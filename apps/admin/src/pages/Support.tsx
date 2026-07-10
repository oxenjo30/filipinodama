import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAdminMutation } from "../lib/ui";

type ListUser = { id: string | null; username: string; tag: string; avatarUrl: string | null };

type TicketRow = {
  id: string;
  category: string;
  subject: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  updatedAt: string;
  msgCount: number;
  user: ListUser;
  userName: string;
  userEmail: string | null;
  userGone: boolean;
};

type ThreadMessage = {
  id: string;
  isStaff: boolean;
  authorName: string;
  author: ListUser | null;
  body: string;
  createdAt: string;
};

type TicketDetail = {
  id: string;
  category: string;
  subject: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  updatedAt: string;
  userGone: boolean;
  user: ListUser;
  userName: string;
  userEmail: string | null;
  resolvedAt: string | null;
  canResolve: boolean;
  canReopen: boolean;
};

const STATUS_FILTERS = ["OPEN", "RESOLVED"] as const;

// Mockup's tStatusStyle() colors for ticket status pills (open=green, resolved=dim purple).
// "PENDING" doesn't exist in our real Ticket model — not rendered.
const STATUS_COLOR: Record<TicketRow["status"], { fg: string; bg: string }> = {
  OPEN: { fg: "#5fd08a", bg: "rgba(95,208,138,.14)" },
  RESOLVED: { fg: "#8b78ad", bg: "rgba(139,120,173,.14)" },
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function initials(username: string): string {
  return username.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "PL";
}

function StatusBadge({ status }: { status: TicketRow["status"] }) {
  const c = STATUS_COLOR[status];
  return (
    <span className="badge-rect" style={{ color: c.fg, background: c.bg, borderColor: `${c.fg}44` }}>
      {status === "OPEN" ? "Open" : "Resolved"}
    </span>
  );
}

/** 3.0 Support — the ticket queue (Player Support). Matches the approved secTickets
 * fidelity: filter chips, a ticket list on the left, the selected thread + reply
 * composer on the right, "Select a ticket" empty state. Two real statuses only
 * (OPEN | RESOLVED) — the mockup's "Pending" filter and priority chip have no
 * backing field on our Ticket model and are omitted (see report). */
export function Support() {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("OPEN");
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadList = () => {
    setLoading(true);
    api
      .get<{ items: TicketRow[]; nextCursor: string | null }>(`/api/admin/tickets?status=${status}&limit=100`)
      .then((d) => setRows(d.items))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };
  useEffect(loadList, [status]);

  // If the selected ticket falls out of the current filtered list (e.g. it just
  // got resolved and we're viewing "Open"), keep it selectable — the detail pane
  // fetches by id regardless of the list filter.

  return (
    <>
      <div className="crumb">Player Support · Support</div>
      <h1 className="page">Support tickets</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            className="abtn"
            onClick={() => setStatus(s)}
            style={{
              font: "700 11px var(--sans)",
              borderRadius: 9,
              padding: "10px 15px",
              ...(status === s
                ? { background: "var(--gold)", color: "#3a2405", border: "1px solid rgba(232,184,75,.5)" }
                : { background: "var(--panel)", color: "#b9a9d6", border: "1px solid rgba(232,184,75,.18)" }),
            }}
          >
            {s === "OPEN" ? "Open" : "Resolved"}
          </button>
        ))}
      </div>

      <div className="fd-2col" style={{ gridTemplateColumns: "1fr 1.3fr", alignItems: "start" }}>
        <TicketList rows={rows} loading={loading} selectedId={selectedId} onSelect={setSelectedId} />
        <div
          className="panel"
          style={{ position: "sticky", top: 0, minHeight: 420, display: "flex", flexDirection: "column" }}
        >
          {selectedId ? (
            <TicketDetailPane
              id={selectedId}
              onClose={() => setSelectedId(null)}
              onChanged={() => {
                loadList();
              }}
            />
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 48,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 34, marginBottom: 10 }}>📨</div>
              <div style={{ font: "700 14px var(--serif)", color: "var(--gold-lt)" }}>Select a ticket</div>
              <div className="dim" style={{ marginTop: 6, fontSize: 12, maxWidth: 220 }}>
                Choose a conversation on the left to read the thread and reply.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function TicketList({
  rows,
  loading,
  selectedId,
  onSelect,
}: {
  rows: TicketRow[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (loading) {
    return <div className="panel panel-pad dim" style={{ textAlign: "center" }}>Loading…</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="panel panel-pad dim" style={{ textAlign: "center", padding: 40 }}>
        No tickets in this view.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((t) => {
        const active = t.id === selectedId;
        return (
          <div
            key={t.id}
            className="arow"
            onClick={() => onSelect(t.id)}
            style={{
              cursor: "pointer",
              background: active ? "#241640" : "var(--panel)",
              border: `1px solid ${active ? "rgba(232,184,75,.35)" : "rgba(232,184,75,.12)"}`,
              borderRadius: 12,
              padding: "15px 16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="fd-avatar">{initials(t.userName)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span className="mono" style={{ font: "600 10.5px var(--mono)", color: "#8b78ad" }}>{t.id}</span>
                </div>
                <div
                  style={{
                    font: "700 12.5px var(--sans)",
                    color: "#e9e0f7",
                    marginTop: 2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {t.subject}
                </div>
              </div>
              <StatusBadge status={t.status} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 9, paddingLeft: 44 }}>
              <span style={{ font: "500 11px var(--sans)", color: "#8b78ad" }}>
                {t.userName} · {t.category}
              </span>
              <span style={{ font: "500 10.5px var(--sans)", color: "#6f5f92" }}>{timeAgo(t.updatedAt)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TicketDetailPane({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<{ ticket: TicketDetail; thread: ThreadMessage[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const mutate = useAdminMutation();

  const load = () => {
    setLoading(true);
    api
      .get<{ ticket: TicketDetail; thread: ThreadMessage[] }>(`/api/admin/tickets/${id}`)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  async function sendReply() {
    const body = reply.trim();
    if (!body) return;
    setSending(true);
    try {
      await api.post(`/api/admin/tickets/${id}/reply`, { body });
      setReply("");
      load();
      onChanged();
    } catch {
      // TICKET_RESOLVED or other errors: refetch so the UI re-syncs with server state.
      load();
    } finally {
      setSending(false);
    }
  }

  const resolve = () =>
    mutate({
      title: "Resolve this ticket",
      requireReason: true,
      confirmLabel: "Resolve",
      method: "POST",
      path: `/api/admin/tickets/${id}/resolve`,
      successMsg: "Ticket resolved.",
      onDone: () => {
        load();
        onChanged();
      },
    });

  if (loading) {
    return <div className="dim" style={{ textAlign: "center", padding: 48 }}>Loading…</div>;
  }
  if (!detail) {
    return <div className="dim" style={{ textAlign: "center", padding: 48 }}>Ticket not found.</div>;
  }

  const { ticket, thread } = detail;
  const c = STATUS_COLOR[ticket.status];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="card-header" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="mono" style={{ font: "600 10.5px var(--mono)", color: "#8b78ad" }}>{ticket.id}</span>
            <span className="badge-rect" style={{ color: c.fg, background: c.bg, borderColor: `${c.fg}44` }}>
              {ticket.status === "OPEN" ? "Open" : "Resolved"}
            </span>
          </div>
          <div style={{ font: "800 15px var(--serif)", color: "var(--gold-lt)", marginTop: 6 }}>{ticket.subject}</div>
          <div style={{ font: "500 11px var(--sans)", color: "#8b78ad", marginTop: 4 }}>
            {ticket.userName}
            {ticket.userEmail ? ` · ${ticket.userEmail}` : ""} · {ticket.category}
            {ticket.userGone && " · account deleted"}
          </div>
        </div>
        <button
          className="abtn"
          onClick={onClose}
          title="Close"
          style={{
            background: "transparent",
            border: "1px solid rgba(232,184,75,.2)",
            color: "#b9a9d6",
            width: 30,
            height: 30,
            borderRadius: 8,
            font: "700 14px var(--sans)",
            flex: "none",
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", maxHeight: 340 }}>
        {thread.map((m) => (
          <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.isStaff ? "flex-end" : "flex-start" }}>
            <div style={{ font: "600 10px var(--sans)", color: "#8b78ad", marginBottom: 4, textAlign: m.isStaff ? "right" : "left" }}>
              {m.authorName} · {timeAgo(m.createdAt)}
            </div>
            <div
              style={{
                maxWidth: "78%",
                padding: "12px 14px",
                borderRadius: 13,
                font: "500 12.5px var(--sans)",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                ...(m.isStaff
                  ? {
                      background: "linear-gradient(180deg,#3a2a12,#2a1e0c)",
                      color: "#f3e6c8",
                      border: "1px solid rgba(232,184,75,.25)",
                    }
                  : {
                      background: "var(--bg-2)",
                      color: "#d9ccf0",
                      border: "1px solid rgba(232,184,75,.1)",
                    }),
              }}
            >
              {m.body}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(232,184,75,.12)" }}>
        {ticket.canResolve ? (
          <>
            <textarea
              className="input"
              placeholder="Type your reply to the player…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              style={{ minHeight: 70, resize: "vertical", width: "100%" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="abtn btn-gold-pill" style={{ flex: 1 }} disabled={sending || !reply.trim()} onClick={sendReply}>
                {sending ? "Sending…" : "Send reply"}
              </button>
              <button
                className="abtn"
                onClick={resolve}
                style={{
                  font: "700 12px var(--sans)",
                  borderRadius: 9,
                  padding: "11px 16px",
                  border: "1px solid rgba(47,143,91,.5)",
                  color: "#fff",
                  background: "linear-gradient(180deg,#2f8f5b,#1c6e42)",
                }}
              >
                Resolve
              </button>
              {/* Reopen omitted — mockup's canReopen action has no server route yet (only resolve exists). */}
            </div>
          </>
        ) : (
          <div className="dim" style={{ fontSize: 12, textAlign: "center" }}>
            This ticket is resolved{ticket.resolvedAt ? ` (${timeAgo(ticket.resolvedAt)})` : ""}.
          </div>
        )}
      </div>
    </div>
  );
}
