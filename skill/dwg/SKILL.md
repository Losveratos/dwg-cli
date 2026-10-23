---
name: dwg
description: >
  dwg cli (Arbeitsname) von Daten-WG: aus einer App-Spec (JSON) entstehen eine Fabric App (Rayfin, React) mit den
  Original-Visuals ChartKitchen und P&L Statement byDatenWG und derselbe Bericht als Power-BI-Projekt (PBIP/PBIR).
  Templates ansehen, Kacheln aus Templates mit Feldvorschlägen anlegen, DAX-Abfragen erzeugen, Visuals in PBIP
  eintragen, alles ohne Fabric testen (Mini-DAX, Browser-Test). Auslösen, wenn der Nutzer sinngemäß sagt „dwg“,
  „App-Spec“, „bau mir eine Fabric-App-Seite mit ChartKitchen/P&L“, „dieselbe Seite als Power-BI-Bericht“,
  „Seite aus Template C03/T04B“, „Spec in die App schreiben“, „PBIP aus der Spec“, „ChartKitchen in der Fabric App“,
  „MockupKitchen-Export als App“, „neues Visual-Release in die Apps/Berichte bringen“.
---

# dwg · eine Definition für Fabric App und Power BI

Alles liegt im Repo **dwg-cli** (GitHub `Losveratos/dwg-cli`), Einstieg `node dwg.mjs` im Repo-Root. Das
Spec-Format mit allen Rollen steht in [`references/app-spec.md`](references/app-spec.md), das deutsche Handbuch in
`docs/handbuch.md`, der Überblick in `README.md`.

Ohne Zugriff auf das Repo (z. B. ein Chat ohne geöffneten Ordner): zuerst den Nutzer bitten, den Ordner `dwg-cli`
zu öffnen oder das Repo zu klonen. Ohne Repo kannst du Specs entwerfen und erklären, aber nichts erzeugen oder testen.

## Was es gibt

| Teil | Pfad | Zweck |
| --- | --- | --- |
| Adapter `@dwg/visuals` | `visuals/` | ChartKitchen und P&L mit **ihrem Original-Code** außerhalb von Power BI; `daxQuery()` baut die Abfrage aus der Rollenbindung. `dist/` ist committet, `visuals/pbiviz/` hat die passenden `.pbiviz` |
| Templates | `templates/`, `visuals/dist/templates.json` | `dwg templates` (28 Templates, Rollen Pflicht/empfohlen/optional), `dwg tile add` (Kachel aus Template, Feldvorschläge aus dem TMDL) |
| App-Generator | `app/` | `dwg app page` schreibt Adapter, `DwgPage`/`DwgShell` und die Seiten in eine Rayfin-App |
| PBIP-Generator | `pbip/` | `dwg pbip new` · `register` · `pages`, `dwg validate` gegen die offiziellen PBIR-Schemas |
| MockupKitchen-Bausteine | `mockup/`, `layout/` | `dwg lint --spec` (Pixelraster, Barrierefreiheit), `dwg mockup import` (mockup-spec.json → App-Spec), `dwg mockup build` (aus dem Kitchen-Repo holen; nicht von Hand ändern) |
| Beispiele | `specs/`, `examples/` | `spike.json`, `guv.json`, `showcase.json` (jedes Template eine Seite) mit Modellen und Berichten |

## Voraussetzungen

- Einrichten mit **`node install.mjs`** im Repo-Root (Pakete, Chromium, Skill, Selbsttest). Bei Problemen zuerst
  `node dwg.mjs doctor`; aktualisieren mit `node dwg.mjs update`.
- Node 20 oder neuer (empfohlen 22). Für Rayfin-Apps npm 11 (`npx -y npm@11 install` im App-Ordner).
- `dwg visuals build` und `dwg mockup build` brauchen einen Klon von **PowerBI-Kitchen-** (Visual-Quellcode) neben
  diesem Repo oder `DWG_KITCHEN=<pfad>`. Sonst reicht das committete `visuals/dist`.
- `dwg mockup import` braucht Python 3. Browser-Tests brauchen Playwright mit Chromium.

## Ablauf A · Seite aus einem Template

1. **Modell klären:** Welches Semantikmodell liegt als PBIP/TMDL vor (`*.SemanticModel/definition/tables/*.tmdl`)?
2. **Template wählen:** `node dwg.mjs templates` (Übersicht), `node dwg.mjs templates T04B` (Rollen, Einstellungen).
3. **Kachel anlegen:** `node dwg.mjs tile add --spec <spec> --new-page "<Name>" --template <ID> --model <X>.SemanticModel
   [--measure <Stamm>] [--<rolle> <feld>] [--rect x,y,b,h] [--dry-run]`. Was nicht eindeutig ist, nennt dwg mit
   Kandidaten; dann mit `--<rolle>` angeben, nicht raten. Strukturtabellen (P&L T01/T02): Ebenen angeben (Region, Kunde).
