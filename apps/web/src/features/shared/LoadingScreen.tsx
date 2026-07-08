import { useEffect } from "react";
import { BRAND, loadingArt } from "../../lib/assets";
import type { LoadingContext } from "../../lib/assets";
import type { PieceSkin } from "../../lib/assets";
import { startLoadingAmbience } from "../../lib/sfx";

/**
 * LoadingScreen — the handoff's pre-match loader (dc-import "Loading Screen",
 * shown via `playWithLoader(ctx, fn)` at handoff line 2976). A full-screen
 * themed overlay: a per-mode background photo (Ken-Burns drift) under a dark
 * scrim, with a flipping Dama coin over a pulsing ground shadow, a
 * context-specific title/subtitle, and three cycling progress dots on top.
 *
 * Contexts mirror the handoff's `loadingCtx`:
 *   - "matchmaking" — pairing for a casual/quick online match
 *   - "ranked"      — pairing for a rated ladder match
 *   - "default"     — offline (vs AI) / local pass-&-play prep
 *
 * The background art comes from `loadingArt(context, skin)` (see assets.ts):
 * the online contexts have fixed backdrops; the offline "default" context
 * mirrors the equipped piece skin so the loader previews your cosmetics. Each
 * set ships a landscape + `-portrait` variant, wired via <picture> below.
 *
 * All motion reuses keyframes already ported into index.css (fdcoinflip,
 * fdcoinbob, fdshadowpulse, fdsheen, fdpulse, fdkenburns).
 */

export type { LoadingContext } from "../../lib/assets";

type Copy = { eyebrow: string; title: string; subtitle: string; accent: string };

const COPY: Record<LoadingContext, Copy> = {
  matchmaking: {
    eyebrow: "✦ FINDING A MATCH ✦",
    title: "Pairing You With a Rival",
    subtitle: "Matching your skill level…",
    accent: "#f0cf72",
  },
  ranked: {
    eyebrow: "✦ RANKED LADDER ✦",
    title: "Entering the Arena",
    subtitle: "Seeking a worthy challenger…",
    accent: "#ff9aa6",
  },
  default: {
    eyebrow: "✦ PREPARING THE BOARD ✦",
    title: "Setting Up Your Match",
    subtitle: "Polishing the discs…",
    accent: "#8ce0ad",
  },
};

export type LoadingScreenProps = {
  /** which flavour of copy/accent to show */
  context?: LoadingContext;
  /**
   * Equipped piece skin — only used for the offline "default" context, where
   * the background art mirrors the skin the player is about to use.
   */
  skin?: PieceSkin;
};

export function LoadingScreen({ context = "default", skin = "default" }: LoadingScreenProps) {
  const copy = COPY[context];
  const art = loadingArt(context, skin);

  // Soft ambient pad while the loader is on screen; fades out on unmount (i.e.
  // when the match/board takes over). Respects the Sound Effects toggle.
  useEffect(() => {
    const stop = startLoadingAmbience();
    return stop;
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        overflow: "hidden",
        background: "linear-gradient(180deg,#1c1030,#0f0820)",
        animation: "fdfade .3s ease both",
      }}
    >
      {/* ── per-mode background photo (landscape / portrait) with slow drift ── */}
      <picture>
        <source media="(orientation:portrait)" srcSet={art.portrait} />
        <img
          src={art.landscape}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transformOrigin: "center",
            animation: "fdkenburns 12s ease-out both",
            pointerEvents: "none",
          }}
        />
      </picture>

      {/* legibility scrim — darken the photo so the coin + copy read cleanly */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(1100px 700px at 50% 42%,rgba(15,8,32,.35),rgba(15,8,32,.72) 70%,rgba(15,8,32,.92))," +
            "linear-gradient(180deg,rgba(15,8,32,.55),rgba(15,8,32,.35) 40%,rgba(15,8,32,.8))",
          pointerEvents: "none",
        }}
      />

      {/* subtle dotted texture, matching the app background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.4,
          backgroundImage: "radial-gradient(rgba(232,184,75,.05) 1px,transparent 1px)",
          backgroundSize: "30px 30px",
          pointerEvents: "none",
        }}
      />

      {/* brand mark */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 30, zIndex: 1 }}>
        <img src={BRAND.logoSun} alt="" width={34} height={34} style={{ objectFit: "contain" }} />
        <div style={{ lineHeight: 0.9, textAlign: "left" }}>
          <div style={{ font: "800 12px Cinzel,serif", letterSpacing: 3, color: "var(--gold-lt)" }}>
            FILIPINO
          </div>
          <div
            style={{
              font: "900 22px Cinzel,serif",
              letterSpacing: 2,
              background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            DAMA
          </div>
        </div>
      </div>

      {/* ── flipping coin over a pulsing ground shadow ── */}
      <div
        style={{
          position: "relative",
          width: 120,
          height: 150,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1,
        }}
      >
        <div style={{ perspective: 700, animation: "fdcoinbob 1.6s ease-in-out infinite" }}>
          <div
            style={{
              position: "relative",
              width: 96,
              height: 96,
              borderRadius: "50%",
              transformStyle: "preserve-3d",
              animation: "fdcoinflip 1.8s ease-in-out infinite",
              background:
                "radial-gradient(circle at 35% 28%,#f7e6ad 0%,#e0b64e 42%,#a86f1f 78%,#6e4512 100%)",
              boxShadow:
                "0 0 0 4px rgba(15,8,32,.55),0 0 0 6px rgba(232,184,75,.4)," +
                "inset 0 3px 5px rgba(255,246,214,.6),inset 0 -6px 10px rgba(0,0,0,.45)," +
                "0 18px 34px rgba(0,0,0,.5)",
            }}
          >
            {/* engraved sun glyph on the coin face */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                font: "900 40px Cinzel,serif",
                color: "rgba(90,55,15,.7)",
                textShadow: "0 1px 0 rgba(255,246,214,.5)",
              }}
            >
              ☀
            </div>
            {/* sheen sweep */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                overflow: "hidden",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "45%",
                  height: "100%",
                  background:
                    "linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent)",
                  animation: "fdsheen 1.8s ease-in-out infinite",
                }}
              />
            </div>
          </div>
        </div>

        {/* ground shadow */}
        <div
          style={{
            position: "absolute",
            bottom: 6,
            width: 78,
            height: 12,
            borderRadius: "50%",
            background: "radial-gradient(ellipse at center,rgba(0,0,0,.55),transparent 70%)",
            animation: "fdshadowpulse 1.6s ease-in-out infinite",
          }}
        />
      </div>

      {/* ── context copy ── */}
      <div style={{ zIndex: 1, textAlign: "center", marginTop: 22 }}>
        <div style={{ font: "700 11px Inter", letterSpacing: 3, color: "var(--gold)", marginBottom: 10 }}>
          {copy.eyebrow}
        </div>
        <div style={{ font: "800 22px Cinzel,serif", color: copy.accent }}>{copy.title}</div>
        <div style={{ font: "500 13px Inter", color: "var(--ink)", marginTop: 6 }}>
          {copy.subtitle}
        </div>
      </div>

      {/* ── cycling progress dots ── */}
      <div style={{ display: "flex", gap: 9, marginTop: 20, zIndex: 1 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: copy.accent,
              animation: "fdpulse 1.2s ease-in-out infinite",
              animationDelay: `${i * 0.18}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default LoadingScreen;
