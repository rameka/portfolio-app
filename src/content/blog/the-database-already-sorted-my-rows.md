---
title: "The Database Already Sorted My Rows. I Almost Built a HashMap Anyway."
description: "A cache-seeding job joined two large query results in memory and kept running pods out of memory. The fix was not a bigger pod. It was noticing the rows were already sorted."
pubDate: 2026-05-13
tags: ["Distributed Systems", "PostgreSQL"]
minRead: 10
thumb: "/blog/the-database-already-sorted-my-rows/hero.png"
cover: "/blog/the-database-already-sorted-my-rows/hero.png"
draft: false
---

> "Bad programmers worry about the code. Good programmers worry about data structures and their relationships." — Linus Torvalds

The reframe that fixed this was one line: the order was already there. Two Postgres queries were coming back sorted by the exact key I needed to join on, and I was about to throw that order away to build a HashMap. The HashMap was not the optimization. It was the thing that ran the pod out of memory.

> Hash join: load one side into a HashMap keyed by the join key, then probe it once per row of the other side. Fast lookups, whole map resident.
> Sorted merge join: walk two inputs already sorted by the same key with two cursors. Resident memory is bounded to the rows for the current key.
> Server-side cursor: the database streams rows in fixed-size batches instead of pulling the whole result set into memory at once.

## The setup

I was building a seeding job for a cache rebuild. During a blue-green migration the job fills a fresh cache from the source database, then keeps checking that the new stack matches the old one. The cache does not store raw table rows. It stores a computed inventory summary, one entry per item and location.

That summary comes from two large inputs. One query returns quantity rows, unique per item, location, and bucket. The other returns reservation rows, and those are not unique at that grain: a single bucket can carry several reservation rows, one per reservation category. So this is a one-to-many join, a quantity row on the left and zero or more reservation rows on the right. That cardinality decides how the merge has to advance, which matters later.

The numbers set the constraint, and these are measured shapes, not guesses. A mid-size location is about 558,000 quantity rows, which come back in roughly five seconds, plus about 204,000 reservation rows in under three. The job runs eight locations at once inside a pod capped at two gigabytes of memory. Everything below exists to fit in that pod.

![Seeding flow: two ordered queries feed a two-pointer merge, which builds the summary and writes it to the cache](/blog/the-database-already-sorted-my-rows/01-seeding-flow.png)

## The obvious moves that do not fit

Before the join strategy, two bigger questions a reader will ask. Why join in the application at all? Why not let the database do it, or skip the database and bulk-load?

Letting Postgres do the join and hand back finished rows is the first instinct, and the one to kill first. Two reasons.

First, the output is a transform, not a join. The summary needs window functions for the logical totals and the reserved quantities, a left join that tolerates a missing inventory row, and a four-step mapping into the cache shape, including the content hash. SQL can express the joins and the windows. It cannot express the mapping, so a SQL-only version still leaves the transform to do, and pushing the mapping into SQL rebuilds application logic in a place that is harder to test, version, and change.

Second, the single joined query does not scale the way the per-location reads do. With no localized limit, the planner stops using the index-ordered path and switches to a hash join or a merge that materializes and sorts large intermediates. Once those intermediates pass work_mem, the per-operation memory a sort or hash is allowed before it goes to disk, Postgres spills them to temp files and the query gets slow in a way you do not see until production. When that query was tried, it ran slower than two plain indexed reads combined in the app. The real move was shifting the allocation out of shared database memory, where other workloads live, and into a constant-bound application stream I can scale on its own pod.

Exporting the tables to S3 and bulk-loading is the instinct for anything that smells like bulk movement. It solves a problem this job does not have. The cache stores the computed summary, not raw rows, so an S3 export still has to run the entire transform somewhere downstream. That adds a staging hop and a second failure surface without removing the join or the mapping. It also does nothing for the live half of the migration, where both stacks are taking writes and you are converging them, not loading a frozen snapshot.

So the join happens in the application, over two query results. That is the real decision, and it is where I went wrong first.

## The HashMap trap

