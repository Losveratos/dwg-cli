# Datenvertrag Showcase · Modell „ZlatyLev Showcase“

Stand 23.10.2026, ergänzt am 29.10.2026 um Bilanz und Cashflow (P&L-Templates T05A und T05B ab P&L 1.7) und am
23.11.2026 um Liquidität, Markt und Rendite (ChartKitchen C18, C20, C24, P&L 11A).
Verbindlich für `specs/showcase.json` und die dwg-Tests.
Namen werden ab jetzt **nicht mehr umbenannt**, nur ergänzt. Alle Zahlen sind synthetisch (Namen aus dem
Brauerei-Case ZLATÝ LEV, Werte per Zufallsgenerator mit festem Seed, `examples/showcase/data/gen_showcase.py`). Kunden und Biere sind erfunden.

| | |
|---|---|
| Workspace | dein Fabric-Workspace |
| Lakehouse | `ZlatyLev_Showcase` mit SQL-Endpunkt, Tabellen kalender, produkt, kunde, konto, fakten, dazu seit 29.10.2026 bilanzkonto, bilanz, cashflowkonto, cashflow und seit 23.11.2026 liquiditaetsart, liquiditaet, marktsegment, markt, renditekonto, rendite (die sechs neuen **noch hochzuladen**, siehe Neuaufbau) |
| Semantikmodell | `ZlatyLev Showcase`, Direct Lake über den SQL-Endpunkt |
| TMDL im Repo | `examples/showcase/ZlatyLev Showcase.SemanticModel` (aus `examples/showcase/model/gen_model.py` + `model.csx`, siehe unten) |
| Mini-DAX-Testdaten | `app/test/datasets/showcase.mjs` (+ `showcase/`-JSON) |
| Währung, Einheit | EUR (ganze Euro), Absatz in Hektoliter (hl) |
| Zeitraum | Jan 2025 bis Dez 2026 · **Ist bis August 2026** · Plan und Forecast für beide Jahre ganz |

## Tabellen und Spalten

Schreibweise in DAX immer mit Hochkommas: `'Kalender'[Jahr]`, `'Fakten'[AC]`.

### 'Kalender' (Datumstabelle, eine Zeile je Monat, 24 Zeilen)

| Spalte | Typ | Inhalt |
|---|---|---|
| Datum | dateTime | Monatserster, Schlüssel, als Datumstabelle markiert |
| Jahr | int64 | 2025, 2026 |
| Monat | int64 | 1 bis 12 |
| Monatsname | string | Jan, Feb, Mär, Apr, Mai, Jun, Jul, Aug, Sep, Okt, Nov, Dez · sortiert nach [Monat] |
| Periode | string | „2026-01“ · Periodenspalte für das P&L-Visual, sortiert sich alphabetisch richtig |
| Quartal | string | Q1 bis Q4 |
| Jahr Quartal | string | „2026 Q1“ |
| Ist | boolean | TRUE bis zum letzten Ist-Monat (alle Monate 2025 und Jan bis Aug 2026), sonst FALSE |

### 'Produkt' (11 Biere)

| Spalte | Typ | Inhalt |
|---|---|---|
| ProduktID | string | P01 bis P11, Schlüssel |
| Produkt | string | z. B. „Zlatý Lev 12° Dvanáctka“, sortiert nach [Produkt Sort] |
| Produkt Sort | int64 | 1 bis 11 (ausgeblendet) |
| Sorte | string | Helles Lager, Dunkles Lager, Spezialität, Alkoholfrei · sortiert nach [Sorte Sort] |
| Sorte Sort | int64 | 1 bis 4 (ausgeblendet) |
| Alkohol % | double | z. B. 5.0 |

### 'Kunde' (12 Kunden)

| Spalte | Typ | Inhalt |
|---|---|---|
| KundeID | string | K01 bis K12, Schlüssel |
| Kunde | string | z. B. „Pivnice Na Rohu Group s.r.o.“ |
| Kanal | string | Handel, Großhandel, Gastronomie, Export · sortiert nach [Kanal Sort] |
| Kanal Sort | int64 | 1 bis 4 (ausgeblendet) |
| Region | string | Prag, Mittelböhmen, Mähren, Sachsen, Slowakei, Polen |
| Land | string | Tschechien, Deutschland, Slowakei, Polen |

### 'Konto' (GuV-Kontendimension wie `dim-konten` im Kitchen-Demo-Modell, 21 Zeilen)

| Spalte | Typ | Inhalt |
|---|---|---|
| KontoID | string | Schlüssel. Konten vierstellig („4000“), Summen `N-…`, Formeln `F-…`, KPIs `K-…` |
| ParentID | string | Elternknoten (Konto → Summe), sonst leer |
| Konto | string | Anzeigename. In [FormulaDef] wird über diesen Namen referenziert |
| L1 | string | Ebene 1: Name der Summe (bei Konten), eigener Name (bei Formel/KPI), leer bei Summen · sortiert nach [L1 Sort] |
| L1 Sort | int64 | [SortOrder] der zugehörigen Ebene 1 (ausgeblendet) |
| L2 | string | Ebene 2: Kontoname (nur Konten) · sortiert nach [SortOrder] |
| SortOrder | int64 | aufsteigend in GuV-Reihenfolge (10, 20, …) |
| RowType | string | Account, Subtotal, Formula, KPI |
| FormulaDef | string | z. B. `[Nettoumsatz] + [Wareneinsatz]`, `[Deckungsbeitrag] / [Nettoumsatz]` |
| SignConvention | int64 | 1 Erlös, −1 Aufwand und Erlösminderung (Werte liegen **positiv** in den Fakten) |
| DisplayInvert | string | „true“/„false“ wie im Kitchen-Modell |
| VarianceInvert | string | überall „false“: das P&L-Visual bewertet die Abweichung auf dem Wert mit Vorzeichen, Kosten (−1) werden dadurch schon richtig rot bei Anstieg. „true“ würde doppelt drehen (anders als im Kitchen-Modell) |
| Kommentar | string | Kurzkommentar für das P&L-Visual, meist leer |
| Bereich | string | Erlöse, Kosten (nur Konten), sonst leer |
| Brückentyp | string | sum oder delta, für eine GuV-Brücke über [L1] (Nettoumsatz = sum, Kostenblöcke = delta) |

