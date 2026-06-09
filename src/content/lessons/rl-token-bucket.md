---
title: "The token bucket idea"
description: "A bucket fills at a steady rate; each request spends a token."
kind: concept
---

Placeholder concept lesson.

A bucket holds up to N tokens and refills at a steady rate. Each request removes one token. If the bucket is empty, the request is rejected. The bucket size sets how big a burst you tolerate; the refill rate sets the long-run limit.

The next lesson shows this as code.
