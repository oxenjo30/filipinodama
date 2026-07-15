import { useEffect, useMemo, useState } from "react";

/**
 * Reusable client-side pagination for admin lists.
 *
 * Admin lists fetch their full result set into memory (the catalogs are small
 * — dozens of rows, not thousands), so pagination here is a pure client-side
 * slice: no extra API round-trips. [usePagination] owns the current page and
 * the sliced page of items; [Pagination] renders the matching footer control.
 *
 * Usage:
 *   const pg = usePagination(rows, 10);
 *   // render pg.pageItems instead of rows
 *   <Pagination {...pg} />
 */

const DEFAULT_PAGE_SIZE = 10;

export interface PaginationState<T> {
  /** The items on the current page (what the list should render). */
  pageItems: T[];
  /** 1-based current page. */
  page: number;
  /** Total number of pages (>= 1). */
  pageCount: number;
  /** Total item count across all pages. */
  total: number;
  /** Items per page. */
  pageSize: number;
  setPage: (p: number) => void;
  setPageSize: (n: number) => void;
}

/**
 * Slice [items] into pages of [initialPageSize]. Resets to page 1 whenever the
 * underlying item count shrinks below the current page's range (e.g. a filter
 * narrows the list) so the view never lands on an empty page.
 */
export function usePagination<T>(items: T[], initialPageSize = DEFAULT_PAGE_SIZE): PaginationState<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Keep the current page in range when the data or page size changes (e.g. a
  // filter/search shrinks the list, or the last item on the last page is
  // deleted) — clamp to the last valid page rather than showing an empty page.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return { pageItems, page, pageCount, total, pageSize, setPage, setPageSize };
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Footer control for a paginated list: "X–Y of N", a page-size selector, and
 * Prev / page-number / Next buttons. Renders nothing when there is only a
 * single page AND the default page size (so short lists stay uncluttered).
 * Pass the full [PaginationState] returned by [usePagination].
 */
export function Pagination<T>({
  page,
  pageCount,
  total,
  pageSize,
  setPage,
  setPageSize,
  // A short label for the entity, e.g. "items" / "players". Defaults to "rows".
  noun = "rows",
}: PaginationState<T> & { noun?: string }) {
  // Hide entirely for a short single-page list at the default size — no reason
  // to show a paginator for 3 rows.
  if (pageCount <= 1 && pageSize === DEFAULT_PAGE_SIZE) return null;

  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  // Compact page-number window: always show first/last, current ±1, with
  // ellipses. Keeps the control short even for many pages.
  const pages = pageWindow(page, pageCount);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        padding: "12px 4px 2px",
        marginTop: 6,
        borderTop: "1px solid rgba(232,184,75,.1)",
      }}
    >
      <div className="dim" style={{ font: "600 11.5px var(--sans)" }}>
        {total === 0 ? `No ${noun}` : `${first}–${last} of ${total} ${noun}`}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <label className="dim" style={{ font: "600 11px var(--sans)", display: "inline-flex", alignItems: "center", gap: 6 }}>
          Per page
          <select
            className="chip"
            style={{ padding: "6px 8px", font: "700 11px var(--sans)" }}
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <PageBtn disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
            ‹
          </PageBtn>
          {pages.map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="dim" style={{ padding: "0 4px", font: "700 11px var(--sans)" }}>
                …
              </span>
            ) : (
              <PageBtn key={p} active={p === page} onClick={() => setPage(p)} aria-label={`Page ${p}`}>
                {p}
              </PageBtn>
            ),
          )}
          <PageBtn disabled={page >= pageCount} onClick={() => setPage(page + 1)} aria-label="Next page">
            ›
          </PageBtn>
        </div>
      </div>
    </div>
  );
}

function PageBtn({
  children,
  onClick,
  disabled,
  active,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  "aria-label"?: string;
}) {
  return (
    <button
      className="abtn"
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 30,
        height: 30,
        padding: "0 8px",
        borderRadius: 8,
        border: active ? "1px solid var(--gold)" : "1px solid rgba(232,184,75,.18)",
        background: active ? "rgba(232,184,75,.16)" : "#1b1030",
        color: active ? "var(--gold-lt)" : "#b9a9d6",
        font: "700 12px var(--sans)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

/**
 * Compact page-number window: first, last, current and its neighbours, with
 * "…" gaps. e.g. page 7 of 20 -> [1, …, 6, 7, 8, …, 20].
 */
function pageWindow(page: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) out.push("…");
  for (let p = start; p <= end; p++) out.push(p);
  if (end < pageCount - 1) out.push("…");
  out.push(pageCount);
  return out;
}
