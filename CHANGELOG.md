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

- README: why dwg exists, how it fits together (diagram), a gallery of real test screenshots (showcase pages, a
  MockupKitchen sketch next to the page dwg builds from it, the app frame) and the family of tools with links.
- `app/test/showcase-e2e.mjs --spec <file> --name <folder>` renders any spec on the showcase model.

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
