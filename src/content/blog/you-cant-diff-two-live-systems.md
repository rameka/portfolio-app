---
title: "You Can't Diff Two Live Systems"
description: "Comparing two continuously updating caches, equality is the wrong test, because the diff is never zero. You don't compare two live systems, you watch their differences converge."
pubDate: 2026-05-20
tags: ["Distributed Systems", "Caching"]
minRead: 7
thumb: "/blog/live-diff/hero.png"
cover: "/blog/live-diff/hero.png"
draft: false
---

We were migrating a cache to a new stack and needed to prove the new one was correct before cutover. The old stack, call it Blue, was a Tier-1 service that could not be paused. The new one, Green, ran beside it, fed the same events, building the same records. The plan was simple: snapshot both caches, diff them, and ship once they matched. They never matched. Not once. And that turned out to be the right answer, because two live systems do not have a moment where they are equal, and equality was the wrong thing to test for.

The pass counts here and in the diagrams are illustrative, drawn from a worked example rather than production telemetry. The shape of the argument is what matters.

## The setup

Blue and Green consume the same stream and write the same shape of record to their own caches. Both are live the entire time. Blue is production and keeps serving; Green is shadowing it, processing the same events a little behind. The question is whether Green, once it catches up, holds the same data Blue does.

![Blue and Green both consume the same events at different speeds; a single snapshot comparison cannot tell whether a mismatch is lag or a real bug](/blog/live-diff/c1-problem.png)

The obvious move is to read every key from both caches and compare. Do that and you get a number: some thousands of records differ. Now you are stuck, because that number means nothing on its own. Green might be forty seconds behind on those records and about to catch up, or it might be processing them wrong. A single snapshot cannot tell the two apart. Both produce a nonzero diff, and the diff between two live systems is always nonzero, because at any instant one of them has seen an event the other has not.

## The version field that isn't

The textbook fix is to attach a version to each record and compare only records at the same version. The upstream events did not carry one. Nothing in the stream gave us a shared, source-assigned ordinal for a given change, so there was no obvious version to align on. What we did have was a last-updated timestamp on every record, and it was the only version-shaped thing in reach, so we tried it.

It was a trap. That timestamp is the record's last-updated time as recorded in each stack's own database, and Blue and Green have separate databases. The same logical event reaches each at a slightly different moment, each database writes its own time, and where source times are missing the assembly falls back to its own wall clock. So the same record ends up with two different timestamps across the two stacks. The field you reach for as a version is produced downstream, independently, in each system. It orders changes perfectly inside one stack and means nothing across them.

> A version is only comparable inside the system that stamped it.

There are exactly two ways out. Get a shared identifier from the source: have the one upstream component that feeds both stacks stamp each event with a sequence number, so the same event carries the same number into both. Or accept that you have no cross-system version and compare a different way. Changing the Tier-1 source path was expensive and risky, so we took the second road.

## Convergence over equality

If both stacks eventually process the same events, then whatever differs between them right now should stop differing once the slower one catches up. So you stop asking "are they equal" and start asking "do their differences disappear."

![Multi-pass comparison: compare all records, then re-check only the ones that differed after a wait; mismatches that resolve were timing, the few that persist are bugs](/blog/live-diff/c2-convergence.png)

Compare everything once and record the keys that differ. Wait. Re-check only those keys. Most of them now agree, because the lag closed. Wait again, re-check the survivors. The set shrinks each pass. The mismatches that resolve were timing. The handful that refuse to converge, no matter how long you wait, are the bugs. That residue is the only thing worth paging someone about.

Persistence alone is not quite the signal, though, and this is where a naive version of the loop bites you. A record under a constant write stream never converges either, because both stacks are always mid-flight on it. Flag it as a bug and you have a false positive caused by churn, not corruption. So you watch whether the mismatched record is still moving. If its value keeps changing across passes on both sides, that is living lag, and you set it aside to re-check once it settles. The real bug is a record that has gone quiet on both stacks and still disagrees. Persistent and quiescent, not just persistent.

> You don't compare two live systems. You watch their differences converge.

This also keeps the work cheap. The first pass is the expensive one, over every key. Every pass after that only touches the shrinking mismatch set, so the cost falls off fast even though the comparison runs several times.

## The one signal that survives a single pass

Convergence needs more than one pass by design, but there is one verdict you can reach immediately. If two records carry the same source-derived timestamp but different values, that is a bug, not lag. Lag can leave the timestamps different, since the slower stack has not applied the newer event yet, but lag cannot produce two identical timestamps sitting over two different values. Same time, different data, means the two stacks processed the same event into different results.

![The diagnostic: separate databases stamp their own timestamps, so the timestamp is not a shared version; but within one pass, same timestamp with different value is a bug, while different timestamp is probably timing](/blog/live-diff/c3-diagnostic.png)

It is a triage rule, not a proof, and it leans on the timestamp being fine-grained enough that a collision really does mean the same event. If your timestamps are coarse, truncated to the millisecond say, two different events can share one value and the rule drops to a strong hint rather than a verdict. Different timestamps still need the convergence passes to sort out. But on fine-grained stamps, same-timestamp-different-value lets you escalate the dangerous mismatches on the first read instead of waiting three passes to find them.

## Where else this hides

Any migration that runs the old and new systems in parallel and compares them. Shadow traffic, dual run, "diff the legacy output against the rewrite." The instant both sides are live, a single diff stops being a pass-fail signal.

Cross-region replicas. Comparing two replicas that are both taking writes has the same property, and for the same reason: neither is a frozen reference for the other.

Reconciliation jobs that alert on any mismatch. They will page on timing noise all night. The alert belongs on mismatches that persist across checks, not on a single nonzero diff.

Any time you borrow a downstream-generated timestamp as a cross-system version. It only orders events inside the system that produced it.

The general version: "are they equal right now" feels like the question, but for two independently advancing systems it has no stable answer. The only answerable question is whether they converge.

## Why the instinct is so strong

For a single system, equality is a fine test. You snapshot, you assert, you move on, because there is one source of truth and you can hold it still. That habit comes from a world with one authority and a pause button. Two live systems have neither, and bringing a single-system test into a two-system world is how you end up staring at a mismatch count that cannot answer the question you asked it.

## Takeaways

When you compare two systems that are both advancing on their own, equality is the wrong question, because the diff is never zero. Convergence is the right one. Alert on what persists, not on what differs, and your signal stops drowning in timing noise. This generalizes well past caches: any parallel-run or replica comparison lives or dies on this distinction.

On versions: an identifier is only comparable inside the system that minted it. To compare across systems you need a token from a shared upstream, or you give up point-in-time comparison and observe behavior over time instead.

On triage: you cannot resolve most mismatches in one pass, but same source timestamp with different values is a bug you can catch immediately, because lag cannot fake it.

Blue and Green never matched, not for a single instant of the migration, and that was never the bug. The bug was the small set of differences that refused to disappear. Once we stopped trying to catch the two systems in the same instant and started watching what would not converge, the question finally had an answer.
