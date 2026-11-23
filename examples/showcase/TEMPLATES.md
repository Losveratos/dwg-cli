# Showcase · Notizen zu den Templates

Stand 23.11.2026 (17 Seiten für ChartKitchen 1.57 und P&L 1.8.3 ergänzt; Bilanz und Cashflow 29.10.2026, sonst
19.10.2026). Spec: `specs/showcase.json` (47 Seiten, je Template eine), Test: `node app/test/showcase-spec.mjs`.
Visuals: ChartKitchen 1.57.0.0, P&L Statement 1.8.3.0 (Adapter `visuals/dist`).
Datenvertrag: `showcase/CONTRACT.md`. Die Templates sind an IBCS angelehnt.
Die ersten 28 Seiten sind mit einem kleinen Generator erzeugt (`gen-showcase.mjs` im Notizordner der Sessions), danach
ist die Spec von Hand gepflegt. Den Generator nicht mehr laufen lassen: er kennt weder das heutige Layout noch T05A,
T05B und die 17 Seiten ab 1.57.

## Wie ein Template sicher greift

**ChartKitchen (`chart.template`).** Das Dropdown schreibt nur Vorgaben. Das Visual vergleicht `chart.template`
mit der versteckten Property `chart.templateApplied`; weichen sie ab, setzt es beim ersten Rendern alle Schalter
des Presets und speichert sie per `persistProperties` (Code: `syncChartTemplate` / `CHART_TEMPLATES` in
`ibcsInspiredChartDeck/src/visual.ts`). `template` allein reicht also, schreibt aber beim ersten Öffnen in den
Bericht und überschreibt mitgegebene Schalter. Die Spec setzt deshalb **`template` und `templateApplied` gleich
und alle Preset-Schalter explizit** (orientation, comparisonMode, showAbsoluteVariance, showRelativeVariance,
dualVariance, waterfallStyle bzw. bridgeOrientation, scatterQuadrant, scatterColorBy, scatterSizeLegend,
multiplesTotal, multiplesSameScale). Ergebnis: dasselbe Bild in App und Power BI, kein Schreiben beim Öffnen,
kein Chip „↺ Zum Template zurück“.

**P&L (`columns.template`).** Gleiches Muster (`syncMegaTemplate` in `pnlByDatenWG/src/visual.ts`, Presets in
`megatable.ts` `MEGA_PRESETS`, Umsetzung in Properties `templateSwitches()` in `hub.ts`). Die Spec setzt
`columns.template` = `columns.templateApplied` und alle Schalter aus `templateSwitches()`: minuend, showPY, showPL,
showMinuend, valueCascade, dPy*/dPl* (Abs, Bar, Waterfall, Pct, Pin), secondBlock, structureSubtotals, showPctRows,
thresholds, scenarioMarks, chartLabels, capBars, sort, sortBlock, blockKind, leftBlockKind; dazu
`numbers.decimals` und `numbers.pctDecimals` des Templates und bei 12G und 12H `titleBlock.headline: true`.
Ab P&L 1.7 gehört `statement.stockMode` dazu: T05A schreibt `allStock`, T05B `auto` (die GuV-Templates lassen es
weg). `templateSwitches()` liefert es als `stmt`, der Katalog als Objekt `statement`.
Templates wirken nur in der Ansicht Tabelle (Standard, kein `state.uiState` gesetzt).
Ab P&L 1.8 gehören `columns.structureTotal` (Gesamtzeile über mehrere Wurzeln) und `columns.keepBlockOrder`
(Blöcke bleiben in Kategoriereihenfolge) zu den Schaltern; alle P&L-Seiten setzen sie wie der Katalog.

**Ansichtsvorlage 11A (ROI-Baum).** Kein Mega-Template: kein `columns.template`, stattdessen die Kartenschalter
`treeCard: months`, `treeStatus: false`, `treeLevel: 0`, `treeAllLabels: true` und die Ansicht in
`state.uiState` (`{"view":"tree","treeV":2}`), so wie der Katalog sie liefert. Der Test erkennt die Seite über
`page.template`.

**Punkt-Schlüssel (ChartKitchen 1.57).** C18 und C24 setzen `scale.refLine` bzw. `scale.xRefLine`; die Spec legt sie
unter `objects.scale` ab, nicht unter `chart` (ebenso die frei gewählten Quotenstrahlen von C23).

