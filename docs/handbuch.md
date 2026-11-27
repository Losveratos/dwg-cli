# dwg · Handbuch (deutsch)

Arbeitsname **dwg cli**. Eine App-Spec beschreibt Seiten und Kacheln mit den Kitchen-Visuals (ChartKitchen, P&L
Statement): Datenrollen, Formatbereich-Objekte, Position. Aus derselben Datei entstehen

- eine **Fabric App**: `dwg app page` schreibt die Seite in eine Rayfin-App. Dort rendern die **Original-Visuals**
  über den Adapter `@visuals`, Daten per DAX aus dem Semantikmodell, Querfilter per Klick.
- ein **Power-BI-Bericht** (PBIP/PBIR): `dwg pbip` schreibt Report, Seiten und `visual.json` und trägt die Custom
  Visuals direkt aus der `.pbiviz` ein, ohne Zwischenschritt in Desktop.
- im **Service**: Bericht per Fabric-Git-Integration oder `fab import`, App per `rayfin up`.

![dwg Spike als Fabric App, Querfilter auf März](../app/docs/app-filter.png)

## Einrichten

```bash
git clone https://github.com/Losveratos/dwg-cli && cd dwg-cli
node install.mjs            # einmalig; danach: node dwg.mjs update | doctor
```

Der Installer prüft Node, git und npm, installiert die Pakete (`npm ci`), lädt bei Bedarf Chromium für
die Browser-Tests, sucht das Kitchen-Repo (`--clone-kitchen` klont es neben dieses Repo), kopiert den Skill `dwg`
nach `~/.claude/skills/dwg` (alle Claude-Code-Sitzungen, mit dem lokalen Repo-Pfad) und macht einen Selbsttest.
Einen fremden Skill gleichen Namens ersetzt er nur mit `--force`. Für Claude Desktop (Chat) gibt es
`skill/dwg.zip` zum Hochladen.

| Befehl | Was |
| --- | --- |
| `node install.mjs [--full-test]` | einrichten; mit `--full-test` alle Tests inkl. Browser |
| `node dwg.mjs update` | `git pull --ff-only`, dann einrichten |
| `node dwg.mjs doctor` | nur prüfen, nichts ändern |
| `npm test` | alle Tests ohne Kitchen-Repo (nutzt das committete `visuals/dist`) |
| `npm run test:all` | zusätzlich Adapter neu bauen und Adapter-Demo testen (braucht Kitchen-Repo; ändert `visuals/dist`) |

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| [`dwg.mjs`](../dwg.mjs) | einziger Einstieg: `visuals build`, `app page`, `pbip …`, `validate`, `lint`, `check`, `mockup build`, `mockup import`, `templates`, `tile add` |
| [`visuals/`](../visuals) | Adapter `@visuals`: ChartKitchen und P&L außerhalb von Power BI, `daxQuery()`. `dist/` ist committet. Eingebunden sind derzeit ChartKitchen 1.58.0.0 und P&L Statement 1.8.4.0 (`dwg doctor` prüft den Stand) |
| [`app/`](../app) | Generator für Rayfin-Apps und Vorlagen (`DwgPage`, `DwgVisual`, `dwg-page.ts`), Browser-Test mit Mock-Konnektor |
| [`pbip/`](../pbip) | Generator für PBIP/PBIR und Schema-Prüfung |
| [`templates/`](../templates) | Template-Katalog lesen (`dwg templates`), Feldvorschläge aus dem Modell und `dwg tile add`; Katalog `visuals/dist/templates.json` erzeugt `visuals build` |
| [`layout/`](../layout) | `pixelgrid.mjs`: Pixelraster nach MockupKitchen (Zonen, Ränder, Linien, Kacheln, Übertragung zwischen Auflösungen), eine Quelle für Generator, Shell, PBIP, Lint und Import. **Erzeugt** mit `dwg mockup build` aus `assets/mockup/pixelgrid.js` im Kitchen-Repo, das MockupKitchen selbst lädt; Tests gegen die Tabellen des Konzepts (`layout/test.mjs`) |
| [`mockup/`](../mockup) | MockupKitchen-Bausteine: `build.mjs` (holen), `lib/lint.mjs` (`dwg lint`), `lib/import.mjs` (`dwg mockup import`), `vendor/` (geholt, mit Manifest), Beispiel-Mockup und Tests |
| [`skill/`](../skill) | Skill `dwg` für Claude Code (`skill/dwg`) und als Paket für Claude Desktop (`skill/dwg.zip`) |
| [`specs/`](../specs) | Beispiel-Specs: `spike.json` (vier Kacheln), `guv.json` (Statement und Baum), `showcase.json` (jedes Template eine Seite) |
| [`examples/`](../examples) | Modelle und Berichte dazu: „ChartKitchen byDatenWG Demo“ (TMDL), „DWG GuV.Report“, Showcase mit Datenvertrag, Generator, TMDL und Bericht |

## Befehle

Aus dem Repo-Root, einmalig `npm install` (oder `node install.mjs`).

