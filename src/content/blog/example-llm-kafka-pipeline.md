---
title: "Building a real time LLM enrichment pipeline on Kafka"
description: "How I wired LLM calls into a live Kafka stream without blowing the latency budget, with a reliability layer and token control."
pubDate: 2026-06-15
tags: ["AI", "Kafka"]
thumb: "pi1"
cover: "pi1"
minRead: 8
draft: false
---

<!-- EXAMPLE POST. Edit the text and frontmatter above, or delete this file. -->

Most LLM tutorials assume a request and response sitting behind a button. Production data does not wait for a button. It arrives as a firehose, and if you want to enrich it with a model, you have to do it without falling behind the stream or melting your token budget. Here is how I built one that holds up.

## The problem

We had a Kafka topic carrying a high volume of events per second. The ask was to attach a model generated label and a confidence score to each one, in near real time, so downstream consumers could route on it. The naive approach, calling the model inline for every event, falls over almost immediately on both latency and cost.

## The architecture

The core idea is to treat the model like any other unreliable, rate limited dependency: batch where you can, cache aggressively, and degrade gracefully when you hit a limit rather than blocking the stream.

```js
// enrich each event with a single LLM call, with a budget
async function enrich(event) {
  if (budget.exhausted()) return passthrough(event);
  const out = await llm.classify(event.text);
  return { ...event, label: out.label, score: out.score };
}
```

> The model is just another dependency. Treat it like one, and the hard parts become familiar distributed systems problems.

## Results

After tuning batching and adding a small cache, throughput held steady and the enrichment stayed within roughly [X] milliseconds of the source event, at a cost of about [Y] per million events. The numbers here are placeholders until I publish the real run.

- Graceful passthrough when the budget is exhausted, so the stream never blocks.
- A cache keyed on event shape that absorbed a large share of calls.
- An eval harness that gates deploys on label quality.
