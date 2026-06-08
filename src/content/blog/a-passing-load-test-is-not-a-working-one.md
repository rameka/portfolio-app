---
title: "A Passing Load Test Is Not a Working One"
description: "A load test reported a healthy service at a thousand requests a second, while measuring the one request that does no work. The bug was not a line of code, it was a posture, fail open instead of fail closed, and it showed up three separate times."
pubDate: 2026-04-25
tags: ["Performance Testing", "Testing"]
minRead: 8
thumb: "/blog/load-test/hero.png"
cover: "/blog/load-test/hero.png"
draft: false
---

> "Program testing can be used to show the presence of bugs, but never to show their absence."
> Edsger Dijkstra

A load test is an instrument. You point it at a service, it reports how the service behaves under pressure, and the whole value of an instrument is that its reading moves when the thing it measures moves. I shipped one whose reading did not move. It said healthy at a thousand requests a second, and it would have said healthy if the service had been swapped for a brick wall.

Here is where this goes. The test was hammering the one request that does no work, the way you might test a vending machine by only ever pressing coin return. Three separate parts of the system each chose, on their own, to keep the test green rather than keep it honest. That choice has a name, and once you can name it you will start seeing it in your own tests.

A note on numbers: the figures here are illustrative. The argument does not rest on them, and I will show the point where it cannot.

Four terms, defined once so nothing later is a guess:

> **TPS:** transactions per second, the rate of requests the test sends.

> **Cache hit / miss:** a hit is served from fast in-memory storage. A miss is not there, so the request falls through to the slower database.

> **p99:** the response time that 99 percent of requests come in under, so only the slowest one request in a hundred is worse. The slow-tail number, not the average.

> **Fail open / fail closed:** when something breaks, failing open means carry on in a degraded state, failing closed means stop and refuse. A door that unlocks in a power cut fails open. A vault that locks fails closed.

## The system and its failure surface

Three parts. A **generator** sends traffic, here Gatling, a widely used load testing tool that fires requests at a target and reports how long each one took. A **target** service answers. A **feeder** supplies the item ids the generator asks about. The target is an inventory lookup: hand it ids, get stock.

```
GET /inventory?ids=A100,A101
200 OK
{ "items": [ { "id": "A100", "qty": 12 }, { "id": "A101", "qty": 0 } ] }
```

Behind the endpoint, a Redis cache in front of PostgreSQL. A known id is a cache hit, served from memory. An unknown id misses the cache, misses the database, and returns a bare 404 instantly, because there was nothing to fetch and nothing to assemble.

![The system, with the three points where a part of it fails open](/blog/load-test/01-failure-surface.png)

The diagram marks three points where a part of this system can fail open. Keep them in view. The rest of this article is those three points going off, one at a time.

## The signal that would not move

The numbers were too good. Low p99, error rate near zero, at a load the service had no business handling cleanly. The right reaction to a flattering measurement is not relief, it is suspicion. Easy usually means you are measuring the cheap path.

Two conditions guarded the run: success rate above 95 percent, and p99 under five seconds. Five seconds is the tell. A read from Redis comes back in under a millisecond because the data already sits in memory, and even a slow trip to the database is tens of milliseconds, so a five second ceiling is thousands of times looser than a healthy lookup needs. It is a smoke alarm wired to trip only after the house has burned down. That gate was never going to fire, which left the success rate as the only real one. Success was defined like this:

```java
scenario("inventory lookup")
    .feed(idFeeder)
    .exec(
        http("get inventory")
            .get("/inventory?ids=#{ids}")
            // passes on 200 OK or 404 Not Found.
            // nothing here ever opens the response body.
            .check(status().in(200, 404))
    );
```

Here is the deeper problem, and it is not the loose threshold. Every id the test sent was a miss by construction, and you will see why in a moment. A real id would cost the service something: a cache lookup, now and then a trip to the database, a response body to assemble. A missing id costs nothing and comes straight back as a bare 404. Since every id was missing, every response was that same empty 404, so the latency the test reported was the latency of doing nothing. Whether the threshold was five seconds or fifty milliseconds barely mattered. The test was not exercising the service at all. The instrument was reading its own empty path.

![One real request does work, one fake request does none, and the check waves both through](/blog/load-test/03-request-lifecycle.png)

## The pattern: fail open

