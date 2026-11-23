// Measures, Sortierung, Formate und Beschreibungen für das Modell „ZlatyLev Showcase“ (Vertrag: showcase/CONTRACT.md).
// Läuft auf dem Gerüst aus gen_model.py: te script -m "showcase/ZlatyLev Showcase.SemanticModel" -S showcase/model/model.csx --save
var f = Model.Tables["Fakten"];
var k = Model.Tables["Kalender"];
var p = Model.Tables["Produkt"];
var c = Model.Tables["Kunde"];
var a = Model.Tables["Konto"];

// --- Hygiene ------------------------------------------------------------------------------------------------
foreach (var col in f.Columns) col.IsHidden = true;
k.DataCategory = "Time";
k.Columns["Datum"].IsKey = true;
k.Columns["Datum"].FormatString = "dd.MM.yyyy";
k.Columns["Monatsname"].SortByColumn = k.Columns["Monat"];
foreach (var n in new[] { "Jahr", "Monat" }) k.Columns[n].FormatString = "0";
k.Columns["Periode"].Description = "Jahr und Monat als Text (2026-01), Periodenspalte für das P&L-Visual.";
k.Columns["Ist"].Description = "WAHR bis zum letzten Ist-Monat (August 2026), danach FALSCH.";
p.Columns["ProduktID"].IsKey = true;
p.Columns["Produkt"].SortByColumn = p.Columns["Produkt Sort"];
p.Columns["Sorte"].SortByColumn = p.Columns["Sorte Sort"];
p.Columns["Produkt Sort"].IsHidden = true;
p.Columns["Sorte Sort"].IsHidden = true;
p.Columns["Alkohol %"].FormatString = "0.0";
c.Columns["KundeID"].IsKey = true;
c.Columns["Kanal"].SortByColumn = c.Columns["Kanal Sort"];
c.Columns["Kanal Sort"].IsHidden = true;
a.Columns["KontoID"].IsKey = true;
a.Columns["L1"].SortByColumn = a.Columns["L1 Sort"];
a.Columns["L2"].SortByColumn = a.Columns["SortOrder"];
a.Columns["L1 Sort"].IsHidden = true;
foreach (var n in new[] { "L1 Sort", "SortOrder", "SignConvention" }) a.Columns[n].FormatString = "0";
a.Columns["SignConvention"].Description = "1 Erlös, -1 Aufwand und Erlösminderung. Die Fakten liegen positiv vor.";
a.Columns["FormulaDef"].Description = "Formel des P&L-Visuals über Kontonamen, Summen mit Vorzeichen.";
a.Columns["Brückentyp"].Description = "sum oder delta für eine GuV-Brücke über L1.";
a.Columns["Bereich"].Description = "Erlöse oder Kosten (nur Konten).";
foreach (var t in new[] { p, c, a }) foreach (var col in t.Columns) col.SummarizeBy = AggregateFunction.None;
foreach (var col in k.Columns) col.SummarizeBy = AggregateFunction.None;

// --- Measures -------------------------------------------------------------------------------------------------
// Feste LineageTags (UUID v5 aus Tabelle und Name, wie gen_model.py), damit ein Neuaufbau keinen Git-Diff ergibt
Func<string, string> Uuid5 = name => {
    var ns = new byte[] { 0x6b, 0xa7, 0xb8, 0x11, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8 };
    var h = System.Security.Cryptography.SHA1.Create().ComputeHash(ns.Concat(System.Text.Encoding.UTF8.GetBytes(name)).ToArray());
    h[6] = (byte)((h[6] & 0x0F) | 0x50);
    h[8] = (byte)((h[8] & 0x3F) | 0x80);
    var x = BitConverter.ToString(h, 0, 16).Replace("-", "").ToLowerInvariant();
    return x.Substring(0, 8) + "-" + x.Substring(8, 4) + "-" + x.Substring(12, 4) + "-" + x.Substring(16, 4) + "-" + x.Substring(20, 12);
};
Action<Table, string, string, string, string, string> MT = (t, name, expr, fmt, folder, desc) => {
    var m = t.AddMeasure(name, expr, folder);
    m.FormatString = fmt;
    m.Description = desc;
    m.LineageTag = Uuid5("ZlatyLev Showcase/" + t.Name + "/measure/" + name);
};
Action<string, string, string, string, string> M = (name, expr, fmt, folder, desc) => MT(f, name, expr, fmt, folder, desc);
const string EUR = "#,##0";
const string HL = "#,##0.0";
const string PCT = "0.0 %";
var sc = new Dictionary<string, string> { { "AC", "Ist" }, { "PY", "Vorjahr" }, { "PL", "Plan" }, { "FC", "Forecast" } };