The textbook way to combine two result sets is a hash join. Read all the reservations for the location into a HashMap keyed by item, location, and bucket, then stream the quantity rows and look each one up in O(1). It is the first thing I wrote and the answer every interview wants.

It worked on a small location. Pointed at a large one, the pod died with an OutOfMemoryError.

Two hundred thousand reservation rows is not a large number. A HashMap of that many entries is. Each entry carries boxed fields, an Entry object, and table overhead, several times the size of the raw rows. Run eight of those maps in parallel in a two-gigabyte pod and you are holding eight full reservation sides resident at once. The lookups were never the bottleneck. Building and holding the map was.

The tempting fix is a bigger pod or less parallelism. Both treat the symptom. The real problem is materializing a whole side of the join when I did not have to.

![Memory contrast: the merge keeps one key resident, the HashMap holds the whole reservation side and OOMs](/blog/the-database-already-sorted-my-rows/03-memory.png)

## The order was already there

Both queries already had ORDER BY on the composite key, and both tables had that key as their primary key. Postgres was handing me rows in sorted order on both sides. I was paying for that sort and then discarding it by dropping everything into an unordered map.

If both inputs are sorted by the same key, you do not need a map. You need a merge. Advance a cursor on each side. When the keys match, emit the joined row and advance that side. When one key is behind, advance it. You never hold more than the rows for the current key.

## The merge loop

The loop is boring, which is the point. Two pointers, one pass, constant memory.

![Flowchart of the two-pointer merge: compare keys, emit on match, advance the smaller side, repeat](/blog/the-database-already-sorted-my-rows/02-merge-algorithm.png)

```java
// both sides arrive ordered by (item, bucket); reservations may repeat per key
var q = quantities.next();      // server-side cursor, streamed
var r = reservations.next();    // server-side cursor, streamed
boolean matched = false;

while (q != null) {
    int cmp = compareKeys(q, r);          // r == null is treated as +infinity (sorts last)
    if (cmp == 0) {                       // one of possibly many reservations for q
        emit(q, r);
        matched = true;
        r = reservations.next();          // advance the many side only
    } else if (cmp < 0) {                 // q's group is done
        if (!matched) emit(q, null);      // left join: q with no reservation
        q = quantities.next();
        matched = false;
    } else {                              // reservation with no matching quantity
        r = reservations.next();
    }
}
```

The advance is the part to get right, and it is where the naive version drops data. Because one quantity row can match several reservations, a match advances the reservation cursor only and sets a flag. The quantity row stays put until its key falls behind, which means its whole group of reservations has been emitted. The flag is what makes it a left join: if a quantity row reaches the end of its group without a single match, it still emits once with no reservation.

The other thing that bites is the empty side. When the reservation cursor runs out, treat its key as positive infinity. Every remaining quantity is then smaller than r, so compareKeys returns a negative number, the cmp < 0 branch fires, and the trailing quantity rows drain through it, each emitting a left join if it never matched. That rule lives in one place, the comparator, so the loop body never null-checks:

```java
int compareKeys(Quantity q, Reservation r) {
    if (r == null) return -1;            // r exhausted: treat its key as +infinity, so q is always smaller (negative)
    int c = q.item().compareTo(r.item());
    return c != 0 ? c : Integer.compare(q.bucket(), r.bucket());
}
```

Without that null guard, the moment the reservation stream runs dry you get a NullPointerException, not a clean exit.

### Watching the cursors move

A concrete walk makes the branches obvious. Take two small sorted inputs, keyed here by a single token for brevity (the real key is item, then bucket). Quantities are unique per key; reservations repeat, and one of them is an orphan with no matching quantity.

```
quantities    a  c  d
reservations  a  a  b  d
```

| Step | q    | r    | cmp | branch             | what happens                                       |
| ---- | ---- | ---- | --- | ------------------ | -------------------------------------------------- |
| 1    | a    | a    | = 0 | match              | emit (a, res), advance r                           |
| 2    | a    | a    | = 0 | match              | emit (a, res), advance r                           |
| 3    | a    | b    | < 0 | q group done       | already matched, advance q                         |
| 4    | c    | b    | > 0 | orphan reservation | b has no quantity, advance r                       |
| 5    | c    | d    | < 0 | q group done       | never matched, emit (c, null), advance q           |
| 6    | d    | d    | = 0 | match              | emit (d, res), advance r                           |
| 7    | d    | null | < 0 | q group done       | reservations exhausted, already matched, advance q |
| 8    | null |      |     | exit               | q is null, stop                                    |