Kontenplan (SortOrder · KontoID · Konto · RowType · Parent):

| Sort | KontoID | Konto | RowType | Parent | Sign |
|---|---|---|---|---|---|
| 10 | N-UMS | Nettoumsatz | Subtotal | | 1 |
| 11 | 4000 | Bruttoumsatz | Account | N-UMS | 1 |
| 12 | 4100 | Rabatte und Boni | Account | N-UMS | −1 |
| 13 | 4200 | Sonstige Erlöse | Account | N-UMS | 1 |
| 20 | N-WE | Wareneinsatz | Subtotal | | −1 |
| 21 | 5000 | Rohstoffe | Account | N-WE | −1 |
| 22 | 5100 | Verpackung und Gebinde | Account | N-WE | −1 |
| 23 | 5200 | Energie Produktion | Account | N-WE | −1 |
| 30 | F-DB | Deckungsbeitrag | Formula `[Nettoumsatz] + [Wareneinsatz]` | | 1 |
| 31 | K-DB | DB-Marge % | KPI `[Deckungsbeitrag] / [Nettoumsatz]` | | 1 |
| 40 | N-BK | Betriebskosten | Subtotal | | −1 |
| 41 | 6000 | Personal | Account | N-BK | −1 |
| 42 | 6100 | Marketing | Account | N-BK | −1 |
| 43 | 6200 | Logistik | Account | N-BK | −1 |
| 44 | 6300 | Sonstige Kosten | Account | N-BK | −1 |
| 50 | F-EBITDA | EBITDA | Formula `[Deckungsbeitrag] + [Betriebskosten]` | | 1 |
| 51 | K-EBITDA | EBITDA-Marge % | KPI `[EBITDA] / [Nettoumsatz]` | | 1 |
| 60 | N-AFA | Abschreibungen | Subtotal | | −1 |
| 61 | 7000 | Abschreibungen Sachanlagen | Account | N-AFA | −1 |
| 70 | F-EBIT | EBIT | Formula `[EBITDA] + [Abschreibungen]` | | 1 |
| 71 | K-EBIT | EBIT-Marge % | KPI `[EBIT] / [Nettoumsatz]` | | 1 |

Formeln addieren, weil Summen mit Vorzeichen gerechnet werden (wie im Kitchen-Modell).

### 'Fakten' (Körnung Monat × Konto × Kunde × Produkt, nur Konten mit RowType Account)

| Spalte | Typ | Inhalt |
|---|---|---|
| Datum | dateTime | Monatserster → 'Kalender'[Datum] |
| KontoID | string | → 'Konto'[KontoID] |
| KundeID | string | → 'Kunde'[KundeID] |
| ProduktID | string | → 'Produkt'[ProduktID] |
| AC | double | Ist, positiv. **Leer ab September 2026** |
| PY | double | Ist des Vorjahresmonats (2026: exakt AC 2025 derselben Zeile) |
| PL | double | Plan, alle Monate |
| FC | double | Forecast: in Ist-Monaten = AC, danach Hochrechnung |
| FC_FY | double | Forecast Gesamtjahr dieser Zeilenkombination (Konto, Kunde, Produkt, Jahr), in jedem Monat wiederholt |
| PL_FY | double | Plan Gesamtjahr, ebenso |
| Hektoliter AC | double | Absatz Ist (nur auf Konto 4000, sonst leer), leer ab September 2026 |
| Hektoliter PY | double | Absatz Vorjahr |
| Hektoliter PL | double | Absatz Plan |
| Hektoliter FC | double | Absatz Forecast |

Alle Wertspalten sind ausgeblendet. Jede Kombination Konto × Kunde × Produkt hat in allen 24 Monaten eine Zeile.

Beziehungen: alle n:1, einfach gerichtet, von 'Fakten' zu 'Kalender'[Datum], 'Konto'[KontoID], 'Kunde'[KundeID],
'Produkt'[ProduktID].

**Achtung P&L-Visual:** Summen-, Formel- und KPI-Konten haben **keine** Faktenzeilen (anders als im Kitchen-Modell).
Die Statement-Abfrage braucht deshalb ADDMISSINGITEMS über die Konto-Spalten (Mini-DAX kann das).

### Bilanz und Cashflow (seit 29.10.2026)

Bestände für die P&L-Templates T05A (Bilanz zum Stichtag) und T05B (Cashflow-Brücke), ab P&L Statement 1.7.
Eigene Konten- und Faktentabellen wie `demoData/bilanz-*` und `demoData/cashflow-*` im Kitchen-Repo, nicht als
Erweiterung von 'Konto': die GuV-Kacheln binden 'Konto' ohne Filter und mit „Elemente ohne Daten anzeigen“, neue
Konten erschienen dort als leere Zeilen. Zwei getrennte Tabellenpaare statt einer gemeinsamen Bestandsdimension, damit
keine Kachel einen Filter „Bilanz oder Cashflow“ braucht und eine Faktzeile nie in die Leerzeile einer fremden
Dimension fällt. Abgeleitet aus der GuV (Jahresüberschuss = EBIT der Fakten minus 4 % Zinsen p. a. auf die
Bankverbindlichkeiten minus 25 % Steuer, Abschreibungen = Konto 7000), Working Capital aus Umsatz und Wareneinsatz
des Monats, eigener Zufallsstrom (Seed 1882, Strom 1702), die GuV-Zahlen bleiben unverändert.

**'Bilanzkonto'** (9 Zeilen) und **'Cashflowkonto'** (10 Zeilen), gleiche Spalten:

