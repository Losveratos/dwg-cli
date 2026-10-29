# App-Spec · Format und Rollen

Eine Datei beschreibt eine oder mehrere Seiten. Dieselbe Datei lesen `dwg app page` (Fabric App) und
`dwg pbip pages` (Power BI). Beispiele: `specs/spike.json`, `specs/guv.json`, mit Filter-Panel und
Navigation `specs/showcase.json` (Abschnitt „App-Rahmen“ unten).

```json
{
  "name": "Vertrieb",
  "about": "Wofür die Seite ist, welches Modell, Besonderheiten.",
  "pages": [{
    "name": "Übersicht",
    "width": 1920, "height": 1080,
    "background": "#F4F4F1",
    "filters": [{ "column": "'Calender'[Year]", "values": [2026] }],
    "tiles": [{
      "id": "umsatz",
      "visual": "chartkitchen",
      "rect": [24, 24, 1140, 560],
      "title": "optional, Name der Kachel (App: aria-label, Power BI: Titeltext, nicht sichtbar); sichtbare Titel über objects.ibcsTitle bzw. objects.titleBlock",
      "bindings": {
        "category": "'Calender'[Month Name Short]",
        "actual": "'Sales Demo'[AC]",
        "plan": "'Sales Demo'[PL]"
      },
      "sortBy": { "'Calender'[Month Name Short]": "'Calender'[Month]" },
      "showItemsWithNoData": false,
      "displayNames": { "[actual]": "Umsatz" },
      "objects": { "chart": { "orientation": "intwaterfall", "comparisonMode": "plan" },
                   "ibcsTitle": { "kpi": "Umsatz", "period": "2026" } }
    }]
  }]
}
```

| Feld | Bedeutung |
| --- | --- |
| `pages[].width/height` | Seitengröße in Pixeln wie in Power BI; die App skaliert auf die Breite, unter 900 px stapelt sie |
| `pages[].filters` | feste Seitenfilter (`TREATAS` in der App, Seitenfilter in Power BI) |
| `tiles[].visual` | `chartkitchen` oder `pnl` |
| `tiles[].rect` | `[x, y, Breite, Höhe]` in Seitenpixeln |
| `tiles[].bindings` | Rolle → Feld. Spalten immer mit Tabelle: `'Tabelle'[Spalte]`. Kennzahlen: Modell-Measure `'Tabelle'[Measure]` (Pflicht für Power BI) oder ein DAX-Ausdruck (nur App) |
| `tiles[].filters` | feste Filter nur dieser Kachel, zusätzlich zu den Seitenfiltern (App: TREATAS in dieser Abfrage; Power BI: Visual-Filter), z. B. nur die echten GuV-Blöcke einer Kontendimension |
| `tiles[].sortBy` | Sortierspalte je gruppierender Spalte (App: ORDER BY; Power BI: muss im Modell als „Nach Spalte sortieren“ stehen) |
| `tiles[].showItemsWithNoData` | Elemente ohne Daten behalten (App: ADDMISSINGITEMS, mit Filtern in CALCULATETABLE, aufgefüllt wird nur innerhalb der Filter; Power BI: `showAll`), z. B. GuV-Formelzeilen |
| `tiles[].displayNames` | Anzeigename je Ergebnisspalte; Measure-Spalten heißen im Ergebnis wie die Rolle, z. B. `[actual]` |
| `tiles[].objects` | Formatbereich-Objekte des Visuals, Namen wie in `capabilities.json` bzw. PBIR `visual.json` |

**Werte in `filters[].values` und `slicers[].default`** haben den Typ der Spalte: Zahl (`2026`) für int64/double,
Text (`"Germany"`) für string, `true`/`false` für boolean, `null` für leer. **Datum als ISO-Text**: `"2026-03-01"`
oder `"2026-03-01T00:00:00"`. Die App filtert damit per `DATE(2026, 3, 1)` (mit Uhrzeit `+ TIME(…)`), Power BI
bekommt `datetime'2026-03-01T00:00:00'` wie von Desktop geschrieben. Mit `--model` (App) bzw. immer (PBIP) prüft dwg
die Werte gegen den `dataType` im TMDL und bricht bei falschem Typ ab (`[2026]` auf einer Textspalte träfe still
nichts). `dwg app page --model` schreibt außerdem den Datentyp der benutzten Spalten als `columnTypes` in die
erzeugte Seite: Abfrageergebnisse tragen keine Typen (Datum kommt als ISO-Text), so wird nur eine dateTime-Spalte
zum Datum und eine Textspalte mit Werten wie `2026-01-01` bleibt Text. Ohne `--model` gilt ISO-Text als Datum.

