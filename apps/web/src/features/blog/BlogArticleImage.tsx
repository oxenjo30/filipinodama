import type { CSSProperties } from "react";
import type { Article } from "./blog";
import { articleImageFor } from "./blogImages";

type BlogArticleImageProps = {
  article: Article;
  variant: "card" | "hero" | "article";
  priority?: boolean;
};

export function BlogArticleImage({ article, variant, priority = false }: BlogArticleImageProps) {
  const image = articleImageFor(article);
  const style = imageFrameStyle(variant);
  const imgAlt = variant === "card" ? "" : image.alt;

  return (
    <div style={style}>
      <img
        src={image.src}
        alt={imgAlt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: image.objectPosition ?? "center",
          transform: variant === "card" ? "scale(1.02)" : "none",
        }}
      />
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(15,8,32,0) 45%, rgba(15,8,32,.42)), radial-gradient(90% 80% at 0% 0%, rgba(247,226,160,.22), transparent 55%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function imageFrameStyle(variant: BlogArticleImageProps["variant"]): CSSProperties {
  const common: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    borderRadius: 12,
    border: "1px solid rgba(232,184,75,.18)",
    background: "rgba(15,8,32,.55)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.03)",
    isolation: "isolate",
  };

  if (variant === "article") {
    return {
      ...common,
      maxWidth: 720,
      aspectRatio: "16 / 9",
      margin: "0 0 28px",
    };
  }

  if (variant === "hero") {
    return {
      ...common,
      aspectRatio: "16 / 9",
      margin: "0 0 20px",
    };
  }

  return {
    ...common,
    aspectRatio: "16 / 9",
    margin: "0 0 6px",
  };
}
