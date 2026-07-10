import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAdminMutation } from "../lib/ui";

// StoreItem.type — mirrors ItemType in schema.prisma.
const ITEM_TYPES = ["BOARD", "SKIN", "AVATAR", "FRAME", "EMOTE", "BUNDLE", "SEASON_PASS"] as const;
type ItemType = (typeof ITEM_TYPES)[number];

type StoreItem = {
  id: string;
  type: ItemType;
  name: string;
  description: string | null;
  priceGold: number | null;
  priceDiamonds: number | null;
  assetKey: string;
  previewKey: string | null;
  tag: string | null;
  isPremium: boolean;
  active: boolean;
  salePrice: number | null;
  onSale: boolean;
  featured: boolean;
  sortOrder: number;
  createdAt: string;
  ownedCount: number;
};

type Form = {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  assetKey: string;
  previewKey: string;
  tag: string;
  priceGold: string;
  priceDiamonds: string;
  salePrice: string;
  sortOrder: string;
  isPremium: boolean;
  active: boolean;
  onSale: boolean;
  featured: boolean;
};

const blankForm = (): Form => ({
  id: "",
  type: "BOARD",
  name: "",
  description: "",
  assetKey: "",
  previewKey: "",
  tag: "",
  priceGold: "",
  priceDiamonds: "",
  salePrice: "",
  sortOrder: "0",
  isPremium: false,
  active: true,
  onSale: false,
  featured: false,
});

const FILTERS = ["all", "active", "inactive", "onSale", "featured"] as const;
type FilterT = (typeof FILTERS)[number];

/**
 * Store catalog — CRUD over StoreItem (boards, skins, frames, bundles, …).
 * Rendered as the top panel of the merged "Store & economy" page (Economy.tsx);
 * not routed on its own — /store redirects to /economy (see App.tsx).
 */
