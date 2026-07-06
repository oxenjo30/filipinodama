/**
 * Central asset manifest. Every image/audio reference in the app goes through
 * these logical names — no raw paths in components. Files live in
 * public/assets (populated by scripts/prepare-assets.mjs from the original
 * art library; originals are never edited).
 *
 * IMPORTANT: portraits (men/kings/castles) are OPAQUE renders on a near-black
 * background — they must always be shown inside a masked/cropped container
 * (circle token, panel, hero card), never dropped on a light surface.
 */

export interface ArtAsset {
  src: string
  alt: string
  /** true = has real transparency and can sit on any background */
  transparent: boolean
}

const a = (src: string, alt: string, transparent = false): ArtAsset => ({
  src: `/assets/${src}`,
  alt,
  transparent,
})

export const ASSETS = {
  // Faction portraits (opaque, near-black backgrounds)
  redMan: a('pieces/red-man.webp', 'Red soldier of the Ember Legion'),
  blueMan: a('pieces/blue-man.webp', 'Blue soldier of the Tidal Order'),
  redKing: a('pieces/red-king.webp', 'Crowned king of the Ember Legion'),
  blueKing: a('pieces/blue-king.webp', 'Crowned king of the Tidal Order'),
  redCastle: a('pieces/red-castle.webp', 'Ember Legion castle'),
  blueCastle: a('pieces/blue-castle.webp', 'Tidal Order castle'),

  // Board & scene art (opaque)
  boardHero: a('board/board-hero.webp', 'Stone and gold dama board'),
  boardClassic: a('board/board-classic.webp', 'Classic framed dama board'),
  heroDesk: a('art/hero-desk.webp', 'Dama board on a candlelit desk'),
  castleBanner: a('art/castle-banner.webp', 'Castle with war banners'),

  // Ornamental frames (transparent)
  framePanel: a('frames/panel.webp', '', true),
  frameFiligree: a('frames/filigree.webp', '', true),
  avatarRing: a('frames/avatar-ring.webp', '', true),
  boardFrame: a('frames/board-frame.webp', '', true),
  podium1: a('frames/podium-1.webp', 'Gold champion podium', true),
  podium2: a('frames/podium-2.webp', 'Silver podium', true),
  podium3: a('frames/podium-3.webp', 'Bronze podium', true),

  // Avatars (opaque portraits; the last six were generated with Meshy AI in
  // the same painted purple-and-gold style as the originals)
  avatarMale: a('avatars/male.webp', 'Male warrior avatar'),
  avatarFemale: a('avatars/female.webp', 'Female warrior avatar'),
  avatarDefault: a('avatars/default.webp', 'Default avatar'),
  // Meshy-generated avatars: transparent PNGs (chroma-key cut out)
  avatarMandirigma: a('avatars/mandirigma.png', 'Mandirigma warrior avatar', true),
  avatarBabaylan: a('avatars/babaylan.png', 'Babaylan priestess avatar', true),
  avatarBagani: a('avatars/bagani.png', 'Bagani veteran avatar', true),
  avatarDiwata: a('avatars/diwata.png', 'Diwata celestial avatar', true),
  avatarSultan: a('avatars/sultan.png', 'Sultan elder avatar', true),
  avatarErmitanyo: a('avatars/ermitanyo.png', 'Ermitanyo hooded wanderer avatar', true),

  // Icons (transparent)
  icCoin: a('icons/ic-coin.webp', 'Coins', true),
  icGem: a('icons/ic-gem.webp', 'Gems', true),
  icTrophy: a('icons/ic-trophy.webp', 'Trophy', true),
  icChest: a('icons/ic-chest.webp', 'Chest', true),

  // Emblems / mode art (transparent unless noted)
  logo: a('brand/logo-sun.png', 'FilipinoDama sun emblem', true),
  mcClassic: a('emblems/mc-classic.webp', 'Classic mode', true),
  mcKingdom: a('emblems/mc-kingdom.webp', 'Kingdom mode', true),
  mcRanked: a('emblems/mc-ranked.webp', 'Ranked mode', true),
  mcTraining: a('emblems/mc-training.webp', 'Training mode', true),
  meCrown: a('emblems/me-crown.webp', 'Crown emblem', true),
  meSwords: a('emblems/me-swords.webp', 'Crossed swords emblem', true),
  meCastle: a('emblems/me-castle.webp', 'Castle emblem', true),

  ogImage: a('brand/og-image.png', 'FilipinoDama'),

  // Mode & difficulty emblems (Meshy AI, painted purple/gold dark-fantasy
  // style; transparent PNGs cut out from a magenta chroma-key background)
  modeQuick: a('emblems/mode-quick.png', 'Crossed lightning swords over a dama board', true),
  modeRanked: a('emblems/mode-ranked.png', 'Championship trophy with laurels', true),
  modeVsAi: a('emblems/mode-vs-ai.png', 'Clockwork automaton studying a dama piece', true),
  modeFriend: a('emblems/mode-friend.png', 'Armored gauntlets in a handshake', true),
  diffEasy: a('emblems/diff-easy.png', 'Wooden training shield with green gem', true),
  diffNormal: a('emblems/diff-normal.png', 'Crossed steel swords with amber gem', true),
  diffHard: a('emblems/diff-hard.png', 'Crimson demon skull war-helm', true),
} as const

export type AssetKey = keyof typeof ASSETS

export const AUDIO = {
  music: '/assets/audio/balangay-of-iron.mp3',
} as const

/** Preload list for the splash screen: what the first game screen needs. */
export const PRELOAD_ASSETS: ArtAsset[] = [
  ASSETS.redMan,
  ASSETS.blueMan,
  ASSETS.redKing,
  ASSETS.blueKing,
  ASSETS.logo,
  ASSETS.boardHero,
]