## App-Rahmen: Filter-Panel, Navigation, Erklärtext, Auflösung

Für Apps mit vielen Seiten (z. B. `specs/showcase.json`). Die App bindet dann `DwgShell` statt einzelner
`DwgPage` ein; `dwg pbip pages` legt dieselben Slicer, Texte und Rechtecke im Bericht an.

```json
{
  "name": "Showcase",
  "resolution": "fullhd",
  "visualHeaders": false,
  "footer": "Demodaten. IBCS® ist eine eingetragene Marke des IBCS Institute.",
  "slicers": [
    { "column": "'Kalender'[Jahr]", "label": "Jahr", "default": [2026], "multi": false },
    { "column": "'Kunde'[Kanal]", "label": "Kanal", "multi": true, "sortBy": "'Kunde'[Kanal Sort]" }
  ],
  "pages": [{
    "name": "Säulen im Zeitverlauf", "template": "C03", "group": "ChartKitchen · Zeitverlauf",
    "description": "Welche Frage die Seite beantwortet, zwei bis drei Sätze.",
    "width": 1920, "height": 1080,
    "tiles": [{ "id": "karten", "rect": [327, 123, 1566, 134], "…": "…" },
              { "id": "vorlage", "rect": [327, 275, 1566, 742], "…": "…" }]
  }]
}
```

| Feld | Fabric App (`DwgShell`) | Power BI (`dwg pbip pages`) |
| --- | --- | --- |
| `resolution` | Startmodus, in der Kopfleiste umschaltbar: `fullhd` bzw. `hd` baut die Seite in 1920 bzw. 1280 px auf und skaliert sie als Ganzes (Schrift, Abstände, Visuals im selben Verhältnis; nie kleiner als 1152 px angezeigt, dann waagerecht scrollen); `responsive` skaliert nur die Kacheln. Unter 900 px wird gestapelt | Seite 1920 × 1080 („An Breite anpassen“) |
| `visualHeaders` | Titelblöcke und Bedienleisten der Visuals (Standard `false`: aus, Seitentitel steht darüber); Schalter „Kopfzeilen“ in der Kopfleiste, ohne neue Abfrage | Objekte der Kachel unverändert |
| `footer` | Fußleiste der Seite | Textfeld in der Fußzone |
| `slicers[].column` | Filter-Panel links, Werte per DAX (`SUMMARIZECOLUMNS`), Auswahl als TREATAS in jeder Kachel aller Seiten | nativer Slicer (Dropdown) im Filter-Panel jeder Seite, Sync-Gruppe je Spalte |
| `slicers[].label` | Überschrift im Panel | Anzeigename des Slicer-Felds |
| `slicers[].default` | Startauswahl, „Zurücksetzen“ führt dorthin; leer = alle | Slicer-Auswahl (`general.filter`) |
| `slicers[].multi` | Mehrfachauswahl (Standard: Einfachauswahl, erneuter Klick = alle) | `selection.singleSelect` |
| `slicers[].sortBy` | Reihenfolge der Werte | nur Prüfung: „Nach Spalte sortieren“ muss im Modell stehen |
| `slicers[].showEmpty` | „(leer)“ in der Werteliste zeigen (Standard: ausgeblendet, im Panel per „Leere Werte zeigen“ einblendbar) | ohne: Visual-Filter „ist nicht leer“ auf dem Slicer |
| `pages[].group` | Navigation oben (Gruppen in Reihenfolge des ersten Auftretens) | im Kopf-Textfeld hinter dem Titel |
| `pages[].template` | Kennung vor dem Namen („C03 Säulen im Zeitverlauf“), Link `#c03` | Seitenname „C03 Säulen im Zeitverlauf“ |
| `pages[].id` | optional: Link-Kennung, wenn es kein `template` gibt | nicht genutzt |
| `pages[].description` | Erklärtext im Kopf der Seite | Kopf-Textfeld |