// 01 GuV (roh)
foreach (var s in sc)
    M("GuV " + s.Key, "SUM ( 'Fakten'[" + s.Key + "] )", EUR, "01 GuV",
      s.Value + " je Konto, positiv wie gebucht. Vorzeichen über Konto[SignConvention], für das P&L-Visual.");
M("GuV FC FY", "AVERAGEX ( VALUES ( 'Kalender'[Periode] ), CALCULATE ( SUM ( 'Fakten'[FC_FY] ) ) )", EUR, "01 GuV",
  "Forecast Gesamtjahr der Auswahl, in jedem Monat gleich. Nur mit einem Jahr im Filter sinnvoll.");
M("GuV PL FY", "AVERAGEX ( VALUES ( 'Kalender'[Periode] ), CALCULATE ( SUM ( 'Fakten'[PL_FY] ) ) )", EUR, "01 GuV",
  "Plan Gesamtjahr der Auswahl, in jedem Monat gleich. Nur mit einem Jahr im Filter sinnvoll.");

// 02 GuV mit Vorzeichen
foreach (var s in sc)
    M("GuV ± " + s.Key, "SUMX ( VALUES ( 'Konto'[SignConvention] ), [GuV " + s.Key + "] * 'Konto'[SignConvention] )",
      "+#,##0;-#,##0;0", "02 GuV mit Vorzeichen",
      s.Value + " mit Vorzeichen: Erlöse positiv, Aufwand negativ. Über alle Konten ergibt sich das EBIT.");

// 03 Kennzahlen
foreach (var s in sc)
    M("Umsatz " + s.Key, "CALCULATE ( [GuV ± " + s.Key + "], 'Konto'[L1] = \"Nettoumsatz\" )", EUR, "03 Kennzahlen",
      "Nettoumsatz " + s.Value + ": Bruttoumsatz minus Rabatte plus sonstige Erlöse.");
foreach (var s in new[] { "AC", "PY", "PL" }) {
    M("Wareneinsatz " + s, "CALCULATE ( [GuV " + s + "], 'Konto'[L1] = \"Wareneinsatz\" )", EUR, "03 Kennzahlen",
      "Wareneinsatz " + sc[s] + " (Rohstoffe, Verpackung, Energie), positiv.");
    M("DB " + s, "[Umsatz " + s + "] - [Wareneinsatz " + s + "]", EUR, "03 Kennzahlen",
      "Deckungsbeitrag " + sc[s] + ": Nettoumsatz minus Wareneinsatz.");
    M("Kosten " + s, "CALCULATE ( [GuV " + s + "], 'Konto'[Bereich] = \"Kosten\" )", EUR, "03 Kennzahlen",
      "Alle Kosten " + sc[s] + " (Wareneinsatz, Betriebskosten, Abschreibungen), positiv.");
    M("EBIT " + s, "[GuV ± " + s + "]", EUR, "03 Kennzahlen", "EBIT " + sc[s] + ": Summe aller Konten mit Vorzeichen.");
    M("DB-Marge % " + s, "DIVIDE ( [DB " + s + "], [Umsatz " + s + "] )", PCT, "03 Kennzahlen",
      "Deckungsbeitrag " + sc[s] + " im Verhältnis zum Nettoumsatz.");
}
foreach (var s in sc)
    M("Absatz hl " + s.Key, "SUM ( 'Fakten'[Hektoliter " + s.Key + "] )", HL, "03 Kennzahlen",
      "Absatz " + s.Value + " in Hektoliter.");

