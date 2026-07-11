import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { MyTicketsPanel } from "./MyTicketsPanel";

/**
 * ContactPage (/contact) — Contact / Support screen.
 *
 * Reproduces the handoff prototype (lines 1077-1151) verbatim: centered header,
 * a two-column grid with the message form on the left and a "Reach Us" /
 * "Before You Write" sidebar on the right.
 *
 * Logged-in, non-guest players POST a real support ticket to
 * `/api/support/tickets` — it's persisted, triaged by SUPPORT staff in the admin
 * console, and the reply arrives via the bell notification. Logged-out/guest
 * visitors keep the original mailto fallback (no ticket backend reachable
 * without an account to attach it to), opening the user's mail client so the
 * message still genuinely reaches support, with a client-generated ticket
 * reference the user can quote.
 */

const SUPPORT_EMAIL = "support@filipinodama.com";

// Topic chips match the prototype set exactly (handoff line 4270).
const CATEGORIES = ["General", "Account", "Bug Report", "Billing"] as const;
type Category = (typeof CATEGORIES)[number];

const MIN_MESSAGE_LENGTH = 10;

/** Client-side ticket reference for the mailto fallback, e.g. "FDR-A1B2C3". */
function makeTicket(): string {
  return "FDR-" + Date.now().toString(36).toUpperCase().slice(-6);
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(232,184,75,.25)",
  background: "rgba(0,0,0,.3)",
  color: "#fff",
  font: "600 14px Inter",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  font: "700 11px Inter",
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "var(--ink2)",
  marginBottom: 7,
};

