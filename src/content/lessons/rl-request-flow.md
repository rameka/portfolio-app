---
title: "One request through the limiter"
description: "How a single request flows through the limiter and the shared counter."
kind: diagram
---

Placeholder diagram lesson. Mermaid is not wired up yet, so for now a "diagram" lesson can hold an image or a plain text sketch.

```
Client  ->  Limiter  ->  Redis (INCR + EXPIRE)
                |
                +-- under limit  ->  200 OK
                +-- over limit   ->  429 Too Many Requests
```

When you write the first real diagram, tell me and I will add Mermaid so this block renders as a proper sequence diagram.