foreach (var s in new[] { "AC", "PY", "PL" })
    M("Erlös je hl " + s, "DIVIDE ( [Umsatz " + s + "], [Absatz hl " + s + "] )", "#,##0.00", "03 Kennzahlen",
      "Nettoumsatz " + sc[s] + " je Hektoliter Absatz in EUR.");
foreach (var s in new[] { "FC", "PL" })
    M("Umsatz " + s + " FY", "CALCULATE ( SUMX ( VALUES ( 'Konto'[SignConvention] ), [GuV " + s + " FY] * 'Konto'[SignConvention] ), 'Konto'[L1] = \"Nettoumsatz\" )",
      EUR, "03 Kennzahlen", "Nettoumsatz " + sc[s] + " Gesamtjahr, in jedem Monat gleich. Nur mit einem Jahr im Filter sinnvoll.");

// 04 Bis Ist: Vorjahr und Plan nur über die Monate mit Ist
var bisIst = new[] { "GuV PY", "GuV PL", "Umsatz PY", "Umsatz PL", "DB PY", "DB PL", "Kosten PY", "Kosten PL",
                     "EBIT PY", "EBIT PL", "Absatz hl PY", "Absatz hl PL" };
foreach (var b in bisIst) {
    var src = Model.AllMeasures.First(x => x.Name == b);
    M(b + " bis Ist", "CALCULATE ( [" + b + "], 'Kalender'[Ist] = TRUE () )", src.FormatString, "04 Bis Ist",
      src.Description.TrimEnd('.') + ", nur Monate mit Ist (bis August 2026).");
}

// --- Bilanz und Cashflow (Bestände für die P&L-Templates T05A und T05B) ----------------------------------------
// Eigene Konten- und Faktentabellen, 'Konto' bleibt die GuV. Measures in der jeweiligen Faktentabelle.
var bi = Model.Tables["Bilanz"];
var cf = Model.Tables["Cashflow"];
foreach (var t in new[] { bi, cf }) foreach (var col in t.Columns) col.IsHidden = true;
bi.Columns["Stichtag"].Description = "WAHR im letzten Ist-Monat jedes Jahres (Dezember 2025, August 2026), für Stände am Stichtag.";
foreach (var t in new[] { Model.Tables["Bilanzkonto"], Model.Tables["Cashflowkonto"] }) {
    t.Columns["KontoID"].IsKey = true;
    t.Columns["L1"].SortByColumn = t.Columns["L1 Sort"];
    t.Columns["L2"].SortByColumn = t.Columns["SortOrder"];
    t.Columns["L1 Sort"].IsHidden = true;
    foreach (var n in new[] { "L1 Sort", "SortOrder", "SignConvention" }) t.Columns[n].FormatString = "0";
    t.Columns["RowType"].Description = "Zeilentyp mit Token für das P&L-Visual (ab 1.7): stock = Stand am Periodenende, opening = Stand am Periodenbeginn.";
    t.Columns["FormulaDef"].Description = "Formel des P&L-Visuals über Kontonamen und Ebene 1.";
    t.Columns["SignConvention"].Description = "Überall 1: Bilanzwerte positiv wie gebucht, Cashflows mit Vorzeichen (Auszahlungen negativ).";
    foreach (var col in t.Columns) col.SummarizeBy = AggregateFunction.None;
}
foreach (var s in sc)
    MT(bi, "Bilanz " + s.Key, "SUM ( 'Bilanz'[" + s.Key + "] )", EUR, "05 Bilanz",
       s.Value + " je Bilanzposition: Stand am Monatsende. Über mehrere Monate summiert, deshalb im P&L-Visual mit Periodenfeld (Zeilentyp stock) oder als Bilanz Stichtag.");
foreach (var s in new[] { "AC", "PY", "PL" })
    MT(bi, "Bilanz Stichtag " + s, "CALCULATE ( [Bilanz " + s + "], 'Bilanz'[Stichtag] = TRUE () )", EUR, "05 Bilanz",
       sc[s] + " am Stichtag: Stand im letzten Ist-Monat des Jahres (2026: August).");
foreach (var s in sc)
    MT(cf, "Cashflow " + s.Key, "SUM ( 'Cashflow'[" + s.Key + "] )", EUR, "06 Cashflow",
       s.Value + " je Cashflow-Position: Flüsse mit Vorzeichen (Auszahlungen negativ), Anfangsbestand je Monat (Zeilentyp opening).");
