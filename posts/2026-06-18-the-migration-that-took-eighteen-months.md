---
title: The migration that took eighteen months
date: 2026-06-18
tags: [infrastructure, postgres, migrations]
summary: We moved forty services off one shared database. Here is what actually made it survivable, and the two things I would do differently.
draft: true   # sample post — remove this line to publish
---

We finished the database split in March. It took eighteen months, which is about
three times what I estimated, and it shipped without a single customer-visible
outage. Both of those facts deserve explanation.

The starting state was one Postgres instance that forty services wrote to
directly. Not through an API — directly, with credentials handed out in 2019 and
never revoked. Any team could add a column. Several teams had, to the same table,
in ways that disagreed about what the column meant.

## Why it took so long

The technical work was maybe four months. The other fourteen went to something I
did not budget for: **finding out what the data actually meant**.

Take one example. We had a `status` column on `accounts` with seven possible
values. Three services wrote to it. When we asked what `pending_review` meant, we
got three different answers, all of them correct for the service that gave them,
and all of them incompatible.

> You cannot split a database you do not understand. You can only split it into
> two databases you do not understand.

Every column like that was a conversation with two or three teams, then a
decision, then a backfill. There were about two hundred columns like that.

## What made it survivable

Four things, roughly in order of how much they mattered.

1. **Dual writes with a read flag.** Every table moved in the same shape: write to
   both, read from old, verify, flip the read, wait a week, drop the write. Six
   steps, each independently reversible. Nothing in the migration was ever a
   one-way door.

2. **A verifier that ran continuously.** A job compared old and new for every
   dual-written table and reported divergence to a dashboard nobody could ignore.
   It caught eleven real bugs. Nine of them were ours.

3. **One table at a time, publicly.** We kept a page listing every table, its
   state, and who owned the next step. It was the single most useful artifact of
   the project — not because it tracked work, but because it made the size of the
   thing legible to leadership when we were nine months in and it looked like
   nothing was happening.

4. **Refusing to bundle improvements.** Every migration is an invitation to also
   fix the schema, rename the badly named thing, add the index. We said no every
   time. A migration that also changes semantics is two changes, and when it
   breaks you cannot tell which one did it.

Here is roughly what the flip looked like in the runner:

```go
// Each step is separately reversible; nothing here is a one-way door.
func (m *Move) Advance(ctx context.Context) error {
    switch m.State {
    case DualWrite:
        if err := m.verifier.CleanFor(ctx, 7*24*time.Hour); err != nil {
            return fmt.Errorf("not clean enough to flip reads: %w", err)
        }
        return m.setState(ctx, ReadNew)
    case ReadNew:
        return m.setState(ctx, DropOldWrite)
    }
    return nil
}
```

## What I would do differently

**Start the semantic archaeology first.** I sequenced it as: build the tooling,
then move tables, and discover meaning along the way. If I did it again I would
spend the first two months doing nothing but interviewing teams about what their
columns mean, before writing a line of migration code. The tooling was not the
bottleneck. Understanding was, and I found that out expensively.

**Give the verifier a budget for false positives.** Ours was strict, so early on it
was noisy, so people started ignoring it — which is the worst possible state for a
correctness check. We eventually added per-table tolerance for known-benign
divergence. Doing that on day one would have bought us months of trust.

| | Estimated | Actual |
|---|---:|---:|
| Tooling | 3 months | 4 months |
| Table moves | 3 months | 6 months |
| Understanding the data | *not estimated* | 8 months |

The row I did not estimate is the row that took the longest. That is the whole
lesson, really.