```bash
# Neues Visual-Release einspielen (ein Schritt: Kitchen-Stand nach .kitchen/, Adapter bauen, .pbiviz übernehmen,
# Beispielberichte registrieren, Doku und CHANGELOG heben, npm test); erst --dry-run zeigt nur den Plan.
# Kitchen-Klon neben diesem Repo, DWG_KITCHEN=<pfad> oder --kitchen <pfad>; Stand ist origin/main, --ref <tag> wählt
node dwg.mjs visuals update --dry-run
node dwg.mjs visuals update [--commit]

# Adapter nur bauen (Entwicklung gegen einen Arbeitsstand des Kitchen-Klons)
node dwg.mjs visuals build

# Stand prüfen: Adapter, .pbiviz, Beispielberichte und veröffentlichte Version (Share-Repo)
node dwg.mjs doctor

# Fabric App: Seite(n) der Spec in eine Rayfin-App schreiben; --model prüft Felder gegen das TMDL
node dwg.mjs app page --app <pfad zur Rayfin-App> --spec specs/spike.json --connector <name> \
  --model "examples/ChartKitchen byDatenWG Demo.SemanticModel"

# Power BI: Report anlegen, Visuals eintragen (oder auf neue Version heben), Seiten erzeugen, prüfen
node dwg.mjs pbip new --out "dwg Spike.Report" --name "dwg Spike" \
  --model "examples/ChartKitchen byDatenWG Demo.SemanticModel" --template "examples/DWG GuV.Report"
node dwg.mjs pbip register --report "dwg Spike.Report" --pbiviz <ChartKitchen.pbiviz> --pbiviz <PnL.pbiviz>
node dwg.mjs pbip pages --report "dwg Spike.Report" --spec specs/spike.json
node dwg.mjs validate "dwg Spike.Report"

# Templates ansehen und eine Kachel aus einem Template anlegen, Felder schlägt dwg aus dem Modell vor (siehe unten)
node dwg.mjs templates
node dwg.mjs tile add --spec specs/neu.json --new-page "Umsatz" --template C03 \
  --model "examples/showcase/ZlatyLev Showcase.SemanticModel" --measure Umsatz

# App-Spec auf Raster und Barrierefreiheit prüfen; MockupKitchen-Export übernehmen (siehe unten)
node dwg.mjs lint --spec specs/showcase.json
# Spec ohne App und Bericht prüfen: Aufbau, Filter, Rollen und Felder (siehe unten)
node dwg.mjs check --spec specs/showcase.json --model "examples/showcase/ZlatyLev Showcase.SemanticModel"
node dwg.mjs mockup import --in mockup-spec.json --out specs/neu.json --model "<Y>.SemanticModel"

# alle Tests: Adapter, Generator, Templates, Mini-DAX, App-Seiten und App-Rahmen im Browser, PBIR-Schemas, Parität;
# test:all baut zusätzlich den Adapter aus dem Kitchen-Repo und testet die Adapter-Demo
npm test
npm run test:all
```

## App-Spec

```json
{ "id": "umsatz", "visual": "chartkitchen", "rect": [24, 278, 1140, 560],
  "bindings": { "category": "'Calender'[Month Name Short]", "actual": "'Sales Demo'[AC]", "previousYear": "'Sales Demo'[PY]" },
  "sortBy": { "'Calender'[Month Name Short]": "'Calender'[Month]" },
  "objects": { "chart": { "orientation": "intwaterfall" }, "ibcsTitle": { "kpi": "Umsatz", "period": "2026" } } }
```

| Feld | Fabric App | Power BI |
| --- | --- | --- |
| `bindings` | `daxQuery()` → SUMMARIZECOLUMNS je Kachel | `queryState` mit Column/Measure-Projektionen |
| `objects` | DataView `metadata.objects` | `visual.objects` als Literale |
| `filters` (Seite) | TREATAS in jeder Abfrage | Seitenfilter im Filterbereich |
| `filters` (Kachel) | TREATAS nur in dieser Abfrage | Visual-Filter |
| Klick in einer Kachel | TREATAS für die anderen Kacheln, Filter-Chip | Querfilter von Power BI |
| `sortBy` | ORDER BY | nur Prüfung: „Nach Spalte sortieren" muss im Modell stehen |
| `formats` (Kachel) | Formatstring je Measure-Rolle (`[actual]`); ohne Eintrag gilt mit `--model` der Formatstring des Measures aus dem TMDL | Formatstring des Measures im Modell |
| `showItemsWithNoData` | ADDMISSINGITEMS (mit Filtern in CALCULATETABLE: aufgefüllt wird nur innerhalb der Filter) | `showAll` je Gruppierungsrolle |
| `rect` | Position, skaliert auf die Breite; unter 900 px untereinander | Position auf der Seite |
| `slicers` (Spec) | Filter-Panel links (`DwgShell`), TREATAS in jeder Kachel aller Seiten | Slicer im Filter-Panel je Seite, Sync-Gruppe |
| `resolution`, `visualHeaders`, `footer` (Spec) | Seite als Ganzes skaliert, Kopfzeilen der Visuals, Fußleiste | Seite 1920 × 1080, Fußtext |
| `lang`, `locale` (Spec) | Bedienung deutsch (Standard) oder englisch, Visuals in `de-DE` bzw. `en-US` (oder `locale`). Gilt über `DwgShell`; wer `DwgPage` ohne Rahmen einbindet, gibt `lang` und `locale` als Props mit | nicht genutzt |
| `tiles[].options` | Live-Optionen je Kachel im einklappbaren Panel neben dem Visual (Formatbereich, keine neue Abfrage) | nicht genutzt, nur `objects` |
| `group`, `template`, `description` (Seite) | Navigation oben, „C03 Name“, Erklärtext im Kopf der Seite | Seitenname „C03 Name“, Kopf-Textfeld |

