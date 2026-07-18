import { Helmet } from "react-helmet-async";

/**
 * seo.tsx — the single source of truth for per-route <head> tags and JSON-LD.
 *
 * WHY THIS EXISTS: the site is a client-rendered SPA, so search engines and AI
 * answer engines saw one empty shell for every route. Content routes are now
 * prerendered to static HTML (see prerender.mjs), and this module supplies the
 * per-route title / description / canonical / Open Graph / Twitter / structured
 * data that make each page rankable for its own keyword.
 *
 * The page-specific tags were removed from index.html on purpose — a hardcoded
 * shell <title>/canonical would survive onto every prerendered route alongside
 * Helmet's, producing duplicate/conflicting canonicals. So EVERY route (including
 * home) must render a <SiteHead> to own its head; there is no shell fallback.
 */

export const SITE = {
  origin: "https://filipinodama.com",
  name: "FilipinoDama Royal",
  brand: "FilipinoDama",
  ogImage: "https://filipinodama.com/assets/brand/og-image.png",
  logo: "https://filipinodama.com/assets/brand/icon-512.png",
  twitterCard: "summary_large_image",
} as const;

/** Absolute canonical URL for a path (leading slash, no trailing slash except root). */
export function canonical(path: string): string {
  if (!path || path === "/") return `${SITE.origin}/`;
  const clean = "/" + path.replace(/^\/+/, "").replace(/\/+$/, "");
  return SITE.origin + clean;
}

type SiteHeadProps = {
  title: string;
  description: string;
  /** Route path, e.g. "/blog" or "/blog/some-slug". Root is "/". */
  path: string;
  /** og:type — "website" for pages, "article" for blog posts. */
  ogType?: "website" | "article";
  image?: string;
  /** When true, emit <meta name="robots" content="noindex"> (thin/unknown pages). */
  noindex?: boolean;
  /** One or more JSON-LD objects to embed. */
  jsonLd?: object | object[];
};

/**
 * SiteHead — renders the full, self-consistent <head> for a route. Helmet dedups
 * by tag identity (one <title>, one rel=canonical, one og:url), so as long as the
 * static shell carries none of these, exactly one of each ships per page.
 */
export function SiteHead({
  title,
  description,
  path,
  ogType = "website",
  image = SITE.ogImage,
  noindex = false,
  jsonLd,
}: SiteHeadProps) {
  const url = canonical(path);
  const blocks = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex" />}

      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={SITE.name} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />

      <meta name="twitter:card" content={SITE.twitterCard} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {blocks.map((block, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(block)}
        </script>
      ))}
    </Helmet>
  );
}

// ── JSON-LD builders ────────────────────────────────────────────────────────
// articles.json carries no author / dateModified / per-article image, so those
// fields are filled from site-level defaults here rather than migrating 145 rows.

const publisher = {
  "@type": "Organization",
  name: SITE.name,
  logo: { "@type": "ImageObject", url: SITE.logo },
} as const;

/** WebSite + Organization for the homepage. */
export function websiteJsonLd(): object[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE.name,
      url: `${SITE.origin}/`,
      alternateName: ["Filipino Dama", "Filipino Checkers", "Dama"],
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE.name,
      url: `${SITE.origin}/`,
      logo: SITE.logo,
    },
  ];
}

/** FAQPage for a page with question/answer blocks (e.g. /learn rules FAQ). */
export function faqJsonLd(faqs: { q: string; a: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** HowTo for step-by-step guides (e.g. how to play dama on /learn). */
export function howToJsonLd(name: string, description: string, steps: { name: string; text: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description,
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

/** Article + BreadcrumbList for a blog post. */
export function articleJsonLd(a: {
  slug: string;
  title: string;
  description: string;
  datePublished: string | null;
  dateModified?: string | null;
}): object[] {
  const url = canonical(`/blog/${a.slug}`);
  const published = a.datePublished ?? undefined;
  const modified = a.dateModified ?? a.datePublished ?? undefined;

  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: a.title.slice(0, 110),
      description: a.description,
      image: SITE.ogImage,
      ...(published ? { datePublished: published } : {}),
      ...(modified ? { dateModified: modified } : {}),
      author: { "@type": "Organization", name: SITE.brand },
      publisher,
      mainEntityOfPage: url,
      url,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE.origin}/` },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE.origin}/blog` },
        { "@type": "ListItem", position: 3, name: a.title, item: url },
      ],
    },
  ];
}
