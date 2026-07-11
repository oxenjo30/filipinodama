import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAdminMutation } from "../lib/ui";

type Season = {
  id: string;
  name: string;
  number: number | null;
  endsLabel: string | null;
  startsAt: string;
  endsAt: string;
  tiers: unknown;
  tierCount: number;
  status: "upcoming" | "active" | "ended";
  participants: number;
};

type QuestTrigger = { event: string } | null;

type Quest = {
  id: string;
  scope: string;
  title: string;
  description: string | null;
  goal: number;
  rewardGold: number;
  active: boolean;
  trigger: QuestTrigger;
  activeProgress: number;
};

type LiveEvent = {
  id: string;
  name: string;
  type: string;
  status: "scheduled" | "live" | "ended" | string;
  scope: string;
  reward: string;
  startsLabel: string | null;
  endsLabel: string | null;
  color: string | null;
  createdByName: string;
  createdAt: string;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const STATUS_CLASS: Record<Season["status"], string> = {
  active: "st-active",
  upcoming: "st-muted",
  ended: "st-deleted",
};

const EVENT_STATUS_CLASS: Record<string, string> = {
  live: "st-active",
  scheduled: "st-muted",
  ended: "st-deleted",
};

const EVENT_TYPES = [
  { value: "double_gold", label: "Double gold" },
  { value: "tournament", label: "Tournament" },
  { value: "fiesta", label: "Fiesta" },
  { value: "sale", label: "Sale" },
  { value: "other", label: "Other" },
];

const EVENT_STATUSES = [
  { value: "scheduled", label: "Scheduled" },
  { value: "live", label: "Live" },
  { value: "ended", label: "Ended" },
];

const EVENT_SCOPES = [
  { value: "all_players", label: "All players" },
  { value: "new_players", label: "New players" },
  { value: "vip", label: "VIP" },
  { value: "guild_members", label: "Guild members" },
  { value: "region_ph", label: "Region: PH" },
  { value: "season_pass", label: "Season pass holders" },
];

// Mirrors QUEST_EVENTS in apps/server/src/lib/quest-trigger.ts — the 6 match
// outcomes the settlement engine can advance a quest from. "" = no trigger
// (draft quest; won't track until an admin picks one).
const QUEST_TRIGGERS = [
  { value: "", label: "— not tracked —" },
  { value: "match_played", label: "Match played" },
  { value: "match_won", label: "Match won" },
  { value: "ranked_played", label: "Ranked played" },
  { value: "ranked_won", label: "Ranked won" },
  { value: "captures", label: "Captures" },
  { value: "win_streak", label: "Win streak" },
];

/** Human label for a quest's trigger (or the "not tracked" fallback). */
function triggerLabel(trigger: QuestTrigger): string {
  const found = QUEST_TRIGGERS.find((t) => t.value === trigger?.event);
  return found && found.value ? found.label : "— not tracked —";
}

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
 * Live ops — authors the Season, Quest, and LiveEvent models. Three panels per
 * the approved secSeasons mockup: the current-season banner (with an inline
 * edit form), Quests, and Scheduled events. Every write goes through the shared
 * confirm→reason→audit mutation flow. The shell renders the page title; this
 * page adds the in-page breadcrumb to match the approved secSeasons layout.
 */
export function LiveOpsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loadingS, setLoadingS] = useState(true);
  const [loadingQ, setLoadingQ] = useState(true);
  const [loadingE, setLoadingE] = useState(true);

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
  const loadEvents = () => {
    setLoadingE(true);
    api
      .get<{ items: LiveEvent[] }>("/api/admin/events")
      .then((d) => setEvents(d.items))
      .catch(() => setEvents([]))
      .finally(() => setLoadingE(false));
  };
  useEffect(() => {
    loadSeasons();
    loadQuests();
    loadEvents();
  }, []);

  const activeSeason = seasons.find((s) => s.status === "active") ?? null;

  return (
    <>
      <SeasonBanner seasons={seasons} activeSeason={activeSeason} onDone={loadSeasons} />

      <QuestsPanel quests={quests} loading={loadingQ} onDone={loadQuests} />

      <EventsPanel events={events} loading={loadingE} onDone={loadEvents} />

      {/* All seasons table — real admin need beyond the current-season banner. */}
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
              </tr>
            </thead>
            <tbody>
              {loadingS ? (
                <tr><td colSpan={5} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
              ) : seasons.length === 0 ? (
                <tr><td colSpan={5} className="dim" style={{ textAlign: "center", padding: 24 }}>No seasons yet.</td></tr>
              ) : (
                seasons.map((s) => (
                  <tr key={s.id} className="arow">
                    <td>
                      <div style={{ font: "700 12.5px var(--sans)", color: "var(--ink-2)" }}>
                        {s.number ? `S${s.number} · ` : ""}{s.name}
                      </div>
                      <div className="mono dim" style={{ fontSize: 11 }}>{s.id}</div>
                    </td>
                    <td className="dim" style={{ whiteSpace: "nowrap" }}>{fmtDate(s.startsAt)} → {fmtDate(s.endsAt)}</td>
                    <td><span className={`badge-st ${STATUS_CLASS[s.status]}`}>{s.status}</span></td>
                    <td className="num">
                      {s.tierCount}
                      <span className="dim mono" style={{ fontSize: 10, marginLeft: 6 }}>{tiersPreview(s.tiers)}</span>
                    </td>
                    <td className="num">{s.participants.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── Current-season banner (secSeasons lines 3-16) ──────────────────────────────

function SeasonBanner({
  seasons,
  activeSeason,
  onDone,
}: {
  seasons: Season[];
  activeSeason: Season | null;
  onDone: () => void;
}) {
  const [formOpen, setFormOpen] = useState<"edit" | "create" | "end" | null>(null);

  const closeForm = () => setFormOpen(null);

  return (
    <div
      style={{
        background: "linear-gradient(120deg,#1e1338,#241645)",
        border: "1px solid rgba(232,184,75,.2)",
        borderRadius: 14,
        padding: 22,
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ font: "700 10px var(--sans)", letterSpacing: 2, color: "var(--dim)" }}>CURRENT SEASON</div>
          <div style={{ font: "800 22px var(--serif)", color: "var(--gold-lt)", marginTop: 4 }}>
            {activeSeason ? `${activeSeason.number ? `S${activeSeason.number} · ` : ""}${activeSeason.name}` : "No active season"}
          </div>
          <div style={{ marginTop: 6, font: "500 12px var(--sans)", color: "#a996c9" }}>
            {activeSeason
              ? activeSeason.endsLabel || `Ends ${fmtDate(activeSeason.endsAt)} · ${activeSeason.tierCount} tiers · ${activeSeason.participants.toLocaleString()} participants`
              : "Create a season below to start a live track."}
          </div>
        </div>
        <div className="row">
          {activeSeason ? (
            <>
              <button className="abtn btn-gold-pill sm" onClick={() => setFormOpen(formOpen === "edit" ? null : "edit")}>
                Edit season
              </button>
              <button className="abtn btn-danger btn-danger-sm" onClick={() => setFormOpen(formOpen === "end" ? null : "end")}>
                End season…
              </button>
            </>
          ) : (
            <button className="abtn btn-gold-pill sm" onClick={() => setFormOpen(formOpen === "create" ? null : "create")}>
              + New season
            </button>
          )}
        </div>
      </div>

      {formOpen === "edit" && activeSeason && (
        <SeasonForm season={activeSeason} onClose={closeForm} onDone={onDone} />
      )}
      {formOpen === "create" && <SeasonForm onClose={closeForm} onDone={onDone} />}
      {formOpen === "end" && activeSeason && (
        <EndSeasonForm season={activeSeason} onClose={closeForm} onDone={onDone} />
      )}

      {seasons.length > 0 && !activeSeason && formOpen !== "create" && (
        <div style={{ marginTop: 14 }}>
          <button className="abtn btn-gold-pill sm" onClick={() => setFormOpen("create")}>+ New season</button>
        </div>
      )}
    </div>
  );
}

/** Inline create/edit form for the current-season banner (secSeasons lines 9-14: name, number, ends/status line). */
function SeasonForm({ season, onClose, onDone }: { season?: Season; onClose: () => void; onDone: () => void }) {
  const mutate = useAdminMutation();
  const isEdit = !!season;
  const [name, setName] = useState(season?.name ?? "");
  const [number, setNumber] = useState(season?.number ? String(season.number) : "");
  const [endsLabel, setEndsLabel] = useState(season?.endsLabel ?? "");
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
    const numberVal = number.trim() ? Number(number.trim()) : undefined;
    mutate({
      title: isEdit ? `Edit season "${name}"` : `Create season "${name}"`,
      body: `${Array.isArray(tiers) ? tiers.length : 0} tiers · ${startsAt || "?"} → ${endsAt || "?"}. Audited.`,
      requireReason: true,
      confirmLabel: isEdit ? "Save season" : "Create season",
      method: isEdit ? "PATCH" : "POST",
      path: isEdit ? `/api/admin/liveops/seasons/${season!.id}` : "/api/admin/liveops/seasons",
      payload: {
        name,
        number: numberVal,
        endsLabel: endsLabel.trim() || undefined,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        tiers,
      },
      successMsg: isEdit ? "Season updated." : "Season created.",
      onDone: () => { onDone(); onClose(); },
    });
  };

  const valid = name.trim() && startsAt && endsAt;

  return (
    <div className="drawer-wrap">
      <div className="drawer-bd" onClick={onClose} />
      <div className="drawer">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ font: "800 18px var(--serif)", color: "var(--gold-lt)" }}>{isEdit ? "Edit season" : "New season"}</div>
          <button className="abtn btn-ghost btn-ghost-sm" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, alignItems: "end" }}>
          <div className="field" style={{ gridColumn: "1/-1", marginBottom: 0 }}>
            <label>Season name</label>
            <input className="input" placeholder="e.g. Rise of the Datu" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Season number</label>
            <input className="input" inputMode="numeric" placeholder="3" value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div className="field" style={{ gridColumn: "2/-1", marginBottom: 0 }}>
            <label>Ends / status line</label>
            <input className="input" placeholder="Ends Aug 31 · 23:59" value={endsLabel} onChange={(e) => setEndsLabel(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Starts (actual)</label>
            <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Ends (actual)</label>
            <input className="input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
          <div className="field" style={{ gridColumn: "1/-1", marginBottom: 0 }}>
            <label>Tiers (JSON array)</label>
            <textarea
              className="input mono"
              style={{ minHeight: 120, resize: "vertical", fontSize: 12 }}
              value={tiersText}
              onChange={(e) => setTiersText(e.target.value)}
              placeholder='[{ "tier": 1, "xp": 100, "freeReward": { "gold": 100 } }]'
            />
            {tiersErr && <span style={{ color: "var(--red-lt)", fontSize: 12 }}>{tiersErr}</span>}
          </div>
          <div style={{ gridColumn: "1/-1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="abtn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="abtn btn-gold-pill" disabled={!valid} onClick={submit}>{isEdit ? "Save season" : "Create season"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** "End season…" — no dedicated end-season route exists, so this honestly pulls
 * the season's end forward to now via the same edit route (endsAt=now, endsLabel
 * marked ended). Kept explicit so admins understand what "end" does. */
function EndSeasonForm({ season, onClose, onDone }: { season: Season; onClose: () => void; onDone: () => void }) {
  const mutate = useAdminMutation();

  const submit = () =>
    mutate({
      title: `End season "${season.name}" now`,
      body: "Sets the season's end time to now so it stops immediately. Audited.",
      requireReason: true,
      danger: true,
      confirmLabel: "End season",
      method: "PATCH",
      path: `/api/admin/liveops/seasons/${season.id}`,
      payload: { endsAt: new Date().toISOString(), endsLabel: "Ended" },
      successMsg: "Season ended.",
      onDone: () => { onDone(); onClose(); },
    });

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,143,174,.2)" }}>
      <div className="dim" style={{ fontSize: 12.5, marginBottom: 10 }}>
        This ends "{season.name}" immediately by setting its end time to now. Participant progress is preserved.
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="abtn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="abtn btn-danger" onClick={submit}>End season now</button>
      </div>
    </div>
  );
}

// ── Quests (secSeasons lines 18-22) ─────────────────────────────────────────────

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
    <div className="panel" style={{ overflow: "hidden", marginBottom: 14 }}>
      <div className="card-header">
        <span className="t">Quests</span>
        <button className="abtn btn-gold-pill sm" onClick={() => { setCreating(true); setEditing(null); }}>+ New quest</button>
      </div>

      {creating && <QuestForm onClose={() => setCreating(false)} onDone={onDone} />}
      {editing && <QuestForm quest={editing} onClose={() => setEditing(null)} onDone={onDone} />}

      <div style={{ overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 560 }}>
          <thead>
            <tr className="thead-raised">
              <th>Quest</th>
              <th>Scope</th>
              <th>Tracks</th>
              <th className="num">Goal</th>
              <th className="num">Reward</th>
              <th style={{ textAlign: "center" }}>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</td></tr>
            ) : quests.length === 0 ? (
              <tr><td colSpan={7} className="dim" style={{ textAlign: "center", padding: 24 }}>No quests yet.</td></tr>
            ) : (
              quests.map((q) => (
                <tr key={q.id} className="arow">
                  <td>
                    <div style={{ font: "700 12.5px var(--sans)", color: "var(--ink-2)" }}>{q.title}</div>
                    {q.description && <div className="dim" style={{ fontSize: 11 }}>{q.description}</div>}
                    <div className="mono dim" style={{ fontSize: 10 }}>{q.id}</div>
                  </td>
                  <td className="dim">{q.scope}</td>
                  <td className={q.trigger ? "dim" : ""} style={q.trigger ? undefined : { color: "var(--red-lt, #ff8fae)" }}>
                    {triggerLabel(q.trigger)}
                  </td>
                  <td className="num" style={{ color: "var(--ink-2)" }}>{q.goal.toLocaleString()}</td>
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
  const [triggerEvent, setTriggerEvent] = useState(quest?.trigger?.event ?? "");

  const submit = () => {
    const trigger = triggerEvent ? { event: triggerEvent } : isEdit ? null : undefined;
    mutate({
      title: isEdit ? `Edit quest "${title}"` : `Create quest "${title}"`,
      body: `Scope ${scope} · goal ${goal} · ${rewardGold} gold · tracks ${triggerEvent || "nothing yet"}. Audited.`,
      requireReason: true,
      confirmLabel: isEdit ? "Save quest" : "Create quest",
      method: isEdit ? "PATCH" : "POST",
      path: isEdit ? `/api/admin/liveops/quests/${quest!.id}` : "/api/admin/liveops/quests",
      payload: isEdit
        ? { title, description: description || null, goal, rewardGold, trigger }
        : { id, scope, title, description: description || undefined, goal, rewardGold, trigger },
      successMsg: isEdit ? "Quest updated." : "Quest created.",
      onDone: () => { onDone(); onClose(); },
    });
  };

  const valid = title.trim() && goal >= 1 && (isEdit || (id.trim() && scope.trim()));

  return (
    <div className="drawer-wrap">
      <div className="drawer-bd" onClick={onClose} />
      <div className="drawer">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ font: "800 18px var(--serif)", color: "var(--gold-lt)" }}>{isEdit ? "Edit quest" : "New quest"}</div>
          <button className="abtn btn-ghost btn-ghost-sm" onClick={onClose}>Close</button>
        </div>
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
        <div className="field">
          <label>Tracks</label>
          <select className="select" value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)}>
            {QUEST_TRIGGERS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {!triggerEvent && (
            <span className="dim" style={{ fontSize: 11 }}>
              No trigger selected — this quest will not track progress until one is set.
            </span>
          )}
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="abtn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="abtn btn-gold-pill" disabled={!valid} onClick={submit}>{isEdit ? "Save quest" : "Create quest"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Scheduled events (secSeasons lines 24-46) ───────────────────────────────────

function EventsPanel({ events, loading, onDone }: { events: LiveEvent[]; loading: boolean; onDone: () => void }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LiveEvent | null>(null);
  const mutate = useAdminMutation();

  const cancelEvent = (e: LiveEvent) =>
    mutate({
      title: `Cancel event "${e.name}"`,
      body: "Marks the event as ended. Audited.",
      requireReason: true,
      danger: true,
      confirmLabel: "Cancel event",
      method: "POST",
      path: `/api/admin/events/${e.id}/cancel`,
      successMsg: "Event cancelled.",
      onDone,
    });

  return (
    <div className="panel" style={{ padding: 18, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ font: "700 14px var(--sans)", color: "var(--ink-2)" }}>Scheduled events</div>
        <button className="abtn btn-gold-pill sm" onClick={() => { setCreating(true); setEditing(null); }}>+ Schedule</button>
      </div>

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
        {loading ? (
          <div className="dim" style={{ textAlign: "center", padding: 24 }}>Loading…</div>
        ) : events.length === 0 ? (
          <div className="dim" style={{ textAlign: "center", padding: 24 }}>No scheduled events.</div>
        ) : (
          events.map((e) => {
            const window = [e.startsLabel, e.endsLabel].filter(Boolean).join(" – ");
            return (
              <div
                key={e.id}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", background: "var(--bg-2)", borderRadius: 9 }}
              >
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: e.color || "var(--gold)", flex: "none" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "700 12.5px var(--sans)", color: "var(--ink-2)" }}>{e.name}</div>
                  {window && <div style={{ font: "500 11px var(--sans)", color: "var(--dim)" }}>{window}</div>}
                  <div style={{ font: "600 10.5px var(--sans)", color: "var(--dim-2)", marginTop: 2 }}>
                    👥 {e.scope} · 🎁 {e.reward}
                  </div>
                </div>
                <span className={`badge-st ${EVENT_STATUS_CLASS[e.status] ?? "st-muted"}`}>{e.status}</span>
                <div style={{ display: "flex", gap: 6, flex: "none" }}>
                  <button
                    className="abtn btn-ghost"
                    style={{ padding: "6px 11px", fontSize: 10.5, border: "1px solid rgba(232,184,75,.28)" }}
                    onClick={() => { setEditing(e); setCreating(false); }}
                  >
                    Edit
                  </button>
                  <button
                    className="abtn btn-danger"
                    style={{ padding: "6px 11px", fontSize: 10.5, border: "1px solid rgba(255,143,174,.35)", color: "#ff8fae", background: "transparent" }}
                    onClick={() => cancelEvent(e)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {creating && <EventForm onClose={() => setCreating(false)} onDone={onDone} />}
      {editing && <EventForm event={editing} onClose={() => setEditing(null)} onDone={onDone} />}
    </div>
  );
}

/** Create/edit a scheduled event (secSeasons lines 30-44: name, type, status, scope, reward, starts, ends). */
function EventForm({ event, onClose, onDone }: { event?: LiveEvent; onClose: () => void; onDone: () => void }) {
  const mutate = useAdminMutation();
  const isEdit = !!event;
  const [name, setName] = useState(event?.name ?? "");
  const [type, setType] = useState(event?.type ?? EVENT_TYPES[0].value);
  const [status, setStatus] = useState(event?.status ?? "scheduled");
  const [scope, setScope] = useState(event?.scope ?? EVENT_SCOPES[0].value);
  const [reward, setReward] = useState(event?.reward ?? "");
  const [startsLabel, setStartsLabel] = useState(event?.startsLabel ?? "");
  const [endsLabel, setEndsLabel] = useState(event?.endsLabel ?? "");

  const submit = () =>
    mutate({
      title: isEdit ? `Edit event "${name}"` : `Schedule event "${name}"`,
      body: `Type ${type} · scope ${scope} · ${status}. Audited.`,
      requireReason: true,
      confirmLabel: isEdit ? "Save event" : "Schedule event",
      method: isEdit ? "PATCH" : "POST",
      path: isEdit ? `/api/admin/events/${event!.id}` : "/api/admin/events",
      payload: {
        name,
        type,
        status,
        scope,
        reward,
        startsLabel: startsLabel.trim() || undefined,
        endsLabel: endsLabel.trim() || undefined,
      },
      successMsg: isEdit ? "Event updated." : "Event scheduled.",
      onDone: () => { onDone(); onClose(); },
    });

  const valid = name.trim() && type.trim() && scope.trim() && reward.trim();

  return (
    <div className="drawer-wrap">
      <div className="drawer-bd" onClick={onClose} />
      <div className="drawer">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ font: "800 18px var(--serif)", color: "var(--gold-lt)" }}>{isEdit ? "Edit event" : "Schedule event"}</div>
          <button className="abtn btn-ghost btn-ghost-sm" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
            <div className="field" style={{ gridColumn: "1/-1", marginBottom: 0 }}>
              <label>Event name</label>
              <input className="input" placeholder="e.g. Fiesta Weekend" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Type</label>
              <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
                {EVENT_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Status</label>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                {EVENT_STATUSES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Audience / scope</label>
              <select className="select" value={scope} onChange={(e) => setScope(e.target.value)}>
                {EVENT_SCOPES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ gridColumn: "1/-1", marginBottom: 0 }}>
              <label>Reward</label>
              <input
                className="input"
                placeholder="e.g. 2× Gold all modes, or 500 Gold + exclusive frame"
                value={reward}
                onChange={(e) => setReward(e.target.value)}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Starts</label>
              <input className="input" placeholder="e.g. Jul 12" value={startsLabel} onChange={(e) => setStartsLabel(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Ends</label>
              <input className="input" placeholder="e.g. Jul 14" value={endsLabel} onChange={(e) => setEndsLabel(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="abtn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="abtn btn-gold-pill" disabled={!valid} onClick={submit}>{isEdit ? "Save event" : "Schedule event"}</button>
          </div>
        </div>
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
