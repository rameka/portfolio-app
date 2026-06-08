---
title: "The Read Replica Will Cancel Your Query"
description: "A standby is a database replaying another database's history in real time, and it is allowed to kill your read to keep up. Why 'canceling statement due to conflict with recovery' happens, and the two knobs that each cost you something."
pubDate: 2026-05-01
tags: ["PostgreSQL", "Databases"]
minRead: 9
thumb: "/blog/the-read-replica-will-cancel-your-query/hero.png"
cover: "/blog/the-read-replica-will-cancel-your-query/hero.png"
draft: false
---

Here is an error that has no business being as confusing as it is:

```
ERROR: canceling statement due to conflict with recovery
DETAIL:  User query might have needed to see row versions that must be removed.
```

Nothing was wrong with the query. It ran fine yesterday. It runs fine right now against the primary. It only dies on the read replica, only sometimes, and only when it runs a little long. Your application sees a dropped query with `SQLSTATE 40001` and no stack trace pointing at anything you wrote.

This is not a bug, and it is not your code. It is the read replica doing exactly what it was designed to do, which happens to be killing your query. Once you understand the one thing a replica actually is, the error stops being mysterious and turns into a decision you have to make.

## The one sentence that explains all of it

A read replica is not a copy of your database. It is a database that is _replaying your primary's history_, continuously, forever, while also trying to answer your reads.

The primary writes every change it makes into a write-ahead log (WAL). The replica streams that log and applies it record by record to stay current. Your `SELECT` runs on top of that, and underneath it the floor is moving: rows are being inserted, updated, and quietly removed as the replica keeps pace with the primary.

Most of the time the read and the replay do not get in each other's way. The conflict shows up at the one place they cannot both win: when replaying the next WAL record would erase something your query is still standing on.

## What actually conflicts

The most common version is a snapshot conflict, and it comes from `VACUUM`.

When a transaction starts, Postgres freezes its view of the data. For the life of that statement it must see a consistent snapshot, even as the world changes around it. On the primary, meanwhile, `VACUUM` is doing its job: reclaiming row versions that no transaction on the primary needs anymore. Those removals get written to the WAL like everything else and shipped to the replica.

Now the two jobs collide. The replica receives a WAL record that says "those old row versions are gone," but a query on the replica is still holding a snapshot that needs to see them. The replica cannot apply the record without yanking data out from under a running query, and it cannot ignore the record without falling behind the primary.