**Regel für beide Ziele:** Kennzahlen sind Modell-Measures (`'Tabelle'[Measure]`). Freie DAX-Ausdrücke gehen nur in
der App; `dwg pbip` lehnt sie ab, `dwg app page --model` lässt sie durch.

## Was `dwg app page` in die App schreibt

Unter `packages/frontend/src/`, bei jedem Lauf ersetzt (nicht von Hand ändern):

- `vendor/dwg-visuals/` — Adapter-Build mit Typen; ChartKitchen und P&L sind eigene Chunks, die erst bei Bedarf laden
- `dwg/DwgPage.tsx`, `dwg/DwgVisual.tsx`, `dwg/dwg-page.ts` (+ Test)
- `dwg/pages/<seite>.ts` (Seiten-Spec) und `dwg/pages/<seite>.dax` (alle Abfragen zum Prüfen in der DAX-Abfrageansicht)
- `dwg/DwgShell.tsx` und `dwg/apps/<spec>.ts` (ganze Spec: Slicer, Seiten in Navigationsreihenfolge), bei Slicern
  `dwg/apps/<spec>.dax` mit den Wertelisten-Abfragen
- `vendor/dwg-fonts/`: Geist und JetBrains Mono als woff2 mit `OFL-*.txt` und `dwg-fonts.css`. Die Rayfin-Vorlage lädt
  beide Schriften von Google Fonts; `app page` entfernt diese Links (auch `preconnect`) aus `packages/frontend/index.html`
  und bindet dort `/src/vendor/dwg-fonts/dwg-fonts.css` ein. Vite bündelt CSS und woff2 nach `dist/assets/`, die App
  lädt keine Schriften von fremden Servern. Andere Stellen (z. B. ein `@import` in `global.css`) meldet `dwg check --app`.

Mit `--model` übernimmt `app page` die Formatstrings der Measures aus dem TMDL in die Seiten-Spec (`formats` je Kachel,
Schlüssel `[rolle]`), wie Power BI sie dem Visual mitgibt: `#,##0` zeigt unter `de-DE` 8.978, ohne Format zeigte die App
8978. Ein Eintrag in `formats` der Kachel geht vor, unter `[rolle]` oder unter dem Measure in jeder Schreibweise
(`'T'[M]`, `T[M]`, `[M]`). Ohne `--model` gilt nur `formats` der Spec.

**Skalierende Kommas** (`#,##0.0,` in Tausend, `#,##0,,` in Millionen) zeigt ChartKitchen 1.58 falsch: 81 statt 81,5.
`dwg lint` warnt bei solchen Einträgen in `formats` (`FORMAT_SCALING_COMMA`), `dwg check --model` bei Formatstrings
gebundener Measures. Ausweg: Formatstring ohne Kommas am Ende und die Einheit dem Visual überlassen (automatisch K/M,
mit `labels.unitSuffix: false` ohne Kürzel, die Einheit dann in Titel oder Beschreibung) oder die Kennzahl im Modell
skalieren. `formats` gilt ohnehin nur in der App, Power BI nimmt den Formatstring des Measures. `labels.displayUnits`
hilft nur, wenn alle Kennzahlen der Kachel dieselbe Einheit haben: es gilt auch für Achsen und Prozentwerte.

**Grenze:** Dynamische Formatstrings (`formatStringDefinition`, DAX je Zelle) wertet die App nicht aus, die Werte
erscheinen dort ohne Format. `app page --model` meldet solche Measures als Hinweis. Ausweg: ein festes Format im
Kachelfeld `formats`, z. B. `"[actual]": "#,##0"`.

Mit `--model` schreibt `app page` außerdem `fabscan.json` in den App-Ordner (neben `rayfin/`):
`{ "connectors": { "<App-Ordner>:<Konnektor>": "<Modellname>" }, "models": ["<Ordner mit dem Modell, relativ zur App>"] }`
(fabscan sucht unter `models` nach `*.SemanticModel`-Ordnern, daher der Elternordner).
Damit findet der Governance-Scanner fabscan (`fabscan <App-Ordner>`) das Modell und prüft die Abfragen dagegen, auch
wenn das Modell in einem anderen Repo liegt. Vorhandene Einträge der Datei bleiben stehen.

Hat die Spec feste Filter (`pages[].filters`, `tiles[].filters`), schreibt `app page` sie auch ohne `--model` als
`visibleFilters` in dieselbe Datei, je Filter ein Eintrag mit der `.dax`-Datei seiner Seite:
`{ "column": "'Calender'[Year]", "values": [2026], "file": "packages/frontend/src/dwg/pages/guv-statement.dax", "source": "dwg" }`.
Die App zeigt diese Filter als Chips; fabscan ab 0.6.2 meldet die passenden TREATAS-Stellen dann als Hinweis
(ℹ „Fester Filter, für Nutzer sichtbar“) statt als Warnung QRY-HARDCODED. Datumswerte stehen in der Abfrage als
`DATE(…)`, ihr Eintrag hat deshalb keine `values` (jeder feste Wert der Spalte in dieser Datei gilt als sichtbar).
Slicer gehören nicht dazu, sie stehen nicht in den `.dax`-Dateien. Jeder Lauf ersetzt die Einträge mit
`"source": "dwg"` zu den Seiten, die er schreibt; Einträge anderer Seiten (eine zweite Spec mit eigenem Konnektor in
derselben App) und eigene Einträge bleiben.