foreach (var s in new[] { "PY", "PL" })
    MT(cf, "Cashflow " + s + " bis Ist", "CALCULATE ( [Cashflow " + s + "], 'Kalender'[Ist] = TRUE () )", EUR, "06 Cashflow",
       sc[s] + " je Cashflow-Position, nur Monate mit Ist (bis August 2026).");

// --- Seit 23.11.2026: Abweichung %, Liquidität, Markt, Rendite (ChartKitchen C18, C20, C24; P&L 11A) --------------
// 07 Abweichung % (C18, Abweichungs-Scatter): gegen Vorjahr und Plan über dieselben Ist-Monate
const string DPCT = "+0.0 %;-0.0 %;0.0 %";
M("Umsatz ΔPY %", "DIVIDE ( [Umsatz AC] - [Umsatz PY bis Ist], [Umsatz PY bis Ist] )", DPCT, "07 Abweichung %",
  "Nettoumsatz Ist gegen Vorjahr in Prozent, Vorjahr nur über die Monate mit Ist (bis August 2026).");
M("Umsatz ΔPL %", "DIVIDE ( [Umsatz AC] - [Umsatz PL bis Ist], [Umsatz PL bis Ist] )", DPCT, "07 Abweichung %",
  "Nettoumsatz Ist gegen Plan in Prozent, Plan nur über die Monate mit Ist (bis August 2026).");

// 08 Liquidität (C20, Bestand und Fluss): Langformat, Art mit Zeilentyp-Token in Liquiditaetsart[Fluss]
var la = Model.Tables["Liquiditaetsart"];
var li = Model.Tables["Liquiditaet"];
foreach (var col in li.Columns) col.IsHidden = true;
la.Columns["ArtID"].IsKey = true;
la.Columns["Art"].SortByColumn = la.Columns["Art Sort"];
la.Columns["Art Sort"].IsHidden = true;
la.Columns["Art Sort"].FormatString = "0";
la.Columns["Fluss"].Description = "Zeilentyp-Token für ChartKitchen (Rolle rowType, Modus stockflow): stock = Bestand am Monatsende, inflow = Zufluss, outflow = Abfluss, leer = Vorzeichen entscheidet.";
foreach (var col in la.Columns) col.SummarizeBy = AggregateFunction.None;
foreach (var s in sc)
    MT(li, "Liquidität " + s.Key, "SUM ( 'Liquiditaet'[" + s.Key + "] )", EUR, "08 Liquidität",
       s.Value + " je Liquiditätsart: Flüsse des Monats mit Vorzeichen, Kasse und Bank als Stand am Monatsende. Der Bestand stimmt nur in Monatskörnung (Summe).");

// 09 Markt (C24, Blasen mit Anteil): Marktsegment Land × Sorte, ohne Beziehung zu Kunde und Produkt
var ms = Model.Tables["Marktsegment"];
var mk = Model.Tables["Markt"];
foreach (var col in mk.Columns) col.IsHidden = true;
ms.Columns["SegmentID"].IsKey = true;
ms.Columns["Land"].SortByColumn = ms.Columns["Land Sort"];
ms.Columns["Sorte"].SortByColumn = ms.Columns["Sorte Sort"];
foreach (var n in new[] { "Land Sort", "Sorte Sort" }) { ms.Columns[n].IsHidden = true; ms.Columns[n].FormatString = "0"; }
ms.Description = "Marktsegmente Land × Sorte. Eigene Spalten, keine Beziehung zu Kunde und Produkt: die Slicer Region, Kanal und Sorte filtern den Markt nicht.";
foreach (var col in ms.Columns) col.SummarizeBy = AggregateFunction.None;
MT(mk, "Marktvolumen hl AC", "SUM ( 'Markt'[Marktvolumen AC] )", HL, "09 Markt", "Marktvolumen Ist in Hektoliter (Blasengröße).");
MT(mk, "Marktvolumen hl PY", "SUM ( 'Markt'[Marktvolumen PY] )", HL, "09 Markt", "Marktvolumen Vorjahr in Hektoliter.");
MT(mk, "Marktvolumen hl PY bis Ist", "CALCULATE ( [Marktvolumen hl PY], 'Kalender'[Ist] = TRUE () )", HL, "09 Markt",
   "Marktvolumen Vorjahr in Hektoliter, nur Monate mit Ist (bis August 2026).");
