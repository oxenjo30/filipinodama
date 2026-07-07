import { useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";

/**
 * AvatarPickerModal — faithful port of the prototype avatar-picker modal
 * (lines 2326-2352 / avatarChoices at line 4367), fully wired to LIVE data.
 *
 * A modal grid of selectable portraits. The avatar currently equipped on the
 * account (useAuthStore().me.avatarUrl) shows a gold border. Clicking a portrait
 * persists it via PATCH /api/users/me { avatarUrl } then patchMe() to update the
 * local session, and closes. The prototype's uploads/* choices do not exist, so
 * we use the real /assets/avatars/*.png roster.
 */

// Real avatar roster (bare keys; Me.avatarUrl stores the bare key).
const AVATAR_CHOICES = [
  "champion",
  "sovereign",
  "strategist",
  "babaylan",
  "bagani",
  "diwata",
  "mandirigma",
  "ermitanyo",
  "dayang",
  "priestess",
  "sultan",
] as const;

/** Resolve a Me.avatarUrl (bare key | "/assets/…" | full URL) to a renderable src. */
function avatarSrc(avatarUrl: string): string {
  if (avatarUrl.startsWith("/") || avatarUrl.startsWith("http")) return avatarUrl;
  return `/assets/avatars/${avatarUrl}.png`;
}

/**
 * The avatar key an existing me.avatarUrl resolves to (bare key | "/assets/…" |
 * full URL all normalise to the trailing "<key>.png" filename), for deciding
 * which grid tile is currently equipped. Returns "" when unrecognised.
 */
function avatarKeyOf(avatarUrl: string): string {
  const file = avatarUrl.split("/").pop() ?? avatarUrl;
  return file.replace(/\.[a-z0-9]+$/i, "");
}

/**
 * The persisted avatarUrl value for an avatar key. We store the BARE KEY (e.g.
 * "champion") — portable across environments (never bakes in an origin) and the
 * form the prototype's avatarChoices use. avatarSrc() resolves a bare key to
 * /assets/avatars/<key>.png everywhere me.avatarUrl is rendered.
 */
function avatarValue(key: string): string {
  return key;
}

export type AvatarPickerModalProps = {
  open: boolean;
  onClose: () => void;
};

export function AvatarPickerModal({ open, onClose }: AvatarPickerModalProps) {
  const me = useAuthStore((s) => s.me);
  const patchMe = useAuthStore((s) => s.patchMe);
  const showToast = useAppStore((s) => s.showToast);
  const [saving, setSaving] = useState<string | null>(null);

  if (!open) return null;

  const currentKey = avatarKeyOf(me?.avatarUrl ?? "champion");

  const pick = async (key: string) => {
    if (saving) return;
    // Already equipped → just close.
    if (key === currentKey) {
      onClose();
      return;
    }
    setSaving(key);
    try {
      // Persist the portable bare key (server accepts key | /assets path | URL).
      const value = avatarValue(key);
      const res = await api.patch<{ user: { avatarUrl: string | null } }>("/api/users/me", {
        avatarUrl: value,
      });
      patchMe({ avatarUrl: res.user.avatarUrl ?? value });
      showToast("Avatar updated.");
      onClose();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Could not update avatar.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 83,
        background: "rgba(10,5,20,.72)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 22,
        animation: "fdfade .2s ease both",
      }}
    >
      <div
        className="frame"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(94vw,520px)", padding: 28, position: "relative" }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1px solid rgba(232,184,75,.3)",
            background: "rgba(15,8,32,.6)",
            color: "var(--ink)",
            cursor: "pointer",
            font: "700 15px Inter",
          }}
        >
          ✕
        </button>
        <div style={{ font: "700 12px Inter", letterSpacing: "2px", textTransform: "uppercase", color: "var(--gold)" }}>
          Your look
        </div>
        <h2 style={{ margin: "6px 0 4px", font: "800 26px Cinzel,serif", color: "var(--gold-lt)" }}>Choose Avatar</h2>
        <p style={{ font: "400 13px Inter", color: "var(--ink)", margin: "0 0 20px" }}>
          Pick a portrait to represent you across the arena.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
          {AVATAR_CHOICES.map((key) => {
            const on = key === currentKey;
            const busy = saving === key;
            return (
              <img
                key={key}
                src={avatarSrc(key)}
                alt={key}
                onClick={() => pick(key)}
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  borderRadius: 14,
                  objectFit: "cover",
                  cursor: saving ? "default" : "pointer",
                  display: "block",
                  filter: "brightness(1.25)",
                  opacity: busy ? 0.55 : 1,
                  border: `3px solid ${on ? "var(--gold)" : "rgba(232,184,75,.18)"}`,
                  boxShadow: on
                    ? "0 0 0 3px rgba(232,184,75,.28),0 6px 16px rgba(0,0,0,.45)"
                    : "0 4px 10px rgba(0,0,0,.3)",
                  transition: "transform .12s ease",
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AvatarPickerModal;
