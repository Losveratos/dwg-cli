// Tests für den Visual-Stand (visuals/lib/release.mjs) und die Kommandozeile von `dwg visuals update`, ohne Kitchen-Repo
// und ohne Netz: veröffentlichte Versionen kommen aus einem eingespielten fetch.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    VISUALS, changelogWithVisuals, compareVersions, consistency, installedVersions, latestVersions, pbivizName, pbivizPath,
    replaceVersionsInText, versionOfFile, versionReport, visualOf,
} from "../lib/release.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log(`  ok  ${name}`); };

await test("visualOf, versionOfFile, pbivizName, pbivizPath", () => {
    assert.equal(visualOf("chartKitchenByDatenWGD9DE0F7AD44D41058672C6FBF6F5A18D"), "chartkitchen");
    assert.equal(visualOf("pnlByDatenWG.1.5.3.0.pbiviz"), "pnl");
    assert.equal(visualOf("dataKitchenGantt.1.15.0.0.pbiviz"), null);
    // die GUID endet auf Ziffern (…6358): nur die Version vor .pbiviz zählt
    assert.equal(versionOfFile("pnlByDatenWG3F9A7D2C51E64B08A1C4E7F0B92D6358.1.5.3.0.pbiviz"), "1.5.3.0");
    assert.equal(versionOfFile("chartKitchenByDatenWG.1.53.0.0.pbiviz"), "1.53.0.0");
    assert.equal(versionOfFile("pbiviz.json"), null);
    assert.equal(pbivizName("chartkitchen", "1.53.0.0"), "chartKitchenByDatenWG.1.53.0.0.pbiviz");
    const files = ["chartKitchenByDatenWGD9DE.1.52.3.0.pbiviz", "chartKitchenByDatenWGD9DE.1.53.0.0.pbiviz", "x.txt"];
    assert.equal(pbivizPath("chartkitchen", "1.53.0.0", files), "ibcsInspiredChartDeck/dist/chartKitchenByDatenWGD9DE.1.53.0.0.pbiviz");
    assert.equal(pbivizPath("chartkitchen", "1.54.0.0", files), null);
});

await test("compareVersions zählt numerisch je Stelle", () => {
    assert.ok(compareVersions("1.53.0.0", "1.52.3.0") > 0);
    assert.ok(compareVersions("1.5.3.0", "1.10.0.0") < 0);
    assert.equal(compareVersions("1.5.3.0", "1.5.3.0"), 0);
});

await test("installedVersions liest Adapter, .pbiviz und Beispielberichte dieses Repos", () => {
    const i = installedVersions(ROOT);
    for (const v of Object.keys(VISUALS)) {
        assert.match(i.build[v], /^\d+\.\d+\.\d+\.\d+$/, `BUILD.json ${v}`);
        assert.ok(i.pbiviz[v].length >= 1, `.pbiviz ${v}`);
    }
    assert.ok(Object.keys(i.reports).length >= 2, "Beispielberichte");
    assert.ok(Object.values(i.reports).every(r => r.chartkitchen && r.pnl), "jeder Beispielbericht hat beide Visuals");
    // das Repo selbst ist widerspruchsfrei (sonst dwg visuals update)
    assert.deepEqual(consistency(i), []);
});

await test("consistency nennt .pbiviz und Berichte, die nicht auf dem Adapter-Stand sind", () => {
    const ok = { build: { chartkitchen: "1.53.0.0", pnl: "1.5.3.0" }, pbiviz: { chartkitchen: ["1.53.0.0"], pnl: ["1.5.3.0"] },
        reports: { "examples/A.Report": { chartkitchen: "1.53.0.0", pnl: "1.5.3.0" } } };
    assert.deepEqual(consistency(ok), []);
    const bad = structuredClone(ok);
    bad.pbiviz.chartkitchen = ["1.52.3.0", "1.53.0.0"];
    bad.reports["examples/A.Report"].chartkitchen = "1.51.1.0";
    bad.pbiviz.pnl = [];
    const p = consistency(bad);
    assert.ok(p.some(x => /mehrere \.pbiviz/.test(x)), p.join("|"));
    assert.ok(p.some(x => /examples\/A\.Report hat 1\.51\.1\.0/.test(x)), p.join("|"));
    assert.ok(p.some(x => /P&L 1\.5\.3\.0: keine \.pbiviz/.test(x)), p.join("|"));
    const none = { build: {}, pbiviz: { chartkitchen: [], pnl: [] }, reports: {} };
    assert.ok(consistency(none).every(x => /ohne Version/.test(x)));
});