MT(mk, "Eigenabsatz hl AC", "SUM ( 'Markt'[Eigenabsatz AC] )", HL, "09 Markt",
   "Eigener Absatz Ist im Segment in Hektoliter (Kreissegment der Blase), gleich Absatz hl AC der Fakten.");
MT(mk, "Eigenabsatz hl PY", "SUM ( 'Markt'[Eigenabsatz PY] )", HL, "09 Markt", "Eigener Absatz Vorjahr im Segment in Hektoliter.");
MT(mk, "Wettbewerber hl AC", "SUM ( 'Markt'[Wettbewerber AC] )", HL, "09 Markt", "Absatz Ist des größten Wettbewerbers im Segment in Hektoliter.");
MT(mk, "Wettbewerber hl PY", "SUM ( 'Markt'[Wettbewerber PY] )", HL, "09 Markt", "Absatz Vorjahr des größten Wettbewerbers im Segment in Hektoliter.");
MT(mk, "Marktwachstum %", "DIVIDE ( [Marktvolumen hl AC] - [Marktvolumen hl PY bis Ist], [Marktvolumen hl PY bis Ist] )", DPCT, "09 Markt",
   "Marktvolumen Ist gegen Vorjahr in Prozent, Vorjahr nur über die Monate mit Ist.");
MT(mk, "Marktanteil %", "DIVIDE ( [Eigenabsatz hl AC], [Marktvolumen hl AC] )", PCT, "09 Markt", "Eigener Absatz im Verhältnis zum Marktvolumen (Ist).");
MT(mk, "Relativer Marktanteil", "DIVIDE ( [Eigenabsatz hl AC], [Wettbewerber hl AC] )", "0.00", "09 Markt",
   "Eigener Absatz im Verhältnis zum größten Wettbewerber (Ist); über 1 = Marktführer.");

// 10 Rendite (11A, ROI-Baum): Jahr als eigene Spalte ohne Beziehung zum Kalender
var rk = Model.Tables["Renditekonto"];
var re = Model.Tables["Rendite"];
foreach (var col in re.Columns) col.IsHidden = true;
re.Columns["Jahr"].IsHidden = false;
re.Columns["Jahr"].FormatString = "0";
re.Columns["Jahr"].Description = "Geschäftsjahr als Periode für das P&L-Visual (2024 und 2025 Ist, 2026 Forecast und Plan). Keine Beziehung zum Kalender: der Jahr-Slicer filtert die Rendite nicht.";
rk.Columns["KontoID"].IsKey = true;
rk.Columns["L1"].SortByColumn = rk.Columns["L1 Sort"];
rk.Columns["L2"].SortByColumn = rk.Columns["SortOrder"];
rk.Columns["L1 Sort"].IsHidden = true;
foreach (var n in new[] { "L1 Sort", "SortOrder", "SignConvention" }) rk.Columns[n].FormatString = "0";
rk.Columns["RowType"].Description = "Zeilentyp mit Token für das P&L-Visual: stock = Stand am Jahresende (Investiertes Kapital), KPI factor = Kennzahl als Faktor (Kapitalumschlag).";
rk.Columns["FormulaDef"].Description = "Formel des P&L-Visuals über Kontonamen (DuPont: ROI = Umsatzrendite × Kapitalumschlag).";
foreach (var col in rk.Columns) col.SummarizeBy = AggregateFunction.None;
foreach (var col in re.Columns) col.SummarizeBy = AggregateFunction.None;
foreach (var s in sc)
    MT(re, "Rendite " + s.Key, "SUM ( 'Rendite'[" + s.Key + "] )", EUR, "10 Rendite",
       s.Value + " je Renditekonto und Jahr: EBIT und Nettoumsatz als Jahressumme, Investiertes Kapital = Aktiva am Jahresende.");
