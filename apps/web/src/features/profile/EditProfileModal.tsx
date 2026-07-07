import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";

/**
 * EditProfileModal — faithful port of the prototype "Edit Profile" modal
 * (FilipinoDama Royal.dc.html lines 2342-2374). Reproduces the avatar row,
 * Display Name, Player Tag, Favorite Faction toggle and Bio fields.
 *
 * Wired to the LIVE backend: Save Changes issues
 *   PATCH /api/users/me { displayName, bio }
 * then updates the local session via patchMe(...) and closes.
 *
 * Persistence notes (honest about what the API actually stores):
 *   • displayName + bio  → persisted through PATCH /api/users/me.
 *   • Player Tag         → server-assigned, not editable via the API, so it is
 *                          shown read-only (matches the real account handle).
 *   • Favorite Faction   → a cosmetic client-side preference in the prototype
 *                          (localStorage only, no server field) — kept as local
 *                          UI state so the toggle stays faithful.
 */

/** Resolve a Me.avatarUrl (bare key | "/assets/…" | full URL) to a renderable src. */
function avatarSrc(avatarUrl: string | null): string {
  if (!avatarUrl) return "/assets/avatars/champion.png";
  if (avatarUrl.startsWith("/") || avatarUrl.startsWith("http")) return avatarUrl;
  return `/assets/avatars/${avatarUrl}.png`;
}

const labelStyle: React.CSSProperties = {
  display: "block",
  font: "700 11px Inter",
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  color: "var(--gold-lt)",
  marginBottom: 8,
};

type Faction = "Red" | "Blue";

export function EditProfileModal({
  open,
  onClose,
  onChangeAvatar,
}: {
  open: boolean;
  onClose: () => void;
  /** Opens the avatar picker (prototype "Change Avatar" behaviour). */
  onChangeAvatar?: () => void;
}) {
  const me = useAuthStore((s) => s.me);
  const patchMe = useAuthStore((s) => s.patchMe);
  const showToast = useAppStore((s) => s.showToast);

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [faction, setFaction] = useState<Faction>("Red");
  const [saving, setSaving] = useState(false);

  // Seed the draft from the live account each time the modal opens.
  useEffect(() => {
    if (open && me) {
      setName(me.displayName ?? "");
      setBio(me.bio ?? "");
    }
  }, [open, me]);

  if (!open || !me) return null;

  const save = async () => {
    const nextName = name.trim() || me.displayName;
    const nextBio = bio.trim();
    setSaving(true);
    try {
      const res = await api.patch<{ user: { displayName: string; bio: string | null } }>("/api/users/me", {
        displayName: nextName,
        bio: nextBio,
      });
      patchMe({ displayName: res.user.displayName, bio: res.user.bio });
      showToast("Profile updated.");
      onClose();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "Could not update profile.");
    } finally {
      setSaving(false);
    }
  };

  const factionOptions = (["Red", "Blue"] as Faction[]).map((f) => {
    const on = faction === f;
    const red = f === "Red";
    const ac = red ? "#c8394a" : "#3a6bd0";
    return {
      label: f,
      on,
      dotStyle: {
        width: 11,
        height: 11,
        borderRadius: "50%",
        flex: "none" as const,
        background: `radial-gradient(circle at 35% 30%,${red ? "#ff8790,#8f1b28" : "#8fb6ff,#22468f"})`,
      } as React.CSSProperties,
      btnStyle: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        padding: 12,
        borderRadius: 9,
        cursor: "pointer",
        font: "700 14px Inter",
        transition: ".15s",
        border: `1px solid ${on ? ac : "rgba(232,184,75,.25)"}`,
        background: on ? (red ? "rgba(160,48,58,.28)" : "rgba(48,90,170,.28)") : "rgba(15,8,32,.5)",
        color: on ? "#fff" : "var(--ink)",
      } as React.CSSProperties,
      onClick: () => setFaction(f),
    };
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 81,
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
        style={{ width: "min(94vw,480px)", padding: 28, position: "relative", maxHeight: "90vh", overflow: "auto" }}
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
          Your profile
        </div>
        <h2 style={{ margin: "6px 0 4px", font: "800 26px Cinzel,serif", color: "var(--gold-lt)" }}>Edit Profile</h2>
        <p style={{ font: "400 13px Inter", color: "var(--ink)", margin: "0 0 22px" }}>
          Update how you appear across the arena.
        </p>

        {/* avatar row */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
          <div style={{ flex: "none" }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                overflow: "hidden",
                border: "3px solid rgba(232,184,75,.55)",
                boxShadow: "0 6px 18px rgba(0,0,0,.5)",
              }}
            >
              <img
                src={avatarSrc(me.avatarUrl)}
                alt={me.displayName}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "brightness(1.25)" }}
              />
            </div>
          </div>
          <button
            className="btn btn-purple"
            onClick={() => {
              if (onChangeAvatar) {
                onClose();
                onChangeAvatar();
              }
            }}
            style={{ padding: "10px 16px", fontSize: 13 }}
          >
            Change Avatar
          </button>
        </div>

        {/* display name */}
        <label style={labelStyle}>Display Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          placeholder="Your display name"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 14px",
            borderRadius: 9,
            border: "1px solid rgba(232,184,75,.3)",
            background: "rgba(15,8,32,.6)",
            color: "#fff",
            font: "600 14px Inter",
            outline: "none",
            marginBottom: 20,
          }}
        />

        {/* player tag (server-assigned → read-only) */}
        <label style={labelStyle}>Player Tag</label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            marginBottom: 6,
            borderRadius: 9,
            border: "1px solid rgba(232,184,75,.3)",
            background: "rgba(15,8,32,.6)",
            overflow: "hidden",
          }}
        >
          <span style={{ padding: "12px 4px 12px 14px", font: "800 15px 'JetBrains Mono',monospace", color: "var(--gold)" }}>
            #
          </span>
          <input
            value={me.tag.replace(/^#/, "")}
            readOnly
            style={{
              flex: 1,
              boxSizing: "border-box",
              padding: "12px 14px 12px 2px",
              border: "none",
              background: "transparent",
              color: "#fff",
              font: "700 14px 'JetBrains Mono',monospace",
              letterSpacing: "1px",
              textTransform: "uppercase",
              outline: "none",
            }}
          />
        </div>
        <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginBottom: 20 }}>
          Your unique handle — shown as {name.trim() || me.displayName}{" "}
          <span style={{ color: "var(--gold)" }}>{me.tag}</span>
        </div>

        {/* favorite faction */}
        <label style={labelStyle}>Favorite Faction</label>
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          {factionOptions.map((f) => (
            <button key={f.label} onClick={f.onClick} style={f.btnStyle}>
              <span style={f.dotStyle} />
              {f.label}
            </button>
          ))}
        </div>

        {/* bio */}
        <label style={labelStyle}>Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={90}
          placeholder="Say something about your play style…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 14px",
            borderRadius: 9,
            border: "1px solid rgba(232,184,75,.3)",
            background: "rgba(15,8,32,.6)",
            color: "#fff",
            font: "500 13px/1.5 Inter",
            outline: "none",
            resize: "none",
            height: 64,
            marginBottom: 24,
          }}
        />

        {/* actions */}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "12px 22px",
              borderRadius: 8,
              border: "1px solid rgba(232,184,75,.3)",
              background: "rgba(15,8,32,.5)",
              color: "var(--ink)",
              font: "700 13px Inter",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button className="btn btn-gold" disabled={saving} onClick={save} style={{ padding: "12px 26px" }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditProfileModal;
