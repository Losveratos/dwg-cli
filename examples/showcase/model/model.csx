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
Action<string, string, string, string, string> M = (name, expr, fmt, folder, desc) => {
    var m = f.AddMeasure(name, expr, folder);
    m.FormatString = fmt;
    m.Description = desc;
};
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
