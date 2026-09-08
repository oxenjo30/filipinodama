# Play Screen Lighting — Design Spec

**Date:** 2026-08-04
**Surface:** Android only (`BattleScreen`, the Play tab) + the shared `BottomTabBar`
**Status:** Approved from mockup; implementing Route 1 and Route 2

---

## Goal

The Play screen is the last thing a player sees before every match, and it is
completely still. Give it ambient life without touching layout, copy, routes, or
game logic:

1. **The light shaft breathes** and fills with drifting dust.
2. **The icons read as lit metal** instead of flat stickers, and they move.

Owner direction: intensity at **Full**, both routes, on the real shipped art.

## Non-goals

- Web. This is Android only.
- Any change to layout, copy, navigation, or game rules.
- Unity, either embedded or as a video source. Evaluated and rejected: embedding
  the engine costs ~20 MB and a second permanent render loop; a pre-rendered video
  loop bands badly on dark purple gradients and burns battery.
- Rive. Evaluated and rejected **for this screen**. Everything here is additive
  shapes and particles over a photo, which Compose `Canvas` draws with no new
  dependency and no download cost. Rive earns its keep on skeletal motion
  (cloth, characters) or designer-authored scenes shipped without an app release
  — revisit it when one of those is the actual requirement.

## Background: what is actually on screen today

`BattleScreen.kt` stacks, back to front:

| Layer | Source |
| --- | --- |
| Base fill `#160B28` | `Box.background` |
| Throne-hall art | `loading_throne_portrait.webp`, `ContentScale.Crop`, full-bleed |
| Vertical scrim | 4-stop `Brush.verticalGradient`, up to 86% opaque mid-screen |
| Tier accent | `Brush.radialGradient`, tier colour at 28% |
| Content | currency pills, identity, tier hero, trophy road, dock, side rail |

**The light shaft is painted into the WebP.** That single fact drives the whole
design: you cannot move what is already painted, so Route 1 adds light on top of
it, and Route 2 replaces it with a layer that can move.

## Route 1 — add light on top

A new `ThroneLight()` composable draws additively **between the art and the
vertical scrim**, so the light sits inside the scene rather than on top of the UI.
Five systems, one shared clock:

| System | Behaviour | Notes |
| --- | --- | --- |
| Shaft breathe | Soft gradient aligned to the painted shaft; opacity on two out-of-phase sines so it never visibly loops | Geometry: origin `(0.90w, -0.05h)`, `21°` from vertical, width `0.50w`, length `0.86h` |
| Dust motes | ~42 pooled particles confined to the shaft, sine wobble across its width, alpha peaking mid-shaft | The single biggest perceptual win — static god rays read as painted, drifting dust reads as volumetric |
| Floor pool | Additive ellipse at the landing point, **sharing the breathe curve** | Shared curve is load-bearing: independent clocks make light and floor visibly disagree |
| Emblem pulse | Additive radial at the eagle `(0.50w, 0.238h)`, its own slow clock | Separate clock so it reads as its own light source, not a reflection of the shaft |
| Gem twinkle | Six small additive radials on the emerald sconces, prime-offset phases | Offsets chosen so no two ever fire together |

The scrims eat most of the added light, so alphas are tuned against the composite,
not in isolation.

### Motion budget

Three tiers — `FULL`, `REDUCED`, `OFF` — resolved once and re-resolved on resume:

- **Battery saver on** → `REDUCED`
- **System reduce-motion / animator duration scale 0** → `OFF`
- **`ActivityManager.isLowRamDevice`** → `REDUCED`
- Otherwise → `FULL`

`REDUCED` halves the clock and caps motes at 18. `OFF` draws a single static
frame. `OFF` must still render the frame, not skip the composable, or the screen
loses the light entirely rather than merely freezing it.

## Route 2 — split the art into layers

Route 1's ceiling is that the beam can brighten but not travel. Route 2 lifts it
by rendering the shaft from a **separate layer** over a **clean plate** — the same
hall with no light painted in.

Runtime design:

- `ThroneLight` takes a `ThroneArt` value: either `Baked` (Route 1, one WebP) or
  `Layered(plate, shaft, emblem)`.
- With `Layered`, the shaft layer is drawn with its own rotation and translation,
  so it genuinely sweeps; sway is no longer capped near 1°.
- The composable is the only thing that knows which mode is active. Callers pass
  art, not booleans.

This keeps Route 2 a **data change plus one branch**, so shipping Route 1 first
costs nothing when the layered art lands.