Der Test prüft beides gegen eine Kopie der Preset-Tabellen und alle Objekte gegen die `capabilities.json` der Visuals.

## Vergleichszeitraum

Ist gibt es bis August 2026, Plan und Forecast für das ganze Jahr. Damit keine Abweichung lügt:

| Seitentyp | Lösung |
| --- | --- |
| ChartKitchen Zeitverlauf (C01, C03, C05, C08, C13) | Monate Jan bis Dez, AC endet im August, ab September Forecast schraffiert (Rolle `forecast`). Abweichung je Monat ist periodengleich |
| ChartKitchen Struktur, Korrelation, Brücken (C02, C04, C06, C09, C10, C12) | Kachelfilter `'Kalender'[Ist] = TRUE`: nur Ist-Monate, PY und PL über denselben Zeitraum |
| Kontextkarten (alle Seiten) | Measures `… PY bis Ist`, `… PL bis Ist` |
| P&L Struktur mit AC als Minuend (T01A, T01B, T02A, T02B, T02C) | Rolle `period` = `'Kalender'[Periode]`: das Visual rechnet YTD bis zum letzten Monat mit AC (`mtdIndex`/`ytdRawSum`), „Monat“ ist August, zwei Blöcke Monat \| YTD |
| P&L GuV mit AC als Minuend (T03A, T04A, T04B, T04C, 12A) | **ohne** `period`, dafür `GuV PY bis Ist` und `GuV PL bis Ist`: ein YTD-Block, wie im Preset. Grund damals: Summen, Formeln und KPIs brauchen ADDMISSINGITEMS; mit Periode füllte es Konto × Periode auf, in DAX auch mit den leeren Perioden 2025 (Filter stand nur in SUMMARIZECOLUMNS), und Mini-DAX konnte es nur über eine Tabelle. Seit 29.10.2026 steht ADDMISSINGITEMS mit Filtern in CALCULATETABLE (aufgefüllt wird nur innerhalb der Filter) und Mini-DAX füllt über mehrere Tabellen auf; die GuV-Seiten bleiben wie abgenommen |
| P&L Bestände (T05A Bilanz, T05B Cashflow) | **mit** `period`: das Visual wählt den Stand am Stichtag aus den Monatswerten (Token `stock` im Zeilentyp, Anfangsbestand `opening`), PY am selben Stichtag ein Jahr früher; mit `showItemsWithNoData` für Eigenkapitalquote und Endbestand (Formel ohne Fakten). Normale Measures (`Bilanz PY`, `Cashflow PY`), das Visual rechnet periodengleich bis August |
| 12G | ohne `period`; FY-Block aus `GuV FC FY` (AC&FC), PY = ganzes Vorjahr (`GuV PY`), YTD-Anteil = AC Jan bis Aug |
| ChartKitchen ab 1.57: Zeitverlauf (C07, C19, C21, C22, C20) | Monate Jan bis Dez mit `forecast` wie C03; C23 (Pfad) mit Ist-Filter, nur Ist-Monate |
| ChartKitchen ab 1.57: Struktur, Rangfolgen, Korrelation, Brücken (C14 bis C18, C24, C25) | Kachelfilter `'Kalender'[Ist] = TRUE`; C18 bindet Δ-Measures mit „bis Ist“ |
| P&L ab 1.8 (T01C, T02D) | mit `period` wie T01A |
| T01D | **ohne** `period` (Gesamtjahr), wie T02E/T02F: mit Periode wäre der Monatsblock August, dort ist FC = AC, und der YTD-Block reines Ist. Die Seitenbeschreibung nennt den Grund |
| 11A | Periode = `'Rendite'[Jahr]` (2024 bis 2026, keine Beziehung zum Kalender): kein Slicer wirkt, auch das Jahr nicht |
| P&L mit FC oder PL als Minuend (T02E, T02F, T03B, T04D, T04E, 12H) | **ohne** `period`: ein Block über das Gesamtjahr. Mit Periode wäre der FC im YTD-Fenster gleich dem AC (FC = AC in Ist-Monaten) und das Template zeigte nichts. Ohne Periode fällt der zweite Block still weg (`megaKeys`), der einzelne YTD-Block trägt keinen Titel; `periodLine` sagt „Gesamtjahr“ |

