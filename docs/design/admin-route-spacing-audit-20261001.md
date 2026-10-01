# Admin route spacing audit — 2026-10-01

## Shared layout contract

- Every route renders inside `.route-body`, aligned with `.route-heading` on a shared 1132 px maximum content width.
- Desktop, tablet, and mobile horizontal gutters use 32 px, 22 px, and 16 px spacing tokens.
- The topbar uses the same content width plus gutters, keeping search, environment, alerts, and account controls aligned with page content.
- Form fields use a 42 px minimum height. Shared action controls use a 40 px minimum height with consistent horizontal padding.
- Tables remain horizontally scrollable inside their existing panels on narrow viewports; the route container itself does not create page-level overflow.
- The command trigger has its own semantic class and visible padding, border, hover, and keyboard-focus treatment.

## Route-by-route coverage

| Route | Main surface | Shared spacing coverage |
| --- | --- | --- |
| `/overview` | KPI cards, activity, health panels | Heading, KPI grid, panels, and chart rows constrained by route body |
| `/analytics` | Filters, KPI cards, charts, tables | Time controls, chart grids, and tables share the content frame |
| `/players` | Saved views, filters, table, drawer | Filter row and player table aligned; drawer remains viewport-attached |
| `/moderation` | Status/reason filters and report cards | Filter row and report stack constrained consistently |
| `/support` | Filters and two-column ticket workspace | Workspace stays inside the route frame and uses existing responsive rules |
| `/matches` | Anti-cheat filters and match table | Controls and table panel share the route width |
| `/economy` | Catalog controls, metrics, item rows | Previously edge-reaching rows now inherit the route body width |
| `/financials` | Totals, charts, orders, refunds | Cards, charts, and tables align with the heading |
| `/fraud` | Phase 2 state | State card follows the same content frame |
| `/liveops` | Season, quest, ladder, event sections | Wide operational sections remain bounded by the route body |
| `/tournaments` | Filters, tournament list, detail drawer | Main list aligns; drawer remains viewport-attached |
| `/guilds` | Search, applications, guild table, drawer | Main controls and tables align; drawer remains viewport-attached |
| `/campaigns` | Composer and campaign history | Form and history panels share the route frame |
| `/settings` | Flags, constants, infrastructure, gateways | Dense forms inherit consistent field height and bounded width |
| `/admins` | Admin list and access forms | Rows and actions align with the shared page frame |
| `/audit` | Filters and append-only log table | Filter row and log table remain bounded and scroll safely |

## Verification boundary

The final implementation passed the admin TypeScript build and production build. Real local-data browser QA captured all 16 routes at desktop (1600 x 1000), tablet (1024 x 900), and mobile (390 x 844): 48 captures. Headings and content frames aligned, with one visible heading per route. An initial mobile Tournaments table overflow was corrected and rechecked. Nine follow-up checks covered Economy, Tournaments, and Campaigns at all three sizes, including command search visibility and keyboard focus for search, notifications, and account actions. Three final Financials captures passed without horizontal overflow or page errors; desktop and mobile contrast were visually inspected. An independent scoped source review approved the changes. This verifies layout and read-only interactions; destructive actions, payment/refund execution, and every possible data state were not exercised. Screenshots are saved under output/playwright/layout-*.png.
