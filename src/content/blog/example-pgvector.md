---
title: "Why pgvector over a dedicated vector database"
description: "The case for keeping your vectors in Postgres until you genuinely outgrow it, with the tradeoffs laid out."
pubDate: 2026-03-01
tags: ["PostgreSQL", "AI"]
thumb: "pi2"
cover: "pi2"
minRead: 5
draft: false
---

<!-- EXAMPLE POST. Edit the text and frontmatter above, or delete this file. -->

Every RAG tutorial reaches for a dedicated vector database on day one. For most projects that is premature. If your data already lives in Postgres, pgvector lets you add similarity search without standing up and operating a second system.

## When Postgres is enough

- One database to back up, monitor, and reason about.
- Joins between your vectors and your real data, in one query.
- Transactions across both, so writes stay consistent.

## When to graduate

You outgrow it when your index no longer fits comfortably in memory, or when query latency under load stops meeting your target. At that point a dedicated store earns its operational cost. Until then, the simpler system wins.