Eingebunden wird die Seite in der App selbst (`App.tsx` gehört der App):

```tsx
<DwgPage page={page} connection="guv" isDark={isDark} />
// oder alle Seiten der Spec mit Navigation oben und Filter-Panel links:
<DwgShell app={app} connection="showcase" isDark={isDark} actions={<ThemeToggle />} />
```

Voraussetzungen der App: Konnektor vom Typ `fabric-semanticmodel` in `rayfin/rayfin.yml`, Hook
`use-semantic-model-query` (Pack `analytics`).

## App-Rahmen: Filter-Panel, Navigation, Auflösung

Für Apps mit vielen Seiten (Showcase mit allen Templates). In der Spec: `slicers`, `resolution`, `visualHeaders`,
`footer` (oberste Ebene) und je Seite `group`, `template`, `description`; Format und Layout-Vertrag in
`skill/dwg/references/app-spec.md`.

- **Auflösung:** `fullhd` bzw. `hd` baut die Seite in 1920 bzw. 1280 px auf und skaliert sie als Ganzes per
  CSS-Transform: Schriften, Abstände und Visuals bleiben im selben Verhältnis, die Visuals rechnen in Seitenpixeln
  (DwgVisual meldet ihnen die Layoutgröße statt der skalierten). Nie kleiner als 1152 px, dann waagerecht scrollen;
  unter 900 px gestapelt. `responsive` skaliert wie bisher nur die Kacheln. Umschaltbar in der Kopfleiste.
- **Pixelraster wie MockupKitchen** (`layout/pixelgrid.mjs`, Tests `layout/test.mjs` gegen die Tabellen des Konzepts; Konzept im Kitchen-Repo
  `assets/mockup/KONZEPT-PIXELRASTER.md`): Kopf, Filter-Panel links, Fußleiste, Inhalt; bei Full HD Rand 27,
  Zwischenraum 18, 12er-Raster, Inhalt x 327 bis 1893, y 123 bis 1017. Generator, Shell und PBIP rechnen mit demselben
  Modul; die App bekommt es als `src/vendor/dwg-pixelgrid/`. Im HD-Modus überträgt die Shell die Kacheln über das Raster
  (`stagePage`, `transfer`), also pixelgenau mit Zwischenraum 12 statt mit 2/3 skaliert.
- **App (`DwgShell`):** Kopfleiste in einer Zeile, bleibt beim Scrollen stehen: ☰ öffnet das Seitenmenü als Popup
  (alle Seiten nach Gruppen in Spalten, Suchfeld für Kennung, Name und Gruppe, aktuelle Seite markiert; Auswahl, Esc
  und Klick daneben schließen es, Fokus zurück auf ☰), daneben Titel, die aktuelle Seite (Gruppe, Kennung, Name,
  Position wie „12/47“, öffnet ebenfalls das Menü) mit ‹ › für vorige und nächste Seite, rechts die Schalter Auflösung
  und Kopfzeilen. Link je Seite `#c03`. Die Seite selbst trägt Titel und Erklärtext im Kopf, das Filter-Panel (Werte per
  DAX, Einfach- und Mehrfachauswahl, Zurücksetzen, leere Werte ausgeblendet, „Leere Werte zeigen“) und den Fußtext.
  Slicer wirken per TREATAS auf alle Kacheln aller Seiten, zusammen mit dem Querfilter per Klick (gleiche Spalte:
  Schnittmenge). Eine Abfrage je Kachel; Filterwechsel fragt die Kacheln der Seite neu ab, Seitenwechsel nur die neue
  Seite; Theme, Fenstergröße, Auflösung und Kopfzeilen lösen keine Abfrage aus (ein Elementbaum für alle Modi).
- **Filter-Panel einklappen:** Knopf « im Panelkopf oder Taste F (nicht in Eingabefeldern). Das Panel verschwindet,
  die Kacheln nutzen die ganze Breite (Pixelraster ohne Filterzone). Unter dem Seitenkopf steht dann eine Filterleiste:
  „Filter“ öffnet das Panel wieder, jeder aktive Slicer ist ein Chip („Jahr: 2026“) mit ×, das den Filter aufhebt
  (Auswahl „Alle“), feste Filter der Spec stehen ohne × daneben, „Zurücksetzen“ stellt die Vorgaben her. Der Zustand
  gilt je Browser (`localStorage` `dwg-filter-panel`), Ein- und Ausklappen fragt nichts neu ab. ARIA: `aria-expanded`
  und `aria-controls` an beiden Knöpfen, Fokus wandert zum Gegenknopf, × mit `aria-label` („Filter Jahr: 2026
  entfernen“).
- **Ganze Seite im Fenster:** In `fullhd` und `hd` passt sich die Bühne der Fensterhöhe unter der Kopfleiste an
  (höchstens die Seitenhöhe, mindestens 60 % davon, `fitHeight`). Den Unterschied nimmt die Hauptkachel (größte
  Fläche) allein auf, Kacheln darüber bleiben, Kacheln darunter rücken nach (`absorbHeight`); KPI-Karten behalten so
  ihre Höhe. Nur wenn eine Kachel das Band der Hauptkachel teilweise überdeckt, wird gleichmäßig im Raster gestaucht. P&L-Kacheln laufen in der App mit `layout.maximize` (Schrift und Zeilen
  auf die Kachelhöhe, `fitToTile`; Power BI behält den Wert der Spec). Braucht ein P&L trotzdem mehr Platz (Bildlauf im
  Visual, z. B. der ROI-Baum 11A), meldet die Kachel die nötige Höhe, die Bühne wird um diesen Betrag höher und
  skaliert als Ganzes etwas kleiner, damit sie ins Fenster passt (höchstens dreimal je Seite; bis 4 px Überlauf gelten
  als Rundung beim Füllen).