**Layout-Vertrag (Pixelraster wie MockupKitchen, `layout/pixelgrid.mjs`):** gilt, sobald die Spec `slicers` oder
`resolution` hat. k = clamp(Breite/1280; 0,6; 3,2), Zwischenraum g = R(12·k), Rand m0 = R(18·k), 12er-Raster
(Ränder je Achse m0 ± 3 so gewählt, dass der Schritt durch 12 teilbar ist). Zonen: Kopf R(64·k) oben, Fußleiste
R(24·k) unten, Filter-Panel R(200·k) links dazwischen, Inhalt mit Rand. Bei 1920 × 1080: Kopf 96, Filter-Panel 300,
Fuß 36, Rand 27, Zwischenraum 18, **Inhalt x 327 bis 1893, y 123 bis 1017**, Spaltenschritt 132, Zeilenschritt 76.
Kacheln müssen ganz im Inhalt liegen (beide Generatoren brechen sonst ab); Rechtecke am besten mit
`pageLayout(1920, 1080).span(a, b, c, d)` (Spalten a..b, Zeilen c..d in Zwölfteln) rechnen, z. B. Karten
`span(0, 12, 0, 2)` = [327, 123, 1566, 134], Hauptkachel `span(0, 12, 2, 12)` = [327, 275, 1566, 742]. In Power BI
liegen Kopf-Textfeld, Slicer (Einzug Rand, Abstand g, ab Inhaltsoberkante) und Fußtext in den Zonen, die Kacheln
auf denselben Rechtecken. Slicer und Querfilter auf dieselbe Spalte ergeben die Schnittmenge.

## ChartKitchen byDatenWG (`chartkitchen`)

`objects.chart.orientation`: `columns` `bars` `line` `waterfall` `intwaterfall` `catbridge` `table` `pareto`
`dumbbell` `slope` `scatter` `cards` `pnl`. `objects.chart.comparisonMode`: `auto` `py` `plan` `fcrev`.

| Rolle | Art | max | Anzeige |
| --- | --- | --- | --- |
| `category` | Spalte | 1 | Category |
| `actual` | Kennzahl | 1 | Actual (AC) |
| `previousYear` | Kennzahl | 1 | Previous Year (PY) |
| `plan` | Kennzahl | 1 | Plan / Budget (PL) |
| `forecast` | Kennzahl | 1 | Forecast (FC) |
| `benchmark` | Kennzahl | 1 | Benchmark (BM) |
| `prevForecast` | Kennzahl | 1 | FC Vormonat (Revision) |
| `lineMeasure` | Kennzahl | 1 | Line (Kombi) |
| `xValue` | Kennzahl | 1 | X axis (Scatter) |
| `xPrevious` | Kennzahl | 1 | X axis PY (Scatter, optional) |
| `bubbleSize` | Kennzahl | 1 | Bubble size (optional) |
| `series` | Spalte | 1 | Stack Series (Gestapelt) |
| `colgroup` | Spalte | 2 | Spalten (Matrix) |
| `filterInfo` | Kennzahl | 1 | Filter-Info (Fußzeile) |
| `comments` | Kennzahl | 1 | Comments |
| `multiples` | Spalte | 1 | Small Multiples |
| `rowType` | Spalte | 1 | Waterfall Type (sum/delta) |
| `trend` | Spalte | 1 | Trend (time) |
| `fcFlag` | Spalte | 1 | Forecast Flag (1/0) |

Häufige Objekte: `chart.invertList` („Kosten, Opex“: mehr ist schlecht), `chart.invert` (ganze Kachel),
`chart.sortByImpact`, `chart.topN`, `chart.multiplesSameScale`, `chart.cardTrendChart` (`off` `sparkline` `columns`),
`chart.bridgeOrientation` (`auto` `bars` `columns`), `chart.scatterQuadrant` (`off` `mean` `median`),
`ibcsTitle.kpi` / `period` / `message`, `labels.fontPreset` (`compact` `fullhd` `presentation`),
`colors.appearance` (`auto` `light` `dark`). Vollständige Liste: `ibcsInspiredChartDeck/capabilities.json`
im Kitchen-Repo, Doku `chartkitchen-doku.html`.

## P&L Statement byDatenWG (`pnl`)

