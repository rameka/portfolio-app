---
title: "Two services hashed the same record and disagreed"
description: "A cache and its source of truth split after a deploy. The hash was not lying. We were, and the fix started by refusing to read the mismatches one at a time."
pubDate: 2026-05-03
tags: ["Distributed Systems", "Kafka"]
readTime: "7 min read"
thumb: "/blog/hash-divergence/hero.png"
heroImage: "/blog/hash-divergence/hero.png"
---

The parity dashboard had been a flat 100 percent for months. An hour after a routine deploy, it read 72 percent.

Some context for that number. We run an inventory cache, one entry per item and location, kept in **Redis**. Two unrelated Java services fill it. A **streaming writer** consumes change events off **Kafka** and updates the cache in real time. Separately, a **reconciler** runs on a schedule, reads the true quantities from **PostgreSQL**, rebuilds what each entry should be, and checks its work by comparing content hashes. A content hash is just a fingerprint of bytes: feed it the same bytes, it returns the same fingerprint, every time. Parity is the share of entries where the two fingerprints agree. Both services run on Spring Boot, and we watched parity in New Relic.

![Two Java services writing to the same Redis cache, with a reconciler comparing content hashes](/blog/hash-divergence/01-architecture.png)

Here is the thing about a content hash. It has no opinions and no bugs. It does one job perfectly, which means a fingerprint that changed is not a malfunction. It is a report. When parity fell to 72 percent, the hash was not failing. It was telling me, precisely and honestly, that the bytes going into it had changed on one side. The only question worth asking was where.

## The trap

The instinct, and I felt it before I thought it, was to blame the data. The writer fell behind Kafka. A batch of events got dropped. The cache went stale. Every one of those is real, every one produces exactly this symptom, a wall of mismatches right after a deploy.

That instinct leads straight to the mismatch report, where you pick a row and start comparing values. With tens of thousands of mismatches, that tells you about one row. It tells you nothing about the bug. I needed the shape of the whole failure before I touched a single record.

## Read the distribution, not the rows

Every mismatch carries two fingerprints, the one the reconciler computed and the one stored in the cache. So I ignored the records and grouped all the mismatches by that pair of fingerprints, then looked at how big the groups were.

![Grouping mismatches by hash pair: many unique pairs means data drift, a few huge clusters means a code fork](/blog/hash-divergence/02-clustering.png)

The cluster sizes answer the question before you read a line of code, and the logic behind that is the part worth stealing.

Drift is random. If the writer is stale or losing events, every affected entry is wrong in its own particular way, so you get thousands of distinct pairs, almost all appearing once. A logic fork is the opposite. If two code paths build the record differently, every entry through the broken branch produces the identical wrong pair. Same input difference in, same output difference out, forever.

When I grouped, about 5,000 entries collapsed onto a single pair. That is the tell, and it is not subtle once you know to look for it. Random data cannot agree with itself five thousand times. A number that clean only comes from code doing the same deterministic thing on every record. Before reading any of the writer's logic, I already knew two facts: this was a code change, not lost data, and it had almost certainly shipped in that deploy.

## From a cluster to a line

Knowing it is a code fork is not knowing where. The cluster handed me that too. Because all 5,000 records in the big group fail identically, I only had to understand one of them.

I pulled a single record, dumped the exact bytes each side produced just before hashing, and diffed those. Not the database values, the serialized output, because the bytes are what the hash actually sees and the values are not. The diff was one field wide. Then I did the same for the next two clusters down, and each pointed at its own field. Three clusters, three independent forks, each a small and entirely reasonable decision that happened to disagree with a decision made in another repository months earlier.

![The same record serialized two ways, producing two different fingerprints through three forks](/blog/hash-divergence/03-forks.png)

**A clamp on one side.** The reconciler clamped negative quantities up to zero. The writer passed them through raw.

```java
.immediateQuantity(qty);               // writer: raw value
.immediateQuantity(Math.max(0, qty));  // reconciler: clamps negatives to 0
```

Negative quantities are legal here, so every entry that dipped below zero hashed two ways. This was the biggest cluster, and it came from one `Math.max` added by someone who reasonably thought a negative quantity was bad data worth cleaning. Harmless in isolation, half of a contract nobody knew existed.

**A different order.** Each entry holds a list of sub-quantities, and hashing a list hashes its elements in sequence, so order is content. The reconciler sorted the list alphabetically. The writer built it by grouping events into a map and iterating, which yields elements in integer-key-hash order.

```java
buckets.sort(comparing(b -> b.type().name())); // reconciler: alphabetical
events.collect(groupingBy(Event::bucketId));    // writer: map iteration order
```

Same elements, different sequence, different bytes. Anything with two or more sub-quantities broke. This is the kind of fork that sails through code review, because both lines are obviously correct on their own. They are only wrong together.

**A different fallback.** Each record carries a last-updated timestamp. When the primary source was null, the reconciler fell back through a two-step chain and the writer through a four-step one that preferred a joined table the reconciler never read.

```java
ts = updateTs != null ? updateTs : createTs;                            // reconciler
ts = firstNonNull(invUpdateTs, invCreateTs, qtyUpdateTs, qtyCreateTs);  // writer
```

Whenever those sources disagreed, the timestamp differed, and so did the fingerprint.

## The cousin one layer down

Fixing the order bug, I found its quieter relative inside a single service. A hash there was computed over a collection that was never sorted first, so the same record could fingerprint two different ways on two runs, depending on iteration order. A hash over an unordered collection is not a hash. It is a coin flip that happens to return hex. It is also worse than the cross-system bug, because it produces mismatches that vanish when you re-run and look like ghosts.

## The contract nobody signed

None of these three is a dramatic mistake. Each is a competent decision that quietly disagreed with another competent decision in a different codebase. The real defect was structural. Two services had to emit byte-identical serializations of the same object, and nobody owned that requirement. There was no shared code, no written format, no test that failed when they drifted. The contract existed only as a green dashboard, which means the first time anyone read it was the moment it broke.

## Takeaways

**A shared hash is a contract, so make it one.** If two systems must agree on a fingerprint, their serialization has to match to the byte, and that agreement will not hold itself together across two repositories and two years. Put the serialization in one library both sides call, or pin the format with golden test vectors that run in both pipelines. The goal is that the next innocent `Math.max` fails a test, not a dashboard.

**When failures come in bulk, read their distribution before any single one.** This is the part that travels. A population of failures carries its diagnosis in its shape. Group them by something that stays constant under a logic bug and varies under randomness, then look at the cluster sizes. A few huge clusters mean deterministic code, so go read the logic. Thousands of unique one-offs mean timing or data, so go check staleness. You learn the bug class before opening a file, and once you find a cluster you debug one member to explain all of it.

**Sort before you hash a collection, and prove it.** Maps, sets, and grouped streams have no inherent order, and serialization walks them in whatever order memory hands over. Sort by a stable key right before you serialize, then write the test that shuffles the input and asserts the fingerprint does not move.

The bug took an afternoon to fix once it was understood. Understanding it took one decision: to trust that the most honest component in the system was the hash, and to go looking for the place where we had lied to it.