- **Kopfzeilen der Visuals:** Standard aus (`visualHeaders: false`), Schalter in der Kopfleiste. Setzt zur Laufzeit
  ChartKitchen `ibcsTitle.show`, `chart.chartButtons`, `chart.cumulativeButton` und P&L `titleBlock.show`,
  `toolbar.show` auf aus. Den Sortier-Chip der ChartKitchen-Karten blendet keine Property aus (hängt an der
  Interaktivität).
- **Power BI:** Seitenname „C03 Säulen im Zeitverlauf“, im Kopf ein Textfeld (Titel, Gruppe, Erklärtext), im Filter-Panel
  je Slicer ein nativer Slicer (Dropdown, Startauswahl, Sync-Gruppe je Spalte, Filter „ist nicht leer“), Fußtext,
  Kacheln auf denselben Rechtecken. Wiederholte Läufe behalten die Seiten-IDs.
- **Tests:** `app/test/unit.mjs` (App-Datei, Zonen, Layout-Vertrag, Pixelraster, Slicer-Prüfung), `pbip/test/unit.mjs`
  (Kopf, Fuß, Slicer-Stapel, Sync-Gruppen, „nicht leer“, gleiche Rechtecke, Schemas), Vitest in der App
  (`dwg-page.spec.ts`), Browser-Test `app/test/shell.mjs` (74 Prüfungen: Seitenmenü mit Suche, Esc und Klick daneben,
  ‹ ›, Bühne, Seitenpixel, HD, Fließend, sticky Kopf, Mindestfaktor, Kopfzeilen ohne Abfrage, leere Werte, Querfilter, Dark Mode, schmal, ganze Seite bei 1920 × 1080
  und 1366 × 768, Panel einklappen per Tastatur und Taste F, Chips mit ×, Fokus, Zustand nach dem Neuladen).
  `app/test/showcase-e2e.mjs` prüft je Seite zusätzlich, dass die Bühne ins Fenster passt und kein P&L über seine
  Kachel läuft und keine Beschriftung einer ChartKitchen-Kachel aus der Kachel ragt; `--width/--height`,
  `--panel closed` und `--dark` für die Varianten.

![Showcase-Rahmen: Filter-Panel, Navigation, Slicer und Querfilter](../app/docs/shell-filter.png)

## MockupKitchen-Bausteine: Raster, Prüfung, Import

Was im Workshop mit MockupKitchen skizziert wird, kommt ohne Nachbau in dwg an. Die gemeinsamen Teile liegen **einmal**
im Kitchen-Repo (`assets/mockup/`, Skill `mockup-to-powerbi`) und werden mit `dwg mockup build` geholt, wie die Visuals
mit `dwg visuals build`. Nicht von Hand ändern: im Kitchen-Repo ändern, dann neu holen; `mockup/vendor/manifest.json`
hält die Hashes, `npm test` meldet jede Abweichung.

| Baustein | Quelle im Kitchen-Repo | in dwg | genutzt von |
| --- | --- | --- | --- |
| Pixelraster | `assets/mockup/pixelgrid.js` + `.d.ts` | `layout/pixelgrid.mjs` (ES-Modul, erzeugt) + `.d.ts` | Generator, Shell (App), PBIP, Lint, Import; MockupKitchen im Browser |
| Rasterprüfung | `assets/mockup/gridcheck.js` | `mockup/vendor/gridcheck.js` | `dwg lint` |
| Barrierefreiheit | `assets/mockup/a11y.js` | `mockup/vendor/a11y.js` | `dwg lint` |
| Zuordnung Mockup → ChartKitchen/P&L | Skill `mockup-to-powerbi/scripts/mockup_to_pbir.py` | `mockup/vendor/skill/` | `dwg mockup import` (Python 3) |

**Warum die Quelle im Kitchen-Repo liegt:** MockupKitchen ist ein Browser-Tool ohne Build und lädt `pixelgrid.js` per
`<script>` (`window.MK_PIXELGRID`); es kann nichts aus diesem Repo holen. dwg dagegen baut ohnehin aus dem Kitchen-Repo.
Das ES-Modul `layout/pixelgrid.mjs` ist der unveränderte Quelltext plus Export-Zeilen, die API ist die der ersten
dwg-Fassung aus der Showcase-Runde (die sieben Tests in `layout/test.mjs` laufen unverändert).

```bash
# gemeinsame Teile holen (Kitchen-Klon: --kitchen, DWG_KITCHEN, Klon neben diesem Repo oder Pfad aus install.mjs)
node dwg.mjs mockup build [--kitchen <pfad>]
node dwg.mjs mockup build --check          # weicht etwas vom Kitchen-Repo ab? ohne Kitchen: gegen das Manifest

# App-Spec prüfen: Raster und Barrierefreiheit (Exit 1 bei Fehlern, mit --strict auch bei Warnungen)
node dwg.mjs lint --spec specs/showcase.json [--json]

# MockupKitchen-Export (mockup-spec.json) in eine App-Spec übersetzen, mit Modellprüfung
node dwg.mjs mockup import --in mockup-spec.json --out specs/vertrieb.json \
  --model "examples/showcase/ZlatyLev Showcase.SemanticModel"
```