| Rolle | Art | max | Anzeige |
| --- | --- | --- | --- |
| `levels` | Spalte | 8 | Level columns (L1..Ln) |
| `account` | Spalte | 1 | Account ID (key) |
| `accountName` | Spalte | 1 | Account name |
| `parent` | Spalte | 1 | Parent account ID |
| `ac` | Kennzahl | 1 | AC (Actual) |
| `py` | Kennzahl | 1 | PY (Previous Year) |
| `pl` | Kennzahl | 1 | PL (Plan / Budget) |
| `fc` | Kennzahl | 1 | FC (Forecast) |
| `period` | Spalte | 1 | Period (month) |
| `colCategory` | Spalte | 1 | Column category |
| `rowType` | Spalte | 1 | Row type |
| `formulaDef` | Spalte | 1 | Formula definition |
| `signConvention` | Spalte | 1 | Sign convention (±1) |
| `displayInvert` | Spalte | 1 | Display invert |
| `varianceInvert` | Spalte | 1 | Variance invert |
| `sortOrder` | Spalte | 1 | Sort order |
| `comment` | Spalte | 1 | Comment |
| `filterInfo` | Kennzahl | 1 | Filter info (footer) |
| `fcFy` | Kennzahl | 1 | FC Full Year (outlook) |
| `plFy` | Kennzahl | 1 | PL Full Year |

Zwei Wege: **reine Hierarchie** (nur `levels` + Kennzahlen, z. B. Unit → Projektart) oder **volle GuV** (zusätzlich
`account`, `rowType`, `formulaDef`, `signConvention`, `displayInvert`, `varianceInvert`, `sortOrder`; dann
`showItemsWithNoData: true`, damit Formel- und Summenzeilen ohne eigene Werte ankommen).
Häufige Objekte: `titleBlock.measureLine` / `periodLine`, `numbers.unitText` (Standard „EUR“; bei Stunden „h“),
`columns.pctRevenue` (bei Nicht-GuV-Daten `false`), `columns.preset`, `style.fontPreset` (`hd` `fullhd` `uhd`),
`style.appearance`. Vollständige Liste: `pnlByDatenWG/capabilities.json`, Doku `pnl-doku.html`.

**Bestände (ab P&L 1.7): Objekt `statement`.** `statement.stockMode`: `auto` (Standard; Bestand oder Fluss aus Token
im Zeilentyp), `allStock` (jede Zeile ein Bestand, Bilanz ohne Token-Spalte), `allFlow` (jede Zeile ein Fluss, wie vor
1.7). Token im Zeilentyp: `stock` (auch `bestand`, `balance`, `stichtag`) = Stand am Periodenende, `opening` (auch
`anfangsbestand`, `eröffnung`) = Stand am Periodenbeginn, z. B. `Account stock`, `Account opening`, `Formula stock`.
Bestände summiert das Visual nicht über die Monate, YTD zeigt den Stand am Stichtag, Δ vergleicht Stände desselben
Stichtags; dafür `period` binden. Die Templates T05A (Bilanz, schreibt `allStock`) und T05B (Cashflow-Brücke, `auto`)
setzen es; in der Spec wie alle Template-Schalter explizit übernehmen:

```json
"objects": {
  "columns": { "template": "T05B", "templateApplied": "T05B", "valueCascade": true, "secondBlock": true, "pctRevenue": false },
  "statement": { "stockMode": "auto" }
}
```

## Was daraus wird

- **App:** `daxQuery()` je Kachel, z. B.
  `EVALUATE SUMMARIZECOLUMNS('Calender'[Month Name Short], 'Calender'[Month], TREATAS({2026}, 'Calender'[Year]), "actual", 'Sales Demo'[AC], "plan", 'Sales Demo'[PL]) ORDER BY 'Calender'[Month]`.
  Alle Abfragen einer Seite stehen nach dem Erzeugen in `src/dwg/pages/<seite>.dax` (zum Prüfen in der
  DAX-Abfrageansicht). Ein Klick filtert die anderen Kacheln mit `TREATAS` auf die geklickten Werte.
- **Power BI:** je Kachel eine `visual.json` mit `queryState` (Column/Measure-Projektionen), `objects` als Literale,
  Position aus `rect`; Seitenfilter im Filterbereich.