Read the four behaviors straight off the table. Item a fans out to two reservations and emits twice, steps 1 and 2. The stray reservation b advances without emitting anything, step 4, because no quantity claims it. Item c never matches, so it still emits once with null, step 5, which is the left join. And when reservations run dry, the comparator treats null as larger than any key, so the last quantity still flows through, step 7, instead of crashing.

The SQL is the other half of the contract. The order in the query has to match the order the merge expects, on both sides.

```sql
-- composite index: (location, item, bucket)
-- WHERE pins the leading column, so the index returns rows already
-- ordered by item, bucket. that is an Index Scan, not a Sort.
SELECT item, location, bucket, quantity
FROM stock
WHERE location = :location
ORDER BY item, bucket;
```

The reservation query mirrors it, ordered by item, bucket, then category, so its repeated rows land in the right place within each key.

## Reading the plan

A merge join is only free if the order is free. So the concrete check was EXPLAIN ANALYZE on both queries, read from the bottom up. You want an Index Scan feeding the output, which means the rows come out in key order because the primary key index already stores them that way. No extra work.

> **Warning:** if the plan shows a Sort node above the scan, the order is not free. The database is buffering the full result set and sorting it in work_mem, or spilling it to disk, before it answers. You have not removed the materialization, you have moved it from your pod onto the shared database server.

![Plan comparison: an Index Scan keeps the order free, a Sort node buffers and sorts every row](/blog/the-database-already-sorted-my-rows/04-explain.png)

Both plans came back as index scans with no Sort, so the order really was free.

### The fetch-size gotcha

An Index Scan with no Sort is necessary but not sufficient, and this is the part most people miss. The bigger trap is in the driver, not the plan.

> **The driver buffers everything by default.** The Postgres JDBC driver buffers the entire result set into heap by default, even when you iterate with next(). ORDER BY does nothing to stop it. You get real server-side streaming only when you set an explicit fetch size and turn autocommit off. Miss that, and the app pulls all half-million rows into the heap at once, so the merge join runs out of memory before the loop even starts.

```java
conn.setAutoCommit(false);          // cursor streaming needs an open transaction
var st = conn.prepareStatement(sql);
st.setFetchSize(5_000);             // 5k rows per round trip, not the whole result set
```

With a fixed fetch size on both queries, each side stays a stream, not a list. Resident memory dropped from a whole reservation side per worker to one key's rows per worker, and the large locations that used to OOM now run in the same capped pod, in parallel.

## Why this happened

This was not a clever bug. The hash join is the default because it is what everyone reaches for, and O(1) lookups feel like the optimization. The sorted order on the inputs was an emergent property of the primary key and an ORDER BY that was already in the query for an unrelated reason. Nobody had connected "the query is already sorted" to "so the join can be a merge." The information was sitting in the query plan the whole time. The gap was knowledge, not code.

## Takeaways

Before you build an index in memory, check whether your input is already ordered. If the source hands you rows in the join key's order, a merge join is free and its memory is bounded to one key. The general version, the one that outlives this story: the cheapest data structure is the one you never allocate, because the work was already done upstream. Look upstream before you build.

EXPLAIN ANALYZE is how you tell free order from hidden cost. An Index Scan means the order is real. A Sort node means you only relocated the materialization.

Most memory blowups at scale come from holding one whole side of something. Bounding resident memory to the current key, instead of the full input, is the difference between fitting in a small pod and asking for a bigger one.

The alternatives matter as much as the choice. The database join and the S3 export are both reasonable on their face. They lose because the cache stores a transform, not rows, and because two plain indexed reads beat one heavy query. Name why the obvious option is wrong, not just why yours is right.

The order was already paid for. The fix was to stop reaching for the HashMap and read the query plan.
