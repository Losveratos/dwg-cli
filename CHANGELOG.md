# Changelog

## Unreleased

- **Showcase review fixes (23.11.2026).** C24 gets small multiples per country (sheet 10G): the catalog lists the
  optional role `multiples` for C24, bubble size and share show in thousand hl via `formats`. C20: the liquidity
  measures are semi-additive (flows summed, cash = last month with a value, also across years); Mini-DAX understands
  `KEEPFILTERS`, `<>` and `LASTNONBLANK` inside `CALCULATE`, the liquidity fixture holds 2025 and 2026. 11A: larger
  tree (`layout.maximize`, `fontZoom`), invested capital includes leases so the capital turnover moves
  (0.86 · 0.96 · 0.84). T01D: levels Sorte and Produkt. C18: plan 2026 redistributed between customers of the same
  channel and region (all sums unchanged). C23 multiples per channel with log axes, C22 and C14 units, texts of
  T02E/T02F. Model rebuilt with te 0.8.1.1, `te validate` clean.
- **Showcase with all 47 templates (ChartKitchen 1.57, P&L 1.8.3).** `specs/showcase.json` has 17 new pages, one per
  new template: C07, C14 to C25, T01C, T01D, T02D and the ROI tree 11A, sorted into the navigation groups (new group
  „ChartKitchen · Rangfolgen“ for C14 to C16). Existing page ids and hash links stay. Every tile takes the template
  switches from the catalog (`template` = `templateApplied`, dotted presets under `objects.scale` for C18, C23 and C24),
  required roles are bound. New data from the model extension: C18 binds `Umsatz ΔPL %` and `Umsatz ΔPY %`, C20 the
  `Liquiditaet` tables (row type tokens stock/inflow/outflow), C24 the `Markt` tables (bubble share = own sales), 11A
  the `Rendite` tables with years as period and no slicer. T01D shows the full year without a period: with a period the
  month block would be August, where forecast equals actual. The 19 existing P&L template pages now carry the 1.8
  switches `structureTotal` and `keepBlockOrder` as in the catalog. The example report `ZlatyLev Showcase.Report` has
  all 47 pages in the order of the spec (validated against the PBIR schemas).
- **Tests for 47 pages.** `showcase-spec.mjs` knows the 1.57 presets (incl. `CK_SCALE`), the 1.8 switches, the view
  preset 11A (no `columns.template`, view in `state.uiState`) and checks that groups stand together.
  `templates/test/unit.mjs` finds the showcase tile by `page.template` (11A has no template object); `rowType` in
  ChartKitchen, `bubbleShare` and the C18 variance measures count as user input there. `showcase-e2e.mjs` also matches
  11A and measures the Δ scale correctly for the C19 year column (forecast part on top of AC) and the horizontal C17
  bridge (PY bar thinner than AC). The parity test checks a P&L tile in tree view (11A) by its cards (one per
  account) instead of L1 group rows, which the tree does not have.
- **Template catalog ready for P&L 1.8 and ChartKitchen 1.57.** `visuals/templates.mjs` now knows the P&L gallery's
  view presets (`VIEW_PRESETS`, P&L 1.8: ROI tree 11A). Such a tile has no mega template: its catalog entry carries
  `view: "tree"`, the card switches in `columns` (no `template`) and the view in `state.uiState`
  (`{"view":"tree","treeV":2}`), with its own roles (levels and AC required; PL, period, row type and formula
  recommended). The P&L hub is bundled with `export *`, so `VIEW_PRESETS` is optional and older P&L versions build as
  before. Probe: the current sources (ChartKitchen 1.53, P&L 1.7) give a byte-identical `templates.json`; P&L 1.8.3
  (Kitchen `main`) with ChartKitchen 1.57 (branch `claude/ck-ibcs-backlog-4`) builds 47 templates (24 + 23), 17 of them
  new. The release itself (`visuals update`) follows once ChartKitchen 1.57 is live.
