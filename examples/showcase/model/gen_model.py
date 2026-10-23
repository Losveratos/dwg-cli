"""Erzeugt das Direct-Lake-Gerüst (Tabellen, Partitionen, Beziehungen) des Modells „ZlatyLev Showcase“
auf dem Lakehouse ZlatyLev_Showcase. Measures, Sortierung, Formate und Beschreibungen setzt danach model.csx
(te script). Vertrag: examples/showcase/CONTRACT.md.

Aufruf (aus dem Repo):
  DWG_SQL_HOST=<host> DWG_SQL_ID=<id> python examples/showcase/model/gen_model.py
  te script -m "examples/showcase/ZlatyLev Showcase.SemanticModel" --file examples/showcase/model/model.csx --save
  te validate -m "examples/showcase/ZlatyLev Showcase.SemanticModel" --errors-only
"""
import json
import os
import pathlib
import shutil
import uuid

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent / "ZlatyLev Showcase.SemanticModel"
NAME = "ZlatyLev Showcase"
# SQL-Endpunkt des Lakehouse ZlatyLev_Showcase (fab get ".../ZlatyLev_Showcase.Lakehouse" -q properties.sqlEndpointProperties)
SQL_HOST = os.environ.get("DWG_SQL_HOST", "<sql-endpoint>.datawarehouse.fabric.microsoft.com")
SQL_ID = os.environ.get("DWG_SQL_ID", "00000000-0000-0000-0000-000000000000")
LOGICAL_ID = "5d0c3a8e-6f1b-4c2a-9e47-2a1b8c7d9e01"   # fest, damit Neuerzeugen keinen neuen Git-Item-Schlüssel ergibt

# Modelltabelle → (Lakehouse-Tabelle, [(Spalte im Modell, Quellspalte, Typ)])
TABLES = {
    "Kalender": ("kalender", [
        ("Datum", "Datum", "dateTime"), ("Jahr", "Jahr", "int64"), ("Monat", "Monat", "int64"),
        ("Monatsname", "Monatsname", "string"), ("Periode", "Periode", "string"), ("Quartal", "Quartal", "string"),
        ("Jahr Quartal", "JahrQuartal", "string"), ("Ist", "Ist", "boolean")]),
    "Produkt": ("produkt", [
        ("ProduktID", "ProduktID", "string"), ("Produkt", "Produkt", "string"), ("Produkt Sort", "ProduktSort", "int64"),
        ("Sorte", "Sorte", "string"), ("Sorte Sort", "SorteSort", "int64"), ("Alkohol %", "AlkoholProzent", "double")]),
    "Kunde": ("kunde", [
        ("KundeID", "KundeID", "string"), ("Kunde", "Kunde", "string"), ("Kanal", "Kanal", "string"),
        ("Kanal Sort", "KanalSort", "int64"), ("Region", "Region", "string"), ("Land", "Land", "string")]),
    "Konto": ("konto", [
        ("KontoID", "KontoID", "string"), ("ParentID", "ParentID", "string"), ("Konto", "Konto", "string"),
        ("L1", "L1", "string"), ("L1 Sort", "L1Sort", "int64"), ("L2", "L2", "string"), ("SortOrder", "SortOrder", "int64"),
        ("RowType", "RowType", "string"), ("FormulaDef", "FormulaDef", "string"), ("SignConvention", "SignConvention", "int64"),
        ("DisplayInvert", "DisplayInvert", "string"), ("VarianceInvert", "VarianceInvert", "string"),
        ("Kommentar", "Kommentar", "string"), ("Bereich", "Bereich", "string"), ("Brückentyp", "Brueckentyp", "string")]),
    "Fakten": ("fakten", [
        ("Datum", "Datum", "dateTime"), ("KontoID", "KontoID", "string"), ("KundeID", "KundeID", "string"),
        ("ProduktID", "ProduktID", "string"), ("AC", "AC", "double"), ("PY", "PY", "double"), ("PL", "PL", "double"),
        ("FC", "FC", "double"), ("FC_FY", "FC_FY", "double"), ("PL_FY", "PL_FY", "double"),
        ("Hektoliter AC", "HektoliterAC", "double"), ("Hektoliter PY", "HektoliterPY", "double"),
        ("Hektoliter PL", "HektoliterPL", "double"), ("Hektoliter FC", "HektoliterFC", "double")]),
}
RELATIONSHIPS = [("Datum", "Kalender", "Datum"), ("KontoID", "Konto", "KontoID"),
                 ("KundeID", "Kunde", "KundeID"), ("ProduktID", "Produkt", "ProduktID")]


def q(name):
    """TMDL-Namen mit Leerzeichen oder Sonderzeichen in Hochkommas."""
    return name if name.replace("_", "").isalnum() and name.isascii() else "'" + name.replace("'", "''") + "'"


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    d = OUT / "definition"
    (d / "tables").mkdir(parents=True)

    def w(p, s):
        p.write_text(s, encoding="utf-8")

    w(OUT / ".platform", json.dumps({
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",
        "metadata": {"type": "SemanticModel", "displayName": NAME},
        "config": {"version": "2.0", "logicalId": LOGICAL_ID}}, indent=2, ensure_ascii=False))
    w(OUT / "definition.pbism", json.dumps({
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json",
        "version": "4.2", "settings": {}}, indent=2))
    w(d / "database.tmdl", "database\n\tcompatibilityLevel: 1604\n")
    w(d / "model.tmdl", "model Model\n\tculture: de-DE\n\tdefaultPowerBIDataSourceVersion: powerBI_V3\n\tdiscourageImplicitMeasures\n\n"
      + "".join(f"ref table {q(t)}\n" for t in TABLES))
    w(d / "expressions.tmdl",
      f'expression DatabaseQuery =\n\t\tlet\n\t\t\tdatabase = Sql.Database("{SQL_HOST}", "{SQL_ID}")\n\t\tin\n\t\t\tdatabase\n'
      f"\tlineageTag: {uuid.uuid5(uuid.NAMESPACE_URL, NAME + '/DatabaseQuery')}\n")

    for t, (src, cols) in TABLES.items():
        tag = lambda s: uuid.uuid5(uuid.NAMESPACE_URL, f"{NAME}/{t}/{s}")
        lines = [f"table {q(t)}", f"\tlineageTag: {tag('')}", f"\tsourceLineageTag: [dbo].[{src}]", ""]
        for c, sc, typ in cols:
            lines += [f"\tcolumn {q(c)}", f"\t\tdataType: {typ}", f"\t\tlineageTag: {tag(c)}",
                      f"\t\tsourceLineageTag: {sc}", "\t\tsummarizeBy: none", f"\t\tsourceColumn: {sc}", ""]
        lines += [f"\tpartition {q(t)} = entity", "\t\tmode: directLake", "\t\tsource", f"\t\t\tentityName: {src}",
                  "\t\t\tschemaName: dbo", "\t\t\texpressionSource: DatabaseQuery", ""]
        w(d / "tables" / f"{t}.tmdl", "\n".join(lines))

    rel = []
    for fc, dt, dc in RELATIONSHIPS:
        rel += [f"relationship {uuid.uuid5(uuid.NAMESPACE_URL, f'{NAME}/rel/{dt}')}",
                f"\tfromColumn: Fakten.{q(fc)}", f"\ttoColumn: {q(dt)}.{q(dc)}", ""]
    w(d / "relationships.tmdl", "\n".join(rel))
    print(OUT)


if __name__ == "__main__":
    main()
