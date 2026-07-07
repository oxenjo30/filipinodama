import { useState } from "react";
import { Modal } from "../shared/Modal";

/**
 * ShareInviteModal — social-media invite sheet for a private room.
 *
 * Builds a friendly invite message from the host name + room code/link and
 * offers one-tap shares to the platforms Filipino players actually use
 * (WhatsApp, Messenger/Facebook, X, Telegram) plus a Copy Link fallback and,
 * where the browser supports it, the native Web Share sheet.
 *
 * Everything here is honest: the link is the real `roomLink` the room page
 * already builds (`/rooms?code=XXXX`), and each platform button just opens that
 * platform's public share URL in a new tab — no fake in-app delivery.
 */

export type ShareInviteModalProps = {
  open: boolean;
  onClose: () => void;
  roomLink: string;
  code: string;
  hostName: string;
};

type ShareTarget = {
  key: string;
  label: string;
  emoji: string;
  href: string;
  color: string;
};

/** window.open with the safe noopener rel to prevent reverse-tabnabbing. */
function openShare(url: string) {
  window.open(url, "_blank", "noopener");
}

export function ShareInviteModal({ open, onClose, roomLink, code, hostName }: ShareInviteModalProps) {
  const [copyLabel, setCopyLabel] = useState("Copy Link");

  const message = `${hostName} invited you to a Dama match on FilipinoDama! Join room ${code}: ${roomLink}`;
  const encMsg = encodeURIComponent(message);
  const encLink = encodeURIComponent(roomLink);

  const targets: ShareTarget[] = [
    {
      key: "whatsapp",
      label: "WhatsApp",
      emoji: "💬",
      href: `https://wa.me/?text=${encMsg}`,
      color: "#25D366",
    },
    {
      key: "facebook",
      label: "Messenger",
      emoji: "📘",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encLink}&quote=${encMsg}`,
      color: "#1877F2",
    },
    {
      key: "twitter",
      label: "X",
      emoji: "𝕏",
      href: `https://twitter.com/intent/tweet?text=${encMsg}`,
      color: "#1DA1F2",
    },
    {
      key: "telegram",
      label: "Telegram",
      emoji: "✈",
      href: `https://t.me/share/url?url=${encLink}&text=${encMsg}`,
      color: "#229ED9",
    },
  ];

  // Feature-detect the native share sheet (mobile / supporting browsers only).
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function doNativeShare() {
    try {
      await navigator.share({
        title: "FilipinoDama — Private Match",
        text: message,
        url: roomLink,
      });
    } catch {
      /* user cancelled the share sheet — nothing to do */
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(roomLink);
      setCopyLabel("Copied!");
      window.setTimeout(() => setCopyLabel("Copy Link"), 1600);
    } catch {
      setCopyLabel("Copy failed");
      window.setTimeout(() => setCopyLabel("Copy Link"), 1600);
    }
  }

  return (
    <Modal open={open} onBackdrop={onClose} maxWidth={460}>
      <div style={{ fontSize: 34, marginBottom: 6 }}>📨</div>
      <div
        style={{
          font: "800 22px Cinzel,serif",
          background: "linear-gradient(180deg,#f7e2a0,#d5a63a)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          marginBottom: 6,
        }}
      >
        Invite a Friend
      </div>
      <div style={{ font: "500 13px Inter", color: "var(--ink)", marginBottom: 20 }}>
        Share your room and drop a friend straight into the match — no account needed.
      </div>

      {/* Room code chip */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 16px",
          borderRadius: 10,
          border: "1px solid rgba(232,184,75,.35)",
          background: "rgba(15,8,32,.6)",
          marginBottom: 22,
        }}
      >
        <span style={{ font: "600 11px Inter", letterSpacing: 1, color: "var(--gold-lt)" }}>
          ROOM
        </span>
        <span
          style={{
            font: "800 20px 'JetBrains Mono',monospace",
            letterSpacing: 4,
            color: "#fff",
          }}
        >
          {code}
        </span>
      </div>

      {/* Native share (mobile / supporting browsers) */}
      {canNativeShare && (
        <button
          onClick={() => void doNativeShare()}
          className="btn btn-gold"
          style={{ width: "100%", padding: "13px 20px", marginBottom: 16 }}
        >
          📤 Share via…
        </button>
      )}

      {/* Platform grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {targets.map((t) => (
          <button
            key={t.key}
            onClick={() => openShare(t.href)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid rgba(232,184,75,.22)",
              background: "rgba(15,8,32,.5)",
              color: "#fff",
              font: "700 13px Inter",
              cursor: "pointer",
            }}
          >
            <span
              aria-hidden
              style={{
                fontSize: 16,
                lineHeight: 1,
                color: t.color,
              }}
            >
              {t.emoji}
            </span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Copy link */}
      <button
        onClick={() => void copyLink()}
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: 10,
          border: "1px solid rgba(232,184,75,.3)",
          background: "rgba(232,184,75,.1)",
          color: "var(--gold-lt)",
          font: "700 13px Inter",
          cursor: "pointer",
          marginBottom: 16,
        }}
      >
        🔗 {copyLabel}
      </button>

      <button
        onClick={onClose}
        style={{
          border: "none",
          background: "transparent",
          color: "var(--ink2)",
          font: "600 12px Inter",
          cursor: "pointer",
          padding: 4,
        }}
      >
        Close
      </button>
    </Modal>
  );
}

export default ShareInviteModal;
