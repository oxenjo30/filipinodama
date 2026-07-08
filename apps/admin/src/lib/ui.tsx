import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { api, ApiError } from "./api";

// ── Toasts ───────────────────────────────────────────────────────────────────
type Toast = { id: number; kind: "ok" | "err"; msg: string };
const ToastCtx = createContext<(kind: "ok" | "err", msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: "ok" | "err", msg: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((t) => [...t, { id, kind, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ── Confirm → reason modal + the shared admin-mutation flow ──────────────────
// Every write goes through confirm(): opens a modal, optionally requires a
// non-empty reason and/or amount, POSTs, toasts, and returns success. The server
// writes the audit row. Extra fields (e.g. duration) render via `extra`.
type ConfirmOpts = {
  title: string;
  body?: ReactNode;
  requireReason?: boolean;
  danger?: boolean;
  confirmLabel?: string;
  /** extra controlled inputs; returns the field values merged into the payload */
  extra?: (set: (k: string, v: unknown) => void, vals: Record<string, unknown>) => ReactNode;
};

type Pending = ConfirmOpts & { resolve: (v: { reason: string; extra: Record<string, unknown> } | null) => void };

const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<{ reason: string; extra: Record<string, unknown> } | null>>(
  async () => null,
);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [extra, setExtra] = useState<Record<string, unknown>>({});

  const confirm = useCallback(
    (o: ConfirmOpts) =>
      new Promise<{ reason: string; extra: Record<string, unknown> } | null>((resolve) => {
        setReason("");
        setExtra({});
        setPending({ ...o, resolve });
      }),
    [],
  );

  const close = (result: { reason: string; extra: Record<string, unknown> } | null) => {
    pending?.resolve(result);
    setPending(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {pending && (
        <div className="overlay" onClick={() => close(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{pending.title}</h3>
            {pending.body && <div className="dim" style={{ fontSize: 13, marginBottom: 14 }}>{pending.body}</div>}
            {pending.extra?.((k, v) => setExtra((s) => ({ ...s, [k]: v })), extra)}
            {pending.requireReason && (
              <div className="field">
                <label>Reason (required, audited)</label>
                <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you doing this?" autoFocus />
              </div>
            )}
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
              <button className="btn" onClick={() => close(null)}>Cancel</button>
              <button
                className={`btn ${pending.danger ? "danger" : "gold"}`}
                disabled={pending.requireReason ? reason.trim().length === 0 : false}
                onClick={() => close({ reason: reason.trim(), extra })}
              >
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

/**
 * useAdminMutation — the one write path every section uses. Opens the
 * confirm/reason modal, runs the request with the reason + extra fields merged
 * in, toasts the outcome. Returns a runner: run(payloadExtra?) => success bool.
 */
export function useAdminMutation() {
  const confirm = useContext(ConfirmCtx);
  const toast = useToast();
  return useCallback(
    async (
      opts: ConfirmOpts & {
        method?: "POST" | "PATCH" | "DELETE";
        path: string;
        payload?: Record<string, unknown>;
        successMsg?: string;
        onDone?: () => void;
      },
    ): Promise<boolean> => {
      const res = await confirm(opts);
      if (!res) return false;
      const body = { ...(opts.payload ?? {}), ...res.extra, ...(opts.requireReason ? { reason: res.reason } : {}) };
      try {
        const method = opts.method ?? "POST";
        if (method === "POST") await api.post(opts.path, body);
        else if (method === "PATCH") await api.patch(opts.path, body);
        else await api.del(opts.path, body);
        toast("ok", opts.successMsg ?? "Done.");
        opts.onDone?.();
        return true;
      } catch (e) {
        toast("err", e instanceof ApiError ? e.message : "Action failed.");
        return false;
      }
    },
    [confirm, toast],
  );
}
