---
title: "The Partition Key Is an Architecture Decision"
description: "Keying a Kafka topic by the obvious business id quietly capped our consumer throughput, and no number of extra consumers could lift it. A story about hot partitions and the ceiling you cannot scale past."
pubDate: 2026-06-22
tags: ["Distributed Systems", "Kafka", "Performance"]
minRead: 9
thumb: "/blog/partition-skew/hero.png"
cover: "/blog/partition-skew/hero.png"
draft: false
---

The fix for our consumer lag was not more consumers. It was one line in the producer, written months earlier, that nobody had thought of as a performance decision. We had chosen a partition key. That choice, not the consumer count and not the brokers, set the ceiling we were now slamming into.

This is about why the partition key is an architecture decision, and why the most natural key is usually the wrong one.

> Partition: an ordered, append only log. A Kafka topic is split into several of them.
> Partition key: the field whose hash decides which partition a message lands on. Same key, same partition, every time.
> Consumer group: a set of consumers sharing the work of one topic. Each partition is read by exactly one consumer in the group.
> Hot partition: a partition taking far more traffic than its peers.

> The figures here are illustrative. The shape of the failure is the point, not the magnitudes.

## The setup

We had an inventory events topic with a comfortable partition count, read by a consumer group sized to match. On paper there was room to spare: more partitions than consumers, and headroom to add more consumers if we ever needed them. Messages were keyed by store id, because events for a store had to stay ordered relative to each other, and the store id sat right there in the payload. It was the obvious choice. Nobody argued with it.

![Producers publish to a topic keyed by store id. The key lands on two partitions, which run hot while the rest sit idle. Consumers on the hot partitions fall behind.](/blog/partition-skew/01-architecture.png)

Ordering held. For a long time, throughput did too.

## The incident

Then a bulk publish went through, and consumer lag started climbing and would not come back down. It was the bad kind of graph: a line heading up and to the right with no knee in sight.

The first move, the one we reached for without thinking, was to add consumers. More hands, more throughput. It did nothing. Lag kept climbing. Next we restarted the pods, on the theory that something was wedged. Also nothing.

That should have been the tell. When adding consumers does not move the line, the bottleneck is not the number of consumers.

## The reframe

A consumer group cannot put two consumers on the same partition. Each partition is read by exactly one consumer in the group. So the real unit of parallelism is not how many consumers you run. It is how many partitions actually carry traffic.

And the partition a message lands on is decided by the hash of its key.

So the key sets the parallelism. We had keyed by store id, and a handful of large stores produced the bulk of the events. Their ids hashed onto a few partitions, and those few partitions absorbed almost all of the load. The rest of the topic sat empty.

![Two bar charts. Keyed by store id, one partition towers over the rest. Keyed for distribution, all partitions are even. Same topic, same partition count, only the key changed.](/blog/partition-skew/02-skew.png)

We had provisioned for the partition count. We were running at the count of hot partitions. Adding consumers handed the idle partitions readers they did not need, and handed the hot partitions nothing, because each was already maxed out at one reader.

## From insight to the diagnostic

The move that generalizes is to stop looking at totals and look per partition. Aggregate lag hides the problem; it averages the drowning partition together with the idle ones and reports something calm. Per partition lag shows it instantly: two lines climbing, the rest flat on the floor.

Once you are looking per partition, the rest follows. Which keys land on the hot partitions. How skewed the key distribution really is. Whether the inflow on a hot partition simply exceeds what one consumer can drain.

That last one has a second cause worth naming.

## What the drain ceiling actually is

A consumer pulls from each partition in bounded slices. `max.partition.fetch.bytes` caps how much data the broker returns per partition per fetch. The bound exists for good reasons, memory and fairness across partitions, and it is invisible when load is spread. It becomes a wall when load is not. On a hot partition with a deep backlog the consumer drains a fixed slice per round while new records keep arriving, and the idle partitions, which hold all the spare capacity, cannot take any of the overflow because no key routes to them.

