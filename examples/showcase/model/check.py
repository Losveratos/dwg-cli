"""Kontrollwerte aus examples/showcase/data/control.json per DAX gegen das Modell im Service prüfen.
Aufruf: DWG_SHOWCASE_MODEL="<Workspace>.Workspace/ZlatyLev Showcase.SemanticModel" python examples/showcase/model/check.py   (braucht fab-Anmeldung und das Skript execute_dax.py des fabric-cli-Plugins)"""
import glob
import json
import os
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
CONTROL = json.loads((HERE.parent / "data" / "control.json").read_text(encoding="utf-8"))
M = os.environ.get("DWG_SHOWCASE_MODEL", "<Workspace>.Workspace/ZlatyLev Showcase.SemanticModel")  # fab-Pfad zum Modell
S = sorted(glob.glob(os.path.expanduser(
    r"~\.claude\plugins\cache\power-bi-agentic-development\fabric-cli\*\skills\fabric-cli\scripts\execute_dax.py")))[-1]

c26, c25, st = CONTROL["2026"], CONTROL["2025"], CONTROL["Geschichten Jan bis Aug 2026"]
CHECKS = [
    ("2026", "'Kalender'[Jahr] = 2026", {**{k: c26[k] for k in [
        "GuV AC", "GuV PY", "GuV PL", "GuV FC", "GuV FC FY", "GuV PL FY", "Umsatz AC", "Umsatz PY bis Ist",
        "Umsatz PL bis Ist", "Umsatz PL", "Umsatz FC", "Wareneinsatz AC", "DB AC", "DB-Marge % AC", "Kosten AC",
        "EBIT AC", "EBIT PL bis Ist", "Absatz hl AC", "Absatz hl PL bis Ist"]},
        "Umsatz FC FY": c26["Umsatz FC"], "Umsatz PL FY": c26["Umsatz PL"],
        "Erlös je hl AC": c26["Umsatz AC"] / c26["Absatz hl AC"]}),
    ("2025", "'Kalender'[Jahr] = 2025", {k: c25[k] for k in ["Umsatz AC", "Umsatz PL", "EBIT AC", "Absatz hl AC"]}),
    ("Polen", "'Kalender'[Jahr] = 2026, 'Kunde'[Region] = \"Polen\"",
     {"Umsatz AC": st["Region Polen"]["Umsatz AC"], "Umsatz PL bis Ist": st["Region Polen"]["Umsatz PL"],
      "Umsatz PY bis Ist": st["Region Polen"]["Umsatz PY"]}),
    ("Praha", "'Kalender'[Jahr] = 2026, 'Produkt'[ProduktID] = \"P03\"",
     {"Umsatz AC": st["Praha Premium 13°"]["Umsatz AC"], "Umsatz PL bis Ist": st["Praha Premium 13°"]["Umsatz PL"]}),
    ("Logistik", "'Kalender'[Jahr] = 2026, 'Konto'[KontoID] = \"6200\"",
     {"Kosten AC": st["Logistik"]["AC"], "Kosten PL bis Ist": st["Logistik"]["PL"]}),
]

bad = 0
for label, flt, exp in CHECKS:
    cols = ", ".join(f'"{k}", [{k}]' for k in exp)
    q = f"EVALUATE CALCULATETABLE(ROW({cols}), {flt})"
    r = subprocess.run([sys.executable, S, M, "-q", q, "--format", "json"], capture_output=True, text=True, encoding="utf-8")
    try:
        row = json.loads(r.stdout)["text"]["results"][0]["tables"][0]["rows"][0]
    except Exception:
        print(label, "FEHLER", r.stdout[-800:], r.stderr[-800:])
        bad += 1
        continue
    for k, v in exp.items():
        got = next(val for key, val in row.items() if key.strip("[]") == k)
        ok = abs((got or 0) - v) <= max(0.05, abs(v) * 1e-9)
        bad += not ok
        print(f"{'ok ' if ok else 'XX '} {label:9} {k:22} {got!r:>22} {'' if ok else f'erwartet {v}'}")
print("alle Kontrollwerte bestätigt" if not bad else f"{bad} Abweichungen")
sys.exit(1 if bad else 0)
