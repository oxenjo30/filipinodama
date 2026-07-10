import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAdminMutation } from "../lib/ui";

type Season = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  tiers: unknown;
  tierCount: number;
  status: "upcoming" | "active" | "ended";
  participants: number;
};

type Quest = {
  id: string;
  scope: string;
  title: string;
  description: string | null;
  goal: number;
  rewardGold: number;
  active: boolean;
  activeProgress: number;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const STATUS_CLASS: Record<Season["status"], string> = {
  active: "st-active",
  upcoming: "st-muted",
  ended: "st-deleted",
};

/** Compact preview of a `tiers` Json array — first few tiers, honestly summarized. */
function tiersPreview(tiers: unknown): string {
  if (!Array.isArray(tiers) || tiers.length === 0) return "no tiers";
  const first = tiers
    .slice(0, 3)
    .map((t: any) => (t && typeof t === "object" && "tier" in t ? `T${t.tier}` : "•"))
    .join(", ");
  return tiers.length > 3 ? `${first}, …` : first;
}

/**
 * Live ops — authors the existing Season + Quest models. Two panels: Seasons
 * (with an active-season banner) and Quests. Every write goes through the shared
 * confirm→reason→audit mutation flow. The shell renders the page title; this page
 * adds the in-page breadcrumb to match the approved secSeasons layout.
 */
export function LiveOpsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loadingS, setLoadingS] = useState(true);
  const [loadingQ, setLoadingQ] = useState(true);

  const loadSeasons = () => {
    setLoadingS(true);
    api
      .get<{ items: Season[] }>("/api/admin/liveops/seasons")
      .then((d) => setSeasons(d.items))
      .catch(() => setSeasons([]))
      .finally(() => setLoadingS(false));
  };
  const loadQuests = () => {
    setLoadingQ(true);
    api
      .get<{ items: Quest[] }>("/api/admin/liveops/quests")
      .then((d) => setQuests(d.items))
      .catch(() => setQuests([]))
      .finally(() => setLoadingQ(false));
  };
  useEffect(() => {
    loadSeasons();
    loadQuests();
  }, []);

  const activeSeason = seasons.find((s) => s.status === "active") ?? null;

  return (
    <>
      <div className="crumb">Live Ops · Seasons & Quests</div>
      <h1 className="page">Seasons & Quests</h1>

      <SeasonsPanel
        seasons={seasons}
        activeSeason={activeSeason}
        loading={loadingS}
        onDone={loadSeasons}
      />

      <QuestsPanel quests={quests} loading={loadingQ} onDone={loadQuests} />
    </>
  );
}

// ── Seasons ──────────────────────────────────────────────────────────────────

