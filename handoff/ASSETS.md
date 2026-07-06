# ASSETS.md — Image Asset Inventory & Manifest

All production image assets already exist in the prototype project under `uploads/`. **Copy them into `apps/web/public/assets/`** during scaffolding (keep the same filenames). The prototype references them as `uploads/<file>`; in production they resolve from `/assets/<file>` and are stored as `assetKey` on `StoreItem`.

> These were generated in **Meshy AI** and hand-picked. Treat them as final art. Do not regenerate or restyle without approval.

## Piece skins (man + king, per color)
Each skin needs a `man` and `king` PNG per color. The board renders `equippedSkin` for both sides.

| Skin | Files |
|------|-------|
| **Classic Crimson / Royal** (default) | `crimson-man.png`, `crimson-king.png`, `blue-man.png`, `blue-king.png` |
| Jade | `jade-man.png`, `jade-king.png` |
| Obsidian | `obsidian-man.png`, `obsidian-king.png` |
| (variant blue art) | `blue-man-*.png`, `blue-king-*.png` (hashed variants — keep the canonical `blue-man.png` / `blue-king.png`) |
| Heritage-hero skins | `babaylan.webp`, `bagani.webp`, `mandirigma.webp`, `diwata.webp`, `ermitanyo.webp` (premium piece skins) |

## Board themes (full-surface textures)
| Theme | File |
|-------|------|
| Marble + Gold (default) | `board-marble.png` |
| Classic Wood | `board-wood.png` |
| Ebony | `board-ebony.png` |
| Obsidian | `board-obsidian.png` |
| Ornate frame overlay | `board-frame.png`, `frame-corner*.png`, `frame-edge-h.png`, `frame-edge-v.png`, `filigree.png`, `laurel.png` |

## Avatars & frames
- Player avatars: `avatar-p1.png`, `avatar-p2.png` (+ user uploads go to S3).
- Cosmetic frames: `uploads/frames/*` (equipped via `User.frameId`).

## Currency & reward icons
| Icon | File |
|------|------|
| Gold coin | `ic-coin.png` |
| Diamond/gem | `ic-gem.png` |
| Trophy | `ic-trophy.png` |
| Chest (daily/rewards) | `ic-chest.png` |

## Mode & menu art
| Use | File |
|-----|------|
| Mode: Quick / Casual | `mode-quick.webp` |
| Mode: Ranked | `mode-ranked.webp` |
| Mode: vs AI | `mode-vs-ai.webp` |
| Mode: Friend / Private | `mode-friend.webp` |
| Menu cards | `mc-classic.png`, `mc-ranked.png`, `mc-training.png`, `mc-kingdom.png` |
| Guild / hero medallions | `me-guild.png`, `me-castle.png`, `me-crown.png`, `me-swords.png`, `me-target.png`, `me-banner.png` |
| AI difficulty crests | `diff-easy.webp`, `diff-normal.webp`, `diff-hard.webp` |

## Rank / medals / achievements
| Use | File |
|-----|------|
| Podium medals | `medal-1.png`, `medal-2.png`, `medal-3.png` |
| Rank crests | `grandmaster.png`, `kingmaker.png` |
| Achievement badges | `first-blood.png`, and others in `uploads/` |

## Events & season
| Use | File |
|-----|------|
| Event banners | `evt-fiesta.png`, `evt-coins2x.png`, `evt-skull.png` |

## Branding
| Use | File |
|-----|------|
| Sun logo mark | `logo-sun.png` |
| Loading screen art | `uploads/loading/*` |

## Redesign explorations (reference only — not shipped)
`dama_redesign_1..6.png`, `pasted-*.png` are exploration screenshots. Keep out of production `public/`.

---

## StoreItem mapping
When seeding `StoreItem` (see `DATABASE_SCHEMA.md`), each row's `assetKey` points at one of these files (without the `uploads/`/`/assets/` prefix — store just the filename or a stable slug and resolve in the client). Example rows:

```
{ id: "board-marble",  type: BOARD,  name: "Marble & Gold", assetKey: "board-marble.png", priceGold: 0,    isPremium:false }  // default, owned
{ id: "board-obsidian",type: BOARD,  name: "Obsidian",      assetKey: "board-obsidian.png", priceGold: 4500 }
{ id: "board-ebony",   type: BOARD,  name: "Ebony",         assetKey: "board-ebony.png",   priceDiamonds: 120, isPremium:true }
{ id: "skin-babaylan", type: SKIN,   name: "Babaylan",      assetKey: "babaylan.webp",     priceDiamonds: 150, isPremium:true }
{ id: "skin-jade",     type: SKIN,   name: "Jade",          assetKey: "jade",              priceGold: 3000 }   // resolves jade-man/king
...
```

> Confirm the exact catalog + prices against the prototype's Store data before finalizing seed values — the prototype is the source of truth for what's free, Gold-priced, and Diamond-priced.

## License / provenance note
All art was produced for this project via Meshy AI. Retain the source project reference and generation records for licensing. Do not ship the raw `dama_redesign_*` / `pasted-*` exploration images.
