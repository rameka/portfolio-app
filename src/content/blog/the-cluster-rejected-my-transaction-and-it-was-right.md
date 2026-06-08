---
title: "The Cluster Rejected My Transaction, and It Was Right"
description: "A dual-key cache write wrapped in MULTI/EXEC is legal on one entity and illegal across a batch. The fix was not a workaround for atomicity, it was realizing the design never needed it."
pubDate: 2026-05-15
tags: ["Distributed Systems", "Caching"]
minRead: 6
thumb: "/blog/crossslot/hero.png"
cover: "/blog/crossslot/hero.png"
draft: false
---

I reached for MULTI/EXEC because that is what you do with two writes that should land together. On a single node it works. On a single entity in the cluster it still works, which is exactly why it survives the first round of testing. Point it at a real batch and the cluster answers with one word: CROSSSLOT. The fix was not a clever way to make the transaction span the cluster. It was admitting the design never needed the transaction at all.

The figures here are illustrative. The mechanism is what matters, and it holds whatever the numbers are.

> Hash slot: a Redis cluster splits its keyspace into 16384 slots, each owned by one shard.
>
> Hash tag: the part of a key inside braces, the `entity:A` in `cache:{entity:A}`. Only that part is hashed, so keys that share a tag share a slot.
>
> MULTI/EXEC: Redis's transaction. The commands between them run as one atomic unit.
>
> CROSSSLOT: the error a cluster returns when one command or transaction touches keys on different slots.
>
> Idempotent write: a write you can apply more than once and get the same result.

## The setup

The cache fronts a Postgres database and serves low-latency reads. Events arrive from a log in batches, and one batch touches thousands of distinct entities. A writer applies the batch to the cache, then publishes downstream. The cache is written before the event is published, so a reader never sees the published event point at a cache that has not caught up yet.

![Write path: a batch of many entities flows through the cache writer into a sharded Redis cluster, then publishes](/blog/crossslot/01-write-path.png)

Per entity we kept two structures: a compact summary the read path serves directly, and a fuller payload used for comparison and debugging. Both are keyed with the same hash tag, `cache:{entity:A}`. That detail matters in a second.

## The transaction that worked until it didn't

The two structures should move together, so I wrapped their writes in MULTI/EXEC. Tested it against one entity. Both keys carry the same `{entity:A}` tag, so they hash to the same slot, so the transaction is legal and it passed. The mental model that came with it was simple: these writes are atomic.

Then the batch path pipelined writes across thousands of entities at once, and the same instinct wrapped the batch in a transaction. CROSSSLOT. The transaction that had passed every test refused to run.

## Why the cluster says no

A cluster routes a key by taking CRC16 of its hash tag, modulo 16384, to pick a slot. `{entity:A}` lands on one slot on one shard. `{entity:B}` lands on a different slot, likely a different shard.

![Two keys with different hash tags route to different slots on different shards, and the MULTI wrapper spanning both returns CROSSSLOT](/blog/crossslot/02-crossslot.png)

A transaction executes on a single shard. It has no way to roll back work on another shard it cannot even see. So rather than promise something it cannot keep, the cluster refuses the request up front. The single-entity test passed because every key in it shared a tag and therefore a slot. The batch failed because nothing forced thousands of entities onto one slot, and nothing should.

The tempting fix is to give everything one hash tag so it all lands on one slot. That buys atomicity back and throws away the cluster. One slot means one shard holds all your data and absorbs all your write traffic. You would trade an illusion of correctness for a guaranteed hot shard. That is not a fix, it is a smaller outage waiting to happen.

## The reframe: atomicity was the wrong property

Ask what the transaction was protecting. If the summary write lands and the fuller write does not, you have a torn record for a few milliseconds. Does anything depend on those two being consistent at every instant? No. The read path serves the summary and tolerates the gap, and the system already had a different safety net.

Every write is idempotent and ordered by a timestamp. A write is applied only if the incoming version is at least as new as what is cached, so replaying it changes nothing. On failure the batch does not retry a stale payload, it emits a refresh request that re-derives the record from Postgres, the actual source of truth. Correctness came from idempotency and reconciliation. The transaction was decoration on top of guarantees that already held without it.