await test("latestVersions: Share-Repo zuerst, latest.json als Rückfall, Fehler benannt", async () => {
    const tree = { tree: [
        { path: "chartkitchen/chartKitchenByDatenWGD9DE.1.53.0.0.pbiviz" }, { path: "chartkitchen/chartKitchenByDatenWGD9DE.1.52.3.0.pbiviz" },
        { path: "pnl-statement/pnlByDatenWG3F9A.1.5.3.0.pbiviz" }, { path: "gantt/dataKitchenGantt.1.15.0.0.pbiviz" }, { path: "README.md" },
    ] };
    const resp = (ok, json) => ({ ok, status: ok ? 200 : 500, json: async () => json });
    const a = await latestVersions({ fetchImpl: async url => resp(/api\.github/.test(url), tree) });
    assert.deepEqual(a.versions, { chartkitchen: "1.53.0.0", pnl: "1.5.3.0" });
    const b = await latestVersions({ fetchImpl: async url => (/api\.github/.test(url) ? resp(false) : resp(true, { version: "1.53.0.0", date: "24.10.2026" })) });
    assert.deepEqual(b.versions, { chartkitchen: "1.53.0.0" });
    assert.match(b.source, /latest\.json/);
    await assert.rejects(latestVersions({ fetchImpl: async () => { throw new Error("ENOTFOUND"); } }), /ENOTFOUND; ENOTFOUND/);
});

await test("versionReport: neuer veröffentlicht → Hinweis mit dwg visuals update, sonst ok", () => {
    const i = { build: { chartkitchen: "1.52.3.0", pnl: "1.5.3.0" } };
    const r = versionReport(i, { versions: { chartkitchen: "1.53.0.0", pnl: "1.5.3.0" } });
    assert.equal(r[0].level, "warn"); assert.match(r[0].text, /ChartKitchen 1\.53\.0\.0 ist veröffentlicht.*1\.52\.3\.0.*dwg visuals update/);
    assert.equal(r[1].level, "ok"); assert.match(r[1].text, /aktuell/);
    const off = versionReport(i, null);
    assert.ok(off.every(l => l.level === "ok" && /im Adapter$/.test(l.text)));
    const ahead = versionReport({ build: { chartkitchen: "1.54.0.0" } }, { versions: { chartkitchen: "1.53.0.0" } });
    assert.match(ahead[0].text, /Vorabstand/);
});

await test("replaceVersionsInText hebt nur die .pbiviz-Dateinamen", () => {
    const src = "--pbiviz visuals/pbiviz/chartKitchenByDatenWG.1.52.3.0.pbiviz --pbiviz visuals/pbiviz/pnlByDatenWG.1.5.3.0.pbiviz\nChartKitchen 1.52.3.0 im Text bleibt.";
    const { text, count } = replaceVersionsInText(src, { chartkitchen: "1.53.0.0", pnl: "1.5.3.0" });
    assert.equal(count, 1);
    assert.match(text, /chartKitchenByDatenWG\.1\.53\.0\.0\.pbiviz/);
    assert.match(text, /pnlByDatenWG\.1\.5\.3\.0\.pbiviz/);
    assert.match(text, /ChartKitchen 1\.52\.3\.0 im Text bleibt/);
    assert.equal(replaceVersionsInText(text, { chartkitchen: "1.53.0.0", pnl: "1.5.3.0" }).count, 0);
});

await test("changelogWithVisuals: Zeile unter Unreleased, anlegen, ersetzen, Zeilenenden behalten", () => {
    const v = { chartkitchen: "1.53.0.0", pnl: "1.5.3.0" }, prev = { chartkitchen: "1.52.3.0", pnl: "1.5.3.0" };
    const withSection = "# Changelog\n\n## Unreleased\n\n- first fix\n- second fix\n\n## 0.1.1\n\n- older\n";
    const a = changelogWithVisuals(withSection, v, prev);
    const lines = a.split("\n");
    const at = lines.findIndex(l => l.startsWith("- **Visuals:**"));
    assert.ok(at > lines.indexOf("- second fix") && at < lines.indexOf("## 0.1.1"), a);
    assert.match(lines[at], /ChartKitchen 1\.53\.0\.0 \(from 1\.52\.3\.0\) and P&L 1\.5\.3\.0\./);
    // zweiter Lauf ersetzt die Zeile statt sie zu doppeln
    const b = changelogWithVisuals(a, { chartkitchen: "1.54.0.0", pnl: "1.5.3.0" }, v);
    assert.equal(b.split("\n").filter(l => l.startsWith("- **Visuals:**")).length, 1);
    assert.match(b, /ChartKitchen 1\.54\.0\.0 \(from 1\.53\.0\.0\)/);
    // ohne Unreleased-Abschnitt wird er angelegt
    const c = changelogWithVisuals("# Changelog\n\n## 0.1.1\n\n- older\n", v, {});
    assert.match(c, /^# Changelog\n\n## Unreleased\n\n- \*\*Visuals:\*\* .*ChartKitchen 1\.53\.0\.0 and P&L 1\.5\.3\.0\.\n\n## 0\.1\.1/);
    // CRLF bleibt CRLF
    const d = changelogWithVisuals(withSection.replace(/\n/g, "\r\n"), v, prev);
    assert.ok(d.includes("\r\n") && !/[^\r]\n/.test(d));
});

await test("Kommandozeile: visuals update ohne Kitchen-Klon meldet den Pfad und endet mit 1", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dwg-nokitchen-"));
    const r = spawnSync(process.execPath, [path.join(ROOT, "dwg.mjs"), "visuals", "update", "--dry-run", "--kitchen", tmp],
        { encoding: "utf8", cwd: ROOT, env: { ...process.env, DWG_KITCHEN: tmp } });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /Kitchen-Repo nicht gefunden/);
    assert.ok(r.stderr.includes(tmp));
});

console.log(`release: ${n} Tests grün`);
