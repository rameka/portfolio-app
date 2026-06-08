---
title: "A Validated Token Is Not a Forwarded One"
description: "An API gateway validated the caller's token, then stripped the credential before forwarding, so the service behind it returned 401 on every request. The bug was not in either auth check. It was the missing contract between them."
pubDate: 2026-05-11
tags: ["Distributed Systems", "Security"]
minRead: 7
thumb: "/blog/auth-boundary/hero.png"
cover: "/blog/auth-boundary/hero.png"
draft: false
---

A request showed up authenticated at the edge and rejected one hop later. The caller's token was valid. The gateway accepted it. The service behind the gateway returned 401 on the same request, with the same token, every time. Two components both performing authentication, both correct on their own terms, disagreeing on every call. The defect was not inside either check. It lived in the space between them, where no one had written down who owns the credential.

> The rule it taught me: a boundary that consumes a credential owes the next hop proof of what it checked. Asking for the credential again is not a second layer of safety. It is a locked door.

> **API gateway:** the front door. It takes external requests, applies cross-cutting concerns like authentication and rate limiting, and forwards what survives to an internal service.

> **Upstream service:** the internal service the gateway forwards to. It does the actual work.

> **Bearer token:** a credential the caller puts in the `Authorization` header. Whoever holds it is treated as the caller. Validating it means checking its signature or asking an auth server whether it is still good.

## The setup

The topology was ordinary. Clients hit the gateway with a bearer token. The gateway authenticated the token and forwarded surviving requests to the upstream service. So far so standard.

The wrinkle was that the upstream also had its own authentication filter, and it re-validated the same token on arrival. The intent was reasonable: do not rely solely on the edge, check again at the service, layers of safety. On paper it looked like belt and suspenders.

![Client to gateway to upstream, where the gateway accepts the token but the credential is dropped before the upstream re-checks it](/blog/auth-boundary/01-boundary.png)

## The problem

In integration it fell apart. The gateway reported the token as valid and forwarded the call. The upstream rejected that same call with 401. Reliably, on every request, not intermittently.

The tempting path was to assume the token was bad. That sends you down a rabbit hole: rotate the signing keys, check for clock skew on expiry, reconfigure the upstream's auth server URL, compare token claims byte for byte. All of it dead ends, because the token was never the problem. It was valid the entire time. The gateway had already proven that.

When the credential is provably good and one side still rejects it, stop interrogating the credential. Something is happening to the request between the two checks.

## The reframe

The upstream was re-validating a credential it no longer had.

Gateways routinely strip sensitive headers before forwarding to internal services, so secrets do not leak past the trust boundary. This gateway did exactly that. It consumed the `Authorization` header during its own validation and did not pass it through. The upstream's filter then read a missing header and did the only correct thing a filter can do with no credential present: reject.

So the second check was not a safety layer at all. It was a check that could never pass, because the input it needed had been deliberately removed one hop earlier. Re-checking a credential at a boundary that already consumed it is not defense in depth. It is a guaranteed rejection wearing the costume of caution.

Picture an airport. Immigration checks your passport once and waves you through. The gate agent inside does not ask for it again, because they trust that you cleared the desk that holds it. Now put a second desk past security that demands the passport you already surrendered at immigration. You are stuck, not because the passport is invalid, but because the desk asking for it is not the desk that has it. That was the upstream service.

![The wrong instinct re-validates a token that never arrives and always 401s; the fix terminates auth once at the gateway and asserts a trusted identity the upstream accepts](/blog/auth-boundary/02-terminate-once.png)

The correct shape is to terminate authentication once and then assert identity downstream. The gateway validates the token, and if the upstream needs to know who the caller is, the gateway hands it a separate trusted assertion, for example a signed identity header. The upstream trusts that assertion because it trusts the boundary, and it does not try to re-derive identity from a credential it was never given.

## From insight to specifics

The fix became obvious the moment we stopped reasoning about tokens and looked at bytes.

Trace one request and read what the upstream received, not what the client sent. A verbose `curl` to the gateway showed the `Authorization` header going in. The forwarded request, as the upstream logged it, showed that header gone, with only forwarding metadata left behind.

![The same request shown twice, with the Authorization header present as the client sent it and absent as the upstream received it](/blog/auth-boundary/03-trace.png)

That side by side is the whole diagnosis. The general move transfers to any boundary problem: inspect the request on the far side, because the thing that proves the bug is the difference between what was sent and what arrived.

## The findings

The upstream filter, reduced to its essence, was this:

```java
String auth = request.getHeader("Authorization");
if (auth == null || !validator.valid(auth)) {
    return UNAUTHORIZED;   // fires on every request the gateway forwards
}
```

It passed every local test, because in local tests the client called the service directly and the header was present. Behind the gateway the header was always absent, so the branch fired on every call. This is the classic staging surprise. Local runs, a docker-compose stack or a direct port or a cluster without the ingress, call the service straight, so the stripped-header path never runs until the request finally goes through the real gateway. It looks correct on paper and on your laptop, right up to the first call that takes the front door. The code was correct for a world where it sits on the edge. It was deployed in a world where it sits behind one.

The fix was not to validate harder. It was to remove the check that could not succeed and trust the boundary, or to consume an identity the gateway asserts:

```yaml
# gateway, after validating the token, injects a signed identity
X-Identity: "<signed claims>" # upstream trusts this, never re-checks the bearer token
```

## Where else this hides

The pattern is: something gets terminated at a boundary, and a component past the boundary tries to re-verify it from inputs that no longer carry it. Once you see it, you see it everywhere.

- TLS terminated at a load balancer. The upstream sees plain HTTP and can wrongly decide the connection is insecure unless it reads `X-Forwarded-Proto`. Same shape: a property terminated at the edge, re-derived downstream from data that lost it.
- Client IP behind a proxy. The upstream sees the proxy address, not the caller, unless it trusts `X-Forwarded-For`. Rate limits and audit logs then key on the wrong address and no one notices until an incident review.
- mTLS terminated at a service mesh sidecar. The application re-checks a client certificate the sidecar already validated and never forwarded.
- A WAF or CDN that rewrites or drops headers the origin still expects to be there.

Every one passes review and works in a direct test. Each waits for the day it runs behind the thing that strips its input.

## Why this happened

This was not a typo. Each side was written by someone with a defensible model. The gateway's model: authenticate, then strip secrets before they reach internal services. The service's model: authenticate our own traffic, do not trust the network. Both are sound in isolation. Both shipped. Nothing wrote down who authenticates, what gets forwarded, and what the upstream is allowed to trust.

I cannot prove the ownership gap from the configuration alone, but the shape points at it. The redundant check was added in good faith and became a guaranteed 401 the first time real traffic arrived through the gateway instead of around it. A boundary with two owners and no contract is where authentication quietly breaks.

## Takeaways

The transferable lesson is about boundaries, not tokens. When a boundary terminates something, whether a credential, a TLS session, or a client identity, it has to forward proof of what it did, and the far side has to trust that proof rather than reconstruct it. The moment a boundary consumes a thing, only an explicit assertion carries it across. Re-deriving it from inputs that no longer exist is how you build a check that cannot pass.

That reframes defense in depth too. Real depth is independent layers that each see what they need. The same check run twice, where only one layer ever receives the input, is not a second layer. It is an outage waiting for traffic.

And when two correct components disagree, suspect the contract between them before the logic inside either one. The fastest way there is to trace a single request across the boundary and read both sides. The bug is almost always in the difference.

The token was valid the whole time. What was missing was an agreement about who carries it across the door.
