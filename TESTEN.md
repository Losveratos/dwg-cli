# dwg testen · Anleitung für Testerinnen und Tester

Danke, dass du dir dwg anschaust! Diese Anleitung bringt dich in etwa 20 Minuten vom leeren Rechner zum ersten eigenen
Ergebnis. Du brauchst dafür **keinen Fabric- oder Power-BI-Zugang**. Alles läuft lokal, alle Zahlen sind Demodaten.

## Worum geht es?

dwg (Arbeitsname) macht aus **einer Beschreibung** (einer JSON-Datei, der „App-Spec“) zwei Dinge:

1. eine **Fabric App** (Web-App in Microsoft Fabric) und
2. denselben **Power-BI-Bericht** als PBIP-Projekt.

In beiden stecken dieselben Original-Visuals **ChartKitchen byDatenWG** und **P&L Statement byDatenWG** (eine GuV, an
IBCS angelehnt). In der App laufen sie mit ihrem unveränderten Code, die Daten kommen per DAX aus einem Semantikmodell.
Zum Testen ersetzt eine kleine DAX-Engine (Mini-DAX) das Modell und rechnet auf Demodaten.

Neu in 0.1: Die 28 Templates der beiden Visuals stehen als Katalog bereit (`dwg templates`), und `dwg tile add` legt eine
Kachel aus einem Template an und schlägt die Felder aus dem Modell vor.

## Was du brauchst