## What we did instead

Pipeline, not transaction.

![The MULTI path returns CROSSSLOT; the pipeline path sends independent HSETs that each route to their own slot, with failures handled by a refresh request that re-derives from the database](/blog/crossslot/03-pipeline-vs-refresh.png)

The writer pipelines independent HSETs. Each one routes to its own slot and lands on its own shard, so there is no atomic boundary to violate and no CROSSSLOT. Pipelining still collapses the network round trips, which was the only thing the batch ever needed from grouping the writes. Grouping them for fewer round trips and grouping them for atomicity look identical in code and are completely different asks. The cluster is happy to give you the first and will never give you the second across slots.

```java
// the habit: one atomic unit, dies on a multi-slot batch
multi();
hset("cache:{entity:A}", "summary", a);
hset("cache:{entity:B}", "summary", b);   // different slot
exec();                                    // CROSSSLOT

// what shipped: independent writes, grouped only to save round trips
pipeline(p -> {
  for (Record r : batch) {
    if (r.ts() >= cachedTs(r.key()))       // idempotent, version gated
      p.hset(r.key(), "summary", r.summary());
  }
});                                        // each key routes to its own slot
```

## Where else this hides

Any MULTI, WATCH, or Lua script that touches more than one key in cluster mode has this rule. Lua is not an escape hatch; a script is still pinned to a single slot.

The dev box is the classic trap. It is one node, prod is sharded, and the transaction passes every local test because a single node has exactly one slot space. It only fails under a real cluster with a real multi-entity batch. Topology is part of the contract. Test against the topology you deploy, not the convenient one: a local three-primary, six-node cluster in Docker Compose costs almost nothing and routes keys through real slots, so the CROSSSLOT shows up on your laptop instead of in staging.

The "just use one hash tag" reflex restores atomicity by destroying distribution. If you ever feel the urge to co-locate everything, that is the signal you are using the wrong primitive, not that you need a bigger tag.

Multi-key mirroring from a relational database carries the same assumption. The database leg was transactional, so people assume the cache leg is too. It is two stores and two failure domains, and the second one will not roll back to match the first.

Cross-partition "transactions" in a log have the same shape. The boundary you want does not line up with the boundary the system shards on.

## Why this happened

MULTI/EXEC is a single-node promise. We carried a single-node mental model into a sharded deployment and never re-litigated it when the topology changed. The word "atomic" went into a design note early, while the prototype was one node, and it survived untouched once the keys were spread across shards. I cannot prove from the code alone that the original author meant cluster-wide atomicity. More likely it was a single-node habit that outlived the migration it should have died in. That is the more common failure mode: not a wrong decision, a right decision whose premise quietly expired.

## Takeaways

Atomicity and correctness are not the same thing. Atomicity is one way to buy correctness. Idempotency plus reconciliation is another, and it is the one that survives sharding, because it makes each write independently safe instead of leaning on a boundary the cluster will not give you. Before you reach for a transaction, name the property you need. At scale, the transaction is often the thing you can least afford. Pat Helland made roughly this argument years ago in "Life Beyond Distributed Transactions," and it has aged well. He split data into independent entities that each live inside their own transactional boundary, with activities coordinating across them through asynchronous messaging and eventual consistency rather than locks. In those terms the hash tag is an entity boundary, the one scope where atomicity is cheap, and the batch is an activity spanning entities, which you hold together with idempotency and a reconciliation path instead of a transaction.

On the mechanism: in a cluster, the slot is the unit of atomicity, not the keyspace. A transaction or script is legal only if every key it touches hashes to one slot, which in practice means sharing a hash tag. Reach for that on purpose for the rare set of keys that truly must move together, never as a blanket.

On process: a guarantee written in a design note ages with the topology around it. When you shard, go re-read every promise that assumed one node. One of them is lying to you now.

The cluster rejecting my transaction was not an obstacle. It was the system telling me my design still thought it lived on one node.
