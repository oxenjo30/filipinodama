# Casual H2H and opponent integrity correction — 2026-10-01

The screenshot's repeated names came from stored MATCHMAKING records whose redId and blueId are identical. The UI and API already map each seat correctly. No separate opponent identity exists in those records, and no historical names or data will be invented or rewritten.

A read-only production check of the preceding 30 days found Casual: 5 distinct-account human matches and 6 same-account records; Ranked: 0 distinct-account human matches and 2 same-account records. These counts are time-sensitive diagnostics, not permanent totals.

The correction adds Casual started/completed drill-down controls using the same snapshot, filters, pagination, match details, and player links as Ranked. Both cohorts exclude same-account seats directly in the shared database predicate, so aggregates and lists agree.

Matchmaking prevention covers atomic queue insertion, duplicate legacy entries, distinct-account pairing at the match creation boundary, and coherent queue membership cleanup. Independent review identified cross-mode joins and stale membership cleanup as additional cases to address in the same correction.

Validation and release evidence will be recorded after the final source freeze. No migration or production history repair is included. The approved October 2, 7 PM Manila in-app campaign remains scheduled.

Review limitation: queue deduplication prevents one account from occupying both seats of a match. A pre-existing pop-to-live-creation window can still allow a concurrent retry to enter another distinct match; fully closing that separate race needs a per-user matching reservation. This release does not claim to solve all concurrent match lifecycle races.

Verification: admin typecheck, scoped lint, and production build passed. Server typecheck/build passed. Guarded analytics/drill-down tests passed 25/25; Redis and real two-tab Socket.IO tests passed 25/25. Independent security reviewer approved the scoped same-account-seat fix with the separate reservation-window limitation recorded above. Direct NOT/equals field-reference filtering was also verified through read-only production Prisma queries.

Browser QA passed at 1600, 1024, and 390 pixels. Real local API requests confirmed CASUAL/RANKED mode propagation and valid empty states. Controlled populated API fixtures showed distinct opponents, expanded details, and a real seeded player drawer for both modes. Settled overlays began at viewport top, headers stayed visible, and no horizontal page overflow occurred. Local data had no matches in the tested 30-day window; populated display evidence is explicitly fixture-based.
