import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";

/**
 * MyTicketsPanel — read-only "My Tickets" list + thread view for signed-in,
 * non-guest players. Consumes GET /api/support/tickets (list) and
 * GET /api/support/tickets/:id (thread). Players cannot reply/resolve/reopen
 * here — that stays staff-only in the admin console; this is view-only.
 *
 * Rendered as a tab inside ContactPage. `openTicketId`, when provided (e.g.
 * from a support_reply notification's data.ticketId), opens straight to that
 * ticket's thread instead of the list.
 */

type TicketStatus = "OPEN" | "RESOLVED";
type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

type TicketListItem = {
  id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  msgCount: number;
};

type ThreadMessage = {
  id: string;
  isStaff: boolean;
  authorName: string;
  body: string;
  createdAt: string;
};

type TicketDetail = {
  id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function StatusBadge({ status }: { status: TicketStatus }) {
  const open = status === "OPEN";
  return (
    <span
      style={{
        font: "700 10px Inter",
        letterSpacing: "1px",
        textTransform: "uppercase",
        color: open ? "#7fe0a3" : "var(--ink2)",
        border: `1px solid ${open ? "rgba(127,224,163,.4)" : "rgba(232,184,75,.25)"}`,
        borderRadius: 100,
        padding: "3px 9px",
        flex: "none",
      }}
    >
      {open ? "Open" : "Resolved"}
    </span>
  );
}

const PRIORITY_COLOR: Record<TicketPriority, string> = {
  LOW: "var(--ink2)",
  MEDIUM: "var(--gold-lt)",
  HIGH: "#f0a860",
  URGENT: "#ff9aa8",
};

function PriorityTag({ priority }: { priority: TicketPriority }) {
  return (
    <span style={{ font: "700 10px Inter", letterSpacing: "1px", textTransform: "uppercase", color: PRIORITY_COLOR[priority] }}>
      {priority}
    </span>
  );
}

export function MyTicketsPanel({ openTicketId }: { openTicketId?: string | null }) {
  const [tickets, setTickets] = useState<TicketListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(openTicketId ?? null);

  const [thread, setThread] = useState<{ ticket: TicketDetail; thread: ThreadMessage[] } | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const loadList = useCallback(() => {
    setError(null);
    setTickets(null);
    api
      .get<{ items: TicketListItem[] }>("/api/support/tickets")
      .then((res) => setTickets(res.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your tickets."));
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (openTicketId) setSelectedId(openTicketId);
  }, [openTicketId]);

  useEffect(() => {
    if (!selectedId) {
      setThread(null);
      return;
    }
    let alive = true;
    setThreadLoading(true);
    setThreadError(null);
    api
      .get<{ ticket: TicketDetail; thread: ThreadMessage[] }>(`/api/support/tickets/${selectedId}`)
      .then((res) => {
        if (alive) setThread(res);
      })
      .catch((e) => {
        if (alive) setThreadError(e instanceof ApiError ? e.message : "Could not load this ticket.");
      })
      .finally(() => {
        if (alive) setThreadLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedId]);

  // ── thread detail view ──
  if (selectedId) {
    return (
      <div className="frame fd-card-m" style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          style={{
            alignSelf: "flex-start",
            background: "none",
            border: "none",
            cursor: "pointer",
            font: "700 12px Inter",
            color: "var(--gold)",
            padding: 0,
          }}
        >
          ‹ Back to My Tickets
        </button>

        {threadLoading && (
          <div style={{ textAlign: "center", padding: "28px 0", font: "600 12px Inter", color: "var(--ink2)" }}>
            Loading ticket…
          </div>
        )}

        {threadError && !threadLoading && (
          <div style={{ textAlign: "center", padding: "28px 0" }}>
            <div style={{ font: "700 14px Inter", color: "var(--ink)" }}>Couldn't load this ticket</div>
            <div style={{ marginTop: 6, font: "400 12px Inter", color: "var(--ink2)" }}>{threadError}</div>
          </div>
        )}

        {thread && !threadLoading && !threadError && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ font: "800 17px Cinzel,serif", color: "var(--gold-lt)" }}>{thread.ticket.subject}</div>
                <div style={{ marginTop: 5, font: "500 12px Inter", color: "var(--ink2)" }}>
                  {thread.ticket.category} · Opened {fmtDate(thread.ticket.createdAt)}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
                <PriorityTag priority={thread.ticket.priority} />
                <StatusBadge status={thread.ticket.status} />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                maxHeight: 480,
                overflowY: "auto",
                padding: "6px 2px",
                borderTop: "1px solid rgba(232,184,75,.12)",
                borderBottom: "1px solid rgba(232,184,75,.12)",
              }}
            >
              {thread.thread.map((m) =>
                m.isStaff ? (
                  <div
                    key={m.id}
                    style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", maxWidth: "88%", alignSelf: "flex-start", marginTop: 10 }}
                  >
                    <div style={{ font: "700 11px Inter", marginBottom: 3, color: "#c9a6ff" }}>{m.authorName} · Support</div>
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: "4px 14px 14px 14px",
                        background: "rgba(255,255,255,.06)",
                        border: "1px solid rgba(232,184,75,.14)",
                        color: "#efe7fb",
                        font: "500 14px/1.5 Inter",
                        wordBreak: "break-word",
                      }}
                    >
                      {m.body}
                    </div>
                    <div style={{ font: "500 10px Inter", color: "var(--ink2)", marginTop: 3 }}>
                      {fmtDate(m.createdAt)} · {fmtTime(m.createdAt)}
                    </div>
                  </div>
                ) : (
                  <div
                    key={m.id}
                    style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: "88%", alignSelf: "flex-end", marginTop: 10 }}
                  >
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: "14px 14px 4px 14px",
                        background: "linear-gradient(180deg,#f0c24b,#c98b2e)",
                        color: "#2a1607",
                        font: "500 14px/1.5 Inter",
                        wordBreak: "break-word",
                      }}
                    >
                      {m.body}
                    </div>
                    <div style={{ font: "500 10px Inter", color: "var(--ink2)", marginTop: 3 }}>
                      {fmtDate(m.createdAt)} · {fmtTime(m.createdAt)}
                    </div>
                  </div>
                ),
              )}
            </div>

            <div style={{ textAlign: "center", font: "400 11px Inter", color: "var(--ink2)" }}>
              {thread.ticket.status === "OPEN"
                ? "Our support team will reply here — you'll get a notification when they do."
                : "This ticket has been resolved."}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── list view ──
  if (error) {
    return (
      <div className="frame fd-card-m" style={{ padding: "40px 24px", textAlign: "center" }}>
        <div style={{ font: "700 14px Inter", color: "var(--ink)" }}>Couldn't load your tickets</div>
        <div style={{ marginTop: 6, font: "400 12px Inter", color: "var(--ink2)" }}>{error}</div>
        <button
          type="button"
          onClick={loadList}
          style={{ marginTop: 14, background: "none", border: "none", cursor: "pointer", font: "600 12px Inter", color: "var(--gold)" }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (tickets === null) {
    return (
      <div className="frame fd-card-m" style={{ padding: "40px 24px", textAlign: "center" }}>
        <div style={{ font: "600 12px Inter", color: "var(--ink2)" }}>Loading your tickets…</div>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="frame fd-card-m" style={{ padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 32, lineHeight: 1, marginBottom: 10 }}>🎫</div>
        <div style={{ font: "800 16px Cinzel,serif", color: "var(--gold-lt)" }}>No tickets yet</div>
        <div style={{ marginTop: 6, font: "400 12px Inter", color: "var(--ink2)" }}>
          When you file a support ticket, it&rsquo;ll show up here with our replies.
        </div>
      </div>
    );
  }

  return (
    <div className="frame fd-card-m" style={{ padding: "10px 0", display: "flex", flexDirection: "column" }}>
      {tickets.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setSelectedId(t.id)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            padding: "14px 20px",
            background: "none",
            border: "none",
            borderTop: "1px solid rgba(232,184,75,.1)",
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span
                style={{
                  font: "700 13px Inter",
                  color: "#fff",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {t.subject}
              </span>
            </div>
            <div style={{ marginTop: 4, font: "500 11px Inter", color: "var(--ink2)" }}>
              {t.category} · {t.msgCount} message{t.msgCount === 1 ? "" : "s"} · updated {fmtDate(t.updatedAt)}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
            <PriorityTag priority={t.priority} />
            <StatusBadge status={t.status} />
            <span style={{ color: "var(--ink2)" }}>›</span>
          </div>
        </button>
      ))}
    </div>
  );
}

export default MyTicketsPanel;
