# Play screen — clean plate candidates

**Status: not shippable as-is. Aspect ratio is wrong.**

These are candidate *clean plates* for Route 2 of the Play-screen lighting work
(see `docs/superpowers/specs/2026-08-04-play-screen-lighting-design.md`): the
throne hall with its painted light shaft removed, so `ThroneLight` can sweep a
real beam instead of being glued to a painted one.

## What is here

| File | Model | Credits |
| --- | --- | --- |
| `clean-plate-nbp.webp` | nano-banana-pro, image-to-image | 9 |
| `clean-plate-gpt.webp` | gpt-image-2, image-to-image | 12 |
| `clean-plate-v3.webp` | gpt-image-2, retry demanding 9:16 output | 12 |

Source: `apps/android/app/src/main/res/drawable-nodpi/loading_throne_portrait.webp`
(1072×1920).

## Why they cannot ship yet

The beam removal itself worked well — all three are evenly dim, lit only by the
eagle emblem and the sconces, with the shaft and its floor pool gone, and the
architecture largely intact. `clean-plate-gpt.webp` is the closest match to the
original framing.

**Every one of them came back 1024×1024.** The shipped backdrop is 1072×1920.
The third attempt explicitly demanded a tall vertical 9:16 portrait and still
returned a square, so this is a fixed property of the Meshy image-to-image
endpoint rather than something a better prompt will solve.

Extending a square to 9:16 mechanically does not work: stretching the bottom
rows to fill the missing 848px leaves a hard seam at the join and obvious
vertical smearing across the lower third.

## What would finish this

Either of:

1. **Paint the shaft out of the original by hand.** Guarantees an exact match,
   because the geometry never moves. This is the lower-risk option — the
   `ThroneLight` scene constants (`EMBLEM_X/Y`, `GEMS`, `LAND_X/Y`) are
   calibrated against the *current* crop, so a plate with the same framing needs
   no code change at all.
2. **Re-run through a generator that honours aspect ratio**, then re-calibrate
   those constants against the new framing.

## Turning it on

Once a 1072×1920 plate exists, drop it into `drawable-nodpi` and change one line
in `BattleScreen.kt`:

```kotlin
art = ThroneArt.CleanPlate(R.drawable.throne_clean_plate)
```

That is the whole switch. `freeSweep` follows from the type, so the shaft's sway
cap lifts from 0.8° to 6° automatically. No other code changes.