| Spalte | Typ | Inhalt |
|---|---|---|
| KontoID | string | Schlüssel. Bilanz `A-…` (Aktiva), `P-…` (Passiva), `K-EKQ`; Cashflow `CF-…` |
| Konto | string | Anzeigename, in [FormulaDef] referenziert |
| L1 | string | Ebene 1: Aktiva, Passiva bzw. Anfangsbestand Zahlungsmittel, Operativer Cashflow, Investiver Cashflow, Finanzierungs-Cashflow, Endbestand Zahlungsmittel; bei KPI, Anfangs- und Endbestand der eigene Name · sortiert nach [L1 Sort] |
| L1 Sort | int64 | Reihenfolge der Ebene 1 (ausgeblendet) |
| L2 | string | Ebene 2: Kontoname (nur Konten, nicht beim Anfangsbestand) · sortiert nach [SortOrder] |
| SortOrder | int64 | Reihenfolge |
| RowType | string | mit Token für das P&L-Visual: Bilanzkonten `Account stock`, Anfangsbestand `Account opening`, Flüsse `Account`, Endbestand `Formula stock`, Eigenkapitalquote `KPI` |
| FormulaDef | string | `[Eigenkapital] / [Passiva]` (K-EKQ), `[Anfangsbestand Zahlungsmittel] + [Operativer Cashflow] + [Investiver Cashflow] + [Finanzierungs-Cashflow]` (CF-END) |
| SignConvention | int64 | überall 1 |
| DisplayInvert | string | überall „false“ |
| VarianceInvert | string | „true“ bei Vorräten, Forderungen, Rückstellungen und Verbindlichkeiten (höher = ungünstig), sonst „false“ |
| Kommentar | string | Kurzkommentar, meist leer |

Kontenplan Bilanz: Aktiva = Sachanlagen (A-SACH), Vorräte (A-VORR), Forderungen LuL (A-FORD), Kasse und Bank
(A-KASSE); Passiva = Eigenkapital (P-EK), Rückstellungen (P-RUECK), Verbindlichkeiten Kreditinstitute (P-BANK),
Verbindlichkeiten LuL (P-VLL); dazu die KPI-Zeile Eigenkapitalquote (K-EKQ). Cashflow: Anfangsbestand Zahlungsmittel
(CF-ANF) · Operativer Cashflow = Jahresüberschuss (CF-JUE), Abschreibungen (CF-AFA), Veränderung Working Capital (CF-WC)
· Investiver Cashflow = Investitionen Sachanlagen (CF-INV), Anlagenabgänge (CF-ABG) · Finanzierungs-Cashflow =
Aufnahme Darlehen (CF-AUF), Tilgung Darlehen (CF-TIL), Dividende (CF-DIV) · Endbestand Zahlungsmittel (CF-END).

**'Bilanz'** und **'Cashflow'** (Körnung Monat × Konto, 2025 und 2026, nur Konten mit RowType `Account…`):

| Spalte | Typ | Inhalt |
|---|---|---|
| Datum | dateTime | Monatserster → 'Kalender'[Datum] (der Wert gilt für das Monatsende) |
| KontoID | string | → 'Bilanzkonto'[KontoID] bzw. 'Cashflowkonto'[KontoID] |
| AC | double | Bilanz: Stand am Monatsende; Cashflow: Fluss des Monats mit Vorzeichen (Auszahlungen negativ), Anfangsbestand = Stand am Monatsbeginn. **Leer ab September 2026** |
| PY | double | derselbe Wert ein Jahr früher (2026 = AC 2025, 2025 aus dem Ist 2024) |
| PL | double | Plan, alle Monate, ab dem Ist-Stand Dezember des Vorjahres |
| FC | double | in Ist-Monaten = AC, danach Hochrechnung ab dem Stand August 2026 |
| Stichtag | boolean | nur 'Bilanz': WAHR im letzten Ist-Monat jedes Jahres (Dezember 2025, August 2026) |

Alle Spalten der Faktentabellen sind ausgeblendet. Bilanz 192 Zeilen (8 Konten × 24 Monate), Cashflow 216 (9 × 24);
Eigenkapitalquote und Endbestand haben keine Faktenzeilen (ADDMISSINGITEMS wie die GuV-Formeln).
Beziehungen: 'Bilanz' und 'Cashflow' n:1 zu 'Kalender'[Datum] und zu ihrer Kontentabelle, einfach gerichtet.

Fachlich geprüft (Generator und `app/test/showcase-data.mjs`): Aktiva = Passiva in jedem Monat und Szenario;
Endbestand = Anfangsbestand + operativ + investiv + finanziell; Endbestand eines Monats = Anfangsbestand des
Folgemonats; Kasse und Bank = Endbestand Zahlungsmittel; Abschreibungen = Konto 7000 der GuV.
Geschichten: Im Juni 2026 kommt die neue Abfüllanlage (3,2 Mio. EUR, Plan 2,8 Mio. EUR), finanziert mit einem
Darlehen über 3,0 Mio. EUR; die Dividende im Mai 2026 fällt mit 0,3 Mio. EUR niedriger aus als geplant (0,5 Mio. EUR).

**Für das P&L-Visual:** Periode `'Kalender'[Periode]` binden. Das Visual wählt den Stand am Stichtag aus den
Monatswerten (Token `stock`/`opening`), ohne Periode bekäme es die Summe der Monate. „Elemente ohne Daten anzeigen“
für Formel und KPI; die App füllt dabei nur innerhalb der Filter auf (CALCULATETABLE um ADDMISSINGITEMS).

### Liquidität, Markt und Rendite (seit 23.11.2026)

