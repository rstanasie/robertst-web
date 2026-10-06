# Choosing what the Amphora lands on

The outcome of a spin used to be whatever the physics produced: the vessel
coasted, friction ran out, and the panel nearest the eye was the story. That is
honest, and it is also unkind. A reader can turn it four times and be handed the
same sealed myth twice, with nothing to read at the end of it — and the vessel
exists to give out stories.

So the order is reversed. **The story is chosen first and the vessel is then
turned to it.** It is still a spin: every panel stays reachable, the weighting is
gentle, and the rules below only ever *remove* outcomes that would waste the
gesture. Nothing here can widen access — whether a story is readable is decided
by the same rules that decide what the page will actually serve.

## Files

| File | Role |
| --- | --- |
| `lib/spin/rules.ts` | The whole policy. Pure, no React, no DOM, no angles |
| `lib/spin/storage.ts` | The session's history, and the external store the page reads it through |
| `lib/amphora.ts` | `glideDistance` / `glideSpeed` / `glideDuration` / `glideProgress` / `travelTo` |
| `lib/useAmphoraRotation.ts` | Calls the chooser, then turns the vessel to the answer |
| `components/Amphora.tsx` | Builds the candidates, holds the memory, keeps the last readable story reachable |
| `tests/spin.test.ts` | 22 checks, with an injectable random source |

## The rules

All four thresholds are in one object, `SPIN_RULES`:

| Rule | Default | What it does |
| --- | --- | --- |
| `repeatLimit` | 2 | A story that has come up twice running steps aside for one spin |
| `blockedLimit` | 2 | Two sealed results in a row, and the next spin must be readable |
| `guaranteeWithin` | 3 | Something readable arrives inside the first three completed spins |
| `freshWeight` | 2 | A story not yet opened is twice as likely as one already read |

`chooseStory()` builds a pool and draws from it once. There is no retry loop, so
no random source can make it spin.

```
pool = every painted story
if owed a readable one   → keep only the readable ones, if there are any
if one has just repeated → drop it, if that leaves anything
draw, weighting unopened stories by freshWeight
```

**The order of those two filters is the policy.** Readability comes first, so a
reader owed something readable gets it even when that means repeating the story
they just saw: a repeat is a disappointment, a third sealed panel is a dead end.
It is also what lets a week with exactly one readable story keep offering it.

## What counts as a spin

Only a gesture that committed *and* came to rest. `rememberSpin()` is called
from the hook's `onSpinSettled`, which fires at the end of the landing
animation on the committed path and nowhere else — so a gesture that fell short
of four panels, and a glide a hand interrupted halfway, move no counter. That is
enforced by where the call sits rather than by a flag that could be set wrongly.

Arrow keys are not spins either. They step to the neighbouring panel, which is
navigation, like the links in the index below the vessel.

Openings are tracked separately from appearances: being shown a story is not
reading it, and `freshWeight` is about the latter. Every link into a story —
the result panel, the standing "Read …" line, the index — records the opening.

## Turning the vessel to the answer

The glide is now *solved* rather than stepped. A sum of `v * dt` over variable
frame times drifts a few degrees from the curve it is meant to be following, and
with a chosen destination those degrees would have to be taken out by a
correction at the end — which is exactly what reads as the vessel changing its
mind. Friction is unchanged; the distance is simply known before the first
frame, and the release speed derived from it:

```
speed(t)    = v0 e^(-DECAY t)          glide ends at MIN_VELOCITY
distance(t) = (v0 / DECAY)(1 - e^(-DECAY t))
```

Thrown hard, the vessel keeps the direction of the throw and `travelTo()` adds
whole turns until it arrives — reversing to reach a panel would read as being
corrected by something outside the room. Released gently it takes the short way
round rather than labouring most of a revolution to reach somewhere it was
nearly at. Either way the last frame lands on the panel, `commitAngle` sets that
exact angle, and the story revealed is that panel's.

## State

`sessionStorage`, under `amphora.spin.v1`, reached through
`useSyncExternalStore`. Session rather than local on purpose: the protections
exist so one sitting is not frustrating, and a reader returning tomorrow should
meet the vessel fresh.

Every read is defensive and validated field by field — storage can be absent,
refused, or hold something from an older version of the file, and none of those
is a reason for the homepage to fail. The fallback is an empty memory, which
simply means the next spin is treated as the first.

A remembered slug that is no longer painted on the vessel is handled by
membership tests at the point of use, not by migration: the chooser falls back
to the physics if its answer has no stop, and the standing "Read …" line does
not appear for a story that has left the week.

## Reading

The last readable story the vessel offered stands in the result panel's resting
state, where the fleuron would be. Spinning past something you could have read
and having to spin again to get back to it is the kind of thing that turns a
vessel into a machine that wants more pulls. It occupies space the panel had
already reserved, so nothing on the page moves.

When nothing painted on the vessel can be read at all, the panel says so once
rather than leaving the reader to discover it by turning the pot five times.

## Verifying

```bash
npm test            # tests/spin.test.ts
```

The pure rules are fully covered. What the tests cannot reach is the browser, so
these were driven through the real page in a headless Chrome and are worth
repeating by hand after any change to the hook:

1. Eight spins: no story appears three times running, and something readable
   turns up inside the first three.
2. The named story, the panel's link and the highlighted entry in the index all
   agree. (A sealed story's action is `/subscribe` by design — that is not a
   disagreement.)
3. The vessel's resting frame matches the chosen story's angle: Prometheus 36°
   rests on `amphora-040`, Orpheus 252° on `amphora-250`, Pandora 324° on
   `amphora-320`.
4. Mid-flight the panel names nothing; the story appears only once the vessel is
   at rest.
5. Reload the tab: the "Read …" line is still there, and the counters are still
   where they were.

Headless Chrome stalls `requestAnimationFrame` after a frame or two under
`--virtual-time-budget`, so the landing animation only runs there if `rAF` is
driven from `setTimeout` in the page under test.
