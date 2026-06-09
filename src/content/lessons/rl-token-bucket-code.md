---
title: "Token bucket, in Java"
description: "The whole algorithm in a few lines."
kind: code
---

Placeholder code lesson. A "code" lesson is prose plus one or more fenced blocks; they use your existing code styling.

```java
synchronized boolean allow() {
  long now = System.nanoTime();
  double elapsed = (now - last) / 1e9;
  tokens = Math.min(capacity, tokens + elapsed * refillPerSec);
  last = now;
  if (tokens >= 1) {
    tokens -= 1;
    return true;
  }
  return false; // caller gets a 429
}
```

That is the entire idea: refill based on elapsed time, then try to spend a token.