Drei weitere Tabellenpaare für die Templates C20 (ChartKitchen, Bestand und Fluss), C24 (ChartKitchen, Blasen mit
Anteil) und 11A (P&L, ROI-Baum nach DuPont). Wie bei Bilanz und Cashflow eigene Tabellen statt Erweiterung von
'Konto' oder 'Fakten'. Alle Werte kommen aus `gen_showcase.py`; die bisherigen neun Tabellen bleiben byte-gleich.
Direct Lake kennt keine berechneten Spalten, deshalb stehen auch Token und Sortierspalten in den Parquet-Dateien.

**'Liquiditaetsart'** (5 Zeilen)

| Spalte | Typ | Inhalt |
|---|---|---|
| ArtID | string | Schlüssel: L-OP, L-INV, L-DAR, L-AUS, L-KASSE |
| Art | string | Operativer Cashflow, Investitionen, Darlehensaufnahme, Tilgung und Dividende, Kasse und Bank · sortiert nach [Art Sort] |
| Art Sort | int64 | 1 bis 5 (ausgeblendet) |
| Fluss | string | Zeilentyp-Token für ChartKitchen (Rolle `rowType`, Modus `stockflow`): leer bei Operativer Cashflow (Vorzeichen entscheidet), `outflow` bei Investitionen sowie Tilgung und Dividende, `inflow` bei Darlehensaufnahme, `stock` bei Kasse und Bank |

**'Liquiditaet'** (Körnung Monat × Art, 2025 und 2026, 120 Zeilen, alle Spalten ausgeblendet)

| Spalte | Typ | Inhalt |
|---|---|---|
| Datum | dateTime | Monatserster → 'Kalender'[Datum] |
| ArtID | string | → 'Liquiditaetsart'[ArtID] |
| AC, PY, PL, FC | double | Flüsse des Monats mit Vorzeichen (Auszahlungen negativ), Kasse und Bank als Stand am Monatsende. AC leer ab September 2026, PY = Ist des Vorjahresmonats, FC in Ist-Monaten = AC |

Herkunft: Operativer Cashflow = CF-JUE + CF-AFA + CF-WC, Investitionen = CF-INV + CF-ABG, Darlehensaufnahme = CF-AUF,
Tilgung und Dividende = CF-TIL + CF-DIV, Kasse und Bank = Bilanz A-KASSE. Jeder Monat hat in jedem Szenario eine
Bestandszeile, auch Monate ohne Darlehen (Wert 0). Geprüft: Kasse am Monatsende = Anfangsbestand des Monats plus
Summe der vier Flüsse = Kasse des Vormonats plus Flüsse; Abflüsse nie positiv, Zuflüsse nie negativ.
Einschränkung: Die Measures summieren, der Bestand stimmt deshalb nur in Monatskörnung. Eine Quartals- oder Jahresachse
bräuchte eine semi-additive Bestands-Measure (`LASTNONBLANKVALUE`), die die Mini-DAX nicht rechnet.

**'Marktsegment'** (16 Zeilen = 4 Länder × 4 Sorten)

| Spalte | Typ | Inhalt |
|---|---|---|
| SegmentID | string | Schlüssel S11 bis S44 (Land Sort, Sorte Sort) |
| Segment | string | „Tschechien · Helles Lager“ |
| Land | string | Tschechien, Deutschland, Slowakei, Polen · sortiert nach [Land Sort] |
| Land Sort | int64 | 1 bis 4 (ausgeblendet) |
| Sorte | string | Helles Lager, Dunkles Lager, Spezialität, Alkoholfrei · sortiert nach [Sorte Sort] |
| Sorte Sort | int64 | 1 bis 4 (ausgeblendet) |

**'Markt'** (Körnung Monat × Segment, 2025 und 2026, 384 Zeilen, alle Spalten ausgeblendet)

| Spalte | Typ | Inhalt |
|---|---|---|
| Datum | dateTime | Monatserster → 'Kalender'[Datum] |
| SegmentID | string | → 'Marktsegment'[SegmentID] |
| Eigenabsatz AC, Eigenabsatz PY | double | eigener Absatz in hl, Summe von 'Fakten'[Hektoliter AC] bzw. [Hektoliter PY] über Land des Kunden und Sorte des Produkts |
| Marktvolumen AC, Marktvolumen PY | double | Marktvolumen des Segments in hl |
| Wettbewerber AC, Wettbewerber PY | double | Absatz des größten Wettbewerbers in hl |

AC leer ab September 2026. Marktvolumen 2024 = Eigenabsatz 2024 geteilt durch einen Startanteil je Segment, danach
mit einem Marktwachstum je Segment und Jahr fortgeschrieben (Helles leicht fallend, Alkoholfrei kräftig wachsend),
eigener Zufallsstrom (Seed 1882, Strom 1703). Eigenanteil Jan bis Aug 2026 zwischen 6,5 % (Deutschland · Helles Lager)
und 54 % (Tschechien · Dunkles Lager); relativer Marktanteil über 1 nur in Tschechien · Dunkles Lager (2,58) und
Tschechien · Alkoholfrei (1,15). Keine Beziehung zu 'Kunde' und 'Produkt': es gibt dort keine eindeutige Land- oder
Sortendimension (Land und Sorte sind Spalten mit Wiederholungen), eine n:n-Beziehung wäre für die Seite unnötig. Die
Spaltennamen der Fakten tragen kein „hl“, weil die Measures so heißen (Spalte und Measure dürfen nicht gleich heißen).

**'Renditekonto'** (6 Zeilen, Spalten wie 'Bilanzkonto')

| KontoID | Konto | L1 Sort, SortOrder | RowType | FormulaDef | VarianceInvert |
|---|---|---|---|---|---|
| R-EBIT | EBIT | 10 | Account | | false |
| R-UMS | Nettoumsatz | 20 | Account | | false |
| R-KAP | Investiertes Kapital | 30 | Account stock | | true |
| R-UR | Umsatzrendite | 40 | KPI | `[EBIT] / [Nettoumsatz]` | false |
| R-KU | Kapitalumschlag | 50 | KPI factor | `[Nettoumsatz] / [Investiertes Kapital]` | false |
| R-ROI | ROI | 60 | KPI | `[Umsatzrendite] * [Kapitalumschlag]` | false |