Step back from the specific line. A test gives a valid signal only when its preconditions hold: real inputs, a live session, an answer that gets checked for correctness. When a precondition breaks, the test has two options. Fail open, carry on and report a pass. Fail closed, stop and report red.

Every layer here failed open. The check, handed an empty 404, passed it. That was sensible in isolation, you do not want legitimate not-founds inflating your error rate. But sensible in isolation is the signature of this whole class of bug. Fail-open defaults are individually reasonable and collectively lethal, because they keep the light green while the meaning drains out of it.

![Fail open keeps the light green, fail closed gives you something to fix](/blog/load-test/02-fail-open-vs-closed.png)

The fix is a posture, not a line. Make the test fail closed. If the answer does not contain what you asked for, it failed, status code regardless:

```java
.check(status().is(200))                                // 404 is now a failure
.check(jsonPath("$.items[?(@.id=='A100')]").exists())   // body must hold the id
```

## Following one request

When a result looks too kind, do not start by reading code. Follow one request end to end and account for the work the server did. That is the diagnostic, and it transfers to any system.

I picked one request. Its id was `ZZZ999`. Cache, miss. Database, miss. Response, 404, instant, no work done. Then the obvious question: why is the test asking for `ZZZ999`, an id that exists nowhere.

The feeder answered. It builds its id list once at startup from a fallback chain: the database first, then a CSV bundled into the image, then, if both fail, random ids. In this environment the database credentials were not set, so that load threw, was caught, and logged to stderr. The CSV was not on the path inside the image, so that returned false, also logged to stderr. Both lines scrolled past in a wall of startup output. The feeder reached its last resort and invented ids. None of them exist. Every request a guaranteed miss.

That is points one and two meeting: a feeder that fails open to garbage, feeding a check that fails open to empties.

## The same mistake, a third time

Once you can name the pattern, you go looking, and it was waiting in the auth.

To call the API the test logs in once, receives a token (a temporary pass valid for one hour), and reuses that token for the whole run.

```java
private static final String BEARER_TOKEN =
    AuthenticationHelper.getBearerToken(apiUrl);   // fetched once, never refreshed
```

The longest profile runs a full hour. Near its end the token expires, and from that point every request comes back 401 Unauthorized, rejected before it reaches the service. This one hid better than the others. Short runs of five or ten minutes never reach expiry, and they are most of what you run. Only the single hour-long run crosses the line, and that run was usually the random-data run, already returning all 404s, so a tail of 401s changed nothing about a result that was already fiction. The bug lived exactly where attention was thinnest: the longest, least-run, least-trusted test.

## Where else this hides

The instance is dull. The class is everywhere. Worth checking in your own suites:

- A success assertion written as a status-code range. A range almost always swallows a failure mode you did not picture, starting with the empty one.
- A tiny working set. If the test rotates through forty ids, you are measuring cache hits, not your system. Real traffic has a long cold tail, and the cold path is the one that hurts.
- Any fallback that degrades silently. A fallback is fine. A silent one is how you end up testing nothing. It should refuse to run or print a banner you cannot miss.
- State fetched once and reused: tokens, connections, leader addresses. If it can go stale within a run, it will, on the longest run, where you look least.
- A fixed-rate load profile. If the generator keeps sending at target rate no matter whether the service keeps up, at high load you are measuring the generator, not the service.

## Why it stayed green

None of this was a coding mistake. Each choice was locally correct: accept 404 so real not-founds do not inflate errors, fall back to random data so a missing file does not block a local run, cache the token so you are not logging in on every call.

I cannot prove this from the code alone, but the shape of it points past the technical. No one owned the question "what does a meaningful failure look like for this test." Three people answered three smaller questions well, and the green light grew in the gap between them. A test with no owner for its definition of failure tends, over time, to define failure as nothing.

## Takeaways

**Any check you cannot make fail is not a check.** Before trusting a green run, break it on purpose: point it at a dead host, feed it junk, expire the token by hand. If it stays green, you own a decoration, and you learned that for free instead of during an incident.

**Default to fail closed in test infrastructure.** Production earns the right to degrade gracefully. A test that degrades gracefully lies gracefully. When a precondition breaks, the test should stop and go red, loudly.

**Assert the answer, not the envelope.** A status code describes the delivery, not the contents. A test that checks only the status is timing your error pages at scale.

Dijkstra said a test can show the presence of a bug but never its absence. This one could not even show presence. We had built the single instrument that always reads zero, and hung our confidence on it.