**`dwg lint`** prüft je Seite:
- *Raster* (bei Specs mit App-Rahmen): Kante 1 bis 3 px neben einer Rasterlinie (mit Vorschlag für `rect`), äußere Kanten
  knapp nicht bündig mit dem Inhaltsrand, Kachel außerhalb des Inhalts (Kopf, Filter-Panel, Fuß). Freie Linien wie 1/5
  sind erlaubt. Ohne Rahmen: fast bündige Kanten und uneinheitliche Zwischenräume. Immer: Überlappungen.
- *Barrierefreiheit* (Regeln aus MockupKitchen): Mindestgröße der Kacheln (Fehler unter 100k × 60k px, Warnung unter
  160k × 90k), Kachel ohne Titel, mehr als neun Kacheln, Schrift zu klein für die Seitenbreite, Slicer ohne Namen, Kontrast
  der App-Farben hell und dunkel. Die Farben liest der Lint aus `app/templates/DwgShell.tsx` (`palette()`), es gibt keine
  zweite Farbtabelle.
- Gleiche Befunde auf vielen Seiten stehen einmal mit Seitenliste.

**`dwg check --spec <datei> [--model <X.SemanticModel>] [--app <Rayfin-App>] [--json] [--strict]`** prüft eine App-Spec,
ohne dass eine Rayfin-App oder ein Bericht dafür nötig ist. Je Problem eine Zeile mit Seite und Kachel, danach die
Hinweise, am Ende „n Seiten, m Kacheln, k Probleme, h Hinweise“. Exit 1 bei Problemen, mit `--strict` auch bei Hinweisen;
`--json` liefert `{ pages, tiles, problems, warnings }`. Geprüft wird:
- *Aufbau* (`checkSpec`): `pages` und `tiles` sind Listen, jede Seite hat einen `name`, jede Kachel eine `id` (je Seite
  eindeutig), ein `visual` aus `chartkitchen` oder `pnl` (genau so klein geschrieben) und `bindings` als Objekt;
  `filters` auf Seite und Kachel sind Listen von `{ "column": "'T'[Spalte]", "values": [mindestens ein Wert] }`; dazu
  Slicer, Auflösung, Seitenkennungen und `rect` im Inhaltsbereich.
- *Rollen und Bindungen* je Kachel mit `daxQuery` aus dem Adapter, derselbe Aufruf wie in `dwg app page`, nur ohne zu
  schreiben: unbekannte Rollen, falsche Anzahl Felder, ungültige Spaltenreferenzen.
- *Felder* (nur mit `--model`): Bindungen, Filter und Slicer müssen im Modell vorkommen.
- *Hinweis feste Zeitfilter*: `pages[].filters` oder `tiles[].filters` auf Jahr, Quartal, Monat, Woche oder Datum
  (nach dem Spaltennamen, mit `--model` auch `dateTime`-Spalten) stehen still in jeder Abfrage und lassen sich in der App
  nicht ändern; dort erscheinen sie nur als Chip im Seitenkopf. Der Hinweis nennt den passenden Slicer mit Vorgabe
  (`slicers[].default`). Ist die Spalte schon Slicer, gelten beide zusammen und der Slicer kommt nicht über den festen
  Wert hinaus. Flags wie `'Kalender'[Ist] = true` und Szenario-Filter gelten nicht als feste Zeitfilter.
- *Hinweis fremde Schriften* (mit `--app`, geht auch ohne `--spec`): Verweise auf Schrift-Dienste (Google Fonts, Typekit
  u. a.) in `index.html` und unter `src/` der App.

`dwg app page` ruft denselben Aufbau-Test und zeigt bei ungültigen Specs diese Meldungen.

Stand der Beispiel-Specs: ohne Fehler. Showcase: die Kartenzeile (2/12, 1566 × 134 px) liegt 1 px unter der
Warnschwelle für die Höhe (135 px bei Full HD). Alle Apps: weiße Schrift auf dem Akzent #C25A2D hat 4,4:1 statt 4,5:1
(aktive Seite, gewählte Slicer-Werte).

**`dwg mockup import`** liest `mockup-spec.json` (specVersion 3) und lässt den Konverter des Skills laufen; dwg übernimmt
dessen Ergebnis je Kachel, statt die Zuordnung nachzubauen:

| Mockup | dwg |
| --- | --- |
| Seite, Fragestellung | Seite, `description` |
| Filterbereich mit Feldern | `slicers` (Startwert, Mehrfachauswahl bei Liste/Kachel; mit `--model` Datentyp und Sortierspalte) |
| ChartKitchen-Kachel | `chartkitchen` mit Rollen und Formatbereich aus `chartkitchen-slots.json` (Szenario aus dem Feldnamen, Modus, Top-N, Polarität); ohne Hell/Dunkel und Schriftgrößen, die setzt die App |
| KPI-Kachel | in Power BI `ibcsKpiCard`, in dwg ChartKitchen-Karte (`cards`), Hinweis |
| GuV-Kachel (P&L) | `pnl` mit den Buckets aus `custom-visuals.json`; mit Zeilentyp `showItemsWithNoData` |
| Lage | im Pixelraster: mit Rastermodus im Mockup exakt über die Brüche (`visuals[].cell`), sonst über die Lage im Inhalt, auf 1/24 gerundet (Hinweis bei mehr als 3 px) |
| Sortierung nach Spalte (Modell) | `sortBy` je Kachel |
| natives Visual, Text, Gantt, Deneb, Sprungziele | nicht abbildbar: Hinweis mit Seite, Titel und Text |
| Warnungen des Mockup-Exports | Hinweis |