L1 = Konto (flach, eine Ebene), L2 leer, SignConvention 1, DisplayInvert „false“. Das entspricht dem Datenvertrag 11A
im P&L-AGENT-GUIDE (Punkt 28): Return, Net sales, Invested capital mit Token `stock`, Kapitalumschlag als `KPI factor`.

**'Rendite'** (Körnung Jahr × Konto, nur die drei Account-Zeilen, 9 Zeilen)

| Spalte | Typ | Inhalt |
|---|---|---|
| Jahr | int64 | 2024, 2025, 2026: Periode für das P&L-Visual (vierstellige Jahre ab P&L 1.8). Sichtbar, **keine Beziehung zu 'Kalender'** |
| KontoID | string | → 'Renditekonto'[KontoID] |
| AC | double | Ist 2024 und 2025 (volle Jahre), leer 2026 |
| PY | double | Ist des Vorjahres (2025, 2026), leer 2024 |
| PL | double | nur 2026 |
| FC | double | 2024 und 2025 = AC, 2026 = Ist Jan bis Aug plus Forecast Sep bis Dez |

Werte aus den Monatsreihen, die der Generator schon rechnet (kein neuer Zufall): EBIT und Nettoumsatz als Jahressumme
der GuV (2024 aus den PY-Werten der 2025-Zeilen), Investiertes Kapital = Aktiva am Jahresende der Bilanz (Dezember
2024, Dezember 2025, FC und PL Dezember 2026). Damit passen EBIT 2025 (2.422.583), Umsatz 2025 (38.527.414),
Umsatz FC 2026 (40.167.091) und Umsatz PL 2026 (41.684.991) zu den übrigen Kontrollwerten. 2026 ist das
Forecast-Jahr: das P&L-Visual zeigt im Baum AC, wo ein Ist da ist, sonst FC (schraffiert), Plan als Referenz.

Warum ohne Kalender-Beziehung: Der globale Jahr-Slicer (Einfachauswahl 2026) würde den Baum sonst auf ein Jahr
schneiden, und eine Slicer-Ausnahme je Seite gibt es im Rahmen nicht. Folge: Region, Kanal und Sorte wirken auch nicht,
die Rendite gilt für das ganze Unternehmen (in der Seitenbeschreibung sagen).

**Beziehungen** (alle n:1, einfach gerichtet): 'Liquiditaet' zu 'Kalender'[Datum] und 'Liquiditaetsart'[ArtID],
'Markt' zu 'Kalender'[Datum] und 'Marktsegment'[SegmentID], 'Rendite' nur zu 'Renditekonto'[KontoID].

**Slicer der App und Tabellen ohne Beziehung.** Die App legt die Slicer (Jahr, Region, Kanal, Sorte) als
`TREATAS`-Filter in jede Kachelabfrage. In DAX wirkt ein Filter auf eine Tabelle ohne Pfad zur Faktentabelle der
Measures nicht, die Abfrage läuft trotzdem; die Mini-DAX macht es genauso (Filter auf nicht erreichbare Tabellen fallen
weg, `app/test/showcase-data.mjs` prüft es). Für die neuen Tabellen heißt das:

| Tabelle | Jahr | Region, Kanal | Sorte |
|---|---|---|---|
| Liquiditaet | filtert | wirkt nicht | wirkt nicht |
| Markt | filtert | wirkt nicht | wirkt nicht ('Marktsegment'[Sorte] ist eine eigene Spalte) |
| Rendite | wirkt nicht | wirkt nicht | wirkt nicht |

Gruppieren nach einer Spalte ohne Beziehung (etwa 'Kalender'[Monatsname] mit [Rendite AC]) ist in Power BI eine
Wiederholung desselben Werts je Zeile; die Mini-DAX wirft dafür einen Fehler, damit ein Test das nicht übersieht.
Der Kachelfilter `'Kalender'[Ist] = TRUE` wirkt auf Liquidität und Markt, nicht auf die Rendite.

## Measures (GuV in 'Fakten', Bilanz, Cashflow, Liquidität, Markt und Rendite in ihren Faktentabellen)

Anzeigeordner in Klammern. Formatstring Beträge `#,##0`, Abweichungen `+#,##0;-#,##0;0`, Prozent `0.0 %`.

**01 GuV (roh, für das P&L-Visual: positiv, Vorzeichen über SignConvention)**

| Measure | DAX |
|---|---|
| GuV AC | `SUM('Fakten'[AC])` |
| GuV PY | `SUM('Fakten'[PY])` |
| GuV PL | `SUM('Fakten'[PL])` |
| GuV FC | `SUM('Fakten'[FC])` |
| GuV FC FY | `AVERAGEX(VALUES('Kalender'[Periode]), CALCULATE(SUM('Fakten'[FC_FY])))` |
| GuV PL FY | `AVERAGEX(VALUES('Kalender'[Periode]), CALCULATE(SUM('Fakten'[PL_FY])))` |

FY-Skalar: In jedem Monat steht der Jahreswert jeder Kombination, die Summe je Monat ist also der Jahreswert der
Auswahl; AVERAGEX über die Monate macht ihn unabhängig davon, ob nach Monat gruppiert wird. (Ein MAX wie im
Kitchen-Modell ginge hier nicht, weil die Körnung feiner als Konto × Monat ist.) Sinnvoll nur mit **einem Jahr**
im Filter.

**02 GuV mit Vorzeichen (für Brücken: Erlös +, Aufwand −; Summe über alle Konten = EBIT)**

| Measure | DAX |
|---|---|
| GuV ± AC | `SUMX(VALUES('Konto'[SignConvention]), [GuV AC] * 'Konto'[SignConvention])` |
| GuV ± PY / GuV ± PL / GuV ± FC | ebenso mit [GuV PY] / [GuV PL] / [GuV FC] |