Jahr-Slicer ist Einfachauswahl (Standard 2026): FY-Measures (AVERAGEX über Perioden) und YTD gelten für ein Jahr.

**Tabellen ohne Beziehung zu Kunde und Produkt.** 'Liquiditaet' (C20) und 'Markt' (C24) hängen nur am Kalender: dort
wirkt nur der Jahr-Slicer, Region, Kanal und Sorte nicht. 'Rendite' (11A) hängt an keinem Slicer. Die drei
Seitenbeschreibungen sagen es; Mini-DAX und DAX lassen Filter ohne Pfad zur Faktentabelle weg.

## Je Template

| Seite | Hauptkachel | Was gesetzt werden musste, Auffälligkeiten |
| --- | --- | --- |
| C01 Gestapelte Säulen | Monat × Absatz hl AC, Serie Sorte | Rolle `series`. Monate ohne AC (Sep bis Dez) entfallen, 8 Säulen |
| C02 Gestapelte Balken | Region × Umsatz AC, Serie Kanal, Ist-Filter | Rolle `series`. Jede Region hat nur wenige Kunden, manche Kanal-Stapel fehlen je Region |
| C03 Säulen + Varianzen (PY) | Monat × Umsatz AC/PY/FC | `forecast` gebunden, damit Sep bis Dez schraffiert erscheint |
| C04 Balken + Varianzen (PL) | Bier × Umsatz AC/PL, Ist-Filter | Plan nur über Ist-Monate |
| C05 Integrierte Brücke | Monat × Umsatz AC/PY/FC | Endsäule AC+FC braucht `forecast` |
| C06 Kategorie-Brücke vertikal | Region × Umsatz AC/PY, Ist-Filter | `bridgeOrientation: columns` kommt aus dem Preset |
| C08 Linie | Monat × Absatz hl AC/PY/PL/FC | Mit Jahr-Einfachauswahl nur 12 Punkte; das Modell hat keine Woche. 24 Monate gingen nur ohne Jahr-Slicer auf dieser Seite (Rahmen kennt keine Ausnahme je Seite), die Einfachauswahl braucht der Rest (FY, YTD) |
| C09 Scatter | Kunde: y DB-Marge % AC (+PY), x Absatz hl AC (+PY), Ist-Filter | Rollen `xValue`, `xPrevious` (Bewegungspfeile). Nur 12 Kunden. DB-Marge ist ein Anteil: Kachelfeld `formats` `0.0 %` für die App (Rahmen reicht es durch), Power BI nimmt den Formatstring des Modells |
| C10 Bubble | Bier: y DB-Marge %, x Absatz hl, Größe Umsatz, Ist-Filter | Rolle `bubbleSize`; `scatterSizeLegend` aus dem Preset; `formats` wie C09 |
| C12 Waterfall / Brücke | GuV-Block (`'Konto'[L1]`) × GuV ± AC/PY, Ist-Filter: EBIT PY → Beitrag je Block → EBIT AC | Bewusst **ohne** Rolle `rowType` (`'Konto'[Brückentyp]`): im rowType-Modus zeichnet das Visual nur Anker für `sum`-Zeilen mit Wert (`buildWaterfall`), Formelzeilen (EBIT) haben keine Faktenzeilen, die Brücke endete ohne EBIT-Säule (eine Endsumme rechnet das Visual in diesem Modus nicht, anders als CONTRACT.md annimmt). Mit gebundenem PY baut es die Brücke Basis → AC mit Anker vorn und hinten |
| C13 Small Multiples | Monat × Umsatz AC/PY/FC, je Kanal eine Kachel | C13 setzt nur `multiplesTotal` und `multiplesSameScale` und behält den Chart-Typ, deshalb `orientation: columns`, `comparisonMode: py` und Varianz-Schalter explizit |
| T01A | Region (flach) × Umsatz AC/PY/PL, Periode | Schwellen aus dem Preset mit Standardwerten (−20 / −10 %, YTD −220) in Tsd. EUR |
| T01B | Land → Region | Zwischensummen-Blöcke je Land; Slowakei und Polen haben je eine Region gleichen Namens (Pfad endet dort) |
| T02A | Land → Region × DB AC/PL, Periode | |
| T02B | Kunde (flach) × Umsatz AC/PL, Periode | Sortierung AC absteigend im YTD-Block |
| T02C | Bier (flach) × Absatz hl AC/PL, Periode | `numbers.unitText: hl`, `scaling: none`; Sortierung nach ΔPL im Monatsblock |
| T02E | Land → Region × Umsatz FC/PY (+AC), ohne Periode | Gesamtjahr, siehe Vergleichszeitraum |
| T02F | Kanal → Kunde × Umsatz FC/PL (+AC), ohne Periode | Gesamtjahr |
| T03A | GuV, AC, PY und PL bis Ist | GuV-Rollen wie `specs/guv.json` (Ebenen L1, L2 + Konto-Rollen), `showItemsWithNoData` für Summen, Formeln, KPIs |
| T03B | GuV, FC/PY/PL (+AC), ohne Periode | Gesamtjahr |
| T04A | GuV, AC, PL bis Ist | |
| T04B | GuV, AC, PL bis Ist | Preset hat 2 Dezimalen: Skalierung Mio. EUR |
| T04C | GuV, AC, PY bis Ist | Mio. EUR |
| T04D | GuV, FC/PL (+AC), ohne Periode | Mio. EUR, Gesamtjahr |
| T04E | GuV, FC/PY (+AC), ohne Periode | Mio. EUR, Gesamtjahr |
| 12A | GuV, AC, PY bis Ist | 0 Dezimalen, Tsd. EUR |
| 12G | GuV, AC/PY/PL/FC + FC FY, PL FY, ohne Periode | Block FY braucht `fcFy`; Headline an |
| 12H | GuV, PL/PY (+AC), ohne Periode | Minuend PL, Planrechnung Gesamtjahr; Headline an |
| T05A | Bilanz ('Bilanzkonto', 'Bilanz'), AC und PY, Periode | `statement.stockMode: allStock` wie das Template (die Daten tragen trotzdem die Token, „Auto“ ergäbe dasselbe); `columns.pctRevenue: false`; `showPctRows` bleibt an, es betrifft nur die KPI-Zeile Eigenkapitalquote (Δ in Prozentpunkten). Mio. EUR mit 2 Dezimalen. Karten: drei Positionen am Stichtag (`Bilanz Stichtag AC/PY`, Kachelfilter auf KontoID: Sachanlagen, Kasse und Bank, Eigenkapital). Verbindlichkeiten bewusst nicht: die Karten kennen keine umgekehrte Polarität und färbten einen Anstieg günstig |
| C07 Gestapelte Fläche | Monat × Absatz hl AC/FC, Serie Sorte | Rolle `series`; Sorten als Fläche mit Summenlinie und Namen am Ende, ab September schraffiert |
| C14 Balkentabelle nach ΔPL | Bier × Umsatz AC/PL, Ist-Filter | Gruppe „ChartKitchen · Rangfolgen“ (neu, wie im Katalog) |
| C15 Balkentabelle nach ΔPL % | Kunde × Umsatz AC/PL, Ist-Filter | |
| C16 Balkentabelle nach AC | Kunde × DB AC/PL, Ist-Filter | Karten: Deckungsbeitrag je Sorte |
| C17 Kategorie-Brücke waagerecht | Kunde × Umsatz AC/PY, Ist-Filter | In die Gruppe Brücken neben C06 gestellt (Katalog: Struktur). Trennlinie alle vier Kunden aus dem Preset |
| C18 Abweichungs-Scatter | Kunde: y `Umsatz ΔPL %`, x `Umsatz ΔPY %`, Farbe Kanal, Größe Umsatz AC, Ist-Filter | `scale.refLine`/`xRefLine` = 0 (Achsenkreuz); `formats` `0.0 %` für die App. `tile add` schlägt aus dem Stamm „Umsatz“ `Umsatz AC` vor; die Δ-Measures nennt man mit `--actual`/`--xValue` |
| C19 Säulen gegen Plan + Jahressäule | Monat × Umsatz AC/PL/FC | `yearColumnLabel: "2026"`; Jahressäule auf eigener Skala (Faktor 0,1), Jahres-Δ mit dem Faktor der Säule. Keine Serie, kein `rowType` |
| C20 Bestand und Fluss | Monat × 'Liquiditaet' AC/FC, Serie Art, Zeilentyp `'Liquiditaetsart'[Fluss]` | Token `stock`/`inflow`/`outflow`, Operativer Cashflow ohne Token (Vorzeichen entscheidet, erscheint deshalb in der Legende oben und unten); `highlight: "Jun"` mit Ellipse. Karten: vier Zahlungsarten Jan bis Aug gegen PY (Kachelfilter ArtID und Ist). `tile add` rät den Zeilentyp nicht (`--rowType` nötig) |
| C21 Kumulierte Linie mit R12 | Monat × Umsatz AC/PL/FC/PY | PY liefert die gleitende Jahressumme (12 Perioden mit PY); Abstandsmarker im August und am Jahresende |
| C22 Serienlinien mit Index | Monat × Absatz hl AC/FC, Serie Sorte | Nur 12 Monate (Jahr-Slicer), die Saison prägt die Linien |
| C23 Scatter-Zeitpfad | Monat × Umsatz AC (y) / Absatz hl AC (x), Serie Kanal, Ist-Filter | Frei gesetzt `scale.ratioRays: "80;100;120"`, `ratioRayUnit: "EUR/hl"` |
| C24 Blasen mit Anteil | Segment ('Marktsegment', Land und Sorte): y Marktwachstum %, x Relativer Marktanteil, Größe Marktvolumen hl, Anteil Eigenabsatz hl, Farbe Sorte, Ist-Filter | Eine Fläche mit 16 Blasen und Gesamtblase (Blatt 10E). Die Variante je Land (10G) bräuchte `multiples`; die Rolle steht für C24 nicht im Katalog, `tile add` lehnt sie ab. `scale.xRefLine` = 1. Karten: Eigenabsatz je Land, ein Klick zeigt ein Land |
| C25 Marimekko | Kanal × Umsatz AC, Serie Sorte, Ist-Filter | Dicke = Umsatz, Summen- und Anteilsspalte, Σ-Zeile |
| T01C | Kanal → Kunde × Umsatz AC/PY/PL, Periode | Kanal statt Land, weil nur Kanäle mehrzeilige Blöcke haben (`keepBlockOrder` wirkt erst dann) |
| T01D | Land → Kunde × Umsatz FC/PY/PL (+AC), ohne Periode | Gesamtjahr (siehe Vergleichszeitraum); Blöcke alphabetisch, weil 'Kunde'[Land] keine Sortierspalte hat |
| T02D | Sorte → Bier × Umsatz AC/PL, Periode | Sortierung nach ΔPL % im YTD-Block, Blöcke in Sortenreihenfolge |
| 11A ROI-Baum | 'Renditekonto' (L1, L2, Konto-Rollen) × 'Rendite' AC/FC/PL, Periode Jahr | Ohne PY (sonst Referenz PY). Baum zeigt AC 2024 und 2025, 2026 als FC schraffiert gegen PL. Karten: EBIT je Jahr (Kachelfilter KontoID R-EBIT), AC&FC gegen PY |
| T05B | Cashflow ('Cashflowkonto', 'Cashflow'), AC und PY, Periode | `statement.stockMode: auto`: Anfangsbestand `Account opening`, Endbestand `Formula stock`, Flüsse ohne Token. Zwei Blöcke August \| Jan..Aug, Kaskaden PY und AC. Karten: die drei Cashflow-Bereiche Jan bis Aug gegen `Cashflow PY bis Ist` |

