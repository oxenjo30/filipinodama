import { SITE } from "../../lib/seo";
import type { Article, BlogCategory } from "./blog";

export type BlogImage = {
  src: string;
  url: string;
  alt: string;
  objectPosition?: string;
};

type ImageKey =
  | "strategy"
  | "plaza"
  | "damath"
  | "patintero"
  | "piko"
  | "sipa"
  | "sungka"
  | "tumbangPreso"
  | "luksongTinik"
  | "online"
  | "tournament"
  | "king"
  | "battle"
  | "victory";

const IMAGES: Record<ImageKey, Omit<BlogImage, "url">> = {
  strategy: {
    src: "/assets/culture/dama-strategy.webp",
    alt: "Two Filipino Dama players studying a board during a sunset match.",
    objectPosition: "center",
  },
  plaza: {
    src: "/assets/culture/dama-plaza.webp",
    alt: "Two elders playing Filipino Dama at a neighborhood plaza.",
    objectPosition: "center",
  },
  damath: {
    src: "/assets/culture/damath.webp",
    alt: "A Filipino classroom game scene inspired by Damath and board-game learning.",
    objectPosition: "center",
  },
  patintero: {
    src: "/assets/culture/patintero.webp",
    alt: "Children playing the Filipino street game Patintero.",
    objectPosition: "center",
  },
  piko: {
    src: "/assets/culture/piko.webp",
    alt: "Children playing Piko, a traditional Filipino playground game.",
    objectPosition: "center",
  },
  sipa: {
    src: "/assets/culture/sipa.webp",
    alt: "A traditional Filipino Sipa game scene.",
    objectPosition: "center",
  },
  sungka: {
    src: "/assets/culture/sungka.webp",
    alt: "A traditional Sungka board game scene from Filipino culture.",
    objectPosition: "center",
  },
  tumbangPreso: {
    src: "/assets/culture/tumbang-preso.webp",
    alt: "Children playing Tumbang Preso, a classic Filipino outdoor game.",
    objectPosition: "center",
  },
  luksongTinik: {
    src: "/assets/culture/luksong-tinik.webp",
    alt: "Children playing Luksong Tinik, a traditional Filipino game.",
    objectPosition: "center",
  },
  online: {
    src: "/assets/loading/load-matchmaking.webp",
    alt: "A dramatic Filipino Dama board prepared for an online match.",
    objectPosition: "center",
  },
  tournament: {
    src: "/assets/loading/load-victory.webp",
    alt: "A royal victory hall representing competitive Filipino Dama.",
    objectPosition: "center",
  },
  king: {
    src: "/assets/loading/load-throne.webp",
    alt: "A royal Dama board in a throne hall, representing king play and promotion.",
    objectPosition: "center",
  },
  battle: {
    src: "/assets/loading/load-crimson.webp",
    alt: "A tactical battle scene representing captures, defense, and pressure in Dama.",
    objectPosition: "center",
  },
  victory: {
    src: "/assets/loading/load-victory.webp",
    alt: "A golden victory hall representing winning Dama strategy.",
    objectPosition: "center",
  },
};

const MATCHERS: { pattern: RegExp; image: ImageKey }[] = [
  { pattern: /\b(damath|sci-dama)\b/, image: "damath" },
  { pattern: /\bpatintero\b/, image: "patintero" },
  { pattern: /\bpiko\b/, image: "piko" },
  { pattern: /\bsipa\b/, image: "sipa" },
  { pattern: /\bsungka\b/, image: "sungka" },
  { pattern: /\btumbang-preso\b|\btumbang preso\b/, image: "tumbangPreso" },
  { pattern: /\bluksong-tinik\b|\bluksong tinik\b/, image: "luksongTinik" },
  { pattern: /\bhistory|spanish|generation|schoolyard|sari-sari|regional|tradition|culture|kids|bonding|rainy|plaza|caps|cardboard|homemade|preserving|filipinos love|growing up\b/, image: "plaza" },
  { pattern: /\bonline|multiplayer|matchmaking|physical|computer|browser|screen\b/, image: "online" },
  { pattern: /\btournament|barangay|fiesta|leaderboard|ranked|rank\b/, image: "tournament" },
  { pattern: /\bking|kings|promotion|promote|flying|throne\b/, image: "king" },
  { pattern: /\bcapture|captures|trap|traps|fork|sacrifice|greedy|threat|forced|force|defense|defending|pressure|huff\b/, image: "battle" },
  { pattern: /\bwin|winning|won|advantage|endgame|opposition|simplify|convert|victory|draw\b/, image: "victory" },
  { pattern: /\bstrategy|opening|center|central|diagonal|tempo|phalanx|lane|material|position|mid-game|tactics|tips|mistakes|sharpness\b/, image: "strategy" },
];

const CATEGORY_FALLBACK: Record<BlogCategory, ImageKey> = {
  Guides: "strategy",
  Rules: "king",
  Strategy: "strategy",
  Culture: "plaza",
};

export const blogImageSources = Object.values(IMAGES).map((image) => image.src);

export function articleImageFor(article: Article): BlogImage {
  const text = `${article.slug} ${article.title} ${article.description}`.toLowerCase();
  const matched = MATCHERS.find((rule) => rule.pattern.test(text));
  const image = IMAGES[matched?.image ?? CATEGORY_FALLBACK[article.category]];

  return {
    ...image,
    url: absoluteAssetUrl(image.src),
  };
}

function absoluteAssetUrl(src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  return `${SITE.origin}${src.startsWith("/") ? src : `/${src}`}`;
}