- Das öffentliche GitHub-Repo `Losveratos/dwg-cli` (ein GitHub-Konto brauchst du nur für Issues).
- **Node.js 22** (https://nodejs.org) und **git** (https://git-scm.com). Windows, macOS und Linux gehen.
- Etwa **1 GB** freien Platz (Pakete und ein Chromium für die Browser-Tests, wird einmalig geladen).
- Empfohlen: **Claude Code** (Terminal, VS Code oder Claude Desktop). Ohne geht es auch, dann nur Teil 1 und 3.

dwg ist eine frühe Vorschau und wird öffentlich entwickelt. Rückmeldungen gern als Issue im Repo.

## Teil 1 · Einrichten (ca. 10 Minuten)

Im Terminal (Windows: PowerShell oder Git Bash):

```bash
git clone https://github.com/Losveratos/dwg-cli
cd dwg-cli
node install.mjs --full-test
```

Der Installer prüft Node, git und npm, installiert die Pakete, lädt Chromium und kopiert den Claude-Skill `dwg` nach
`~/.claude/skills/dwg`. Am Ende laufen alle Tests, das dauert einige Minuten.

**So sieht Erfolg aus:** am Ende steht `✓ dwg eingerichtet: … 0 Fehler`. Hinweise sind in Ordnung, z. B.
„Kitchen-Repo nicht gefunden“ (brauchst du nicht) oder „npm 11 nehmen“ (nur für eigene Apps nötig).

Danach siehst du dir die Screenshots an, die die Browser-Tests gemacht haben:

```
app/test/out/guv-statement/1-hell.png   GuV als Tabelle
app/test/out/guv-baum/1-hell.png        GuV als Werttreiberbaum
app/test/out/dwg-spike/2-filter.png     ChartKitchen-Seite nach einem Klick (Querfilter)
app/test/out/shell/                     App-Rahmen mit Navigation und Filter-Panel
```

Je Seite gibt es mehrere Bilder: hell, nach dem Filtern, dunkel und schmal (Handy-Breite). Alle 30 Templates als
Seiten: `npm run test:showcase`, Bilder unter `app/test/out/showcase/`.

## Teil 2 · Mit Claude Code ausprobieren (empfohlen)

Öffne den Ordner `dwg-cli` in Claude Code. Der Skill `dwg` ist nach dem Installer in jeder Sitzung da. Dann probier
zum Beispiel diese Sätze:

- „Erklär mir in fünf Sätzen, was dwg kann, und zeig mir die Templates.“
- „Bau mit dwg eine Seite aus Template C03 auf dem Showcase-Modell, Kennzahl Umsatz. Zeig mir erst, welche Felder du
  nimmst, dann erzeuge den Power-BI-Bericht und prüf ihn.“
- „Ändere in specs/guv.json das Statement auf den Vergleich mit dem Vorjahr und zeig mir das Ergebnis im Browser-Test.“

Achte darauf, ob Claude die Spec und die Feldauswahl verständlich erklärt, ob das Ergebnis so aussieht wie beschrieben
und wo es hakt.

## Teil 3 · Ohne Claude, von Hand

**A · Kachel aus einem Template:**

```bash
node dwg.mjs templates
node dwg.mjs tile add --spec quickstart/app-spec.json --new-page "Umsatz" --template C03 \
  --model "examples/showcase/ZlatyLev Showcase.SemanticModel" --measure Umsatz
node dwg.mjs lint --spec quickstart/app-spec.json
```

In PowerShell (Windows) dieselben Schritte, nur die Fortsetzungszeile endet mit einem Backtick statt `\`:

```powershell
node dwg.mjs templates
node dwg.mjs tile add --spec quickstart/app-spec.json --new-page "Umsatz" --template C03 `
  --model "examples/showcase/ZlatyLev Showcase.SemanticModel" --measure Umsatz
node dwg.mjs lint --spec quickstart/app-spec.json
```

`tile add` zeigt, welche Felder es gewählt hat und welche Alternativen es gibt. Probier auch ein Template ohne
`--measure` oder mit einer Rolle von Hand, z. B. `--category Kunde.Region`.

**B · Eine Einstellung an der GuV ändern und ansehen:**

1. Öffne `specs/guv.json`. Bei der Kachel `"id": "statement"` steht unter `"objects"` ein Block `"columns"`.
   Ändere dort `"preset": "acpldpl"` auf `"preset": "acpydpy"` und `"reference": "pl"` auf `"reference": "py"`
   (Vergleich mit dem Vorjahr statt mit dem Plan).
2. Seite im Browser-Test neu erzeugen: `node app/test/e2e.mjs --page guv-statement`
3. Schau dir `app/test/out/guv-statement/1-hell.png` an: Jetzt steht PY statt PL in den Spalten.
4. Derselbe Stand als Power-BI-Bericht:

   ```bash
   node dwg.mjs pbip pages --report "examples/DWG GuV.Report" --spec specs/guv.json
   node dwg.mjs validate "examples/DWG GuV.Report"
   ```

   Das prüft den Bericht gegen die offiziellen Power-BI-Schemas. In Power BI Desktop öffnen geht nicht, weil die
   Demodaten des Modells nicht im Repo liegen.

Am Ende verwirfst du deine Änderungen mit `git checkout -- .` und `git clean -fd quickstart "examples/DWG GuV.Report"`.

Alle Befehle siehst du mit `node dwg.mjs`. Die Beschreibung aller Rollen und Optionen der Spec steht in
`skill/dwg/references/app-spec.md`, das Handbuch in `docs/handbuch.md`.

## Wenn etwas nicht klappt

| Problem | Was hilft |
| --- | --- |
| `npm` meldet `ECONNRESET` oder Netzwerkfehler | Installer einfach noch einmal starten |
| Browser-Tests starten nicht | `npx playwright install chromium`, dann `npm test` |
| Unklar, was fehlt | `node dwg.mjs doctor` prüft alles, ohne etwas zu ändern |
| Später neuer Stand | `node dwg.mjs update` holt ihn und richtet neu ein |

## Was mich interessiert

Schreib mir gern kurz zu diesen Punkten, am besten als Issue im Repo:

1. **Einrichten:** Hat es auf Anhieb geklappt? Wie lange hat es gedauert? Welches Betriebssystem?
2. **Verstehen:** War nach Teil 1 und 2 klar, was dwg macht und wofür man es braucht?
3. **Templates und Felder:** Hat `tile add` die richtigen Felder gewählt? Wo nicht, mit Befehl und erwartetem Feld.
4. **Ergebnis:** Sehen die Visuals in den Screenshots so aus, wie du sie aus Power BI kennst? Was fällt dir auf?
5. **Nutzen:** Wofür würdest du das einsetzen, und was müsste es dafür noch können?
6. **Fehler:** Alles, was abgestürzt ist oder komisch aussah, am besten mit Screenshot oder Fehlermeldung.

Danke dir!