Jede Seite hat oben eine Kontextkachel (ChartKitchen-KPI-Karten je Kanal oder Sorte, Ist gegen PY und PL bis Ist;
bei Bilanz und Cashflow Bilanzpositionen bzw. Cashflow-Bereiche gegen PY).
Ein Klick auf eine Karte filtert die Hauptkachel (Test: Querfilter je Kanal, Summe der Kanäle = Ganzes).

## Prüfung (19.10.2026)

- `node app/test/showcase-spec.mjs`: 17/17 grün. Aufbau und Layout, Preset-Schalter, Objekte gegen
  `capabilities.json` (Kitchen-Repo), alle Felder, Sortierungen, Filter und Slicer gegen das TMDL, jede Kachel per
  Mini-DAX (Zeilen, DataView, Grenzen), Summen gegen `examples/showcase/data/control.json` bzw. die Rohdaten, Querfilter.
  Nur Jahr 2026: der Testdatensatz hat Fakten nur für 2026.
- `dwg app page --model "showcase/ZlatyLev Showcase.SemanticModel"` in eine Wegwerf-App: ohne Feldfehler.
- `dwg pbip new/register/pages` + `dwg validate` in einen Wegwerf-Ordner: 28 Seiten, schemagültig, keine Hinweise.
- 29.10.2026 (T05A, T05B): `showcase-spec.mjs` 18/18 (mit `DWG_KITCHEN`), `npm run test:showcase` 31/31 Seiten ohne
  Befund, Parität App und PBIP ohne Befund, `dwg validate` 30 Seiten, `te validate` ohne Fehler. Im Browser:
  Doppelstrich unter Aktiva und Passiva, Stand August statt Summe, Eigenkapitalquote in Prozentpunkten; Cashflow als
  Kaskade vom Anfangs- zum Endbestand, im YTD-Block Anfangsbestand 1. Januar.
