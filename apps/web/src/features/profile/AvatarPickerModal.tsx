import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";

/**
 * AvatarPickerModal — the profile avatar picker, wired to OWNERSHIP.
 *
 * The picker shows only avatars the player actually OWNS — the free starter
 * avatars everyone is granted on signup, plus any avatars they've bought in the
 * Store. This avoids the old bug where the picker gave away all 11 store avatars
 * for free (a paid Store avatar could be equipped without buying it). Owned
 * avatars come from the inventory (GET /api/users/me/export → inventory[itemId],
 * the same read the Store uses). The equipped avatar shows a gold border.
 * Clicking a portrait persists it via PATCH /api/users/me { avatarUrl }.
 *
 * Avatar store-item ids ARE the bare avatar key (e.g. "katipunero"), which is
 * also what avatarUrl stores and what /assets/avatars/<key>.png resolves to.
 */

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

/** A catalog AVATAR item — its id is the bare avatar key. */
type AvatarItem = { id: string; name: string };

export function AvatarPickerModal({ open, onClose }: AvatarPickerModalProps) {
  const me = useAuthStore((s) => s.me);
  const patchMe = useAuthStore((s) => s.patchMe);
  const showToast = useAppStore((s) => s.showToast);
  const [saving, setSaving] = useState<string | null>(null);
  // Owned avatars = the free starters (granted on signup) + any bought in the
  // Store. Loaded when the modal opens: catalog AVATAR items ∩ the user's
  // inventory. Never all avatars — a paid avatar only appears once purchased.
  const [ownedAvatars, setOwnedAvatars] = useState<AvatarItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setOwnedAvatars(null);
    setLoadError(false);
    Promise.all([
      api.get<{ items: { id: string; type: string; name: string }[] }>("/api/store/items"),
      api.get<{ inventory: { itemId: string }[] }>("/api/users/me/export"),
    ])
      .then(([cat, inv]) => {
        if (cancelled) return;
        const ownedIds = new Set(inv.inventory.map((i) => i.itemId));
        const avatars = cat.items
          .filter((it) => it.type === "AVATAR" && ownedIds.has(it.id))
          .map((it) => ({ id: it.id, name: it.name }));
        setOwnedAvatars(avatars);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

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
          Pick a portrait to represent you across the arena. Unlock more in the Store.
        </p>

        {ownedAvatars === null && !loadError ? (
          <div style={{ padding: "30px 0", textAlign: "center", font: "500 13px Inter", color: "var(--ink2)" }}>
            Loading your avatars…
          </div>
        ) : loadError ? (
          <div style={{ padding: "30px 0", textAlign: "center", font: "500 13px Inter", color: "#ff8fae" }}>
            Couldn't load your avatars. Please try again.
          </div>
        ) : ownedAvatars && ownedAvatars.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", font: "500 13px/1.6 Inter", color: "var(--ink2)" }}>
            You don't own any avatars yet.
            <br />
            Visit the Store to unlock portraits.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
            {(ownedAvatars ?? []).map((item) => {
              const key = item.id;
              const on = key === currentKey;
              const busy = saving === key;
              return (
                <img
                  key={key}
                  src={avatarSrc(key)}
                  alt={item.name}
                  title={item.name}
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
        )}
      </div>
    </div>
  );
}

export default AvatarPickerModal;
