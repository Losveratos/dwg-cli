# Changelog

## Unreleased

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
- **Visuals:** adapter, `.pbiviz` and example reports on ChartKitchen 1.53.0.0 and P&L 1.7.0.0 (from 1.5.3.0).
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