![How the conflict happens: vacuum on the primary removes rows, the WAL says so, and the replica's running query still needs them](/blog/the-read-replica-will-cancel-your-query/conflict-timeline.png)

So it stalls. It holds the WAL replay and waits, hoping the query finishes on its own. If the query takes too long, the replica gives up on waiting, cancels the query, applies the record, and moves on. The query is collateral. Keeping up with the primary wins.

The `DETAIL` line is the tell. "User query might have needed to see row versions that must be removed" is the snapshot case described above.

## It is not only vacuum

Snapshot conflicts are the headline, but there are five conflict types, and the error message never tells you which one you hit. The fix is different for each, so guessing is expensive.

| Conflict   | What triggers it                                                       | Notes                                              |
| ---------- | ---------------------------------------------------------------------- | -------------------------------------------------- |
| snapshot   | `VACUUM` on the primary removes rows a standby query still needs       | the common one, and the only one feedback prevents |
| lock       | DDL on the primary (`ALTER TABLE`, etc.) needs a lock replay must take | no setting removes this cleanly                    |
| bufferpin  | replay needs a page a standby query is actively pinned to              | usually brief                                      |
| tablespace | a tablespace is dropped out from under a query                         | rare                                               |
| deadlock   | replay and a query deadlock on the standby                             | rare                                               |

You do not have to guess. Postgres counts every cancellation by type in a system view. Read it on the replica:

```sql
SELECT datname, confl_tablespace, confl_lock,
       confl_snapshot, confl_bufferpin, confl_deadlock
FROM pg_stat_database_conflicts
WHERE datname = current_database();
```

If `confl_snapshot` is the number climbing, it is vacuum and you have real options. If `confl_lock` is climbing, your pain is DDL running on the primary while long reads run on the replica, and the honest fix is to stop doing both at once, not to turn a knob.

## The two knobs, and why both hurt

Assume the common case: snapshot conflicts. There are two settings people reach for, and the thing nobody says out loud is that _neither one makes the problem go away_. Each one relocates the cost somewhere else.

![Every fix moves the pain: default cancels queries, raising the delay causes replica lag, hot standby feedback causes primary bloat](/blog/the-read-replica-will-cancel-your-query/two-knobs.png)

**`max_standby_streaming_delay`** controls how long the replica will pause WAL replay to let a conflicting query finish before it cancels. The default is 30 seconds. Set it higher and more queries survive, because the replica is more patient. The catch: while the replica is being patient, it is not applying WAL, so it falls behind the primary. You are trading replica freshness for query survival. Setting it to `-1` means "wait forever," which sounds like a fix and is actually how you let a replica drift arbitrarily far behind reality.

**`hot_standby_feedback`** attacks the cause instead of the symptom. With it on, the replica tells the primary which old row versions its running queries still need, and the primary's `VACUUM` leaves those rows alone. No removal record, no snapshot conflict, no cancellation. The catch: you have now told the primary it may not clean up dead rows that a slow query on a _replica_ is sitting on. A long query on the replica becomes back-pressure on the primary's ability to vacuum, and the price is table bloat on the most important machine you own.

So the real shape of the decision is this. Do nothing and queries get canceled. Raise the delay and the replica goes stale. Enable feedback and the primary bloats. There is no free option. There is only the cost you can live with.

And note the asymmetry from the table above: feedback only helps snapshot conflicts. If your `confl_lock` count is the one going up, feedback does nothing, because the conflict is a lock that DDL replay has to take, not a row vacuum wants to remove. For that one, only the delay buys time, and the better answer is scheduling.

## Your app did not cause this, but it can still help

This is a database configuration problem, and the cluster-wide settings belong to whoever owns the database. But there are three things the application can do that matter, and the first one is nearly free.

**Retry the query.** Postgres deliberately gives recovery-conflict cancellations a retryable error code. `40001` is in the serialization-failure class precisely so clients know a retry is reasonable; the data did not go wrong, the replica just needed the slot back. A bounded retry with backoff turns most snapshot cancellations into a hiccup nobody notices.

```java
catch (DataAccessException e) {
    if (e.getCause() instanceof SQLException sql
            && "40001".equals(sql.getSQLState())) {
        // recovery conflict, not a logic error: safe to retry with backoff
    }
}
```

**Route heavy reads deliberately.** The queries that get canceled are the long ones, and the long ones are usually reports and analytics, not the millisecond lookups serving live traffic. Sending the slow analytical work to a replica tuned for patience (or to the primary, or to a dedicated reporting replica) keeps it from fighting WAL replay on the replica that serves your fast path.

**Keep transactions short.** A snapshot conflict is fundamentally "a transaction held an old view for too long." An idle-in-transaction connection that opened a snapshot and then went to lunch is the worst offender, because it pins old rows without doing any work. Close transactions promptly and set a `statement_timeout` so nothing holds a snapshot open indefinitely.

## The mental model to keep

The next time a replica cancels a query, do not start by tuning a number. Ask which conflict it was, because the view will tell you, and then decide which cost you are willing to pay rather than reaching for the knob nearest to hand.

A read replica is a deal: you get a second machine to read from, and in exchange it reserves the right to interrupt you so it can keep up with the primary. The settings do not cancel that deal. They only let you choose where the bill lands, on the freshness of the replica, the health of the primary, or the occasional query that has to run twice.

Pick that on purpose, ideally per workload, and the error stops being a surprise. It becomes a line item you already agreed to.
