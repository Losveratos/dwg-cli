# Changelog

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
