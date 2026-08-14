---
title: Boring code is a gift to your future self
date: 2026-04-02
tags: [craft, code review]
summary: The cleverest code I ever wrote saved four lines and cost a colleague two hours. A short argument for writing the obvious thing.
---

Early in my career I wrote a function I was proud of. It collapsed four
branches into a lookup table and a bit of arithmetic, replacing about twenty
lines with six. I remember the small, private satisfaction of it.

Two years later a colleague spent an afternoon in that function trying to add a
case. She was not a worse engineer than me. The code simply did not explain
itself, and I was no longer around to explain it.

## The trade you are actually making

Clever code trades *writing time* — which happens once, while you have full
context — for *reading time*, which happens repeatedly, usually under pressure,
by someone who has none of your context.

That trade is almost always bad. A function is written once and read dozens of
times. Optimizing the rare event at the expense of the common one is a strange
thing to do on purpose.

The version I would write now:

```python
def shipping_tier(weight_kg, destination, expedited):
    if expedited and destination == "domestic":
        return "overnight"
    if expedited:
        return "international_express"
    if weight_kg > 20:
        return "freight"
    return "standard"
```

Four branches. Nothing to work out. You can read it while distracted, which is
the state most code is read in.

## Where cleverness earns its keep

I am not arguing for uniformly dumb code. Cleverness is worth it when:

- It is genuinely on a hot path you have *measured*, not one you assume.
- It is isolated behind an interface that is itself boring.
- There is a comment explaining the *why*, not the *what*.
- The alternative is worse — some problems really are intricate, and pretending
  otherwise produces long code that is also hard to read.

The failure mode is not cleverness. It is cleverness spent on things that did
not need it.

## A heuristic that works

Before merging, I ask: *if I got paged at 3am and landed in this function, how
long until I understood it?*

If the answer is more than about thirty seconds, and the function is not doing
something inherently subtle, I rewrite it. The cost is a few extra lines. The
return is that the worst version of me — tired, rushed, half-informed — can still
work on it.

That version of you shows up eventually. Leave them something kind.
