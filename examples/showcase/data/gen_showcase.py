"""Synthetischer Brauerei-Datensatz für die Showcase-App (Modell „ZlatyLev Showcase“).

Brauerei-Case ZLATÝ LEV: Biere, Kunden und Zahlen sind erfunden
(fester Seed, deterministisch). Vertrag: examples/showcase/CONTRACT.md.

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
        "rows": {"fakten": len(fakten), "fakten2026": len(f26), "kombinationen": len(combos)},
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
    (HERE / "control.json").write_text(json.dumps(control, ensure_ascii=False, indent=2), encoding="utf-8")

    # ------------------------------------------------------------ Mini-DAX-Fixtures (Spaltennamen wie im Modell)
    OUT_JSON.mkdir(parents=True, exist_ok=True)
    rename = {
        "kalender": {"JahrQuartal": "Jahr Quartal"},
        "produkt": {"ProduktSort": "Produkt Sort", "SorteSort": "Sorte Sort", "AlkoholProzent": "Alkohol %"},
        "kunde": {"KanalSort": "Kanal Sort"},
        "konto": {"L1Sort": "L1 Sort", "Brueckentyp": "Brückentyp"},
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

    print(json.dumps(control, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
