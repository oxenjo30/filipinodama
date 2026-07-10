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
  return username.slice(0, 2).toUpperCase();
}

const STATUS_ACCENT: Record<TicketRow["status"], string> = {
  OPEN: "var(--amber)",
  RESOLVED: "var(--green-lt)",
};

/** 3.0 Support — the ticket queue (Player Support). Matches the approved secTickets
 * fidelity: a filtered ticket list on the left, the selected thread + composer on
 * the right. Status = OPEN | RESOLVED only (priority + pending are deferred). */
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

      <div className="row" style={{ marginBottom: 14 }}>
        {STATUS_FILTERS.map((s) => (
          <button key={s} className={`chip${status === s ? " on" : ""}`} onClick={() => setStatus(s)}>
            {s === "OPEN" ? "Open" : "Resolved"}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 16, alignItems: "start" }}>
        <TicketList rows={rows} loading={loading} selectedId={selectedId} onSelect={setSelectedId} />
        <div style={{ position: "sticky", top: 84 }}>
          {selectedId ? (
            <TicketDetailPane
              id={selectedId}
              onClose={() => setSelectedId(null)}
              onChanged={() => {
                loadList();
              }}
            />
          ) : (
            <div className="panel panel-pad" style={{ textAlign: "center", padding: 48 }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>📨</div>
              <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--gold-lt)", font: "800 16px var(--serif)" }}>
                Select a ticket
              </div>
              <div className="dim" style={{ maxWidth: 360, margin: "0 auto" }}>
                Choose a ticket from the list to read the thread and reply.
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
      <div className="panel panel-pad dim" style={{ textAlign: "center", padding: 32 }}>
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
            className="acard"
            onClick={() => onSelect(t.id)}
            style={{
              cursor: "pointer",
              padding: 14,
              borderColor: active ? "var(--gold)" : "var(--edge)",
              background: active ? "rgba(232,184,75,.08)" : "var(--panel)",
            }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "nowrap" }}>
              <div className="row" style={{ gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    width: 30, height: 30, borderRadius: "50%", flex: "none",
                    background: "linear-gradient(150deg, #4a2d7a, #2a1848)",
                    border: "1px solid var(--edge-strong)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    font: "800 11px var(--sans)", color: "var(--gold-lt)",
                  }}
                >
                  {initials(t.userName)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="mono dim" style={{ fontSize: 11 }}>{t.id}</span>
                    <span className="badge-st" style={{ color: "var(--dim)", background: "rgba(255,255,255,.04)", border: "1px solid var(--edge-strong)" }}>
                      Normal
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.subject}
                  </div>
                </div>
              </div>
              <span
                className="badge-st"
                style={{ flex: "none", color: STATUS_ACCENT[t.status], background: "rgba(255,255,255,.06)", border: `1px solid ${STATUS_ACCENT[t.status]}` }}
              >
                {t.status === "OPEN" ? "Open" : "Resolved"}
              </span>
            </div>
            <div className="dim" style={{ marginTop: 8, fontSize: 12 }}>
              {t.userName} · {t.category} · {timeAgo(t.updatedAt)}
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
    return <div className="panel panel-pad dim" style={{ textAlign: "center" }}>Loading…</div>;
  }
  if (!detail) {
    return <div className="panel panel-pad dim" style={{ textAlign: "center" }}>Ticket not found.</div>;
  }

  const { ticket, thread } = detail;

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 140px)" }}>
      <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--edge)" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="mono dim" style={{ fontSize: 11 }}>{ticket.id}</span>
            <span
              className="badge-st"
              style={{ color: STATUS_ACCENT[ticket.status], background: "rgba(255,255,255,.06)", border: `1px solid ${STATUS_ACCENT[ticket.status]}` }}
            >
              {ticket.status === "OPEN" ? "Open" : "Resolved"}
            </span>
            <span className="badge-st" style={{ color: "var(--dim)", background: "rgba(255,255,255,.04)", border: "1px solid var(--edge-strong)" }}>
              Normal
            </span>
          </div>
          <button className="btn" onClick={onClose} title="Close">✕</button>
        </div>
        <div style={{ marginTop: 8, font: "800 16px var(--serif)", color: "var(--gold-lt)" }}>{ticket.subject}</div>
        <div className="dim" style={{ marginTop: 4, fontSize: 12 }}>
          {ticket.userName}
          {ticket.userEmail ? ` · ${ticket.userEmail}` : ""} · {ticket.category}
          {ticket.userGone && " · account deleted"}
        </div>
      </div>

      <div style={{ padding: "14px 18px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        {thread.map((m) => (
          <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.isStaff ? "flex-end" : "flex-start" }}>
            <div
              style={{
                maxWidth: "80%",
                padding: "9px 13px",
                borderRadius: 12,
                background: m.isStaff ? "rgba(232,184,75,.14)" : "var(--panel-2)",
                border: m.isStaff ? "1px solid rgba(232,184,75,.3)" : "1px solid var(--edge)",
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {m.body}
            </div>
            <div className="dim" style={{ marginTop: 4, fontSize: 11 }}>
              {m.isStaff ? "Staff" : "Player"} · {m.authorName} · {timeAgo(m.createdAt)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: "14px 18px", borderTop: "1px solid var(--edge)" }}>
        {ticket.canResolve ? (
          <>
            <textarea
              className="input"
              rows={3}
              placeholder="Write a reply…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              style={{ resize: "vertical", marginBottom: 10 }}
            />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn gold" disabled={sending || !reply.trim()} onClick={sendReply}>
                {sending ? "Sending…" : "Send reply"}
              </button>
              <button
                className="btn"
                style={{ background: "rgba(63,191,111,.16)", borderColor: "rgba(63,191,111,.45)", color: "var(--green-lt)" }}
                onClick={resolve}
              >
                Resolve
              </button>
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