- **Nicht geprüft:** Darstellung im Browser (die Mini-DAX-Prüfung rechnet keine Visuals) und Power BI Desktop.
  Ob jedes Template sichtbar so aussieht wie in der Doku, zeigt erst der Browser-Test der Rahmen-Session bzw.
  das Öffnen in Desktop. Kritisch dafür: GuV im Ebenen-Modus mit leerem L1 bei Summenzeilen (wie im Kitchen-Modell,
  dort erprobt), Scatter mit 12 bzw. 11 Punkten, `formats` für die Marge in der App.

- 23.11.2026 (47 Seiten, ChartKitchen 1.57, P&L 1.8.3): `showcase-spec.mjs` 19/19 (mit `DWG_KITCHEN` auf den
  Release-Stand), `templates/test/unit.mjs` 27/27, `dwg check` 47 Seiten, 94 Kacheln, 0 Probleme, `dwg lint` ohne
  Fehler und Rasterbefunde, `dwg app page --model` in eine Wegwerf-App ohne Fehler, `dwg pbip pages` in den
  Beispielbericht und `dwg validate` 47 Seiten schemagültig, `npm run test:showcase` 48/48 ohne Befund. Nicht im
  Dienst und nicht in Power BI Desktop geprüft; die sechs neuen Tabellen liegen noch nicht im Lakehouse.

