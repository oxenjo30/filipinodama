/** A visible "not yet wired" placeholder for Phase-2 sections — never fake data. */
export function Phase2({ title, note }: { title: string; note: string }) {
  return (
    <>
      <div className="crumb">Phase 2</div>
      <h1 className="page">{title}</h1>
      <div className="phase2">
        <div style={{ fontSize: 28, marginBottom: 8 }}>🚧</div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          <b>PHASE 2 — not yet wired</b>
        </div>
        <div style={{ maxWidth: 440, margin: "0 auto" }}>{note}</div>
      </div>
    </>
  );
}