**03 Kennzahlen (positiv)**

| Measure | DAX |
|---|---|
| Umsatz AC / PY / PL / FC | `CALCULATE([GuV ± AC], 'Konto'[L1] = "Nettoumsatz")` (Nettoumsatz) |
| Wareneinsatz AC / PY / PL | `CALCULATE([GuV AC], 'Konto'[L1] = "Wareneinsatz")` |
| DB AC / PY / PL | `[Umsatz AC] - [Wareneinsatz AC]` (Deckungsbeitrag) |
| Kosten AC / PY / PL | `CALCULATE([GuV AC], 'Konto'[Bereich] = "Kosten")` (Wareneinsatz, Betriebskosten, Abschreibungen) |
| EBIT AC / PY / PL | `[GuV ± AC]` |
| Absatz hl AC / PY / PL / FC | `SUM('Fakten'[Hektoliter AC])` usw. |
| DB-Marge % AC / PY / PL | `DIVIDE([DB AC], [Umsatz AC])` |
| Erlös je hl AC / PY / PL | `DIVIDE([Umsatz AC], [Absatz hl AC])` (Format `#,##0.00`) |
| Umsatz FC FY / Umsatz PL FY | `CALCULATE(SUMX(VALUES('Konto'[SignConvention]), [GuV FC FY] * 'Konto'[SignConvention]), 'Konto'[L1] = "Nettoumsatz")`, FY-Skalar, ein Jahr im Filter |

**04 Bis Ist (Plan und Vorjahr nur über die Ist-Monate)**

Ist gibt es bis August 2026, Plan und Vorjahr für das ganze Jahr. Für faire Vergleiche ohne Monatsfilter:

| Measure | DAX |
|---|---|
| GuV PY bis Ist / GuV PL bis Ist | `CALCULATE([GuV PY], 'Kalender'[Ist] = TRUE())` |
| Umsatz PY bis Ist / Umsatz PL bis Ist | `CALCULATE([Umsatz PY], 'Kalender'[Ist] = TRUE())` |
| DB PY bis Ist / DB PL bis Ist | ebenso |
| EBIT PY bis Ist / EBIT PL bis Ist | ebenso |
| Kosten PY bis Ist / Kosten PL bis Ist | ebenso |
| Absatz hl PY bis Ist / Absatz hl PL bis Ist | ebenso |

Alternativ filtert die Seite auf `'Kalender'[Ist] = TRUE` (Filter-Panel), dann reichen die normalen Measures.
Monatsreihen (Jan bis Dez) nutzen die normalen Measures: AC endet im August, PL und FC laufen weiter.

**05 Bilanz (in 'Bilanz')**

| Measure | DAX |
|---|---|
| Bilanz AC / PY / PL / FC | `SUM('Bilanz'[AC])` usw.: Stand je Monat. Über mehrere Monate summiert, deshalb im P&L-Visual mit Periode |
| Bilanz Stichtag AC / PY / PL | `CALCULATE([Bilanz AC], 'Bilanz'[Stichtag] = TRUE())`: Stand im letzten Ist-Monat des Jahres, für Karten |

**06 Cashflow (in 'Cashflow')**

| Measure | DAX |
|---|---|
| Cashflow AC / PY / PL / FC | `SUM('Cashflow'[AC])` usw. |
| Cashflow PY bis Ist / Cashflow PL bis Ist | `CALCULATE([Cashflow PY], 'Kalender'[Ist] = TRUE())` |

**07 Abweichung % (in 'Fakten', seit 23.11.2026, für C18)**

| Measure | DAX | Format |
|---|---|---|
| Umsatz ΔPY % | `DIVIDE ( [Umsatz AC] - [Umsatz PY bis Ist], [Umsatz PY bis Ist] )` | `+0.0 %;-0.0 %;0.0 %` |
| Umsatz ΔPL % | `DIVIDE ( [Umsatz AC] - [Umsatz PL bis Ist], [Umsatz PL bis Ist] )` | `+0.0 %;-0.0 %;0.0 %` |

Vorjahr und Plan nur über die Ist-Monate, damit die Kachel auch ohne Ist-Filter fair ist. Gesamt 2026: +4,4 % zum
Vorjahr, −3,9 % zum Plan.

**08 Liquidität (in 'Liquiditaet', für C20)**

| Measure | DAX |
|---|---|
| Liquidität AC / PY / PL / FC | `SUM ( 'Liquiditaet'[AC] )` usw., Format `#,##0` |

**09 Markt (in 'Markt', für C24)**

| Measure | DAX | Format |
|---|---|---|
| Marktvolumen hl AC / PY | `SUM ( 'Markt'[Marktvolumen AC] )` usw. (Blasengröße) | `#,##0.0` |
| Marktvolumen hl PY bis Ist | `CALCULATE ( [Marktvolumen hl PY], 'Kalender'[Ist] = TRUE () )` | `#,##0.0` |
| Eigenabsatz hl AC / PY | `SUM ( 'Markt'[Eigenabsatz AC] )` usw. (Kreissegment, Rolle `bubbleShare`) | `#,##0.0` |
| Wettbewerber hl AC / PY | `SUM ( 'Markt'[Wettbewerber AC] )` usw. (größter Wettbewerber) | `#,##0.0` |
| Marktwachstum % | `DIVIDE ( [Marktvolumen hl AC] - [Marktvolumen hl PY bis Ist], [Marktvolumen hl PY bis Ist] )` | `+0.0 %;-0.0 %;0.0 %` |
| Marktanteil % | `DIVIDE ( [Eigenabsatz hl AC], [Marktvolumen hl AC] )` | `0.0 %` |
| Relativer Marktanteil | `DIVIDE ( [Eigenabsatz hl AC], [Wettbewerber hl AC] )` (über 1 = Marktführer) | `0.00` |

**10 Rendite (in 'Rendite', für 11A)**

