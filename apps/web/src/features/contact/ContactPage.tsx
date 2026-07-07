import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../stores/appStore";

/**
 * ContactPage (/contact) — Contact / Support screen.
 *
 * Reproduces the handoff prototype (lines 1077-1151) verbatim: centered header,
 * a two-column grid with the message form on the left and a "Reach Us" /
 * "Before You Write" sidebar on the right.
 *
 * There is no support-ticket backend yet, so submitting does NOT fake a ticket
 * id or claim an email was delivered. Instead it validates the form locally and
 * surfaces an honest toast, then opens the user's mail client (mailto:) so the
 * message actually reaches the support inbox. The "Before You Write" links and
 * Privacy links navigate to real routes.
 */

const SUPPORT_EMAIL = "support@filipinodama.com";

const CATEGORIES = ["Bug Report", "Account Help", "Billing", "Other"] as const;
type Category = (typeof CATEGORIES)[number];

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

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<Category>("Bug Report");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

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

  function handleSend() {
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      showToast("Please fill in your name, email, subject, and message.");
      return;
    }
    // No support backend yet — open the user's mail client so the message is
    // genuinely delivered, and give an honest toast. No fake ticket id.
    const body = `Name: ${name}\nEmail: ${email}\nTopic: ${category}\n\n${message}`;
    const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      `[${category}] ${subject}`,
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    showToast(`Opening your email app to send this to ${SUPPORT_EMAIL}.`);
  }

  return (
    <div
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 300px",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* FORM */}
        <div
          className="frame"
          style={{ padding: "26px 28px", display: "flex", flexDirection: "column", gap: 16 }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Your Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Juan dela Cruz"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Your Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                style={inputStyle}
              />
            </div>
          </div>
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
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief summary"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what&rsquo;s going on. Include your player tag if it&rsquo;s about your account."
              rows={6}
              style={{
                ...inputStyle,
                font: "500 14px/1.55 Inter",
                resize: "vertical",
              }}
            />
          </div>
          <button
            type="button"
            className="btn btn-gold"
            onClick={handleSend}
            style={{ width: "100%", padding: 14, fontSize: 13 }}
          >
            Send Message
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
            . This opens your email app to deliver the message to our support team.
          </div>
        </div>

        {/* SIDEBAR */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="frame" style={{ padding: 20 }}>
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
          <div className="frame" style={{ padding: 20 }}>
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
    </div>
  );
}

export default ContactPage;
