---
title: "pgvector RAG Service"
blurb: "Retrieval augmented generation over a corpus, served as a streaming API with eval gating."
year: "2026"
badge: "AI Project"
stack: ["Python", "pgvector", "FastAPI"]
cover: "pi2"
demo: "#"
github: "#"
order: 2
draft: false
---

<!-- EXAMPLE PROJECT. Edit the text and frontmatter above, or delete this file. -->

## Overview

A retrieval augmented generation service over a document corpus, exposed as a streaming API. Answers are grounded in retrieved passages and gated by an eval suite before deploy.

## Approach

- Embeddings and similarity search kept in Postgres via pgvector.
- Streaming responses so the client sees tokens as they generate.
- Eval gating on answer quality and grounding before any deploy.

## Outcome

Placeholder for real numbers once published: retrieval quality at [X], median response start under [Y] ms.