function SeasonsPanel({
  seasons,
  activeSeason,
  loading,
  onDone,
}: {
  seasons: Season[];
  activeSeason: Season | null;
  loading: boolean;
  onDone: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Season | null>(null);

  return (
    <div style={{ marginBottom: 22 }}>
      {/* Active-season banner — secSeasons: gradient card, eyebrow + serif name + ends line, gold-pill actions. */}
      <div
        style={{
          background: "linear-gradient(120deg,#1e1338,#241645)",
          border: "1px solid var(--edge-strong)",
          borderRadius: 14,
          padding: 22,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ font: "700 10px var(--sans)", letterSpacing: 2, color: "var(--dim)" }}>CURRENT SEASON</div>
            <div style={{ font: "800 22px var(--serif)", color: "var(--gold-lt)", marginTop: 4 }}>
              {activeSeason ? activeSeason.name : "No active season"}
            </div>
            <div style={{ marginTop: 6, font: "500 12px var(--sans)", color: "var(--dim)" }}>
              {activeSeason
                ? `Ends ${fmtDate(activeSeason.endsAt)} · ${activeSeason.tierCount} tiers · ${activeSeason.participants.toLocaleString()} participants`
                : "Create a season below to start a live track."}
            </div>
          </div>
          <div className="row">
            {activeSeason && (
              <button className="abtn btn-gold-pill sm" onClick={() => { setEditing(activeSeason); setCreating(false); }}>
                Edit season
              </button>
            )}
            <button className="abtn btn-gold-pill sm" onClick={() => { setCreating(true); setEditing(null); }}>
              + New season
            </button>
          </div>
        </div>
      </div>

      {creating && <SeasonForm onClose={() => setCreating(false)} onDone={onDone} />}
      {editing && <SeasonForm season={editing} onClose={() => setEditing(null)} onDone={onDone} />}

      {/* All seasons table. */}
      <div className="panel" style={{ overflow: "hidden" }}>
        <div className="card-header">
          <span className="t">All seasons</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ minWidth: 640 }}>
            <thead>
              <tr className="thead-raised">
                <th>Season</th>
                <th>Window</th>
                <th>Status</th>
                <th className="num">Tiers</th>
                <th className="num">Participants</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
              ) : seasons.length === 0 ? (
                <tr><td colSpan={6} className="dim" style={{ textAlign: "center", padding: 24 }}>No seasons yet.</td></tr>
              ) : (
                seasons.map((s) => (
                  <tr key={s.id} className="arow">
                    <td>
                      <div style={{ font: "700 12.5px var(--sans)", color: "var(--ink-2)" }}>{s.name}</div>
                      <div className="mono dim" style={{ fontSize: 11 }}>{s.id}</div>
                    </td>
                    <td className="dim" style={{ whiteSpace: "nowrap" }}>{fmtDate(s.startsAt)} → {fmtDate(s.endsAt)}</td>
                    <td><span className={`badge-st ${STATUS_CLASS[s.status]}`}>{s.status}</span></td>
                    <td className="num">
                      {s.tierCount}
                      <span className="dim mono" style={{ fontSize: 10, marginLeft: 6 }}>{tiersPreview(s.tiers)}</span>
                    </td>
                    <td className="num">{s.participants.toLocaleString()}</td>
                    <td className="num">
                      <button className="abtn btn-ghost btn-ghost-sm" onClick={() => { setEditing(s); setCreating(false); }}>Edit</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Create/edit a season. `tiers` is authored as raw JSON, validated on submit. */
function SeasonForm({ season, onClose, onDone }: { season?: Season; onClose: () => void; onDone: () => void }) {
  const mutate = useAdminMutation();
  const isEdit = !!season;
  const [name, setName] = useState(season?.name ?? "");
  const [startsAt, setStartsAt] = useState(season ? toLocalInput(season.startsAt) : "");
  const [endsAt, setEndsAt] = useState(season ? toLocalInput(season.endsAt) : "");
  const [tiersText, setTiersText] = useState(
    season && Array.isArray(season.tiers) ? JSON.stringify(season.tiers, null, 2) : "[]",
  );
  const [tiersErr, setTiersErr] = useState("");

  const submit = () => {
    let tiers: unknown;
    try {
      tiers = JSON.parse(tiersText || "[]");
      if (!Array.isArray(tiers)) throw new Error("not an array");
      setTiersErr("");
    } catch {
      setTiersErr("Tiers must be a valid JSON array.");
      return;
    }
    mutate({
      title: isEdit ? `Edit season "${name}"` : `Create season "${name}"`,
      body: `${Array.isArray(tiers) ? tiers.length : 0} tiers · ${startsAt || "?"} → ${endsAt || "?"}. Audited.`,
      requireReason: true,
      confirmLabel: isEdit ? "Save season" : "Create season",
      method: isEdit ? "PATCH" : "POST",
      path: isEdit ? `/api/admin/liveops/seasons/${season!.id}` : "/api/admin/liveops/seasons",
      payload: { name, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), tiers },
      successMsg: isEdit ? "Season updated." : "Season created.",
      onDone: () => { onDone(); onClose(); },
    });
  };

  const valid = name.trim() && startsAt && endsAt;

  return (
    <div className="panel panel-pad" style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>{isEdit ? "Edit season" : "New season"}</div>
      <div className="field">
        <label>Season name</label>
        <input className="input" placeholder="e.g. Rise of the Datu" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>Starts</label>
          <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>Ends</label>
          <input className="input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Tiers (JSON array)</label>
        <textarea
          className="input mono"
          style={{ minHeight: 140, resize: "vertical", fontSize: 12 }}
          value={tiersText}
          onChange={(e) => setTiersText(e.target.value)}
          placeholder='[{ "tier": 1, "xp": 100, "freeReward": { "gold": 100 } }]'
        />
        {tiersErr && <span style={{ color: "var(--red-lt)", fontSize: 12 }}>{tiersErr}</span>}
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="abtn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="abtn btn-gold-pill" disabled={!valid} onClick={submit}>{isEdit ? "Save season" : "Create season"}</button>
      </div>
    </div>
  );
}

// ── Quests ───────────────────────────────────────────────────────────────────

function QuestsPanel({ quests, loading, onDone }: { quests: Quest[]; loading: boolean; onDone: () => void }) {
  const mutate = useAdminMutation();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Quest | null>(null);

  const toggle = (q: Quest) =>
    mutate({
      title: `${q.active ? "Deactivate" : "Activate"} quest "${q.title}"`,
      body: `Scope: ${q.scope}. Audited.`,
      requireReason: true,
      confirmLabel: q.active ? "Deactivate" : "Activate",
      danger: q.active,
      method: "POST",
      path: `/api/admin/liveops/quests/${q.id}/toggle`,
      successMsg: "Quest updated.",
      onDone,
    });

  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <div className="card-header">
        <span className="t">Quests</span>
        <button className="abtn btn-gold-pill sm" onClick={() => { setCreating(true); setEditing(null); }}>+ New quest</button>
      </div>

      {creating && (
        <div style={{ padding: "0 18px" }}>
          <QuestForm onClose={() => setCreating(false)} onDone={onDone} />
        </div>
      )}
      {editing && (
        <div style={{ padding: "0 18px" }}>
          <QuestForm quest={editing} onClose={() => setEditing(null)} onDone={onDone} />
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 640 }}>
          <thead>
            <tr className="thead-raised">
              <th>Quest</th>
              <th>Scope</th>
              <th className="num">Goal</th>
              <th className="num">Reward</th>
              <th style={{ textAlign: "center" }}>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
            ) : quests.length === 0 ? (
              <tr><td colSpan={6} className="dim" style={{ textAlign: "center", padding: 24 }}>No quests yet.</td></tr>
            ) : (
              quests.map((q) => (
                <tr key={q.id} className="arow">
                  <td>
                    <div style={{ font: "700 12.5px var(--sans)", color: "var(--ink-2)" }}>{q.title}</div>
                    {q.description && <div className="dim" style={{ fontSize: 11 }}>{q.description}</div>}
                    <div className="mono dim" style={{ fontSize: 10 }}>{q.id}</div>
                  </td>
                  <td className="dim">{q.scope}</td>
                  <td className="num">{q.goal.toLocaleString()}</td>
                  <td className="num" style={{ color: "var(--gold-lt)" }}>{q.rewardGold.toLocaleString()} 🪙</td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      className={`abtn fd-switch${q.active ? " on" : ""}`}
                      title={q.active ? "Deactivate quest" : "Activate quest"}
                      onClick={() => toggle(q)}
                    >
                      <span className="knob" />
                    </button>
                  </td>
                  <td className="num">
                    <button className="abtn btn-ghost btn-ghost-sm" onClick={() => { setEditing(q); setCreating(false); }}>Edit</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Create/edit a quest. Scope is a select over the real seed scopes (daily/seasonal). */
function QuestForm({ quest, onClose, onDone }: { quest?: Quest; onClose: () => void; onDone: () => void }) {
  const mutate = useAdminMutation();
  const isEdit = !!quest;
  const [id, setId] = useState(quest?.id ?? "");
  const [scope, setScope] = useState(quest?.scope ?? "daily");
  const [title, setTitle] = useState(quest?.title ?? "");
  const [description, setDescription] = useState(quest?.description ?? "");
  const [goal, setGoal] = useState<number>(quest?.goal ?? 1);
  const [rewardGold, setRewardGold] = useState<number>(quest?.rewardGold ?? 0);

  const submit = () =>
    mutate({
      title: isEdit ? `Edit quest "${title}"` : `Create quest "${title}"`,
      body: `Scope ${scope} · goal ${goal} · ${rewardGold} gold. Audited.`,
      requireReason: true,
      confirmLabel: isEdit ? "Save quest" : "Create quest",
      method: isEdit ? "PATCH" : "POST",
      path: isEdit ? `/api/admin/liveops/quests/${quest!.id}` : "/api/admin/liveops/quests",
      payload: isEdit
        ? { title, description: description || null, goal, rewardGold }
        : { id, scope, title, description: description || undefined, goal, rewardGold },
      successMsg: isEdit ? "Quest updated." : "Quest created.",
      onDone: () => { onDone(); onClose(); },
    });

  const valid = title.trim() && goal >= 1 && (isEdit || (id.trim() && scope.trim()));

  return (
    <div className="panel panel-pad" style={{ margin: "14px 0" }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>{isEdit ? "Edit quest" : "New quest"}</div>
      {!isEdit && (
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>Quest id</label>
            <input className="input mono" placeholder="daily-play5" value={id} onChange={(e) => setId(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>Scope</label>
            <select className="select" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="daily">daily</option>
              <option value="seasonal">seasonal</option>
            </select>
          </div>
        </div>
      )}
      <div className="field">
        <label>Title</label>
        <input className="input" placeholder="Win 3 matches" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label>Description</label>
        <input className="input" placeholder="Claim victory in 3 matches today" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label>Goal</label>
          <input className="input" type="number" min={1} value={goal || ""} onChange={(e) => setGoal(Number(e.target.value))} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label>Reward gold</label>
          <input className="input" type="number" min={0} value={rewardGold || ""} onChange={(e) => setRewardGold(Number(e.target.value))} />
        </div>
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="abtn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="abtn btn-gold-pill" disabled={!valid} onClick={submit}>{isEdit ? "Save quest" : "Create quest"}</button>
      </div>
    </div>
  );
}

/** ISO string → value for <input type="datetime-local"> (local time, no seconds). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
