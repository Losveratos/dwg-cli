"""Synthetischer Brauerei-Datensatz für die Showcase-App (Modell „ZlatyLev Showcase“).

Brauerei-Case ZLATÝ LEV: Biere, Kunden und Zahlen sind erfunden
(fester Seed, deterministisch). Vertrag: examples/showcase/CONTRACT.md.

Dazu Bilanz und Cashflow (Bestände für die P&L-Templates T05A und T05B, seit P&L-Visual 1.7): eigene Konten- und
Faktentabellen, abgeleitet aus dem GuV-EBIT, deterministisch ohne den Zufallsstrom der GuV.

Seit 23.11.2026 dazu drei Tabellenpaare für neue Templates: Liquidität (ChartKitchen C20, aus Cashflow und Bilanz),
Markt (C24, Eigenabsatz aus den Fakten, Marktvolumen mit eigenem Zufallsstrom) und Rendite (P&L 11A, Jahreswerte aus
den Monatsreihen von GuV und Bilanz). Die bisherigen Tabellen bleiben byte-gleich.

Ausgabe:
  examples/showcase/data/parquet/<tabelle>.parquet          Quellen für das Lakehouse (Spaltennamen ohne Leerzeichen)
  examples/showcase/data/control.json                    Kontrollwerte
  app/test/datasets/showcase/*.json         Mini-DAX-Fixtures (Spaltennamen wie im Modell, Fakten nur 2026)

Aufruf: python examples/showcase/data/gen_showcase.py
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

SEED = 1882
HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
OUT_PARQUET = HERE / "parquet"
OUT_JSON = REPO / "app" / "test" / "datasets" / "showcase"
LAST_ACTUAL = (2026, 8)          # letzter Ist-Monat
YEARS = [2025, 2026]             # Jahre im Modell; 2024 wird nur als Vorjahr für 2025 gerechnet

rng = np.random.default_rng(SEED)

# ---------------------------------------------------------------- Dimensionen

MONATSNAMEN = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]

# ProduktID, Produkt, Sorte, Alkohol %, Preis €/hl (brutto, Handel), Rohstoff €/hl, Saisonstärke, Basisvolumen
PRODUKTE = [
    ("P01", "Zlatý Lev 10° Desítka", "Helles Lager", 4.1, 82, 18, 1.0, 1.00),
    ("P02", "Zlatý Lev 12° Dvanáctka", "Helles Lager", 5.0, 104, 22, 1.0, 1.10),
    ("P03", "Praha Premium 13°", "Helles Lager", 5.5, 122, 25, 1.0, 0.45),
    ("P04", "Černý Lev 11°", "Dunkles Lager", 4.6, 98, 22, 0.6, 0.30),
    ("P05", "Vyšehrad Tmavý 13°", "Dunkles Lager", 5.2, 118, 26, 0.5, 0.14),
    ("P06", "Karlův IPA", "Spezialität", 6.2, 158, 38, 0.8, 0.12),
    ("P07", "Vltava Pšenice", "Spezialität", 5.1, 128, 27, 1.4, 0.13),
    ("P08", "Anniversary 1882", "Spezialität", 6.5, 192, 41, 0.4, 0.04),
    ("P09", "Smíchov Hazy IPA", "Spezialität", 6.0, 172, 42, 0.9, 0.10),
    ("P10", "Lev Free", "Alkoholfrei", 0.4, 88, 16, 1.2, 0.18),
    ("P11", "Lev Citrón Radler", "Alkoholfrei", 2.0, 84, 15, 1.8, 0.16),
]
SORTEN = ["Helles Lager", "Dunkles Lager", "Spezialität", "Alkoholfrei"]

# KundeID, Kunde, Kanal, Region, Land, Größe (hl je Monat bei Basisvolumen 1)
KUNDEN = [
    ("K01", "Nová Vlna Supermarkety s.r.o.", "Handel", "Prag", "Tschechien", 1150),
    ("K02", "Potraviny Domov spol. s r.o.", "Handel", "Mittelböhmen", "Tschechien", 820),
    ("K03", "HyperMax Česko v.o.s.", "Handel", "Prag", "Tschechien", 1280),
    ("K04", "Trh Plus Obchody ČR a.s.", "Handel", "Prag", "Tschechien", 990),
    ("K05", "Diskont Sever s.r.o.", "Handel", "Prag", "Tschechien", 1040),
    ("K06", "Velkoobchod Centrum s.r.o.", "Großhandel", "Prag", "Tschechien", 760),
    ("K07", "Nápoje Morava Distribuce s.r.o.", "Großhandel", "Mähren", "Tschechien", 900),
    ("K08", "Hospoda U Lva", "Gastronomie", "Prag", "Tschechien", 380),
    ("K09", "Pivnice Na Rohu Group s.r.o.", "Gastronomie", "Prag", "Tschechien", 450),
    ("K10", "Getränkemarkt Elbtal GmbH", "Export", "Sachsen", "Deutschland", 520),
    ("K11", "Trh Plus Obchody SR a.s.", "Export", "Slowakei", "Slowakei", 480),
    ("K12", "Sklepik Osiedlowy sp. z o.o.", "Export", "Polen", "Polen", 430),
]
KANAELE = ["Handel", "Großhandel", "Gastronomie", "Export"]
# Preisfaktor, Rabattsatz 2024/25, Rabattsatz 2026, Verpackung €/hl, Logistik €/hl
KANAL = {
    "Handel": (1.00, 0.090, 0.100, 19, 6.5),
    "Großhandel": (0.92, 0.060, 0.060, 17, 5.5),
    "Gastronomie": (1.18, 0.040, 0.040, 7, 8.0),
    "Export": (1.06, 0.050, 0.050, 18, 13.5),
}
# Sortiment: welche Biere ein Kanal nicht führt
OHNE = {
    "Handel": {"P08"},
    "Großhandel": {"P08", "P09"},
    "Gastronomie": {"P10", "P11"},
    "Export": {"P05", "P07", "P08", "P11"},
}

# KontoID, ParentID, Konto, RowType, SortOrder, FormulaDef, SignConvention, Bereich, Kommentar
KONTEN = [
    ("N-UMS", None, "Nettoumsatz", "Subtotal", 10, None, 1, None, None),
    ("4000", "N-UMS", "Bruttoumsatz", "Account", 11, None, 1, "Erlöse",
     "Praha Premium seit April 2026 bei Trh Plus und HyperMax ausgelistet"),
    ("4100", "N-UMS", "Rabatte und Boni", "Account", 12, None, -1, "Erlöse", "Handel 2026 mit höheren Jahresboni"),
    ("4200", "N-UMS", "Sonstige Erlöse", "Account", 13, None, 1, "Erlöse", None),
    ("N-WE", None, "Wareneinsatz", "Subtotal", 20, None, -1, None, None),
    ("5000", "N-WE", "Rohstoffe", "Account", 21, None, -1, "Kosten", None),
    ("5100", "N-WE", "Verpackung und Gebinde", "Account", 22, None, -1, "Kosten", None),
    ("5200", "N-WE", "Energie Produktion", "Account", 23, None, -1, "Kosten", None),
    ("F-DB", None, "Deckungsbeitrag", "Formula", 30, "[Nettoumsatz] + [Wareneinsatz]", 1, None, None),
    ("K-DB", None, "DB-Marge %", "KPI", 31, "[Deckungsbeitrag] / [Nettoumsatz]", 1, None, None),
    ("N-BK", None, "Betriebskosten", "Subtotal", 40, None, -1, None, None),
    ("6000", "N-BK", "Personal", "Account", 41, None, -1, "Kosten", None),
    ("6100", "N-BK", "Marketing", "Account", 42, None, -1, "Kosten", None),
    ("6200", "N-BK", "Logistik", "Account", 43, None, -1, "Kosten", "Dieselzuschläge und Maut 2026 deutlich über Plan"),
    ("6300", "N-BK", "Sonstige Kosten", "Account", 44, None, -1, "Kosten", None),
    ("F-EBITDA", None, "EBITDA", "Formula", 50, "[Deckungsbeitrag] + [Betriebskosten]", 1, None, None),
    ("K-EBITDA", None, "EBITDA-Marge %", "KPI", 51, "[EBITDA] / [Nettoumsatz]", 1, None, None),
    ("N-AFA", None, "Abschreibungen", "Subtotal", 60, None, -1, None, None),
    ("7000", "N-AFA", "Abschreibungen Sachanlagen", "Account", 61, None, -1, "Kosten", None),
    ("F-EBIT", None, "EBIT", "Formula", 70, "[EBITDA] + [Abschreibungen]", 1, None, None),
    ("K-EBIT", None, "EBIT-Marge %", "KPI", 71, "[EBIT] / [Nettoumsatz]", 1, None, None),
]
ACCOUNTS = [k[0] for k in KONTEN if k[3] == "Account"]

SAISON = np.array([0.74, 0.76, 0.88, 0.97, 1.08, 1.22, 1.32, 1.28, 1.04, 0.93, 0.84, 0.94])

# ---------------------------------------------------------------- Bilanz und Cashflow (Bestände)
# Eigene Tabellen wie demoData/bilanz-* und cashflow-* im Kitchen-Repo: 'Konto' bleibt die reine GuV, die GuV-Kacheln
# binden 'Konto' ohne Filter. Bilanzwerte positiv wie gebucht (Aktiva und Passiva, SignConvention 1), Cashflow mit
# Vorzeichen (Auszahlungen negativ). Zeilentyp mit Token: Bilanz „Account stock“, Anfangsbestand „Account opening“,
# Endbestand „Formula stock“ (ohne Faktzeilen, ADDMISSINGITEMS wie die GuV-Formeln).

# KontoID, Konto, L1, L1 Sort, SortOrder, RowType, FormulaDef, VarianceInvert, Kommentar
BILANZKONTEN = [
    ("A-SACH", "Sachanlagen", "Aktiva", 10, 11, "Account stock", None, "false", "Neue Abfüllanlage im Juni 2026"),
    ("A-VORR", "Vorräte", "Aktiva", 10, 12, "Account stock", None, "true", None),
    ("A-FORD", "Forderungen LuL", "Aktiva", 10, 13, "Account stock", None, "true", None),
    ("A-KASSE", "Kasse und Bank", "Aktiva", 10, 14, "Account stock", None, "false", "Gleich dem Endbestand Zahlungsmittel im Cashflow"),
    ("P-EK", "Eigenkapital", "Passiva", 20, 21, "Account stock", None, "false", "Dividende 2026 im Mai, niedriger als geplant"),
    ("P-RUECK", "Rückstellungen", "Passiva", 20, 22, "Account stock", None, "true", None),
    ("P-BANK", "Verbindlichkeiten Kreditinstitute", "Passiva", 20, 23, "Account stock", None, "true",
     "Darlehen für die Abfüllanlage im Juni 2026"),
    ("P-VLL", "Verbindlichkeiten LuL", "Passiva", 20, 24, "Account stock", None, "true", None),
    ("K-EKQ", "Eigenkapitalquote", "Eigenkapitalquote", 30, 30, "KPI", "[Eigenkapital] / [Passiva]", "false", None),
]
CASHFLOWKONTEN = [
    ("CF-ANF", "Anfangsbestand Zahlungsmittel", "Anfangsbestand Zahlungsmittel", 10, 10, "Account opening", None, "false",
     "Stand am Periodenbeginn"),
    ("CF-JUE", "Jahresüberschuss", "Operativer Cashflow", 20, 21, "Account", None, "false", "EBIT der GuV nach Zinsen und Steuern"),
    ("CF-AFA", "Abschreibungen", "Operativer Cashflow", 20, 22, "Account", None, "false", None),
    ("CF-WC", "Veränderung Working Capital", "Operativer Cashflow", 20, 23, "Account", None, "false", None),
    ("CF-INV", "Investitionen Sachanlagen", "Investiver Cashflow", 30, 31, "Account", None, "false", "Abfüllanlage im Juni 2026"),
    ("CF-ABG", "Anlagenabgänge", "Investiver Cashflow", 30, 32, "Account", None, "false", None),
    ("CF-AUF", "Aufnahme Darlehen", "Finanzierungs-Cashflow", 40, 41, "Account", None, "false", None),
    ("CF-TIL", "Tilgung Darlehen", "Finanzierungs-Cashflow", 40, 42, "Account", None, "false", None),
    ("CF-DIV", "Dividende", "Finanzierungs-Cashflow", 40, 43, "Account", None, "false", None),
    ("CF-END", "Endbestand Zahlungsmittel", "Endbestand Zahlungsmittel", 50, 50, "Formula stock",
     "[Anfangsbestand Zahlungsmittel] + [Operativer Cashflow] + [Investiver Cashflow] + [Finanzierungs-Cashflow]", "false",
     "Gleich Kasse und Bank in der Bilanz"),
]
STICHTAGE = {(2025, 12), LAST_ACTUAL}     # letzter Ist-Monat je Jahr: Stand für die Karten („Bilanz Stichtag …“)
ZINS = 0.040                              # p.a. auf die Verbindlichkeiten Kreditinstitute des Vormonats
STEUER = 0.25                             # pauschal auf das Ergebnis nach Zinsen
CAPEX_QUOTE = 0.50                        # laufende Investitionen in Prozent der Abschreibungen
TILGUNG = 60_000                          # je Monat
START = {"A-SACH": 28_000_000, "A-KASSE": 4_500_000, "P-BANK": 11_000_000}   # Stand 31.12.2023
# Ereignisse je Szenario (Monat → EUR)
INVEST = {"AC": {(2024, 9): 900_000, (2025, 10): 1_400_000, (2026, 6): 3_200_000},
          "PL": {(2025, 10): 1_200_000, (2026, 6): 2_800_000}}
ABGANG = {"AC": {(2025, 3): 60_000, (2026, 2): 85_000}, "PL": {}}
DARLEHEN = {"AC": {(2026, 6): 3_000_000}, "PL": {(2026, 6): 3_000_000}}
DIVIDENDE = {"AC": {(2024, 5): 300_000, (2025, 5): 400_000, (2026, 5): 300_000},
             "PL": {(2025, 5): 400_000, (2026, 5): 500_000}}


def months(year):
    return [(year, m) for m in range(1, 13)]


def is_actual(y, m):
    return (y, m) <= LAST_ACTUAL


# ---------------------------------------------------------------- Mengen (hl) je Kombination und Monat

def volume_actual(prod, kunde, y, m):
    """Ist-Absatz in hl (vor Rundung) mit den Geschichten der Showcase."""
    pid, sai, base = prod[0], prod[6], prod[7]
    kid, kanal, region = kunde[0], kunde[2], kunde[3]
    season = 1 + (SAISON[m - 1] - 1) * sai
    trend = {2024: 1.00, 2025: 1.03, 2026: 1.05}[y]
    v = kunde[5] * base * season * trend
    # Smíchov Hazy IPA: Einführung April 2025, Hochlauf über 12 Monate
    if pid == "P09":
        t = (y - 2025) * 12 + m - 4
        v *= 0 if t < 0 else min(1.0, 0.25 + 0.75 * t / 12)
    # Geschichte 1: Polen (Sklepik Osiedlowy) wächst 2026 kräftig, Plan rechnete nur mit +6 %
    if region == "Polen" and y == 2026:
        v *= 1.12 + 0.025 * m
    # Geschichte 2: Praha Premium bricht ab April 2026 ein (Auslistung bei Trh Plus und HyperMax, Handel schwach)
    if pid == "P03" and y == 2026 and m >= 4:
        v *= 0.15 if kid in ("K03", "K04") else 0.78
    # Alkoholfrei wächst über die Jahre
    if prod[2] == "Alkoholfrei":
        v *= {2024: 0.92, 2025: 1.0, 2026: 1.09}[y]
    noise = rng.normal(1.0, 0.06)
    return max(v * noise, 0.0)


def volume_plan(prod, kunde, y, m, base_prev):
    """Plan in hl: Vorjahresmuster (glatt) mal geplantem Wachstum, ohne die Geschichten des Planjahrs."""
    pid = prod[0]
    growth = 1.035 if y == 2025 else 1.03
    if kunde[3] == "Polen" and y == 2026:
        growth = 1.06
    if pid == "P09":               # Hazy IPA: Plan ab Einführung
        t = (y - 2025) * 12 + m - 4
        if y == 2025:
            return 0.0 if t < 0 else kunde[5] * prod[7] * (1 + (SAISON[m - 1] - 1) * prod[6]) * 0.55
        return kunde[5] * prod[7] * (1 + (SAISON[m - 1] - 1) * prod[6]) * 1.10
    if prod[2] == "Alkoholfrei":
        growth *= 1.06
    return base_prev * growth


# ---------------------------------------------------------------- Werte je Konto

def account_values(prod, kunde, y, hl, price_year):
    """Direkte Konten (alles außer Umlagen) aus Absatz und Preisen, positiv."""
    pf, rab25, rab26, verp, logi = KANAL[kunde[2]]
    infl = {2024: 0.97, 2025: 1.0, 2026: 1.025}[price_year]
    brutto = hl * prod[4] * pf * infl
    rabatt = brutto * (rab26 if price_year == 2026 else rab25)
    sonst = brutto * 0.012
    roh = hl * prod[5] * infl
    verpackung = hl * verp * infl
    energie = hl * (6.8 if price_year < 2026 else 6.3)
    logistik = hl * logi * infl
    return {"4000": brutto, "4100": rabatt, "4200": sonst, "5000": roh, "5100": verpackung,
            "5200": energie, "6200": logistik}


# Gemeinkosten des Unternehmens je Monat (EUR), per Umlage nach Nettoumsatzanteil auf die Kombinationen
def overhead(y, m, scenario):
    personal = {2024: 640_000, 2025: 662_000, 2026: 690_000}[y]
    marketing = {2024: 205_000, 2025: 214_000, 2026: 228_000}[y] * (1.35 if m in (5, 6, 7) else 0.85)
    sonstige = {2024: 118_000, 2025: 121_000, 2026: 124_000}[y]
    afa = {2024: 236_000, 2025: 241_000, 2026: 252_000}[y]
    if scenario == "AC":
        personal *= rng.normal(1.0, 0.015)
        marketing *= rng.normal(1.0, 0.05)
        sonstige *= rng.normal(1.0, 0.06)
        if y == 2026:
            personal *= 1.012       # Tarifabschluss leicht über Plan
        if y == 2026 and m in (5, 6):
            marketing *= 1.18       # Sommerkampagne Hazy IPA vorgezogen
    return {"6000": personal, "6100": marketing, "6300": sonstige, "7000": afa}


# ---------------------------------------------------------------- Bilanz und Cashflow rechnen

def guv_treiber(fakten):
    """Monatswerte der GuV je Szenario (gerundete Faktzeilen): EBIT, Abschreibungen, Nettoumsatz, Wareneinsatz.
    Ist-Zeitreihe Jan 2024 bis Aug 2026 (2024 aus PY der 2025-Zeilen), Plan und Forecast je Jahr."""
    by_id = {k[0]: k for k in KONTEN}
    sign = {k[0]: k[6] for k in KONTEN}
    block = {k[0]: by_id[k[1]][2] for k in KONTEN if k[1]}
    f = fakten.assign(y=fakten["Datum"].str[:4].astype(int), m=fakten["Datum"].str[5:7].astype(int),
                      s=fakten["KontoID"].map(sign), blk=fakten["KontoID"].map(block))

    def monate(rows, col, year_shift=0):
        out = {}
        for (y, m), g in rows.groupby(["y", "m"]):
            v = g[col]
            if v.isna().all():
                continue
            out[(int(y) + year_shift, int(m))] = {
                "ebit": int(round(float((v * g["s"]).sum()))),
                "afa": int(round(float(v[g["KontoID"] == "7000"].sum()))),
                "umsatz": int(round(float((v * g["s"])[g["blk"] == "Nettoumsatz"].sum()))),
                "we": int(round(float(v[g["blk"] == "Wareneinsatz"].sum()))),
            }
        return out

    f25, f26 = f[f["y"] == 2025], f[f["y"] == 2026]
    return {
        "AC": {**monate(f25, "PY", -1), **monate(f25, "AC"), **monate(f26, "AC")},
        "PL": {**monate(f25, "PL"), **monate(f26, "PL")},
        "FC": {**monate(f25, "FC"), **monate(f26, "FC")},
    }


def working_capital(d, m, vorrat=1.0):
    """Stände aus den Monatswerten der GuV: Vorräte 1,4 und Verbindlichkeiten LuL 0,85 Monate Wareneinsatz,
    Forderungen ein Monat Nettoumsatz (rund 30 Tage), Rückstellungen wachsen über das Jahr (Boni, Urlaub) und
    werden im Januar ausgezahlt."""
    return {"A-VORR": int(round(d["we"] * 1.4 * vorrat)), "A-FORD": int(round(d["umsatz"] * 1.0)),
            "P-VLL": int(round(d["we"] * 0.85)), "P-RUECK": 1_450_000 + 38_000 * m}


def aktiva(s):
    return s["A-SACH"] + s["A-VORR"] + s["A-FORD"] + s["A-KASSE"]


def passiva(s):
    return s["P-EK"] + s["P-RUECK"] + s["P-BANK"] + s["P-VLL"]


def simulieren(start, monate, treiber, scen, rng_b=None):
    """Monatsstände (Monatsende) und Cashflows ab dem Stand des Vormonats. Jahresüberschuss = EBIT der GuV minus Zinsen
    minus pauschaler Steuer; Abschreibungen aus Konto 7000 mindern die Sachanlagen; Kasse = Anfangsbestand + Cashflows."""
    s = dict(start)
    staende, fluesse = {}, {}
    for (y, m) in monate:
        d = treiber[(y, m)]
        zins = int(round(s["P-BANK"] * ZINS / 12))
        ebt = d["ebit"] - zins
        jue = ebt - int(round(ebt * STEUER))
        laufend = d["afa"] * CAPEX_QUOTE * (rng_b.normal(1.0, 0.12) if rng_b is not None else 1.0)
        capex = int(round(laufend)) + INVEST.get(scen, {}).get((y, m), 0)
        abg = ABGANG.get(scen, {}).get((y, m), 0)
        auf = DARLEHEN.get(scen, {}).get((y, m), 0)
        div = DIVIDENDE.get(scen, {}).get((y, m), 0)
        w = working_capital(d, m, rng_b.normal(1.0, 0.03) if rng_b is not None else 1.0)
        dwc = (-(w["A-VORR"] - s["A-VORR"]) - (w["A-FORD"] - s["A-FORD"]) + (w["P-VLL"] - s["P-VLL"])
               + (w["P-RUECK"] - s["P-RUECK"]))
        fl = {"CF-ANF": s["A-KASSE"], "CF-JUE": jue, "CF-AFA": d["afa"], "CF-WC": dwc, "CF-INV": -capex, "CF-ABG": abg,
              "CF-AUF": auf, "CF-TIL": -TILGUNG, "CF-DIV": -div}
        s = {**s, **w,
             "A-SACH": s["A-SACH"] + capex - d["afa"] - abg,
             "A-KASSE": s["A-KASSE"] + sum(v for k, v in fl.items() if k != "CF-ANF"),
             "P-BANK": s["P-BANK"] + auf - TILGUNG,
             "P-EK": s["P-EK"] + jue - div}
        assert aktiva(s) == passiva(s), f"Bilanz {y}-{m:02d} {scen}: Aktiva {aktiva(s)}, Passiva {passiva(s)}"
        assert s["A-KASSE"] > 0, f"Kasse {y}-{m:02d} {scen} negativ"
        staende[(y, m)], fluesse[(y, m)] = dict(s), fl
    return staende, fluesse


def bestaende(fakten):
    """Bilanz und Cashflow 2025 und 2026 (Monatsende), Vorjahr aus dem Ist des Vorjahres, Plan je Jahr ab dem Ist-Stand
    Dezember des Vorjahres, Forecast ab dem letzten Ist-Monat. Gibt die vier Tabellen und die Kontrollwerte zurück."""
    rng_b = np.random.default_rng([SEED, 1702])        # eigener Strom: die GuV-Zahlen bleiben unverändert
    tr = guv_treiber(fakten)
    ist_monate = [ym for ym in months(2024) + months(2025) + months(2026) if is_actual(*ym)]
    s0 = {**START, **working_capital(tr["AC"][(2024, 1)], 12)}
    s0["P-EK"] = aktiva(s0) - s0["P-RUECK"] - s0["P-BANK"] - s0["P-VLL"]
    ac_st, ac_fl = simulieren(s0, ist_monate, tr["AC"], "AC", rng_b)
    pl_st, pl_fl = {}, {}
    fc_st = {k: v for k, v in ac_st.items() if k[0] in YEARS}
    fc_fl = {k: v for k, v in ac_fl.items() if k[0] in YEARS}
    for y in YEARS:
        st, fl = simulieren(ac_st[(y - 1, 12)], months(y), tr["PL"], "PL")
        pl_st.update(st)
        pl_fl.update(fl)
        offen = [ym for ym in months(y) if not is_actual(*ym)]
        if offen:
            st, fl = simulieren(ac_st[LAST_ACTUAL], offen, tr["FC"], "FC")
            fc_st.update(st)
            fc_fl.update(fl)
    # Endbestand = Anfangsbestand + Cashflows = Kasse; Endbestand eines Monats = Anfangsbestand des Folgemonats
    for st, fl in [(ac_st, ac_fl), (pl_st, pl_fl), (fc_st, fc_fl)]:
        for (y, m), f in fl.items():
            assert f["CF-ANF"] + sum(v for k, v in f.items() if k != "CF-ANF") == st[(y, m)]["A-KASSE"]
            nxt = (y, m + 1) if m < 12 else (y + 1, 1)
            if nxt in fl and (y, m) != (y, 12):
                assert fl[nxt]["CF-ANF"] == st[(y, m)]["A-KASSE"], f"Anfangsbestand {nxt}"

    def dim(konten):
        return pd.DataFrame([{
            "KontoID": k[0], "Konto": k[1], "L1": k[2], "L1Sort": k[3],
            "L2": k[1] if k[5].startswith("Account") and k[2] != k[1] else None,
            "SortOrder": k[4], "RowType": k[5], "FormulaDef": k[6], "SignConvention": 1, "DisplayInvert": "false",
            "VarianceInvert": k[7], "Kommentar": k[8],
        } for k in konten])

    def fakt(konten, ac, pl, fc, stichtag):
        rows = []
        for y in YEARS:
            for m in range(1, 13):
                for k in konten:
                    if not k[5].startswith("Account"):
                        continue            # Formeln und KPIs ohne Faktzeilen
                    r = {"Datum": f"{y}-{m:02d}-01", "KontoID": k[0],
                         "AC": float(ac[(y, m)][k[0]]) if is_actual(y, m) else None,
                         "PY": float(ac[(y - 1, m)][k[0]]), "PL": float(pl[(y, m)][k[0]]), "FC": float(fc[(y, m)][k[0]])}
                    if stichtag:
                        r["Stichtag"] = (y, m) in STICHTAGE
                    rows.append(r)
        return pd.DataFrame(rows)

    bilanz = fakt(BILANZKONTEN, ac_st, pl_st, fc_st, True)
    cashflow = fakt(CASHFLOWKONTEN, ac_fl, pl_fl, fc_fl, False)

    # Kontrollwerte: Stand am Stichtag (letzter Ist-Monat) und Cashflow Jan bis Stichtag
    st, st_vj = ac_st[LAST_ACTUAL], ac_st[(LAST_ACTUAL[0] - 1, LAST_ACTUAL[1])]
    ytd = [(LAST_ACTUAL[0], m) for m in range(1, LAST_ACTUAL[1] + 1)]

    def cf(ids, shift=0):
        return float(sum(ac_fl[(y - shift, m)][i] for y, m in ytd for i in ids))

    op, inv, fin = ["CF-JUE", "CF-AFA", "CF-WC"], ["CF-INV", "CF-ABG"], ["CF-AUF", "CF-TIL", "CF-DIV"]
    ctrl = {
        "Stichtag": f"{LAST_ACTUAL[0]}-{LAST_ACTUAL[1]:02d}",
        "Aktiva AC": float(aktiva(st)), "Passiva AC": float(passiva(st)), "Aktiva PY": float(aktiva(st_vj)),
        "Aktiva PL": float(aktiva(pl_st[LAST_ACTUAL])),
        "Eigenkapital AC": float(st["P-EK"]), "Eigenkapital PY": float(st_vj["P-EK"]),
        "Sachanlagen AC": float(st["A-SACH"]), "Kasse und Bank AC": float(st["A-KASSE"]),
        "Verbindlichkeiten Kreditinstitute AC": float(st["P-BANK"]),
        "Eigenkapitalquote AC": st["P-EK"] / passiva(st),
        "Anfangsbestand AC": float(ac_fl[ytd[0]]["CF-ANF"]), "Anfangsbestand PY": float(ac_fl[(ytd[0][0] - 1, 1)]["CF-ANF"]),
        "Operativer Cashflow AC": cf(op), "Investiver Cashflow AC": cf(inv), "Finanzierungs-Cashflow AC": cf(fin),
        "Operativer Cashflow PY bis Ist": cf(op, 1), "Investiver Cashflow PY bis Ist": cf(inv, 1),
        "Finanzierungs-Cashflow PY bis Ist": cf(fin, 1),
        "Endbestand AC": float(st["A-KASSE"]), "Endbestand PY": float(st_vj["A-KASSE"]),
        "Jahresüberschuss AC": cf(["CF-JUE"]), "Abschreibungen AC": cf(["CF-AFA"]),
        "Endbestand FC Dezember": float(fc_st[(LAST_ACTUAL[0], 12)]["A-KASSE"]),
    }
    sim = {"st": {"AC": ac_st, "PL": pl_st, "FC": fc_st}, "fl": {"AC": ac_fl, "PL": pl_fl, "FC": fc_fl}, "tr": tr}
    return dim(BILANZKONTEN), bilanz, dim(CASHFLOWKONTEN), cashflow, ctrl, sim


# ---------------------------------------------------------------- Liquidität (ChartKitchen C20, Bestand und Fluss)
# Langformat für den Modus stockflow: Flussarten und der Kassenbestand als Mitglieder einer Spalte, Zeilentyp-Token
# in 'Liquiditaetsart'[Fluss] (leer = Vorzeichen entscheidet). Werte aus den Cashflow- und Bilanz-Frames, kein neuer
# Zufallsstrom. Kasse und Bank = Stand am Monatsende (je Monat eine Zeile, auch in FC- und PL-Monaten).

# ArtID, Art, Art Sort, Fluss-Token, Cashflow-Konten (None = Bestand A-KASSE)
LIQ_ARTEN = [
    ("L-OP", "Operativer Cashflow", 1, None, ["CF-JUE", "CF-AFA", "CF-WC"]),
    ("L-INV", "Investitionen", 2, "outflow", ["CF-INV", "CF-ABG"]),
    ("L-DAR", "Darlehensaufnahme", 3, "inflow", ["CF-AUF"]),
    ("L-AUS", "Tilgung und Dividende", 4, "outflow", ["CF-TIL", "CF-DIV"]),
    ("L-KASSE", "Kasse und Bank", 5, "stock", None),
]


def liquiditaet(sim):
    """Dimension und Monatsfakten 2025 und 2026 (AC leer ab September 2026, PY = Ist des Vorjahres)."""
    st, fl = sim["st"], sim["fl"]

    def wert(scen, ym, art):
        if art[4] is None:
            return float(st[scen][ym]["A-KASSE"])
        return float(sum(fl[scen][ym][k] for k in art[4]))

    rows = []
    for y in YEARS:
        for m in range(1, 13):
            ym = (y, m)
            for scen in (["AC"] if is_actual(y, m) else []) + ["PL", "FC"]:
                # Bestand am Monatsende = Anfangsbestand + Summe der Flüsse des Monats
                flows = sum(wert(scen, ym, a) for a in LIQ_ARTEN if a[4] is not None)
                assert fl[scen][ym]["CF-ANF"] + flows == wert(scen, ym, LIQ_ARTEN[-1]), f"Liquidität {ym} {scen}"
                for a in LIQ_ARTEN:
                    if a[3] == "outflow":
                        assert wert(scen, ym, a) <= 0, f"{a[1]} {ym} {scen} positiv, Token outflow passt nicht"
                    if a[3] == "inflow":
                        assert wert(scen, ym, a) >= 0, f"{a[1]} {ym} {scen} negativ, Token inflow passt nicht"
            for a in LIQ_ARTEN:
                rows.append({"Datum": f"{y}-{m:02d}-01", "ArtID": a[0],
                             "AC": wert("AC", ym, a) if is_actual(y, m) else None,
                             "PY": wert("AC", (y - 1, m), a), "PL": wert("PL", ym, a), "FC": wert("FC", ym, a)})
    dim_ = pd.DataFrame([{"ArtID": a[0], "Art": a[1], "ArtSort": a[2], "Fluss": a[3]} for a in LIQ_ARTEN])
    fakt = pd.DataFrame(rows)
    ytd = [(LAST_ACTUAL[0], m) for m in range(1, LAST_ACTUAL[1] + 1)]
    ctrl = {
        "Kasse und Bank AC (Stichtag)": wert("AC", LAST_ACTUAL, LIQ_ARTEN[-1]),
        "Kasse und Bank PY (Stichtag)": wert("AC", (LAST_ACTUAL[0] - 1, LAST_ACTUAL[1]), LIQ_ARTEN[-1]),
        "Kasse und Bank FC Dezember": wert("FC", (LAST_ACTUAL[0], 12), LIQ_ARTEN[-1]),
        "Kasse und Bank PL Dezember": wert("PL", (LAST_ACTUAL[0], 12), LIQ_ARTEN[-1]),
        **{f"{a[1]} AC": sum(wert("AC", ym, a) for ym in ytd) for a in LIQ_ARTEN[:-1]},
        "Darlehensaufnahme AC Juni": wert("AC", (2026, 6), LIQ_ARTEN[2]),
        "Investitionen AC Juni": wert("AC", (2026, 6), LIQ_ARTEN[1]),
    }
    return dim_, fakt, ctrl


# ---------------------------------------------------------------- Markt (ChartKitchen C24, Blasen mit Anteil)
# Marktsegment = Land × Sorte (16). Eigenabsatz aus den Fakten (Konto 4000, Hektoliter), Marktvolumen und größter
# Wettbewerber synthetisch mit eigenem Zufallsstrom (Seed 1882, Strom 1703): Marktvolumen 2024 = Eigenabsatz 2024 /
# Startanteil, danach je Jahr mit dem Marktwachstum des Segments fortgeschrieben. Die GuV bleibt unverändert.

LAENDER = ["Tschechien", "Deutschland", "Slowakei", "Polen"]
# (Land, Sorte) → Eigenanteil 2024, Marktwachstum 2025, Marktwachstum 2026, Anteil des größten Wettbewerbers.
# Dunkles Lager schrumpft in den Exportländern, Spezialität in Polen wächst stark: die Segmente eines Landes liegen
# auseinander, damit die Kacheln je Land (Blatt 10G) lesbar bleiben.
MARKT = {
    ("Tschechien", "Helles Lager"): (0.30, -0.015, -0.020, 0.38),
    ("Tschechien", "Dunkles Lager"): (0.52, 0.005, 0.000, 0.21),
    ("Tschechien", "Spezialität"): (0.20, 0.050, 0.060, 0.27),
    ("Tschechien", "Alkoholfrei"): (0.27, 0.090, 0.110, 0.24),
    ("Deutschland", "Helles Lager"): (0.06, -0.010, -0.015, 0.29),
    ("Deutschland", "Dunkles Lager"): (0.10, -0.030, -0.055, 0.13),
    ("Deutschland", "Spezialität"): (0.05, 0.045, 0.050, 0.19),
    ("Deutschland", "Alkoholfrei"): (0.07, 0.100, 0.120, 0.31),
    ("Slowakei", "Helles Lager"): (0.12, -0.005, -0.010, 0.34),
    ("Slowakei", "Dunkles Lager"): (0.18, -0.025, -0.045, 0.21),
    ("Slowakei", "Spezialität"): (0.09, 0.055, 0.060, 0.24),
    ("Slowakei", "Alkoholfrei"): (0.10, 0.080, 0.100, 0.27),
    ("Polen", "Helles Lager"): (0.08, 0.010, 0.020, 0.33),
    ("Polen", "Dunkles Lager"): (0.15, -0.010, -0.030, 0.23),
    ("Polen", "Spezialität"): (0.06, 0.090, 0.105, 0.15),
    ("Polen", "Alkoholfrei"): (0.09, 0.120, 0.140, 0.29),
}


def markt(fakten):
    """Dimension 'Marktsegment' und Monatsfakten 'Markt' 2025 und 2026 (AC leer ab September 2026)."""
    rng_m = np.random.default_rng([SEED, 1703])
    land = {k[0]: k[4] for k in KUNDEN}
    sorte = {p[0]: p[2] for p in PRODUKTE}
    f = fakten[fakten["KontoID"] == "4000"]
    f = f.assign(y=f["Datum"].str[:4].astype(int), m=f["Datum"].str[5:7].astype(int),
                 land=f["KundeID"].map(land), sorte=f["ProduktID"].map(sorte))
    own = {}                                                         # (Land, Sorte, y, m) → hl
    for (l, s, y, m), g in f.groupby(["land", "sorte", "y", "m"]):
        if y == 2025:
            own[(l, s, 2024, m)] = g["HektoliterPY"].sum()
        if g["HektoliterAC"].notna().any():
            own[(l, s, int(y), int(m))] = g["HektoliterAC"].sum()
    vol, wett = {}, {}
    for (l, s), (anteil, g25, g26, wb) in MARKT.items():
        for m in range(1, 13):
            v = own[(l, s, 2024, m)] / anteil * rng_m.normal(1.0, 0.03)
            for y, g in [(2024, 0.0), (2025, g25), (2026, g26)]:
                v = v * (1 + g) * (rng_m.normal(1.0, 0.02) if y > 2024 else 1.0)
                vol[(l, s, y, m)] = v
                wett[(l, s, y, m)] = v * wb * rng_m.normal(1.0, 0.02)
    segs = [(l, s) for l in LAENDER for s in SORTEN]
    seg_id = {ls: f"S{LAENDER.index(ls[0]) + 1}{SORTEN.index(ls[1]) + 1}" for ls in segs}
    r1 = lambda x: float(round(x, 1))
    rows = []
    for y in YEARS:
        for m in range(1, 13):
            for l, s in segs:
                act = is_actual(y, m)
                rows.append({"Datum": f"{y}-{m:02d}-01", "SegmentID": seg_id[(l, s)],
                             "EigenabsatzAC": r1(own[(l, s, y, m)]) if act else None,
                             "EigenabsatzPY": r1(own[(l, s, y - 1, m)]),
                             "MarktvolumenAC": r1(vol[(l, s, y, m)]) if act else None,
                             "MarktvolumenPY": r1(vol[(l, s, y - 1, m)]),
                             "WettbewerberAC": r1(wett[(l, s, y, m)]) if act else None,
                             "WettbewerberPY": r1(wett[(l, s, y - 1, m)])})
    dim_ = pd.DataFrame([{"SegmentID": seg_id[(l, s)], "Segment": f"{l} · {s}", "Land": l, "LandSort": LAENDER.index(l) + 1,
                          "Sorte": s, "SorteSort": SORTEN.index(s) + 1} for l, s in segs])
    fakt = pd.DataFrame(rows)
    # Kontrolle 2026 (Jan bis Aug): Eigenanteil zwischen 5 und 60 %, ein bis zwei Segmente mit relativem Anteil über 1
    ist = fakt[fakt["Datum"].str.startswith("2026") & fakt["EigenabsatzAC"].notna()]
    g = ist.merge(dim_, on="SegmentID").groupby("Segment")[["EigenabsatzAC", "MarktvolumenAC", "WettbewerberAC"]].sum()
    anteil = g["EigenabsatzAC"] / g["MarktvolumenAC"]
    rel = g["EigenabsatzAC"] / g["WettbewerberAC"]
    assert anteil.between(0.045, 0.62).all(), f"Eigenanteil außerhalb 5 bis 60 %:\n{anteil}"
    assert 1 <= (rel > 1).sum() <= 2, f"relativer Marktanteil über 1 in {(rel > 1).sum()} Segmenten:\n{rel}"
    ytd = fakt[fakt["Datum"].str.startswith("2026") & (fakt["Datum"] <= "2026-08-01")]
    ctrl = {
        "Eigenabsatz hl AC": round(float(ist["EigenabsatzAC"].sum()), 1),
        "Marktvolumen hl AC": round(float(ist["MarktvolumenAC"].sum()), 1),
        "Marktvolumen hl PY bis Ist": round(float(ytd["MarktvolumenPY"].sum()), 1),
        "Wettbewerber hl AC": round(float(ist["WettbewerberAC"].sum()), 1),
        "Eigenanteil je Segment": {k: round(float(v), 4) for k, v in anteil.items()},
        "Relativer Marktanteil je Segment": {k: round(float(v), 3) for k, v in rel.items()},
    }
    return dim_, fakt, ctrl


# ---------------------------------------------------------------- Rendite (P&L 11A, ROI-Baum nach DuPont)
# Jahreswerte aus den Monatsreihen der GuV und der Bilanz: EBIT und Nettoumsatz als Jahressumme, investiertes Kapital
# = Aktiva am Jahresende plus Barwert der Miet- und Leasingverträge (LEASING). Ist 2024 und 2025, Forecast 2026 (Ist Jan bis Aug plus Forecast), Plan 2026. Periode = Jahr
# als eigene Spalte ohne Beziehung zum Kalender (der Jahr-Slicer würde den Baum sonst auf ein Jahr schneiden).

# KontoID, Konto, SortOrder, RowType, FormulaDef, VarianceInvert, Kommentar
RENDITEKONTEN = [
    ("R-EBIT", "EBIT", 10, "Account", None, "false", "EBIT der GuV im Jahr"),
    ("R-UMS", "Nettoumsatz", 20, "Account", None, "false", None),
    ("R-KAP", "Investiertes Kapital", 30, "Account stock", None, "true",
     "Aktiva am Jahresende plus Barwert der Miet- und Leasingverträge; 2026 neue Abfüllanlage und gemietetes Kühllager"),
    ("R-UR", "Umsatzrendite", 40, "KPI", "[EBIT] / [Nettoumsatz]", "false", None),
    ("R-KU", "Kapitalumschlag", 50, "KPI factor", "[Nettoumsatz] / [Investiertes Kapital]", "false", None),
    ("R-ROI", "ROI", 60, "KPI", "[Umsatzrendite] * [Kapitalumschlag]", "false", None),
]
RENDITE_JAHRE = [2024, 2025, 2026]
# Barwert der Miet- und Leasingverträge (EUR) je Szenario und Jahr: die HGB-Bilanz aktiviert sie nicht, für den ROI
# zählen sie zum investierten Kapital. 2025 läuft das Lkw-Leasing aus, 2026 kommt ein gemietetes Kühllager dazu (im
# Plan kleiner). Damit wandert der Kapitalumschlag sichtbar (0,86 · 0,96 · 0,84) und bleibt unter 1 (zwei Stellen).
LEASING = {("AC", 2024): 5_200_000, ("AC", 2025): 3_400_000, ("FC", 2026): 7_900_000, ("PL", 2026): 6_500_000}


def rendite(sim):
    tr, st = sim["tr"], sim["st"]

    def jahr(scen, y):
        ms = [(y, m) for m in range(1, 13)]
        if any(ym not in tr[scen] for ym in ms):
            return None
        return {"R-EBIT": float(sum(tr[scen][ym]["ebit"] for ym in ms)),
                "R-UMS": float(sum(tr[scen][ym]["umsatz"] for ym in ms)),
                "R-KAP": float(aktiva(st[scen][(y, 12)]) + LEASING[(scen, y)])}

    ist = {y: jahr("AC", y) for y in RENDITE_JAHRE if y < LAST_ACTUAL[0]}
    fc = {**ist, LAST_ACTUAL[0]: jahr("FC", LAST_ACTUAL[0])}
    pl = {LAST_ACTUAL[0]: jahr("PL", LAST_ACTUAL[0])}
    rows = []
    for y in RENDITE_JAHRE:
        for k in RENDITEKONTEN:
            if not k[3].startswith("Account"):
                continue                    # KPI-Zeilen ohne Faktzeilen (ADDMISSINGITEMS)
            rows.append({"Jahr": y, "KontoID": k[0],
                         "AC": ist[y][k[0]] if y in ist else None,
                         "PY": ist[y - 1][k[0]] if (y - 1) in ist else None,
                         "PL": pl[y][k[0]] if y in pl else None,
                         "FC": fc[y][k[0]] if y in fc else None})
    dim_ = pd.DataFrame([{
        "KontoID": k[0], "Konto": k[1], "L1": k[1], "L1Sort": k[2], "L2": None, "SortOrder": k[2], "RowType": k[3],
        "FormulaDef": k[4], "SignConvention": 1, "DisplayInvert": "false", "VarianceInvert": k[5], "Kommentar": k[6],
    } for k in RENDITEKONTEN])
    ctrl = {}
    for label, d in [("AC", ist), ("FC", {LAST_ACTUAL[0]: fc[LAST_ACTUAL[0]]}), ("PL", pl)]:
        for y, v in d.items():
            ctrl[f"{label} {y}"] = {**{k[1]: v[k[0]] for k in RENDITEKONTEN if k[0] in v},
                                    "Umsatzrendite": v["R-EBIT"] / v["R-UMS"], "Kapitalumschlag": v["R-UMS"] / v["R-KAP"],
                                    "ROI": v["R-EBIT"] / v["R-KAP"], "Leasing": float(LEASING[(label, y)])}
    return dim_, pd.DataFrame(rows), ctrl


# ---------------------------------------------------------------- Rechnen

def main():
    combos = [(p, k) for k in KUNDEN for p in PRODUKTE if p[0] not in OHNE[k[2]]]
    all_months = months(2024) + months(2025) + months(2026)

    # Ist-Absatz 2024 bis Aug 2026; Plan 2025, 2026
    hl_ac = {}
    for p, k in combos:
        for y, m in all_months:
            if is_actual(y, m):
                hl_ac[(p[0], k[0], y, m)] = volume_actual(p, k, y, m)
    hl_pl = {}
    for p, k in combos:
        for y in YEARS:
            prev = [hl_ac[(p[0], k[0], y - 1, m)] for m in range(1, 13)]
            # Vorjahr geglättet: Jahressumme mit Saisonmuster verteilt
            total = sum(prev)
            shape = 1 + (SAISON - 1) * p[6]
            shape = shape / shape.sum()
            for m in range(1, 13):
                hl_pl[(p[0], k[0], y, m)] = volume_plan(p, k, y, m, total * shape[m - 1])

    def direct(hlmap, y, scen_year):
        out = {}
        for p, k in combos:
            for m in range(1, 13):
                key = (p[0], k[0], y, m)
                if key in hlmap:
                    vals = account_values(p, k, y, hlmap[key], scen_year)
                    vals["hl"] = hlmap[key]
                    out[key] = vals
        return out

    def allocate(vals, y, scenario, overhead_factor=None):
        """Gemeinkosten nach Nettoumsatzanteil des Monats verteilen."""
        for m in range(1, 13):
            keys = [kk for kk in vals if kk[2] == y and kk[3] == m]
            if not keys:
                continue
            netto = {kk: vals[kk]["4000"] - vals[kk]["4100"] + vals[kk]["4200"] for kk in keys}
            tot = sum(netto.values())
            oh = overhead(y, m, scenario)
            if overhead_factor:
                oh = {a: v * overhead_factor.get(a, 1.0) for a, v in oh.items()}
            for kk in keys:
                share = netto[kk] / tot if tot else 0
                for a, v in oh.items():
                    vals[kk][a] = v * share

    # Ist je Jahr (2024 nur für PY 2025)
    ac = {}
    for y in [2024, 2025, 2026]:
        d = direct(hl_ac, y, y)
        # Geschichte 3: Logistik 2026 über Plan (Diesel, Maut)
        if y == 2026:
            for kk in d:
                d[kk]["6200"] *= 1.17 + 0.01 * kk[3]
        allocate(d, y, "AC")
        ac.update(d)
    pl = {}
    for y in YEARS:
        d = direct(hl_pl, y, y)
        allocate(d, y, "PL")
        pl.update(d)

    # Forecast: Ist-Monate = Ist, danach Plan mal gedämpfter Run-Rate (Ist/Plan bis zum letzten Ist-Monat)
    fc = {}
    for p, k in combos:
        for y in YEARS:
            done = [(y, m) for m in range(1, 13) if is_actual(y, m)]
            ratio = {}
            for a in ACCOUNTS + ["hl"]:
                s_ac = sum(ac[(p[0], k[0], yy, mm)][a] for yy, mm in done)
                s_pl = sum(pl[(p[0], k[0], yy, mm)][a] for yy, mm in done)
                r = s_ac / s_pl if s_pl else 1.0
                ratio[a] = 1 + 0.8 * (r - 1)
            for m in range(1, 13):
                key = (p[0], k[0], y, m)
                if is_actual(y, m):
                    fc[key] = dict(ac[key])
                else:
                    fc[key] = {a: pl[key][a] * ratio[a] for a in ACCOUNTS + ["hl"]}

    # Runden: Euro ganz, hl auf eine Nachkommastelle
    def r_eur(x):
        return float(round(x))

    def r_hl(x):
        return float(round(x, 1))

    rows = []
    for p, k in combos:
        for y in YEARS:
            fy_fc = {a: sum(r_eur(fc[(p[0], k[0], y, m)][a]) for m in range(1, 13)) for a in ACCOUNTS}
            fy_pl = {a: sum(r_eur(pl[(p[0], k[0], y, m)][a]) for m in range(1, 13)) for a in ACCOUNTS}
            for m in range(1, 13):
                key = (p[0], k[0], y, m)
                actual = is_actual(y, m)
                prev = ac[(p[0], k[0], y - 1, m)]
                for a in ACCOUNTS:
                    hl_row = a == "4000"
                    rows.append({
                        "Datum": f"{y}-{m:02d}-01",
                        "KontoID": a, "KundeID": k[0], "ProduktID": p[0],
                        "AC": r_eur(ac[key][a]) if actual else None,
                        "PY": r_eur(prev[a]),
                        "PL": r_eur(pl[key][a]),
                        "FC": r_eur(fc[key][a]),
                        "FC_FY": fy_fc[a],
                        "PL_FY": fy_pl[a],
                        "HektoliterAC": (r_hl(ac[key]["hl"]) if actual else None) if hl_row else None,
                        "HektoliterPY": r_hl(prev["hl"]) if hl_row else None,
                        "HektoliterPL": r_hl(pl[key]["hl"]) if hl_row else None,
                        "HektoliterFC": r_hl(fc[key]["hl"]) if hl_row else None,
                    })
    fakten = pd.DataFrame(rows)
    # PY 2026 = AC 2025 derselben Zeile
    key = ["KontoID", "KundeID", "ProduktID", "Monat"]
    chk = fakten.assign(Monat=fakten["Datum"].str[5:7], Jahr=fakten["Datum"].str[:4])
    m = chk[chk["Jahr"] == "2026"].merge(chk[chk["Jahr"] == "2025"], on=key, suffixes=("", "_vj"))
    assert len(m) == len(fakten) // 2 and (m["PY"] == m["AC_vj"]).all(), "PY 2026 weicht von AC 2025 ab"

    kalender = pd.DataFrame([{
        "Datum": f"{y}-{m:02d}-01", "Jahr": y, "Monat": m, "Monatsname": MONATSNAMEN[m - 1],
        "Periode": f"{y}-{m:02d}", "Quartal": f"Q{(m - 1) // 3 + 1}", "JahrQuartal": f"{y} Q{(m - 1) // 3 + 1}",
        "Ist": is_actual(y, m),
    } for y in YEARS for m in range(1, 13)])
    produkt = pd.DataFrame([{
        "ProduktID": p[0], "Produkt": p[1], "ProduktSort": i + 1, "Sorte": p[2], "SorteSort": SORTEN.index(p[2]) + 1,
        "AlkoholProzent": p[3],
    } for i, p in enumerate(PRODUKTE)])
    kunde = pd.DataFrame([{
        "KundeID": k[0], "Kunde": k[1], "Kanal": k[2], "KanalSort": KANAELE.index(k[2]) + 1, "Region": k[3], "Land": k[4],
    } for k in KUNDEN])
    by_id = {k[0]: k for k in KONTEN}
    bilanzkonto, bilanz, cashflowkonto, cashflow, ctrl_best, sim = bestaende(fakten)
    liquiditaetsart, liquiditaet_, ctrl_liq = liquiditaet(sim)
    marktsegment, markt_, ctrl_markt = markt(fakten)
    renditekonto, rendite_, ctrl_rendite = rendite(sim)

    def l1(k):
        if k[3] == "Account":
            return by_id[k[1]][2]
        if k[3] in ("Formula", "KPI"):
            return k[2]
        return None

    def l1_sort(k):
        if k[3] == "Account":
            return by_id[k[1]][4]
        return k[4]

    # VarianceInvert überall false: das P&L-Visual bewertet die Abweichung mit Vorzeichen, SignConvention -1 reicht für Kosten
    konto = pd.DataFrame([{
        "KontoID": k[0], "ParentID": k[1], "Konto": k[2], "L1": l1(k), "L1Sort": l1_sort(k),
        "L2": k[2] if k[3] == "Account" else None, "SortOrder": k[4], "RowType": k[3], "FormulaDef": k[5],
        "SignConvention": k[6], "DisplayInvert": "true" if k[6] == -1 and k[3] != "Account" or (k[7] == "Kosten") else "false",
        "VarianceInvert": "false", "Kommentar": k[8], "Bereich": k[7],
        "Brueckentyp": "sum" if (l1(k) in ("Nettoumsatz",) or k[3] in ("Formula", "KPI") or k[0] == "N-UMS") else "delta",
    } for k in KONTEN])

    # ------------------------------------------------------------ Parquet
    OUT_PARQUET.mkdir(parents=True, exist_ok=True)
    date = pa.date32()
    schemas = {
        "kalender": (kalender, {"Datum": date, "Jahr": pa.int64(), "Monat": pa.int64(), "Ist": pa.bool_()}),
        "produkt": (produkt, {"ProduktSort": pa.int64(), "SorteSort": pa.int64(), "AlkoholProzent": pa.float64()}),
        "kunde": (kunde, {"KanalSort": pa.int64()}),
        "konto": (konto, {"L1Sort": pa.int64(), "SortOrder": pa.int64(), "SignConvention": pa.int64()}),
        "fakten": (fakten, {"Datum": date, **{c: pa.float64() for c in fakten.columns if c not in ("Datum", "KontoID", "KundeID", "ProduktID")}}),
        "bilanzkonto": (bilanzkonto, {"L1Sort": pa.int64(), "SortOrder": pa.int64(), "SignConvention": pa.int64()}),
        "bilanz": (bilanz, {"Datum": date, "AC": pa.float64(), "PY": pa.float64(), "PL": pa.float64(), "FC": pa.float64(),
                            "Stichtag": pa.bool_()}),
        "cashflowkonto": (cashflowkonto, {"L1Sort": pa.int64(), "SortOrder": pa.int64(), "SignConvention": pa.int64()}),
        "cashflow": (cashflow, {"Datum": date, "AC": pa.float64(), "PY": pa.float64(), "PL": pa.float64(), "FC": pa.float64()}),
        # seit 23.11.2026: Liquidität (C20), Markt (C24), Rendite (11A)
        "liquiditaetsart": (liquiditaetsart, {"ArtSort": pa.int64()}),
        "liquiditaet": (liquiditaet_, {"Datum": date, "AC": pa.float64(), "PY": pa.float64(), "PL": pa.float64(),
                                       "FC": pa.float64()}),
        "marktsegment": (marktsegment, {"LandSort": pa.int64(), "SorteSort": pa.int64()}),
        "markt": (markt_, {"Datum": date, **{c: pa.float64() for c in markt_.columns if c not in ("Datum", "SegmentID")}}),
        "renditekonto": (renditekonto, {"L1Sort": pa.int64(), "SortOrder": pa.int64(), "SignConvention": pa.int64()}),
        "rendite": (rendite_, {"Jahr": pa.int64(), "AC": pa.float64(), "PY": pa.float64(), "PL": pa.float64(),
                               "FC": pa.float64()}),
    }
    for name, (df, types) in schemas.items():
        fields = []
        for c in df.columns:
            fields.append(pa.field(c, types.get(c, pa.string())))
        arrays = []
        for f in fields:
            col = df[f.name]
            if f.type == date:
                arrays.append(pa.array(pd.to_datetime(col).dt.date, type=date))
            else:
                arrays.append(pa.array([None if (isinstance(v, float) and math.isnan(v)) else v for v in col.tolist()], type=f.type))
        pq.write_table(pa.Table.from_arrays(arrays, schema=pa.schema(fields)), OUT_PARQUET / f"{name}.parquet")

    # ------------------------------------------------------------ Kontrollwerte
    f26 = fakten[fakten["Datum"].str.startswith("2026")]
    f25 = fakten[fakten["Datum"].str.startswith("2025")]
    ist26 = f26[f26["AC"].notna()]
    sign = dict(zip(konto["KontoID"], konto["SignConvention"]))
    l1map = dict(zip(konto["KontoID"], konto["L1"]))

    def signed(df, col):
        return float((df[col] * df["KontoID"].map(sign)).sum())

    def umsatz(df, col):
        return signed(df[df["KontoID"].map(l1map) == "Nettoumsatz"], col)

    def l1sum(df, col, name):
        return float(df[df["KontoID"].map(l1map) == name][col].sum())

    ytd26 = f26[f26["Datum"] <= "2026-08-01"]
    control = {
        "rows": {"fakten": len(fakten), "fakten2026": len(f26), "kombinationen": len(combos),
                 "bilanz": len(bilanz), "cashflow": len(cashflow), "liquiditaet": len(liquiditaet_),
                 "markt": len(markt_), "rendite": len(rendite_)},
        "2026": {
            "GuV AC": float(f26["AC"].sum()), "GuV PY": float(f26["PY"].sum()), "GuV PL": float(f26["PL"].sum()),
            "GuV FC": float(f26["FC"].sum()),
            "GuV FC FY": float(f26[f26["Datum"] == "2026-01-01"]["FC_FY"].sum()),
            "GuV PL FY": float(f26[f26["Datum"] == "2026-01-01"]["PL_FY"].sum()),
            "Umsatz AC": umsatz(f26, "AC"), "Umsatz PY": umsatz(f26, "PY"), "Umsatz PL": umsatz(f26, "PL"),
            "Umsatz FC": umsatz(f26, "FC"),
            "Umsatz PY bis Ist": umsatz(ytd26, "PY"), "Umsatz PL bis Ist": umsatz(ytd26, "PL"),
            "Wareneinsatz AC": l1sum(f26, "AC", "Wareneinsatz"),
            "Kosten AC": float(f26[f26["KontoID"].map(dict(zip(konto["KontoID"], konto["Bereich"]))) == "Kosten"]["AC"].sum()),
            "EBIT AC": signed(f26, "AC"), "EBIT PL bis Ist": signed(ytd26, "PL"),
            "Absatz hl AC": round(float(f26["HektoliterAC"].sum()), 1),
            "Absatz hl PL bis Ist": round(float(ytd26["HektoliterPL"].sum()), 1),
            "Logistik AC": float(f26[f26["KontoID"] == "6200"]["AC"].sum()),
            "Logistik PL bis Ist": float(ytd26[ytd26["KontoID"] == "6200"]["PL"].sum()),
        },
        "2025": {
            "Umsatz AC": umsatz(f25, "AC"), "Umsatz PL": umsatz(f25, "PL"), "EBIT AC": signed(f25, "AC"),
            "Absatz hl AC": round(float(f25["HektoliterAC"].sum()), 1),
        },
    }
    c26 = control["2026"]
    c26["DB AC"] = c26["Umsatz AC"] - c26["Wareneinsatz AC"]
    c26["DB-Marge % AC"] = c26["DB AC"] / c26["Umsatz AC"]
    # Geschichten (Ist bis Aug 2026 gegen Plan bis Aug)
    kmap = dict(zip(kunde["KundeID"], kunde["Region"]))
    stories = {}
    for label, mask in [("Region Polen", ytd26["KundeID"].map(kmap) == "Polen"),
                        ("Praha Premium 13°", ytd26["ProduktID"] == "P03")]:
        sub = ytd26[mask]
        stories[label] = {"Umsatz AC": umsatz(sub, "AC"), "Umsatz PL": umsatz(sub, "PL"), "Umsatz PY": umsatz(sub, "PY")}
    stories["Logistik"] = {"AC": c26["Logistik AC"], "PL": c26["Logistik PL bis Ist"]}
    control["Geschichten Jan bis Aug 2026"] = stories
    control["Bilanz und Cashflow 2026"] = ctrl_best
    control["Liquidität 2026"] = ctrl_liq
    control["Markt 2026"] = ctrl_markt
    control["Rendite"] = ctrl_rendite
    (HERE / "control.json").write_text(json.dumps(control, ensure_ascii=False, indent=2), encoding="utf-8")

    # ------------------------------------------------------------ Mini-DAX-Fixtures (Spaltennamen wie im Modell)
    OUT_JSON.mkdir(parents=True, exist_ok=True)
    rename = {
        "kalender": {"JahrQuartal": "Jahr Quartal"},
        "produkt": {"ProduktSort": "Produkt Sort", "SorteSort": "Sorte Sort", "AlkoholProzent": "Alkohol %"},
        "kunde": {"KanalSort": "Kanal Sort"},
        "konto": {"L1Sort": "L1 Sort", "Brueckentyp": "Brückentyp"},
        "bilanzkonto": {"L1Sort": "L1 Sort"},
        "cashflowkonto": {"L1Sort": "L1 Sort"},
        "bilanz": {},
        "cashflow": {},
        "liquiditaetsart": {"ArtSort": "Art Sort"},
        "liquiditaet": {},
        "marktsegment": {"LandSort": "Land Sort", "SorteSort": "Sorte Sort"},
        "markt": {"EigenabsatzAC": "Eigenabsatz AC", "EigenabsatzPY": "Eigenabsatz PY",
                  "MarktvolumenAC": "Marktvolumen AC", "MarktvolumenPY": "Marktvolumen PY",
                  "WettbewerberAC": "Wettbewerber AC", "WettbewerberPY": "Wettbewerber PY"},
        "renditekonto": {"L1Sort": "L1 Sort"},
        "rendite": {},
        "fakten": {"HektoliterAC": "Hektoliter AC", "HektoliterPY": "Hektoliter PY", "HektoliterPL": "Hektoliter PL",
                   "HektoliterFC": "Hektoliter FC"},
    }

    def to_json(df, name, file):
        df = df.rename(columns=rename[name])
        if "Datum" in df.columns:
            df = df.assign(Datum=df["Datum"] + "T00:00:00")
        rows_ = [[None if (isinstance(v, float) and math.isnan(v)) else v for v in r] for r in df.itertuples(index=False)]
        rows_ = [[int(v) if isinstance(v, (np.integer,)) else bool(v) if isinstance(v, np.bool_) else v for v in r] for r in rows_]
        (OUT_JSON / file).write_text(json.dumps({"columns": list(df.columns), "rows": rows_}, ensure_ascii=False,
                                                separators=(",", ":")), encoding="utf-8")

    to_json(kalender, "kalender", "kalender.json")
    to_json(produkt, "produkt", "produkt.json")
    to_json(kunde, "kunde", "kunde.json")
    to_json(konto, "konto", "konto.json")
    to_json(f26, "fakten", "fakten-2026.json")
    to_json(bilanzkonto, "bilanzkonto", "bilanzkonto.json")
    to_json(cashflowkonto, "cashflowkonto", "cashflowkonto.json")
    to_json(bilanz[bilanz["Datum"].str.startswith("2026")], "bilanz", "bilanz-2026.json")
    to_json(cashflow[cashflow["Datum"].str.startswith("2026")], "cashflow", "cashflow-2026.json")
    to_json(liquiditaetsart, "liquiditaetsart", "liquiditaetsart.json")
    # Liquidität beide Jahre: der Test „alle Jahre“ prüft den semi-additiven Bestand (Kasse nicht über Jahre addiert)
    to_json(liquiditaet_, "liquiditaet", "liquiditaet.json")
    to_json(marktsegment, "marktsegment", "marktsegment.json")
    to_json(markt_[markt_["Datum"].str.startswith("2026")], "markt", "markt-2026.json")
    to_json(renditekonto, "renditekonto", "renditekonto.json")
    to_json(rendite_, "rendite", "rendite.json")            # alle Jahre: ohne Beziehung zum Kalender

    print(json.dumps(control, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
