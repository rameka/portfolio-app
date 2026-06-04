---
title: "Real Time LLM Enrichment Pipeline"
blurb: "Enriches live Kafka events with LLM calls, with a reliability layer and token budgeting."
year: "2026"
badge: "AI Project"
stack: ["Java", "Apache Kafka", "LLM APIs", "Redis", "Kubernetes"]
cover: "pi1"
demo: "#"
github: "#"
order: 1
draft: false
---

<!-- EXAMPLE PROJECT. Edit the text and frontmatter above, or delete this file. -->

## Overview

A streaming service that enriches live Kafka events with LLM generated labels and scores in near real time, built to stay within a fixed latency and cost budget under heavy load.

## The problem

Inline model calls per event do not scale on latency or cost. The goal was real time enrichment that degrades gracefully instead of blocking the stream.

## Approach

- Treated the model as a rate limited dependency: batching, caching, and budget aware passthrough.
- Added a reliability layer with retries, timeouts, and a circuit breaker.
- Built an eval suite that gates deploys on label quality.

## Outcome

Held steady throughput with enrichment within roughly [X] ms of the source event at about [Y] per million events. Real figures go here once the run is published.