export function StoreCatalog() {
  const [rows, setRows] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [filter, setFilter] = useState<FilterT>("all");
  const [q, setQ] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const mutate = useAdminMutation();

  const load = () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (typeFilter) qs.set("type", typeFilter);
    if (filter === "active") qs.set("active", "true");
    else if (filter === "inactive") qs.set("active", "false");
    else if (filter === "onSale") qs.set("onSale", "true");
    else if (filter === "featured") qs.set("featured", "true");
    if (q.trim()) qs.set("q", q.trim());
    api
      .get<{ items: StoreItem[] }>(`/api/admin/store?${qs}`)
      .then((d) => setRows(d.items))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [typeFilter, filter]);

  const openNew = () => {
    setEditId(null);
    setForm(blankForm());
  };
  const openEdit = (it: StoreItem) => {
    setEditId(it.id);
    setForm({
      id: it.id,
      type: it.type,
      name: it.name,
      description: it.description ?? "",
      assetKey: it.assetKey,
      previewKey: it.previewKey ?? "",
      tag: it.tag ?? "",
      priceGold: it.priceGold != null ? String(it.priceGold) : "",
      priceDiamonds: it.priceDiamonds != null ? String(it.priceDiamonds) : "",
      salePrice: it.salePrice != null ? String(it.salePrice) : "",
      sortOrder: String(it.sortOrder),
      isPremium: it.isPremium,
      active: it.active,
      onSale: it.onSale,
      featured: it.featured,
    });
  };
  const closeForm = () => {
    setForm(null);
    setEditId(null);
  };

  // number-or-null from a text field ("" ⇒ null clears it)
  const numOrNull = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };

  const save = () => {
    if (!form) return;
    const base = {
      type: form.type,
      name: form.name.trim(),
      description: form.description.trim() || null,
      assetKey: form.assetKey.trim(),
      previewKey: form.previewKey.trim() || null,
      tag: form.tag.trim() || null,
      priceGold: numOrNull(form.priceGold),
      priceDiamonds: numOrNull(form.priceDiamonds),
      salePrice: numOrNull(form.salePrice),
      sortOrder: Number(form.sortOrder.trim() || "0") || 0,
      isPremium: form.isPremium,
      active: form.active,
      onSale: form.onSale,
      featured: form.featured,
    };
    if (editId) {
      mutate({
        title: `Save “${base.name || form.id}”`,
        body: "Edits the catalog item live in the player store. Audited with before/after.",
        requireReason: true,
        confirmLabel: "Save changes",
        method: "PATCH",
        path: `/api/admin/store/${editId}`,
        payload: base,
        successMsg: "Item updated.",
        onDone: () => {
          closeForm();
          load();
        },
      });
    } else {
      mutate({
        title: `Add “${base.name || form.id}” to the store`,
        body: "Creates a new catalog item, live in the player store. Audited.",
        requireReason: true,
        confirmLabel: "Add item",
        method: "POST",
        path: `/api/admin/store`,
        payload: { id: form.id.trim(), ...base },
        successMsg: "Item created.",
        onDone: () => {
          closeForm();
          load();
        },
      });
    }
  };

  const toggle = (it: StoreItem) =>
    mutate({
      title: `${it.active ? "Deactivate" : "Activate"} “${it.name}”`,
      body: it.active
        ? "Removes this item from the player store. Owned copies are unaffected."
        : "Makes this item purchasable in the player store again.",
      requireReason: true,
      danger: it.active,
      confirmLabel: it.active ? "Deactivate" : "Activate",
      method: "POST",
      path: `/api/admin/store/${it.id}/toggle`,
      successMsg: it.active ? "Item deactivated." : "Item activated.",
      onDone: load,
    });

  const remove = (it: StoreItem) =>
    mutate({
      title: `Delete “${it.name}”`,
      body:
        it.ownedCount > 0
          ? `${it.ownedCount} player${it.ownedCount === 1 ? "" : "s"} own this item, so it will be soft-deleted (deactivated + pulled from the store) to protect their inventory.`
          : "No player owns this item, so it will be permanently removed.",
      requireReason: true,
      danger: true,
      confirmLabel: it.ownedCount > 0 ? "Soft-delete" : "Delete permanently",
      method: "DELETE",
      path: `/api/admin/store/${it.id}`,
      successMsg: it.ownedCount > 0 ? "Item soft-deleted." : "Item deleted.",
      onDone: load,
    });

  return (
    <>
      {/* filters */}
      <div className="row" style={{ margin: "4px 0 14px" }}>
        <input
          className="input"
          style={{ maxWidth: 220 }}
          placeholder="Search name or id"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <select className="select" style={{ maxWidth: 160 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {typeLabel(t)}
            </option>
          ))}
        </select>
        <div className="row" style={{ gap: 6 }}>
          {FILTERS.map((f) => (
            <button key={f} className={`chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
              {filterLabel(f)}
            </button>
          ))}
        </div>
      </div>

      <div className="panel" style={{ overflow: "hidden" }}>
        {/* header */}
        <div className="card-header">
          <span className="t">Store catalog</span>
          <span className="sub">{rows.length} items</span>
          <button className="abtn btn-gold-pill sm" onClick={openNew}>
            + Add item
          </button>
        </div>

        {/* inline create / edit form */}
        {form && (
          <div style={{ padding: 18, borderBottom: "1px solid rgba(232,184,75,.1)", background: "var(--panel-2)", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
              <div className="field" style={{ gridColumn: "1/-1", marginBottom: 0 }}>
                <label>Item name</label>
                <input className="input" placeholder="e.g. Sapphire Court Board" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Item id {editId ? "(locked)" : "(slug)"}</label>
                <input
                  className="input"
                  placeholder="sapphire-court"
                  value={form.id}
                  disabled={!!editId}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Type</label>
                <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ItemType })}>
                  {ITEM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {typeLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Tag / badge</label>
                <input className="input" placeholder="NEW · VALUE · -35%" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Price (gold)</label>
                <input className="input" inputMode="numeric" placeholder="—" value={form.priceGold} onChange={(e) => setForm({ ...form, priceGold: e.target.value })} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Price (diamonds)</label>
                <input className="input" inputMode="numeric" placeholder="—" value={form.priceDiamonds} onChange={(e) => setForm({ ...form, priceDiamonds: e.target.value })} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Sale price</label>
                <input className="input" inputMode="numeric" placeholder="—" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Sort order</label>
                <input className="input" inputMode="numeric" placeholder="0" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
              </div>
              <div className="field" style={{ gridColumn: "1/-1", marginBottom: 0 }}>
                <label>Asset key (uploads/…)</label>
                <input className="input" placeholder="uploads/board-marble.png" value={form.assetKey} onChange={(e) => setForm({ ...form, assetKey: e.target.value })} />
              </div>
              <div className="field" style={{ gridColumn: "1/-1", marginBottom: 0 }}>
                <label>Preview key (optional)</label>
                <input className="input" placeholder="uploads/board-marble-preview.png" value={form.previewKey} onChange={(e) => setForm({ ...form, previewKey: e.target.value })} />
              </div>
              <div className="field" style={{ gridColumn: "1/-1", marginBottom: 0 }}>
                <label>Description (optional)</label>
                <input className="input" placeholder="Shown in the item detail sheet" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>

            {/* boolean toggles */}
            <div className="row" style={{ gap: 8 }}>
              {(
                [
                  ["active", "Active"],
                  ["onSale", "On sale"],
                  ["featured", "Featured"],
                  ["isPremium", "Premium"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} className={`chip ${form[k] ? "on" : ""}`} onClick={() => setForm({ ...form, [k]: !form[k] })}>
                  {label}
                </button>
              ))}
            </div>

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="abtn btn-ghost" onClick={closeForm}>
                Cancel
              </button>
              <button className="abtn btn-gold-pill" disabled={!form.name.trim() || (!editId && !form.id.trim()) || !form.assetKey.trim()} onClick={save}>
                {editId ? "Save changes" : "Add item"}
              </button>
            </div>
          </div>
        )}

        {/* catalog table */}
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ minWidth: 780 }}>
            <thead>
              <tr className="thead-raised">
                <th>Item</th>
                <th>Type</th>
                <th className="num">Gold</th>
                <th className="num">Diamonds</th>
                <th>Tag</th>
                <th style={{ textAlign: "center" }}>On sale</th>
                <th style={{ textAlign: "center" }}>Active</th>
                <th className="num">Sort</th>
                <th style={{ textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="dim" style={{ textAlign: "center", padding: 24 }}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="dim" style={{ textAlign: "center", padding: 24 }}>
                    No catalog items.
                  </td>
                </tr>
              ) : (
                rows.map((it) => (
                  <tr key={it.id} className="arow">
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          title={it.previewKey || it.assetKey || undefined}
                          style={{ width: 34, height: 34, borderRadius: 8, background: "var(--bg-2)", border: "1px solid rgba(232,184,75,.16)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flex: "none", font: "700 10px var(--sans)", color: "var(--dim)" }}
                        >
                          {typeGlyph(it.type)}
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ font: "700 12.5px var(--sans)", color: "var(--ink)" }}>{it.name}</span>
                            {it.isPremium && (
                              <span style={{ font: "700 8px var(--sans)", letterSpacing: 1, color: "var(--red-lt)", border: "1px solid rgba(255,154,168,.4)", borderRadius: 5, padding: "2px 5px" }}>PREMIUM</span>
                            )}
                            {it.featured && (
                              <span style={{ font: "700 8px var(--sans)", letterSpacing: 1, color: "var(--gold-lt)", border: "1px solid rgba(232,184,75,.4)", borderRadius: 5, padding: "2px 5px" }}>FEATURED</span>
                            )}
                          </div>
                          <div className="mono dim" style={{ fontSize: 10.5, marginTop: 2 }}>{it.id}{it.ownedCount > 0 ? ` · owned ×${it.ownedCount}` : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: "var(--ink-3)" }}>{typeLabel(it.type)}</td>
                    <td className="num">{it.priceGold != null ? it.priceGold.toLocaleString() : "—"}</td>
                    <td className="num">{it.priceDiamonds != null ? it.priceDiamonds.toLocaleString() : "—"}</td>
                    <td>
                      {it.tag ? (
                        <span className="chip on" style={{ padding: "3px 9px", fontSize: 10 }}>{it.tag}</span>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {it.onSale ? (
                        <span className="badge-st st-active">{it.salePrice != null ? it.salePrice.toLocaleString() : "on"}</span>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`badge-st ${it.active ? "st-active" : "st-deleted"}`}>{it.active ? "Active" : "Off"}</span>
                    </td>
                    <td className="num">{it.sortOrder}</td>
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                        <button className="abtn btn-ghost btn-ghost-sm" onClick={() => openEdit(it)}>
                          Edit
                        </button>
                        <button className="abtn btn-ghost btn-ghost-sm" onClick={() => toggle(it)}>
                          {it.active ? "Deactivate" : "Activate"}
                        </button>
                        <button className="abtn btn-danger btn-danger-sm" onClick={() => remove(it)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dim" style={{ fontSize: 12, margin: "10px 0 14px" }}>
        Every create, edit, toggle, and delete is recorded in the audit log with a required reason. Items owned by players are soft-deleted (deactivated) to protect inventory.
      </div>
    </>
  );
}

// Short glyph for the catalog thumbnail chip. The admin app has no access to the
// player-facing asset bundle (that lives under apps/web/public/assets and isn't
// served here), so we can't render the item's real art without fabricating a
// path — this is an honest type-based placeholder, not a stand-in image.
function typeGlyph(t: ItemType): string {
  switch (t) {
    case "BOARD":
      return "BRD";
    case "SKIN":
      return "SKN";
    case "AVATAR":
      return "AVA";
    case "FRAME":
      return "FRM";
    case "EMOTE":
      return "EMO";
    case "BUNDLE":
      return "BND";
    case "SEASON_PASS":
      return "SPS";
  }
}

function typeLabel(t: ItemType): string {
  switch (t) {
    case "BOARD":
      return "Board";
    case "SKIN":
      return "Skin";
    case "AVATAR":
      return "Avatar";
    case "FRAME":
      return "Frame";
    case "EMOTE":
      return "Emote";
    case "BUNDLE":
      return "Bundle";
    case "SEASON_PASS":
      return "Season Pass";
  }
}

function filterLabel(f: FilterT): string {
  switch (f) {
    case "all":
      return "All";
    case "active":
      return "Active";
    case "inactive":
      return "Inactive";
    case "onSale":
      return "On sale";
    case "featured":
      return "Featured";
  }
}