### Art requirement and the honest risk

Route 2 needs a clean plate that matches the existing hall exactly. Two ways to
get one, and neither is free:

1. **Regenerate** the hall through the existing image pipeline. Fast, but a
   regenerated hall is a *new* room — pillars, gems and throne will not land on
   the same pixels, so the tier art and UI that were composed against the current
   image may need renudging.
2. **Paint out** the shaft from the current WebP in an editor. Guarantees a match;
   needs a human with a brush.

**Decision:** build the layered renderer now and ship it behind `ThroneArt`,
defaulting to `Baked`. The moment a clean plate exists — generated or painted —
flipping to `CleanPlate` is a one-line change with no code rewrite. This is the
only part of the design that is gated on an asset rather than on code.

### Simplification found during implementation

The mockup assumed three new assets (plate + beam + emblem glow). It needs
**one**. `ThroneLight` already draws the shaft procedurally; the only reason its
sway is capped at 0.8° is that it must stay glued to the *painted* beam. Remove
the painted beam and the procedural shaft is free to sweep. So `ThroneArt` is
`Baked` or `CleanPlate(plate, shaft = null)`, where a hand-painted shaft image
is optional and nothing requires it.

### Outcome of the art attempt (2026-08-04)

Three image-to-image runs against the shipped WebP, 33 credits total:
nano-banana-pro (9), gpt-image-2 (12), and a gpt-image-2 retry explicitly
demanding a 9:16 portrait (12).

The beam removal succeeded in all three. **All three returned 1024×1024.** The
shipped backdrop is 1072×1920, and the retry proves the square output is a fixed
property of the endpoint rather than a prompting problem. Mechanically extending
a square to 9:16 leaves a hard seam and vertical smearing, so it is not usable.

Route 2 therefore ships **code-complete and art-blocked**. Candidates and the
one-line switch-on instructions are in
`docs/art/play-clean-plate-candidates/README.md`. Hand-painting the shaft out of
the original is the lower-risk finish, because the `ThroneLight` scene constants
are calibrated to the current crop and would not need re-deriving.

## Icons

Owner direction: brighter, and animated.

**This is an explicit change to an approved handoff requirement.**
`BottomTabBar.kt` currently dims inactive icons to `alpha 0.5` +
`grayscale(0.4)`, implementing the mockup 1:1 and deliberately. The owner has
asked for brighter icons, which supersedes that row. The active/inactive
distinction is *preserved* — inactive icons are lifted, not equalised — so the
tab bar still reads as a tab bar.

| Treatment | Where | Detail |
| --- | --- | --- |
| Brightness lift | Rail buttons, dock slots, currency pills, trophy road, tab bar | `ColorMatrix` scale on RGB plus a small saturation lift |
| Warm glow | Rail buttons, dock slots, active tab | Radial behind the icon, gold at low alpha |
| Lifted tile | Rail buttons, dock slots | Gradient raised from `#3A2A5E→#241640` to `#4E3A82→#2B1A52`, gold border at higher alpha |
| Idle pulse | Rail buttons | Scale + glow on an infinite transition, staggered per button so they never beat together |
| Claimable bounce | Daily-reward rail button **only when a reward is claimable** | Fires on real state, never decorative |
| Active-tab glow | Tab bar | Pulsing radial behind the selected tab icon |

Inactive tab icons go from `alpha 0.5 / grayscale 0.4` to `alpha 0.78 /
grayscale 0.15`.

All icon motion obeys the same motion budget as the light.

## Testing

- Unit-testable pure functions: motion-budget resolution, breathe curve, mote
  advance/recycle, gem phase offsets. These are where the bugs live.
- Compose UI behaviour (does a Canvas draw) is not usefully unit-testable here;
  verification is a release build plus device screenshots at each budget tier.
- Regression guard: `BattleScreen` must render unchanged with `OFF` and `Baked`.

## Risks

| Risk | Mitigation |
| --- | --- |
| A permanently animating screen costs battery | Motion budget; `OFF` draws one static frame; nothing animates off-screen |
| Added light hurts text contrast | Light is drawn **under** both existing scrims, which are unchanged |
| Brighter icons flatten the active/inactive tab distinction | Inactive lifted to 0.78/0.15, not to parity; active keeps gold tint plus glow |
| Route 2 clean plate does not match the current hall | Layered renderer ships defaulting to `Baked`; no visual change until an asset is accepted |
