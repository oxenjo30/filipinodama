# Third-party font notices

Fonts bundled in `app/src/main/res/font/` are self-hosted from Google Fonts
(no game art or brand assets are included — see Phase 1 boundaries).

| Family | File | License | Source |
|---|---|---|---|
| Cinzel (variable, weights 400–900) | `cinzel_variable.ttf` | SIL Open Font License 1.1 | https://github.com/google/fonts/tree/main/ofl/cinzel |
| Inter (variable, opsz+weight axes) | `inter_variable.ttf` | SIL Open Font License 1.1 | https://github.com/google/fonts/tree/main/ofl/inter |
| JetBrains Mono (variable, weight axis) | `jetbrainsmono_variable.ttf` | SIL Open Font License 1.1 | https://github.com/google/fonts/tree/main/ofl/jetbrainsmono |

Full license text for each family: https://scripts.sil.org/OFL

**Deviation from plan**: the task brief expected JetBrains Mono to be
Apache-2.0 (its historical license). As of this fetch (2026-07-12), Google
Fonts serves JetBrains Mono from `ofl/jetbrainsmono/` under OFL 1.1 — it has
been relicensed upstream. All three fonts are therefore OFL 1.1, which is
strictly compatible with this project's use (self-hosted, no redistribution
restrictions beyond OFL's own terms).

**Simplification**: each family is fetched as a single variable font file
(one file covers the whole weight range, and Inter's optical-size axis too)
rather than separate static per-weight files. `Type.kt` selects specific
weights via Compose's `FontVariation.Settings`. Variable-font variation
settings are honored on devices/renderers that support them; on older
Android versions the font renders at its default static instance, which is
an acceptable Phase 1 simplification (all text remains legible; only the
precise weight may not exactly match on very old OS versions).