| Measure | DAX |
|---|---|
| Rendite AC / PY / PL / FC | `SUM ( 'Rendite'[AC] )` usw., Format `#,##0` |

Bindung 11A: `levels` = 'Renditekonto'[L1] (oder `account` = [KontoID], `accountName` = [Konto]), `sortOrder` =
[SortOrder], `rowType` = [RowType], `formulaDef` = [FormulaDef], `signConvention`, `displayInvert`, `varianceInvert`,
`ac` = [Rendite AC], `fc` = [Rendite FC], `pl` = [Rendite PL], `period` = 'Rendite'[Jahr]; „Elemente ohne Daten
anzeigen“ für die KPI-Zeilen.

Zusammen 83 Measures (52 in 'Fakten', 13 Bilanz und Cashflow, 4 Liquidität, 10 Markt, 4 Rendite). Die LineageTags der Measures sind seit 29.10.2026 fest
(UUID v5 aus Tabelle und Name, `model.csx`), ein Neuaufbau ergibt keinen Git-Diff mehr.

## Hinweise für die Templates (Abgleich mit der Wunschliste der Templates-Session)

- **Vorzeichen-Trio:** Konten mit Aufwand haben `SignConvention -1 · DisplayInvert true · VarianceInvert false`.
  Rabatte (4100) `-1 · false · false`, Erlöse `1 · false · false`. VarianceInvert ist überall „false“ (geändert am 19.10.2026).
- **Brücke C12:** über 'Konto'[L1] mit Rolle rowType = 'Konto'[Brückentyp] (Nettoumsatz „sum“, Kostenblöcke „delta“)
  und [GuV ± AC] (Kosten negativ). Formelzeilen haben keine Fakten, die Endsumme (EBIT) muss das Visual rechnen.
- **Ebenen für Zwischensummen-Blöcke:** 'Kunde'[Land] > [Region] > [Kunde], 'Kunde'[Kanal] > [Kunde], 'Produkt'[Sorte] > [Produkt].
- **Nicht im Modell:** Kalenderwoche (Körnung Monat; für C08 die 24 Monate nehmen), Gebinde/Format.
- **FC:** in Ist-Monaten gleich AC, danach Forecast. PL bis zum letzten Ist-Monat: Measures „… bis Ist“.

## Geschichten in den Daten (Jan bis Aug 2026)

| Geschichte | Wo sichtbar | Umsatz AC | Umsatz PL | Umsatz PY |
|---|---|---:|---:|---:|
| Polen (Sklepik Osiedlowy, Export) wächst weit über Plan | 'Kunde'[Region] = "Polen" | 1.592.019 | 1.343.114 | 1.177.685 |
| Praha Premium 13° bricht ab April ein (Auslistung bei Trh Plus und HyperMax) | 'Produkt'[Produkt] | 3.120.117 | 4.272.360 | 4.077.418 |
| Logistik über Plan (Diesel, Maut), Kommentar am Konto 6200 | 'Konto'[Konto] = "Logistik", Kosten AC 2.624.524 gegen PL 2.202.956 | | | |

Dazu: Smíchov Hazy IPA wird im April 2025 eingeführt (PY bis März 2026 klein, 2025 bis März null), Alkoholfrei
wächst, Marketing im Mai und Juni 2026 über Plan (Sommerkampagne), Handel 2026 mit höheren Rabatten.
Gesamtbild: Umsatz +4,4 % zum Vorjahr, −3,9 % zum Plan, EBIT deutlich unter Plan.

## Kontrollwerte

Aus dem Generator (`examples/showcase/data/control.json`), alle Kunden, Produkte und Konten. „bis Ist“ = Jan bis Aug.

| Wert | 2026 | 2025 |
|---|---:|---:|
| Faktzeilen | 14.124 | 14.124 |
| GuV AC (roh, Jan bis Aug) | 58.417.579 | |
| GuV PY (ganzes Jahr) | 80.712.013 | |
| GuV PL (ganzes Jahr) = GuV PL FY | 87.158.043 | |
| GuV FC (ganzes Jahr) = GuV FC FY | 85.431.330 | |
| Umsatz AC | 27.527.603 | 38.527.414 |
| Umsatz PY bis Ist | 26.356.201 | |
| Umsatz PL bis Ist | 28.640.106 | |
| Umsatz PL (ganzes Jahr) | 41.684.991 | 38.862.885 |
| Umsatz FC (ganzes Jahr) | 40.167.091 | |
| Wareneinsatz AC | 13.026.379 | |
| DB AC | 14.501.224 | |
| DB-Marge % AC | 52,68 % | |
| Kosten AC | 26.212.364 | |
| EBIT AC | 1.315.239 | 2.422.583 |
| EBIT PL bis Ist | 2.507.660 | |
| Absatz hl AC | 279.545,3 | 399.360,7 |
| Absatz hl PL bis Ist | 288.695,4 | |

Bestätigt am 19.10.2026 per DAX gegen das Modell im Service: alle 30 Werte dieser Tabelle und der Geschichten
stimmen (`python examples/showcase/model/check.py`). Die Mini-DAX trifft dieselben Werte (`node app/test/showcase-data.mjs` in `dwg/`).

**Bilanz und Cashflow 2026** (`control.json`, Schlüssel „Bilanz und Cashflow 2026“; Stichtag 31.08.2026, Cashflow Jan
bis Aug). Mini-DAX bestätigt; im Service erst nach dem Upload der vier Tabellen (`check.py` prüft sie mit).