## Befunde

1. **Kostenzeilen grün bei Überschreitung (Datenkonvention, nicht das Visual), behoben.** `gen_showcase.py` setzte
   `VarianceInvert = true` für alle Zeilen mit `SignConvention = -1`, wie `dim-konten` im Kitchen-Demo-Modell. Das
   Visual bewertet die Abweichung auf dem gerechneten Wert (roh × Vorzeichen, `engine.ts` `varianceOf`), ein Plus ist
   günstig; `VarianceInvert` drehte das ein zweites Mal. Die Daten-Session hat es am 19.10.2026 auf `false` gestellt
   (Service, TMDL, Fixtures), der Test wacht darüber. Das Kitchen-Demo-Modell (GuV-App) hat den Fehler weiterhin.
2. **ChartKitchen-Karten:** Dezimalpunkt und -komma gemischt (bekannt), betrifft die
   Kontextkarten aller Seiten.
3. **Format-Slicer:** Der Vertrag hat keine Spalte Format/Gebinde; der Slicer fehlt.
4. **C08:** keine Wochen im Modell, die Linie hat 12 Punkte.
5. **Brückentyp:** `'Konto'[Brückentyp]` bleibt ungenutzt (siehe C12).
6. **ADDMISSINGITEMS und Filter (29.10.2026, behoben).** Die App setzte Filter nur in SUMMARIZECOLUMNS; ADDMISSINGITEMS
   füllte deshalb auch mit Elementen außerhalb der Filter auf (Perioden 2025 bei Jahr 2026, Konten außerhalb eines
   Kachelfilters, nach einem Klick alle übrigen Konten als leere Zeilen). `daxQuery` legt die Filter jetzt zusätzlich
   außen an (CALCULATETABLE), wie Power BI mit „Elemente ohne Daten anzeigen“. Aufgefallen bei T05A/T05B, die als
   erste Seiten Periode und „Elemente ohne Daten“ zusammen nutzen.
7. **T05A/T05B noch nicht im Dienst geprüft:** Die vier Tabellen fehlen im Lakehouse, bis sie jemand hochlädt
   (CONTRACT.md, Neuaufbau). Browser-Test und Paritätstest (App und PBIP) sind grün.
