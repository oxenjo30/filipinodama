import { useState } from "react";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";

/**
 * ReportPlayerModal — reason-picker + optional/required note, submits
 * POST /api/reports (Task 8's reportRoutes). Entry points wire this in:
 *   - MessagesPage:    context="dm"      — a per-message report on the other
 *                      person's bubble, with a locked quote of that message.
 *   - FriendsPage/
 *     PublicProfilePage: context="profile" — from a player profile; the
 *                      server requires a non-empty note for profile reports.
 *   - GuildChatPanel:  context="guild"   — a per-message report in guild chat,
 *                      with the message id + author id (like "dm").
 *
 * Styling matches the app's existing modal convention (inline styles + the
 * shared "frame" class — see EditProfileModal.tsx / the FriendsPage profile
 * sheet) rather than any global .overlay/.modal CSS, which this codebase
 * does not define.
 */

const REASONS = [
  ["HARASSMENT", "Harassment / abuse"],
  ["HATE_SPEECH", "Hate speech"],
  ["CHEATING", "Cheating"],
  ["INAPPROPRIATE", "Inappropriate name / avatar"],
  ["SPAM", "Spam"],
  ["OTHER", "Other"],
] as const;

type Reason = (typeof REASONS)[number][0];

const labelStyle: React.CSSProperties = {
  display: "block",
  font: "700 11px Inter",
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  color: "var(--gold-lt)",
  marginBottom: 8,
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  borderRadius: 9,
  border: "1px solid rgba(232,184,75,.3)",
  background: "rgba(15,8,32,.6)",
  color: "#fff",
  font: "600 14px Inter",
  outline: "none",
};

export function ReportPlayerModal({
  open,
  accusedId,
  context,
  messageId,
  quotedText,
  onClose,
}: {
  open: boolean;
  accusedId: string;
  context: "dm" | "profile" | "guild";
  messageId?: string;
  quotedText?: string;
  onClose: () => void;
}) {
  const showToast = useAppStore((s) => s.showToast);
  const [reason, setReason] = useState<Reason>("HARASSMENT");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const noteRequired = context === "profile";
  const noteMissing = noteRequired && !note.trim();

  const submit = async () => {
    if (noteMissing) {
      showToast("Please describe the problem.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/reports", {
        accusedId,
        reason,
        note: note.trim() || undefined,
        context,
        messageId,
      });
      showToast("Report submitted — thanks for helping keep the game fair.");
      setNote("");
      setReason("HARASSMENT");
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        showToast(e.code === "ALREADY_REPORTED" ? "You've already reported this player." : e.message);
      } else {
        showToast("Couldn't submit report.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
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
        style={{ width: "min(94vw,420px)", padding: 26, position: "relative", maxHeight: "90vh", overflow: "auto" }}
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
          Report
        </div>
        <h2 style={{ margin: "6px 0 4px", font: "800 24px Cinzel,serif", color: "var(--gold-lt)" }}>Report player</h2>
        <p style={{ font: "400 13px Inter", color: "var(--ink)", margin: "0 0 18px" }}>
          Tell us what happened. Our moderators review every report.
        </p>

        {quotedText && (
          <blockquote
            style={{
              margin: "0 0 18px",
              padding: "10px 14px",
              borderLeft: "3px solid rgba(232,184,75,.55)",
              borderRadius: "0 8px 8px 0",
              background: "rgba(15,8,32,.5)",
              color: "var(--ink)",
              font: "500 13px/1.5 Inter",
              fontStyle: "italic",
              wordBreak: "break-word",
            }}
          >
            "{quotedText}"
          </blockquote>
        )}

        <label style={labelStyle}>Reason</label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as Reason)}
          style={{ ...fieldStyle, marginBottom: 18, cursor: "pointer" }}
        >
          {REASONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>

        <label style={labelStyle}>
          {noteRequired ? "What's wrong? (required)" : "Add context (optional)"}
        </label>
        <textarea
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={noteRequired ? "Describe what happened…" : "Anything else we should know…"}
          style={{
            ...fieldStyle,
            font: "500 13px/1.5 Inter",
            resize: "none",
            height: 84,
            marginBottom: 6,
          }}
        />
        <div style={{ font: "500 11px Inter", color: "var(--ink2)", marginBottom: 20, textAlign: "right" }}>
          {note.length}/500
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={busy}
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
          <button
            className="btn btn-red"
            disabled={busy || noteMissing}
            onClick={() => void submit()}
            style={{ padding: "12px 26px", opacity: busy || noteMissing ? 0.6 : 1 }}
          >
            {busy ? "Submitting…" : "Submit report"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReportPlayerModal;
