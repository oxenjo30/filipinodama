// One-time asset pipeline: copies curated art from the previous filipinodama
// project ("Clash Royale" folder) into public/assets, optimized to webp.
// Originals are never modified. Re-run with: npm run prepare-assets
import { mkdir, copyFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const SRC = 'D:/AI Projects/Clash Royale'
const OUT = fileURLToPath(new URL('../public/assets/', import.meta.url))

/** @type {Array<{from:string,to:string,width?:number,copy?:boolean,quality?:number}>} */
const JOBS = [
  // Faction portraits (opaque near-black backgrounds — UI must mask/crop them)
  { from: 'dama/images/red_soldiers.png', to: 'pieces/red-man.webp', width: 640 },
  { from: 'dama/images/blue soldiers.png', to: 'pieces/blue-man.webp', width: 640 },
  { from: 'dama/images/red king.png', to: 'pieces/red-king.webp', width: 640 },
  { from: 'dama/images/blue king.png', to: 'pieces/blue-king.webp', width: 640 },
  { from: 'dama/images/red castle.png', to: 'pieces/red-castle.webp', width: 640 },
  { from: 'dama/images/blue castle.png', to: 'pieces/blue-castle.webp', width: 640 },
  // Board / scene art
  { from: 'dama/images/board v2.png', to: 'board/board-hero.webp', width: 1280 },
  { from: 'web/assets/board-classic.png', to: 'board/board-classic.webp', width: 1024 },
  { from: 'web/assets/art/hero-desk.png', to: 'art/hero-desk.webp', width: 1600 },
  { from: 'web/assets/art/ig-castle-banner.png', to: 'art/castle-banner.webp', width: 1600 },
  // Frames & ornaments (have alpha)
  { from: 'web/assets/frames/panel.png', to: 'frames/panel.webp', width: 1024 },
  { from: 'web/assets/frames/filigree.png', to: 'frames/filigree.webp', width: 1024 },
  { from: 'web/assets/frames/avatar-ring.png', to: 'frames/avatar-ring.webp', width: 512 },
  { from: 'web/assets/frames/board-frame.png', to: 'frames/board-frame.webp', width: 900 },
  { from: 'web/assets/frames/podium-1.png', to: 'frames/podium-1.webp', width: 512 },
  { from: 'web/assets/frames/podium-2.png', to: 'frames/podium-2.webp', width: 512 },
  { from: 'web/assets/frames/podium-3.png', to: 'frames/podium-3.webp', width: 512 },
  { from: 'web/assets/frames/medal-1.png', to: 'frames/medal-1.webp', width: 256 },
  { from: 'web/assets/frames/medal-2.png', to: 'frames/medal-2.webp', width: 256 },
  { from: 'web/assets/frames/medal-3.png', to: 'frames/medal-3.webp', width: 256 },
  // Avatars
  { from: 'web/assets/avatars/male.png', to: 'avatars/male.webp', width: 512 },
  { from: 'web/assets/avatars/female.png', to: 'avatars/female.webp', width: 512 },
  { from: 'web/assets/avatars/default.png', to: 'avatars/default.webp', width: 512 },
  // Icons
  { from: 'web/assets/icons/ic-coin.png', to: 'icons/ic-coin.webp', width: 256 },
  { from: 'web/assets/icons/ic-gem.png', to: 'icons/ic-gem.webp', width: 256 },
  { from: 'web/assets/icons/ic-trophy.png', to: 'icons/ic-trophy.webp', width: 256 },
  { from: 'web/assets/icons/ic-chest.png', to: 'icons/ic-chest.webp', width: 256 },
  // Emblems / mode cards
  { from: 'web/assets/emblems/logo-sun.png', to: 'brand/logo-sun.png', copy: true },
  { from: 'web/assets/emblems/mc-classic.png', to: 'emblems/mc-classic.webp', width: 512 },
  { from: 'web/assets/emblems/mc-kingdom.png', to: 'emblems/mc-kingdom.webp', width: 512 },
  { from: 'web/assets/emblems/mc-ranked.png', to: 'emblems/mc-ranked.webp', width: 512 },
  { from: 'web/assets/emblems/mc-training.png', to: 'emblems/mc-training.webp', width: 512 },
  { from: 'web/assets/emblems/me-crown.png', to: 'emblems/me-crown.webp', width: 512 },
  { from: 'web/assets/emblems/me-swords.png', to: 'emblems/me-swords.webp', width: 512 },
  { from: 'web/assets/emblems/me-castle.png', to: 'emblems/me-castle.webp', width: 512 },
  // Brand / meta (copied verbatim)
  { from: 'web/og-image.png', to: 'brand/og-image.png', copy: true },
  { from: 'web/favicon.ico', to: 'brand/favicon.ico', copy: true },
  { from: 'web/favicon-96x96.png', to: 'brand/favicon-96x96.png', copy: true },
  { from: 'web/apple-touch-icon.png', to: 'brand/apple-touch-icon.png', copy: true },
  { from: 'web/web-app-manifest-192x192.png', to: 'brand/icon-192.png', copy: true },
  { from: 'web/web-app-manifest-512x512.png', to: 'brand/icon-512.png', copy: true },
  // Music
  { from: 'dama/Balangay of Iron.mp3', to: 'audio/balangay-of-iron.mp3', copy: true },
]

let ok = 0
let failed = 0
for (const job of JOBS) {
  const src = path.join(SRC, job.from)
  const dest = path.join(OUT, job.to)
  await mkdir(path.dirname(dest), { recursive: true })
  try {
    if (job.copy) {
      await copyFile(src, dest)
    } else {
      await sharp(src)
        .resize({ width: job.width, withoutEnlargement: true })
        .webp({ quality: job.quality ?? 82 })
        .toFile(dest)
    }
    const s = await stat(dest)
    console.log(`ok  ${job.to}  ${(s.size / 1024).toFixed(0)}kb`)
    ok++
  } catch (e) {
    console.error(`FAIL ${job.from}: ${e.message}`)
    failed++
  }
}
console.log(`\n${ok} written, ${failed} failed`)
if (failed > 0) process.exit(1)
