---
plan: morning-digest
status: done
owner: rook
opened: 2026-10-29
closed: 2026-10-13
---

# Morning digest

The night's run log is a JSONL file nobody reads. By breakfast someone has to know what ran,
what retried, what failed, and whose it was, without opening `runs/`. rig already serves the
status board; the digest is one more page on it.

Out of scope: notifications, history across nights, auth (rig only listens on localhost).

## 1. Run log reader

Read `runs/<night>.jsonl` into one row per job: job, owner, runs, retries, last status, last
error, first and last time. One JSON object per line (`at`, `job`, `status`: `ok | retry | fail`,
`owner`, optional `error`).

- A line that doesn't parse is counted, never thrown. The night still renders.
- `owner` can be `null`. Keep the row; show the owner as `—`.
- Lives in `src/digest/`. Commit `src/digest/types.ts` first (the `DigestRow` type and the
  `readNight(runsDir, night)` signature), so every part of section 2 can start against it.

Done when: reader tests pass on `runs/2026-10-28.jsonl` (5 jobs, 1 bad line).

## 2. Digest page

Four small parts. Each needs only `src/digest/types.ts` from section 1, so once that is in they
can go to four workers at once. Small, well-specified work: a cheaper model is fine here.

### 2a. Page

`GET /digest/:night` renders the rows with the usual layout: one table, sorted by job, retries of
3 or more and any `fail` marked. A night with no file returns 404; an empty file renders
"nothing ran".

Done when: `/digest/2026-10-28` renders locally.

### 2b. JSON

`GET /api/digest/:night` returns the same rows as JSON. Agents read this one; the page and the
JSON must never disagree (ADR 0001).

Done when: the JSON for 2026-10-28 has the same jobs, in the same order, as the page.

### 2c. Board link

The status board links each night on disk to its digest, with its ok / retry / fail counts beside
it.

Done when: both nights on disk link to a digest that renders.

### 2d. Route tests

Route tests for 2a and 2b: 200, 404 for a night with no file, the empty night, a night with a bad
line. Use a temp runs dir; `runs/` is read-only.

Done when: `pnpm test` is green with the new tests.

## 3. Preview for review

Rook reviews the page from a copy, not from the lane. Run rig and save `/digest/2026-10-28` as
one HTML file, lane banner included (a command, not a browser's "save as"; the page is
self-contained, ADR 0001). Put it in the review bucket so it opens from a public HTTPS link. Send
Rook the link and the issues for this plan.

Done when: the preview link is sent to Rook.

## 4. Clean up

The preview shows lane data on a public link (ADR 0003). Delete the object; the link must stop
resolving. Move this plan to `docs/plans/done/` with its issue list.

Done when: the preview link returns nothing.

## Issues

| # | Issue | Blocked by | Worker | Closed |
|---|-------|-----------|--------|--------|
| 1 | Run log reader | — | claude-code · opus-5.5 · medium | 2026-10-13 |
| 2 | Digest page | #1 (types only) | claude-code · haiku-5.5 · low | 2026-10-13 |
| 3 | Digest JSON | #1 (types only) | claude-code · haiku-5.5 · low | 2026-10-13 |
| 4 | Board link | #1 (types only) | claude-code · haiku-5.5 · low | 2026-10-13 |
| 5 | Route tests | #1 (types only) | claude-code · haiku-5.5 · low | 2026-10-13 |
| 6 | Preview for review | #2, #3, #4, #5 | claude-code · opus-5.5 · xhigh | 2026-10-13 |
| 7 | Clean up | #6, Rook's review | claude-code · opus-5.5 · xhigh | 2026-10-13 |

#1 went out in two commits: `src/digest/types.ts` first, so #2–#5 ran on four workers at once.
Merging #2 and #3 left a duplicate import in `src/app.tsx`; the coordinator removed it (104f870).
#6 was first closed when the link was sent, before Rook had looked. It was reopened and closed
again after the review. The preview link stopped resolving the same day.