Danach prüft der Import mit `checkSpec` (Layout-Vertrag) und zeigt die Lint-Zusammenfassung; weiter mit `dwg app page`
und `dwg pbip pages` wie bei jeder Spec. Beispiel und Test: `mockup/test/beispiel/mockup-spec.json` (in MockupKitchen
auf „ZlatyLev Showcase“ gebaut, zwei Seiten, Pixelraster an, Bild `mockup/docs/beispiel-mockup.png`),
`mockup/test/unit.mjs` (13 Tests: Manifest, Lint, Import bis zum schemagültigen Bericht). Ohne Python überspringt der
Test den Import mit Meldung.

![Beispiel-Mockup in MockupKitchen (Rastermodus, Filter links)](../mockup/docs/beispiel-mockup.png)

**Offen:** In MockupKitchen fehlt Stufe 2 des Pixelraster-Konzepts (Einrasten beim Ziehen, „Pixelgenau machen“ mit
Gewichten aus den sichtbaren Pixeln); der Skill wertet `canvas.pixel` noch nicht aus (Toleranz 0, `--resnap`). Text-
Kacheln und native Karten haben in dwg kein Gegenstück.

## Templates und Kacheln aus der Kommandozeile

Die 47 Templates (ChartKitchen C01 bis C25, P&L T01A bis 12H, ab P&L 1.7 Bilanz T05A und Cashflow T05B, ab P&L 1.8 die Ansichtsvorlage 11A ROI-Baum) stehen als Katalog
in `visuals/dist/templates.json`. Ihn erzeugt
`dwg visuals build` aus dem Code der Visuals ([`visuals/templates.mjs`](visuals/templates.mjs)): die Schalter, die ein
Template beim Anwenden setzt (ChartKitchen `CHART_TEMPLATES`, P&L `templateSwitches()`), Gruppe, Titel und Zweck in DE
und EN aus den Sprachressourcen, dazu die Datenrollen als Pflicht, empfohlen oder optional. Die Rollen leitet dwg aus den
Schaltern ab (Vergleich mit dem Vorjahr → PY Pflicht, zweiter Block → Periode empfohlen, GuV-Statement → Kontologik
empfohlen); geprüft gegen die abgenommenen Showcase-Kacheln. Derselbe Katalog ist für MockupKitchen gedacht.
AC ist überall Pflicht, außer bei den Forecast-Strukturtabellen T01D, T02E und T02F (Minuend FC): dort ist AC empfohlen.
Sie zeigen den Forecast im Monats- und YTD-Block; ist später der Berichtsmonat wählbar, zeigt das Visual FC auch ohne
AC. `tile add` bindet AC weiter, wenn das Modell eine Ist-Kennzahl im Stamm hat; den Stamm nimmt es aus `--measure`, aus
AC oder ersatzweise aus der Minuend-Rolle (`--fc 'Fakten'[Umsatz FC]` → „umsatz“). P&L 1.8.4 zeichnet ohne AC noch keine
Tabelle (Hinweis „AC (Ist)“ im Visual): fehlt AC trotzdem, warnen `tile add` und `dwg lint` (Code `PNL_NO_AC`, Warnung,
kein Fehler; mit `--strict` Exit 1). Die FC-Statements T03B, T04D und T04E behalten AC als Pflicht.
Bei den Scatter-Templates (C10, C18, C23, C24) heißt die Rolle `series` „Serie“: sie färbt oder gruppiert die Punkte und
stapelt nichts. C24 führt sie optional und nie mit demselben Feld wie `category` (sonst doppelte, gekürzte Namen); `tile add`
schlägt dieses Feld für `series` nicht vor und warnt, wenn beide Rollen dasselbe Feld bekommen.

**Bestände (P&L 1.7, Gruppe „Bilanz & Cashflow“).** T05A und T05B schreiben zusätzlich `statement.stockMode`
(T05A `allStock`, T05B `auto`). Das Visual liest Bestand oder Fluss aus Token im Zeilentyp: `stock` (Stand am
Periodenende, z. B. `Account stock`), `opening` (Stand am Periodenbeginn, `Account opening`), ohne Token Fluss.
Bestände summiert es nicht über die Monate, sondern zeigt den Stand am Stichtag. Rollen: Periode empfohlen (den
Stichtag wählt das Visual aus den Monatswerten), Zeilentyp bei T05B Pflicht (Anfangs- und Endbestand), bei T05A
empfohlen (ohne Token setzt das Template „Alle Zeilen Bestand“). Beispiel: Showcase-Seiten T05A und T05B auf
'Bilanzkonto'/'Bilanz' und 'Cashflowkonto'/'Cashflow' (`examples/showcase/CONTRACT.md`). Hat ein Modell mehrere
Kontentabellen mit Ebenen und Zeilentyp, nimmt `tile add` die, die mit der Tabelle der Kennzahl verbunden ist.