| Wert | AC | PY |
|---|---:|---:|
| Bilanzsumme (Aktiva = Passiva) | 39.993.754 | 36.847.730 |
| Bilanzsumme PL | 40.801.910 | |
| Eigenkapital | 24.498.007 | 23.622.741 |
| Eigenkapitalquote | 61,3 % | |
| Sachanlagen | 29.467.439 | |
| Verbindlichkeiten Kreditinstitute | 12.080.000 | |
| Anfangsbestand Zahlungsmittel (1.1.) | 4.326.188 | 3.983.655 |
| Operativer Cashflow | 1.419.128 | 1.370.549 |
| Investiver Cashflow | −4.193.822 | −870.644 |
| Finanzierungs-Cashflow | 2.220.000 | −880.000 |
| Endbestand = Kasse und Bank | 3.771.494 | 3.603.560 |
| Jahresüberschuss | 784.426 | |
| Abschreibungen (= Konto 7000) | 2.016.011 | |
| Endbestand FC Dezember 2026 | 5.480.869 | |

**Liquidität, Markt und Rendite** (`control.json`, Schlüssel „Liquidität 2026“, „Markt 2026“, „Rendite“). Mini-DAX
bestätigt (`app/test/showcase-data.mjs`), im Service noch nicht (`check.py` prüft sie nach dem Upload mit).

| Wert | Betrag |
|---|---:|
| Kasse und Bank AC August 2026 (= Bilanz A-KASSE) | 3.771.494 |
| Kasse und Bank FC Dezember 2026 | 5.480.869 |
| Kasse und Bank PL Dezember 2026 | 6.762.011 |
| Operativer Cashflow AC Jan bis Aug | 1.419.128 |
| Investitionen AC Jan bis Aug | −4.193.822 |
| Darlehensaufnahme AC (Juni) | 3.000.000 |
| Tilgung und Dividende AC Jan bis Aug | −780.000 |
| Eigenabsatz hl AC 2026 (= Absatz hl AC) | 279.545,3 |
| Marktvolumen hl AC 2026 | 1.217.564,4 |
| Marktvolumen hl PY bis Ist | 1.207.355,9 |
| Wettbewerber hl AC 2026 | 401.363,1 |

| Rendite | EBIT | Nettoumsatz | Investiertes Kapital | Umsatzrendite | Kapitalumschlag | ROI |
|---|---:|---:|---:|---:|---:|---:|
| AC 2024 | 1.524.979 | 35.671.771 | 36.222.516 | 4,3 % | 0,98 | 4,2 % |
| AC 2025 | 2.422.583 | 38.527.414 | 36.724.875 | 6,3 % | 1,05 | 6,6 % |
| FC 2026 | 1.731.308 | 40.167.091 | 39.709.198 | 4,3 % | 1,01 | 4,4 % |
| PL 2026 | 3.359.545 | 41.684.991 | 40.767.856 | 8,1 % | 1,02 | 8,2 % |

## Dateien und Neuaufbau

| Datei | Zweck |
|---|---|
| `examples/showcase/data/gen_showcase.py` | Datensatz (Seed 1882) → `examples/showcase/data/parquet/*.parquet`, `control.json`, Mini-DAX-Fixtures |
| `examples/showcase/model/gen_model.py` | Direct-Lake-Gerüst als TMDL (Tabellen, Partitionen, Beziehungen) |
| `examples/showcase/model/model.csx` | Measures, Sortierung, Formate, Beschreibungen (`te script`) |
| `examples/showcase/model/export_measures.csx` | Measures (83) wörtlich nach `app/test/datasets/showcase/measures.json` (aus dem Repo aufrufen) |
| `examples/showcase/model/check.py` | Kontrollwerte per DAX gegen den Service |
| `app/test/datasets/showcase.mjs` | Mini-DAX-Modell (Fakten, Bilanz, Cashflow, Liquidität und Markt 2026, Rendite alle Jahre; Mini-DAX nimmt je Abfrage die Faktentabelle der Measures) |
| `app/test/showcase-data.mjs` | Test: Kontrollwerte, Geschichten, FY, ADDMISSINGITEMS, Bilanz und Cashflow, Umsatz Δ%, Liquidität, Markt, Rendite, Slicer ohne Beziehung, Mini-DAX-Erweiterungen |

Neuaufbau (aus dem Repo, PowerShell):

```
python examples/showcase/data/gen_showcase.py
# Upload: fab cp <abs. Pfad>\<t>.parquet ".../ZlatyLev_Showcase.Lakehouse/Files/showcase/<t>/" -f
# fab table load ".../Tables/<t>" --file ".../Files/showcase/<t>" --format format=parquet --mode overwrite
# <t> = kalender, produkt, kunde, konto, fakten, seit 29.10.2026 bilanzkonto, bilanz, cashflowkonto, cashflow
# und seit 23.11.2026 liquiditaetsart, liquiditaet, marktsegment, markt, renditekonto, rendite
# (die neun älteren Dateien sind unverändert; nur die sechs neuen laden)
python examples/showcase/model/gen_model.py
te script -m "examples/showcase/ZlatyLev Showcase.SemanticModel" --file examples/showcase/model/model.csx --save
te validate -m "examples/showcase/ZlatyLev Showcase.SemanticModel" --errors-only
te script -m "examples/showcase/ZlatyLev Showcase.SemanticModel" --file examples/showcase/model/export_measures.csx
fab import "<Workspace>.Workspace/ZlatyLev Showcase.SemanticModel" -i <abs. Pfad zum .SemanticModel> -f
python examples/showcase/model/check.py
```

Hinweis 23.11.2026: Die Preview der te CLI ist am 31.10.2026 abgelaufen. Ersatzweise lässt sich `model.csx` mit
Tabular Editor 2 (2.24) anwenden, das Ergebnis ist im TMDL zeichengleich mit dem te-Stand:
`TabularEditor.exe "<…>.SemanticModel\definition" -S examples\showcase\model\model.csx -TMDL <Ausgabeordner>`, dann den
Ausgabeordner als `definition` übernehmen. `export_measures.csx` braucht System.Text.Json und läuft nur mit te; mit
Tabular Editor 2 dieselbe Ausgabe über Newtonsoft (`JsonConvert.SerializeObject(d, Formatting.Indented)`, Zeilenende LF). `te validate` ersetzt das nicht: nach dem Update der te CLI nachholen.