4. **Prüfen:** `node dwg.mjs lint --spec <spec>` (Raster, Barrierefreiheit) und
   `node dwg.mjs check --spec <spec> --model <X>.SemanticModel` (Aufbau, Filter, Rollen, Felder; ohne App und Bericht, Exit 1 bei Problemen).

## Ablauf B · Fabric App

1. **Erzeugen:** `node dwg.mjs app page --app <Rayfin-App> --spec <spec> --connector <name> [--model <X>.SemanticModel]`.
   Der Konnektor (Typ `fabric-semanticmodel`) muss in `rayfin/rayfin.yml` stehen, der Hook
   `use-semantic-model-query` (Pack `analytics`) in der App.
2. **Einbinden** in `src/App.tsx` (gehört der App): `<DwgPage page={page} connection="<name>" isDark={isDark} />`,
   viele Seiten mit Navigation und Filter-Panel: `<DwgShell app={app} connection="<name>" isDark={isDark} />`.
3. **Prüfen** in der App: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
4. **Deploy macht ein Mensch** (Fabric-SSO): `npx rayfin up`. Agenten deployen nicht.

## Ablauf C · Derselbe Bericht in Power BI

```bash
node dwg.mjs pbip new --out "<Name>.Report" --name "<Name>" --model "<X>.SemanticModel" --template "<Y>.Report"
node dwg.mjs pbip register --report "<Name>.Report" --pbiviz visuals/pbiviz/<ChartKitchen>.pbiviz --pbiviz visuals/pbiviz/<PnL>.pbiviz
node dwg.mjs pbip pages --report "<Name>.Report" --spec <spec>
node dwg.mjs validate "<Name>.Report"
```

- `register` entpackt die `.pbiviz` nach `CustomVisuals/<GUID>/` und trägt sie in `report.json` ein; so lassen sich
  auch bestehende Berichte auf eine neue Visual-Version heben.
- Nur Modell-Measures; freie DAX-Ausdrücke lehnt `pbip pages` ab. „Nach Spalte sortieren“ muss im Modell stehen.
- In den Service: Fabric-Git-Integration oder `fab import`, das macht ein Mensch.

## Ablauf D · Testen ohne Fabric

- Alles: `npm test` (Adapter, Generator, Templates, Mini-DAX, App-Seiten und App-Rahmen im Browser, PBIR-Schemas,
  Parität Power BI gegen App). `npm run test:showcase` rendert alle 28 Showcase-Seiten. `npm run test:all` baut
  zusätzlich den Adapter neu (Kitchen-Repo nötig). Erwartet: überall „grün“.
- **Mini-DAX** (`app/test/minidax.mjs`) führt die erzeugten Abfragen auf Tabellen im Format `{columns, rows}` aus
  (SUMMARIZECOLUMNS, TREATAS, CALCULATE mit `=`-Filtern, SUM, ORDER BY, ADDMISSINGITEMS). Neuer Datensatz:
  `app/test/datasets/<name>.mjs` mit `model` und `CONTROL`, Test wie `app/test/guv.mjs`, Fall in `CASES` in `e2e.mjs`.
- Browser-Tests erzeugen die Seiten selbst in eine Minimal-App (`app/test/minimal-app.mjs`); Screenshots unter
  `app/test/out/` ansehen, nicht nur die Prüfungen.

## Regeln

- Generierte Dateien nicht von Hand ändern: `src/dwg/**` und `src/vendor/dwg-visuals/**` in Apps, `visuals/dist/`,
  `layout/pixelgrid.mjs`, `mockup/vendor/`. Änderungen an Vorlagen in `app/templates/`, dann neu erzeugen.
- Ist gegen Plan nur über denselben Zeitraum vergleichen („PL bis Ist“ oder Periodenfeld), sonst lügt die Abweichung.
- Bei Nicht-Währungsdaten im P&L-Visual `numbers.unitText` setzen und `columns.pctRevenue: false`.
- IBCS nur als „an IBCS angelehnt“, keine Zertifizierung suggerieren; deutsche UI-Texte ohne Gedankenstriche.
- Keine Schlüssel, Workspace-IDs oder Kundendaten in Specs und Repo.
- Vor einem Push: `npm test`.

## Bekannte Stolpersteine

| Symptom | Ursache und Lösung |
| --- | --- |
| `Cannot find module @rolldown/binding-linux-x64-gnu` | Lockfile von Windows; Linux-Bindungen `--no-save` nachinstallieren |
| Kachel leer oder Visual läuft über den Rand | Container ohne Größe; Vorlage nutzt Inline-Styles, nicht ändern |
| Kachel zeigt „Daten fehlen“ | Abfrageergebnis passt nicht zu den Rollen (Spaltenname, fehlende Spalte); Meldung lesen |
| `tile add` bricht mit „Pflichtrolle … ohne Feld“ ab | mehrere Kandidaten; `--measure <Stamm>` oder `--<rolle> <feld>` angeben |
| Abweichung −30 % auf jeder Zeile | Ist YTD gegen Plan Gesamtjahr; „PL bis Ist“-Measure oder `period` binden |
| `Konnektor "<x>" fehlt` | erst `rayfin connector add` bzw. Block in `rayfin.yml` |