```bash
node dwg.mjs templates                 # Übersicht nach Zweck, mit Pflichtrollen
node dwg.mjs templates T04B --lang en  # ein Template: Rollen, was es im Visual einstellt
node dwg.mjs templates --json          # Katalog für Werkzeuge

# Kachel anlegen: --page nimmt eine vorhandene Seite, --new-page legt eine an (neue Spec mit App-Rahmen in Full HD)
node dwg.mjs tile add --spec specs/neu.json --new-page "GuV" --template T04B --model "<Y>.SemanticModel"
node dwg.mjs tile add --spec specs/neu.json --page umsatz --template C04 --model "<Y>.SemanticModel" \
  --measure Umsatz --category Kunde.Region --rect 327,700,780,300 --dry-run
```

Felder: `--<rolle> <feld>` setzt eine Rolle (`'Kunde'[Region]`, `Kunde.Region`, ein eindeutiger Spalten- oder
Measure-Name; mehrere Ebenen mit Komma oder mehrfach `--levels`). Was fehlt, schlägt dwg aus dem TMDL vor:

- **Kennzahlen** über den Stamm: „Umsatz AC“ → Stamm „umsatz“, Szenario AC; PY, PL, FC derselben Kachel kommen aus
  demselben Stamm. Den Stamm gibt `--measure` vor, eine gesetzte Ist-Kennzahl oder das Modell, wenn es nur eine Familie
  gibt (bei GuV-Templates die GuV-Familie mit den meisten Szenarien). Abweichungs-Measures (Δ, Abw.) fallen weg,
  Varianten (YTD, R12, FC2, ±) bleiben Alternativen. Vergleicht ein P&L-Template Ist über das laufende Jahr ohne
  Periodenfeld, nimmt dwg „PY/PL bis Ist“, damit Ist und Plan dieselben Monate zeigen.
- **Spalten**: Zeitachse aus der Kalendertabelle (Monatsname mit Sortierspalte), Ebenen L1..Ln und die GuV-Logik
  (Zeilentyp, Formel, Vorzeichen, Umkehr, Sortierung, Konto) aus derselben Tabelle. Strukturachsen (Region, Kanal, Kunde)
  und die Ebenen der Strukturtabellen T01/T02 gibt man an; dwg nennt Kandidaten.

Übernommen wird ein Vorschlag nur, wenn er eindeutig vorn liegt; sonst bricht `tile add` ab und nennt Kandidaten. Die
Kachel bekommt die Schalter des Templates, Sortierspalte und Anzeigenamen (ChartKitchen), den Template-Titel und auf
einer leeren Seite den ganzen Inhaltsbereich; daneben braucht sie `--rect`. Danach gelten `checkSpec`, `dwg lint`,
`app page` und `pbip pages` wie für jede Spec.

Tests: `templates/test/unit.mjs` (31: Katalog, Schalter und Pflichtrollen gegen die 47 Showcase-Kacheln, Vorschläge
treffen deren Felder, Kurzangaben, Kommandozeile, T02E ohne AC bis zur Power-BI-Seite, Serie bei Scatter und C24). Von Hand geprüft: drei Seiten aus `tile add` (C03, T04B, T01A) als
schemagültiger Bericht (`pbip pages`, `validate`) und im Browser-Testrahmen gerendert, Zahlen wie die Showcase-Seiten;
Gegenprobe auf dem Modell „ChartKitchen byDatenWG Demo“ (L1..L6, Measures ohne Stamm).

**Offen:** Lage neben vorhandenen Kacheln automatisch (heute `--rect`), Format-Vorgaben wie `numbers.scaling` per
Option, MockupKitchen liest den Katalog (Template-Auswahl je Kachel, Rollen-Checkliste).

## Beispiel GuV

Spec [`specs/guv.json`](../specs/guv.json) auf dem Modell „ChartKitchen byDatenWG Demo“, Bericht
`examples/DWG GuV.Report`. Zwei Seiten mit dem P&L Statement: GuV-Statement und GuV-Baum, Jan bis Aug 2026 mit
FY-Ausblick. Getestet mit den CSV-Quellen des Modells (5.000 Konten): `app/test/guv.mjs` (Kontrollwerte),
`app/test/e2e.mjs --page guv-statement|guv-baum`.

- `tiles[].filters` (Kachelfilter; App TREATAS, Power BI Visual-Filter).
- Keine Monatsspalten: 5.000 Konten × 12 Monate sprengen die executeQuery-Grenzen.

## Stand und Grenzen

- **Geprüft (npm test):** Adapter, Generator, Templates und Feldvorschläge, Mini-DAX gegen Kontrollwerte, App-Seiten
  und App-Rahmen im Browser mit Mock-Konnektor (Rendern, eine Abfrage je Kachel, Querfilter mit TREATAS, Dark Mode,
  schmal, keine Konsolenfehler), PBIR gegen die offiziellen Schemas, Parität Power BI gegen App.
- **Nicht geprüft:** echte Abfragen gegen das Semantikmodell in Fabric und die Anmeldung (braucht Fabric-SSO), der
  Bericht in Desktop/Service. Das macht ein Mensch.
- Querfilter in der App: eine Auswahl gleichzeitig, Filter je Spalte (TREATAS). Kein Drill-through, keine Lesezeichen.
- Private Visuals im Bericht brauchen im Tenant die Einstellung für SDK-Visuals (bis zum AppSource-Listing).

Alle Zahlen im Demo-Modell sind Demodaten. IBCS® ist eine eingetragene Marke des IBCS Institute.