- **ChartKitchen catalog entries fixed for 1.57 (review).** Preset keys with a dot (`scale.refLine`, `scale.xRefLine`
  in C18 and C24) now go to their own object (`objects.scale`), as the visual splits them; before they landed as unknown
  `chart` properties and the reference lines were missing. Roles that `TEMPLATE_NEEDS` does not name are added from the
  visual's AGENT-GUIDE: C23 `series` (one path per unit), C24 `bubbleSize` and `bubbleShare` required (otherwise no pie
  segments), C18 `series`/`bubbleSize`/`multiples`, C20 `series`, `fcFlag`, `lineMeasure`. 11A requires `rowType` and
  `formulaDef` (without them the tree falls back to a plain hierarchy). `tile add` never picks a ChartKitchen `rowType`
  on its own (the P&L account table's row type is a different contract), it only lists candidates. A gallery tile
  without mega preset and view preset fails with a clear message. New catalog check: no property name with a dot.

Three findings from fabscan 0.6.0 on the four dwg apps (Fabric-Apps-Demo, 19 Nov 2026):

- **Fonts ship with the app (fabscan SEC-CDN, 4 of 4 apps).** The Rayfin app template loads Geist and JetBrains Mono
  from fonts.googleapis.com. `dwg app page` now copies both fonts (woff2, latin + latin-ext, with `OFL-*.txt`) to
  `src/vendor/dwg-fonts/`, removes the links to font services (stylesheet and `preconnect`) from
  `packages/frontend/index.html` and links `/src/vendor/dwg-fonts/dwg-fonts.css` there instead; Vite bundles CSS and
  woff2 into `dist/assets/` (checked with a Vite build). Idempotent, a second run leaves `index.html` alone.
  **`dwg check --app <Rayfin-App>`** (also without `--spec`) reports remaining references to font services in
  `index.html` and under `src/` (Google Fonts, Typekit, Bunny Fonts, Fontsource CDNs and others).
- **Fixed filters are visible (fabscan QRY-HARDCODED, 3 of 4 apps).** `pages[].filters` and `tiles[].filters` used to
  end up silently in every query. The app now shows them as non-clickable chips: in the page header of `DwgShell`
  (right of the title), in the chip row of a plain `DwgPage` (`showFixedFilters`, default on). Ranges of whole numbers
  read „Month: 1 bis 8“; a tile filter names its tile („nur Umsatz“) unless all tiles share it. `dwg check` adds
  **hints** for fixed year, quarter, month, week or date values (by column name, with `--model` also `dateTime`
  columns) with the matching slicer and `default`, and says when the column is a slicer too (both apply, the slicer
  cannot leave the fixed value). Flags like `'Kalender'[Ist] = true` and scenario filters do not count. Hints do not
  change the exit code unless `--strict`; `--json` gains `warnings`. Before this there were slicers with `default`
  (filter panel, PBIP slicer) but nothing that pointed to them.
- **The model is findable for checks (fabscan LIN-NO-MODEL, 2 of 4 apps).** `dwg app page --model` writes
  `fabscan.json` into the app folder: `{ "connectors": { "<app folder>:<connector>": "<model name>" }, "models":
  ["<folder that holds the model, relative to the app>"] }` (fabscan looks for `*.SemanticModel` folders inside
  `models` entries, so the entry is the model's parent folder). The model name is the `displayName` from `.platform`,
  as fabscan reads it. Existing entries stay; a broken file is an error with the file name.

Fixes from the first public review (fresh clone, full test run, code review):

- **Visual state survives app updates.** The adapter keeps the `persistProperties` packets a visual writes and replays
  them on top of new spec objects; an `update()` with the same objects leaves the state alone. Before, ChartKitchen lost
  the card sort chip on every theme switch or new query. The showcase run now checks this.
- **`tile add` without `--model`** requires the mandatory roles (alternatives like `account` + `parent` instead of
  `levels` count); unknown roles are an error. Before it wrote a tile without any field. The catalog lists `parent` for
  the P&L statement templates.
- **`displayNames` and `formats` per field** accept the spec key (`'T'[Field]`), the normalized key (`T[Field]`) or
  the role key (`[actual]`) in the app and in Power BI alike.
- **`tile add` writes the title into the visual** (`ibcsTitle.kpi`, `titleBlock.measureLine`, `--title` sets it) and
  no container title; new specs start with `visualHeaders: true`. `--description` sets the page's explanatory text.
  Power BI containers no longer show `title`/`subtitle` (they stay as the visual's name), so both targets render the
  same.
- **`dwg check --spec <file> [--model <X.SemanticModel>] [--json]`** checks a spec without a Rayfin app and without a
  report: structure, filters, roles and bindings per tile (`daxQuery`), with `--model` also the fields. One line per
  problem with page and tile, exit 1 on problems.
- **`checkSpec` covers the gaps** that used to end in a `TypeError` or in invalid DAX: `pages`/`tiles` must be lists,
  pages need a `name`, tiles a unique `id`, a `visual` spelled `chartkitchen` or `pnl` and `bindings` as an object;
  `filters` on pages and tiles need `column` and at least one value. `dwg app page` shows these messages too. An unknown
  visual in `pbip pages` is reported as unknown instead of "register first".
- `visuals build` produces the same chunk hashes regardless of the checkout path.
- **Dates in filters are handled the same everywhere.** One format in `visuals/src/dax.ts`: slicer values (ISO text
  from the connector), clicks (a `Date` from the visual) and spec values all go through `filterValue`, compare by the
  ISO timestamp (`valueKey`) and become `DATE(y, m, d)` in DAX, `+ TIME(h, m, s)` when there is a time. Before, the
  slicer sent `TREATAS({"2026-03-01T00:00:00"}, …)` as text, the click `DATE(…)` without the time, and a slicer plus a
  click on the same date column never intersected, so the tile filtered on BLANK. In PBIP, filter and slicer values
  on a `dateTime` column are written as `datetime'2026-03-01T00:00:00'` like Desktop does (was a text literal).
- **Column types from the TMDL.** `dwg app page --model` writes `columnTypes` (TMDL `dataType` of the columns a page
  uses) into the page and app spec; query results carry no types. With a known type only `dateTime` columns turn ISO
  text into dates, a text column with values like `2026-01-01` stays text. Without `--model` ISO text still counts as
  a date.
- **Filter and slicer values are checked against the column's `dataType`** (`dwg app page --model`, `dwg pbip pages`):
  `default: [2026]` on a text column, a non-ISO date or `2.5` on an int64 column is an error instead of silently
  matching nothing (`filterLit(2.5, "int64")` wrote `2L`). New browser test `app/test/dates.mjs`.
- Error messages name the file: a missing or broken spec says `Spec <file> nicht gefunden` / `Spec <file>: <JSON error>`
  (`app page`, `lint`, `tile add`, `pbip pages`); the same for `mockup import --in`, a missing report
  (`pbip pages`, `pbip register`), template report or model folder (`pbip new`).
- `templates --visual foo` lists the valid values (`chartkitchen`, `pnl`) and exits 1 instead of printing an empty list.
- `install.mjs --no-skill` no longer claims Claude Code finds the skill in the repo; it says how to copy `skill/dwg` by hand.
- README: Quickstart also as PowerShell block (checked by running it), `TESTEN.md` part 3 likewise; known limitations
  mention German CLI output and the mini DAX behind the browser tests.
- CI caches the Playwright browser (key from the Playwright version in `package-lock.json`) and cancels superseded
  runs per branch.

- README: why dwg exists, how it fits together (diagram), a gallery of real test screenshots (showcase pages, a
  MockupKitchen sketch next to the page dwg builds from it, the app frame) and the family of tools with links.
- `app/test/showcase-e2e.mjs --spec <file> --name <folder>` renders any spec on the showcase model.
- **`dwg visuals update`** brings a new visual release into the repo in one step: Kitchen state as a detached worktree
  under `.kitchen/` (so the adapter's chunk hashes no longer depend on where the Kitchen clone lives), adapter and
  template catalog, `.pbiviz` into `visuals/pbiviz/`, example reports re-registered, file names in README, docs and
  skill, this CHANGELOG line, `npm test`; `--dry-run` shows the plan, `--commit` commits. `dwg doctor` compares the
  adapter with the `.pbiviz`, the example reports and the published version (Share repo, Kitchen `latest.json`).
  Found on the first run: the GuV example report still carried ChartKitchen 1.51.1.0 and P&L 1.4.2.0.
- `dwg check` reads the spec with the same file-name errors as the other commands.
- **Visuals:** adapter, `.pbiviz` and example reports on ChartKitchen 1.57.0.0 (from 1.53.0.0) and P&L 1.8.3.0 (from 1.7.0.0).
- **P&L 1.7 balance sheet and cash flow:** the catalog has 19 P&L templates (T05A balance sheet at the reporting date,
  T05B cash-flow bridge, group `balance`) and writes `statement.stockMode` (T05A `allStock`, T05B `auto`); period is
  recommended for both, the row type is required for T05B (opening and closing balance need the `stock`/`opening`
  tokens). The showcase has 30 pages: new tables 'Bilanzkonto'/'Bilanz' and 'Cashflowkonto'/'Cashflow' derived from
  the P&L (assets = liabilities every month, closing cash = cash in the balance sheet), 13 new measures, fixed measure
  lineage tags. `tile add` picks the account table linked to the measure's table when a model has several.
- **`showItemsWithNoData` with filters:** the app query wraps ADDMISSINGITEMS in CALCULATETABLE with the filters, so it
  only fills in items inside them (before: periods of other years, accounts outside a tile filter or a click came back
  as empty rows). Mini-DAX fills in across several tables and handles several fact tables.

## 0.1.1 (2026-10-23) · public

- The repository is public, developed in public.
- PBIR schemas for `dwg validate` ship in `pbip/schemas/` (from microsoft/json-schemas, MIT); validation works
  offline, unknown schema versions are still fetched once.
- README: what is in the repo, contributing; tester guide for the public repo.

## 0.1.0 (2026-10-23) · first release as its own repo

dwg moves out of the Fabric Apps demo repo into `dwg-cli`, with a fresh history.

- **Commands:** `templates`, `tile add`, `app page`, `pbip new · register · pages`, `validate`, `lint`,
  `mockup build · import`, `visuals build`, `install · update · doctor`.
- **Visuals:** adapter built from ChartKitchen byDatenWG 1.52.3.0 and P&L Statement byDatenWG 1.5.3.0; the matching
  `.pbiviz` files ship in `visuals/pbiviz/`.
- **Templates:** catalog of the 28 templates generated from the visual code (`visuals/dist/templates.json`), roles as
  required, recommended or optional; `tile add` suggests fields from the TMDL (measure stem and scenario AC, PY, PL,
  FC, BM; calendar, level and P&L logic columns; „PY/PL bis Ist“ when actuals YTD are compared without a period).
  Unit prefixes (€, #) are ignored in measure stems, the P&L period prefers a month with year.
- **Examples:** spike, P&L (GuV) and the showcase with one page per template; showcase customers are fictitious,
  the data generator reproduces the same numbers.
- **Tests:** browser tests generate the pages into a minimal app themselves (`app/test/minimal-app.mjs`), no real
  Rayfin app needed. GitHub Action runs `npm test` and the showcase run.
- Not carried over: the utilisation test case (third-party sample model), deployed apps and workspace IDs.