Now count the concurrency. The cluster had many brokers, and the group had many consumers, each on its own thread and core. But all the work lived on one partition, and one partition is read by one consumer, on one thread. Effective parallelism was one. We had paid for a distributed system and were running a single threaded program on a single core while the rest of the cluster idled around it.

![Top tier, six provisioned consumer threads with only one in use. Bottom tier, the single active path: one hot partition feeding one consumer, one thread, one core, capped per fetch by max.partition.fetch.bytes. Effective concurrency is one.](/blog/partition-skew/03-choke-point.png)

There is no consumer count that fixes this, because the limit is one partition wide.

## One layer deeper: the partition we pinned

There is an uglier version of the same mistake in the same codebase, and it is worth showing because it is the natural overcorrection.

For one class of event, the producer does not derive the partition from the key at all. It pins it:

```java
// publish every event of this type to the same place
new ProducerRecord<>(topic, 9, key, event, headers);
```

The comment that explained why is long gone. What the line does is route every event of that type to partition nine, forever, no matter the key. That is the store id problem taken to its limit: not a key that happens to skew, but a constant that guarantees one hot partition by construction, frozen into code where no dashboard will ever explain it.

A pinned partition is a key decision in disguise, and a worse one, because it cannot spread even when the data would let it.

## Where else this hides

This is not a Kafka quirk. It is the shape of every hash partitioned system.

- A sharded SQL database keyed on a low cardinality column. A few shards take the writes, the rest idle, and you cannot add your way out.
- A Redis or Memcached cluster where a few hot keys map to a few slots. Adding nodes does not move the hot keys.
- A DynamoDB or Cassandra partition key with a skewed distribution. The hot partition throttles while the table sits well under its provisioned total.
- Any explicit pin: routing by a constant, a single region code, a small enum. You have chosen one bucket and called it a strategy.

The reason transfers cleanly. When a key concentrates load onto a subset of buckets, the capacity on the empty buckets is unreachable, and scaling the consumers, nodes, or replicas behind those buckets buys you nothing.

## Why it happened

The honest root cause was not technical. The key was chosen for a local and correct reason, ordering per store, by someone looking at one event type. No one owned the question of how load would distribute across the topic as a whole. There was no contract anywhere saying a partition key is a capacity decision that has to be reviewed as one. So the convenient field won, the system worked until one store got big, and the eventual fix under pressure was to pin a partition, which moved the debt instead of paying it.

I cannot prove from the code alone that the pin came from this exact incident. But it has the shape of a change made at 2am.

## Takeaways

Here is the part most advice skips. Ordering and parallelism are one dial turned in opposite directions. Kafka guarantees order only within a partition, and the key is what assigns a record to a partition, so the key is your distribution function and your ordering boundary at the same time. Widen it to spread load and you shrink the window inside which order holds. You do not get both. Keying by store id buys a total order per store and pays for it with a hot partition. Splitting to a store and item key fills the topic and pays for it by giving up any ordering between items in that store.

That trade is only free if your consumer does not depend on the order you are about to break. If a deduction for one item and a restock for another can be handled in any sequence without corrupting state, split away. If your logic needs the whole store to advance in lockstep, a finer key reorders those events across partitions and your data goes wrong. So the real question is not how to spread the load. It is what is the smallest set of events that genuinely must stay ordered, and you key at exactly that grain, no finer. If one of those ordering boundaries is itself too hot for a single partition, partitioning cannot save you, and you are into sequencing at the application level, which is a harder problem and a different article.

Watch lag per partition, never only in aggregate. The average is precisely the statistic that hides skew, which is why it is the one most dashboards show by default.

The one to carry to other systems: a partition or shard key is a capacity decision wearing the costume of a correctness decision. It looks like you are only choosing how to group records. You are choosing your ceiling.

The consumers were never the bottleneck. The key was, and it had been set the day someone picked the easy field.