export function ContactPage() {
  const navigate = useNavigate();
  const showToast = useAppStore((s) => s.showToast);
  const me = useAuthStore((s) => s.me);
  // Player tag threaded into the outgoing support message so the team can find
  // the account. Falls back to "#0000" when signed out (mirrors the prototype).
  const playerTag = me?.tag || "#0000";
  // Authenticated, non-guest players file a real ticket; guests/logged-out
  // visitors keep the mailto fallback (guests are treated as logged-out here —
  // the server also rejects guest-filed tickets, defense in depth).
  const isAuthedFiler = Boolean(me && !me.isGuest);

  // "My Tickets" tab — only meaningful for signed-in non-guest players (guests
  // only ever see the New Ticket form, as before). Deep-linked via
  // ?tab=tickets&ticket=<id> — the support_reply notification carries
  // data.ticketId and NotificationsMenu routes here on click.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkedTicketId = searchParams.get("ticket");
  const [tab, setTab] = useState<"new" | "tickets">(
    isAuthedFiler && (searchParams.get("tab") === "tickets" || deepLinkedTicketId) ? "tickets" : "new",
  );

  // If the URL carries a ticket deep-link after mount (e.g. navigating here
  // from the bell while already on /contact), follow it.
  useEffect(() => {
    if (isAuthedFiler && (searchParams.get("tab") === "tickets" || searchParams.get("ticket"))) {
      setTab("tickets");
    }
  }, [isAuthedFiler, searchParams]);

  function switchTab(next: "new" | "tickets") {
    setTab(next);
    // Clear the query string once the user navigates away from the deep link
    // so tab switches afterward don't keep re-opening the same old ticket.
    if (searchParams.toString()) setSearchParams({}, { replace: true });
  }

  const [name, setName] = useState(me?.displayName ?? "");
  const [email, setEmail] = useState(me?.email ?? "");
  const [category, setCategory] = useState<Category>("General");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Success panel: prototype's "Message Sent!" state with a ticket reference.
  const [sent, setSent] = useState(false);
  const [ticket, setTicket] = useState("");
  // Real server ticket id when the authenticated branch succeeded — drives the
  // honest success copy ("your ticket" vs. "on its way to <email>").
  const [persisted, setPersisted] = useState(false);

  function chipStyle(active: boolean): React.CSSProperties {
    return {
      padding: "9px 15px",
      borderRadius: 999,
      cursor: "pointer",
      font: "700 12px Inter",
      border: active ? "1px solid var(--gold)" : "1px solid rgba(232,184,75,.22)",
      background: active ? "rgba(232,184,75,.16)" : "rgba(0,0,0,.28)",
      color: active ? "var(--gold-lt)" : "var(--ink)",
    };
  }

  async function handleSend() {
    // Authenticated (non-guest) players file a REAL persisted ticket. Checked
    // FIRST, with its own independent validation: only subject + message are
    // required. Do NOT gate this branch on name/email — a logged-in player with
    // a null account email has email="" here, and the email input is hidden for
    // logged-in users (nothing to fill it with), so the old unconditional
    // `!email.trim()` guard would block them from ever submitting even though
    // the server tolerates userEmail=null (it snapshots the account's email
    // server-side, not from this form).
    if (isAuthedFiler) {
      if (!subject.trim()) {
        showToast("Please fill in a subject.");
        return;
      }
      const trimmedMessage = message.trim();
      if (trimmedMessage.length < MIN_MESSAGE_LENGTH) {
        setMessageError(`Please write at least ${MIN_MESSAGE_LENGTH} characters.`);
        return;
      }
      if (trimmedMessage.length > 4000) {
        setMessageError("Message is too long (4000 characters max).");
        return;
      }
      setMessageError(null);
      setSending(true);
      try {
        const { id } = await api.post<{ id: string }>("/api/support/tickets", {
          category,
          subject: subject.trim(),
          message: trimmedMessage,
        });
        setTicket(id);
        setPersisted(true);
        setSent(true);
        showToast("Ticket submitted — we'll get back to you");
      } catch (e) {
        if (e instanceof ApiError && e.code === "RATE_LIMITED") {
          showToast("You're filing tickets too fast — please wait a bit.");
        } else if (e instanceof ApiError && e.code === "GUEST_CANNOT_FILE") {
          // Shouldn't happen (guests take the mailto branch below) — fall back
          // to mailto so the message still reaches support.
          sendViaMailto();
        } else {
          showToast(e instanceof ApiError ? e.message : "Couldn't submit your ticket. Please try again.");
        }
      } finally {
        setSending(false);
      }
      return;
    }

    // Logged-out / guest — the original guard is kept, scoped to this branch
    // only: here name/email inputs are visible and required, so the guard is
    // meaningful (unlike the authenticated branch above).
    if (!name.trim() || !email.trim() || !subject.trim()) {
      showToast("Please fill in your name, email, and subject.");
      return;
    }
    if (message.trim().length < MIN_MESSAGE_LENGTH) {
      setMessageError(`Please write at least ${MIN_MESSAGE_LENGTH} characters.`);
      return;
    }
    setMessageError(null);
    sendViaMailto();
  }

  /** No support-ticket backend for logged-out/guest visitors — open the user's
   * mail client so the message is genuinely delivered, with a client-generated
   * reference the user can quote. */
  function sendViaMailto() {
    const ref = makeTicket();
    const emlSubject = `[${category}] ${subject} (Ticket ${ref})`;
    const body =
      "New support request from FilipinoDama Royal\n" +
      "------------------------------------------\n" +
      `Ticket: ${ref}\n` +
      `Name: ${name}\n` +
      `Email: ${email}\n` +
      `Player Tag: ${playerTag}\n` +
      `Topic: ${category}\n` +
      "------------------------------------------\n\n" +
      `${message}\n`;
    const href = `mailto:${SUPPORT_EMAIL}?cc=${encodeURIComponent(email)}&subject=${encodeURIComponent(
      emlSubject,
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = href;

    setTicket(ref);
    setPersisted(false);
    setSent(true);
    showToast("Opening your email app to notify support…");
  }

  /** Return to a fresh form to send another message. */
  function resetForm() {
    setSubject("");
    setMessage("");
    setMessageError(null);
    setSent(false);
    setPersisted(false);
  }

  return (
    <div
      className="fd-page-pad"
      style={{
        maxWidth: 1000,
        margin: "0 auto",
        padding: 26,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            font: "700 12px Inter",
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "var(--gold)",
          }}
        >
          We&rsquo;re here to help
        </div>
        <h1
          style={{
            margin: "8px 0 0",
            font: "800 clamp(26px,3vw,38px) Cinzel,serif",
            color: "var(--gold-lt)",
          }}
        >
          Contact Support
        </h1>
        <p
          style={{
            margin: "10px auto 0",
            maxWidth: 520,
            font: "400 14px/1.6 Inter",
            color: "var(--ink)",
          }}
        >
          Questions, bug reports, or account help — send us a message and our support team will get
          back to you.
        </p>
      </div>

      {/* Tabs — only signed-in non-guest players have tickets to view; guests
          keep the mailto-only form exactly as before. */}
      {isAuthedFiler && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => switchTab("new")}
            style={chipStyle(tab === "new")}
          >
            New Ticket
          </button>
          <button
            type="button"
            onClick={() => switchTab("tickets")}
            style={chipStyle(tab === "tickets")}
          >
            My Tickets
          </button>
        </div>
      )}

      {isAuthedFiler && tab === "tickets" ? (
        <div style={{ maxWidth: 700, margin: "0 auto", width: "100%" }}>
          <MyTicketsPanel openTicketId={deepLinkedTicketId} />
        </div>
      ) : (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 300px",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* FORM / SUCCESS */}
        {sent ? (
          <div
            className="frame fd-card-m"
            style={{
              padding: "40px 32px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(63,191,111,.14)",
                border: "1px solid rgba(63,191,111,.4)",
                fontSize: 30,
                color: "#3fbf6f",
              }}
            >
              ✓
            </div>
            <h2 style={{ margin: 0, font: "800 22px Cinzel,serif", color: "var(--gold-lt)" }}>
              Message Sent!
            </h2>
            {persisted ? (
              <p style={{ margin: 0, maxWidth: 420, font: "400 14px/1.65 Inter", color: "var(--ink)" }}>
                Our support team has your ticket and will reply in your notifications. Your ticket
                reference is <b style={{ color: "#fff" }}>{ticket}</b>.
              </p>
            ) : (
              <p style={{ margin: 0, maxWidth: 420, font: "400 14px/1.65 Inter", color: "var(--ink)" }}>
                Your message is on its way to{" "}
                <b style={{ color: "var(--gold-lt)" }}>{SUPPORT_EMAIL}</b>. We typically reply within
                24–48 hours. Your ticket reference is <b style={{ color: "#fff" }}>{ticket}</b>.
              </p>
            )}
            <button
              type="button"
              className="btn btn-gold fd-cta-full"
              onClick={resetForm}
              style={{ marginTop: 8, padding: "12px 26px" }}
            >
              Send Another Message
            </button>
          </div>
        ) : (
        <div
          className="frame fd-card-m"
          style={{ padding: "26px 28px", display: "flex", flexDirection: "column", gap: 16 }}
        >
          {!isAuthedFiler && (
            <div className="fd-collapse-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={labelStyle}>Your Name</label>
                <input
                  className="fd-nozoom"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Juan dela Cruz"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Your Email</label>
                <input
                  className="fd-nozoom"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  style={inputStyle}
                />
              </div>
            </div>
          )}
          <div>
            <label style={{ ...labelStyle, marginBottom: 9 }}>Topic</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  style={chipStyle(category === c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Subject</label>
            <input
              className="fd-nozoom"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief summary"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Message</label>
            <textarea
              className="fd-nozoom"
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                if (messageError && e.target.value.trim().length >= MIN_MESSAGE_LENGTH) {
                  setMessageError(null);
                }
              }}
              placeholder="Tell us what&rsquo;s going on. Include your player tag if it&rsquo;s about your account."
              rows={6}
              style={{
                ...inputStyle,
                font: "500 14px/1.55 Inter",
                resize: "vertical",
                border: messageError
                  ? "1px solid rgba(255,154,168,.6)"
                  : (inputStyle.border as string),
              }}
            />
            {messageError && (
              <div style={{ marginTop: 7, font: "600 12px Inter", color: "#ff9aa8" }}>
                {messageError}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn-gold fd-cta-full"
            onClick={handleSend}
            disabled={sending}
            style={{ width: "100%", padding: 14, fontSize: 13, opacity: sending ? 0.7 : 1 }}
          >
            {sending ? "Sending…" : "Send Message"}
          </button>
          <div
            style={{
              font: "500 11px/1.5 Inter",
              color: "var(--ink2)",
              textAlign: "center",
            }}
          >
            By sending, you agree to our{" "}
            <span
              onClick={() => navigate("/legal")}
              style={{ color: "var(--gold-lt)", cursor: "pointer" }}
            >
              Privacy Policy
            </span>
            .{" "}
            {isAuthedFiler
              ? "Our support team will reply in your notifications."
              : "This opens your email app to deliver the message to our support team."}
          </div>
        </div>
        )}

        {/* SIDEBAR */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="frame fd-card-m" style={{ padding: 20 }}>
            <div className="ptitle" style={{ textAlign: "left" }}>
              Reach Us
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                <span style={{ fontSize: 17 }}>📧</span>
                <div>
                  <div style={{ font: "700 12px Inter", color: "#fff" }}>Email</div>
                  <div style={{ font: "500 12px Inter", color: "var(--gold-lt)" }}>
                    {SUPPORT_EMAIL}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                <span style={{ fontSize: 17 }}>⏱️</span>
                <div>
                  <div style={{ font: "700 12px Inter", color: "#fff" }}>Response Time</div>
                  <div style={{ font: "500 12px Inter", color: "var(--ink2)" }}>
                    Within 24–48 hours
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                <span style={{ fontSize: 17 }}>💬</span>
                <div>
                  <div style={{ font: "700 12px Inter", color: "#fff" }}>Community</div>
                  <div style={{ font: "500 12px Inter", color: "var(--ink2)" }}>
                    Join our Discord for live help
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="frame fd-card-m" style={{ padding: 20 }}>
            <div className="ptitle" style={{ textAlign: "left" }}>
              Before You Write
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                onClick={() => navigate("/learn")}
                style={{
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  borderTop: "1px solid rgba(232,184,75,.1)",
                  padding: "11px 0",
                  cursor: "pointer",
                  font: "600 13px Inter",
                  color: "var(--ink)",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                How do I play? <span style={{ color: "var(--ink2)" }}>›</span>
              </button>
              <button
                type="button"
                onClick={() => navigate("/settings")}
                style={{
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  borderTop: "1px solid rgba(232,184,75,.1)",
                  padding: "11px 0",
                  cursor: "pointer",
                  font: "600 13px Inter",
                  color: "var(--ink)",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                Delete my account <span style={{ color: "var(--ink2)" }}>›</span>
              </button>
              <button
                type="button"
                onClick={() => navigate("/legal")}
                style={{
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  borderTop: "1px solid rgba(232,184,75,.1)",
                  padding: "11px 0",
                  cursor: "pointer",
                  font: "600 13px Inter",
                  color: "var(--ink)",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                Privacy &amp; Terms <span style={{ color: "var(--ink2)" }}>›</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

export default ContactPage;
