// `dwg visuals update`: ein neues Visual-Release in dieses Repo bringen, alles in einem Schritt.
//
//   node dwg.mjs visuals update [--kitchen <Kitchen-Klon>] [--ref origin/main] [--pbiviz <datei> …]
//                               [--no-fetch] [--no-test] [--force] [--dry-run] [--commit]
//
// Schritte: Kitchen-Stand als eigener Checkout unter .kitchen/ (git worktree des Klons, losgelöst auf --ref, Standard
// origin/main nach git fetch) → Versionen aus pbiviz.json lesen → Adapter bauen (visuals/build.mjs) → .pbiviz nach
// visuals/pbiviz/ (ältere Version derselben Visuals raus) → Beispielberichte unter examples/ neu registrieren →
// Dateinamen in README, TESTEN.md, docs/, skill/ heben, CHANGELOG-Zeile unter Unreleased → npm test.
// Der Checkout liegt immer unter .kitchen/ (gitignored), damit die Chunk-Hashes des Adapters nicht vom Pfad des
// Kitchen-Klons abhängen: wer auch immer baut, bekommt dieselben Dateinamen in dist/.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerVisual } from "../pbip/lib/report.mjs";
import {
    VISUALS, changelogWithVisuals, compareVersions, exampleReports, installedVersions, pbivizName, pbivizPath,
    replaceVersionsInText, versionOfFile, versionOfPbivizJson, visualOf,
} from "./lib/release.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const WIN = process.platform === "win32";

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const vals = f => argv.flatMap((a, i) => (a === f && argv[i + 1] && !argv[i + 1].startsWith("--") ? [argv[i + 1]] : []));
const val = f => vals(f)[0];
const DRY = has("--dry-run");
const say = m => console.log(m);

function git(args, cwd, { quiet = true } = {}) {
    const r = spawnSync("git", args, { cwd, encoding: "utf8", stdio: quiet ? "pipe" : "inherit" });
    return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}
const fail = m => { console.error(`Fehler: ${m}`); process.exit(1); };

// ---------------------------------------------------------------- 1 · Kitchen-Klon und Checkout unter .kitchen/
const isKitchen = p => p && fs.existsSync(path.join(p, "ibcsInspiredChartDeck", "src", "visual.ts"));
const candidates = [val("--kitchen"), process.env.DWG_KITCHEN, path.resolve(ROOT, "..", "PowerBI-Kitchen-")].filter(Boolean);
const clone = candidates.find(isKitchen);
if (!clone) { fail(`Kitchen-Repo nicht gefunden (geprüft: ${candidates.join(", ")}). --kitchen <pfad> oder DWG_KITCHEN setzen.`); }
if (git(["rev-parse", "--git-dir"], clone).code !== 0) { fail(`${clone} ist kein Git-Checkout; --ref braucht einen Klon von PowerBI-Kitchen-.`); }

const ref = val("--ref") ?? "origin/main";
const KITCHEN = path.join(ROOT, ".kitchen");
say(`Kitchen-Klon: ${clone}\nStand: ${ref} → ${KITCHEN}`);
if (!has("--no-fetch") && /^origin\//.test(ref)) {
    const f = git(["fetch", "origin"], clone);
    if (f.code !== 0) { fail(`git fetch im Kitchen-Klon: ${f.out}`); }
}
const head = git(["rev-parse", "--short", ref], clone);
if (head.code !== 0) { fail(`Stand ${ref} gibt es im Kitchen-Klon nicht: ${head.out}`); }
// Versionen und .pbiviz-Namen kommen aus dem Git-Stand (nicht aus dem Arbeitsverzeichnis des Klons, das auf einem
// anderen Branch stehen kann); erst danach wird ausgecheckt
const fileAt = rel => { const r = git(["show", `${ref}:${rel}`], clone); return r.code === 0 ? r.out : null; };
const listAt = rel => { const r = git(["ls-tree", "--name-only", ref, `${rel}/`], clone); return r.code === 0 ? r.out.split(/\r?\n/).filter(Boolean).map(p => p.split("/").pop()) : []; };

// ---------------------------------------------------------------- 2 · Versionen alt und neu
const before = installedVersions(ROOT).build;
const next = {};
for (const [v, { dir }] of Object.entries(VISUALS)) {
    const j = fileAt(`${dir}/pbiviz.json`);
    if (!j) { fail(`${dir}/pbiviz.json fehlt im Stand ${ref}.`); }
    next[v] = versionOfPbivizJson(j);
}
const changed = Object.keys(VISUALS).filter(v => next[v] !== before[v]);
say(`Kitchen ${head.out}:`);
for (const [v, { label }] of Object.entries(VISUALS)) {
    const arrow = next[v] === before[v] ? "unverändert" : `${before[v] ?? "–"} → ${next[v]}${compareVersions(next[v], before[v] ?? "0") < 0 ? " (älter!)" : ""}`;
    say(`  ${label.padEnd(12)} ${next[v]}  ${arrow}`);
}
if (!changed.length && !has("--force")) { say("Nichts zu tun: der Adapter hat schon diesen Stand (--force baut trotzdem)."); process.exit(0); }

// ---------------------------------------------------------------- 3 · .pbiviz finden
const given = vals("--pbiviz").map(f => path.resolve(f));
const pbiviz = {};   // je Visual: { file: absoluter Pfad nach dem Checkout, label: Anzeige }
for (const v of Object.keys(VISUALS)) {
    const own = given.find(f => visualOf(path.basename(f)) === v && versionOfFile(path.basename(f)) === next[v]);
    if (own) {
        if (!fs.existsSync(own)) { fail(`${own} nicht gefunden.`); }
        pbiviz[v] = { file: own, label: path.relative(ROOT, own) };
        continue;
    }
    const rel = pbivizPath(v, next[v], listAt(`${VISUALS[v].dir}/dist`));
    if (!rel) {
        fail(`${VISUALS[v].label} ${next[v]}: keine .pbiviz unter ${VISUALS[v].dir}/dist im Stand ${ref}. `
            + `Im Kitchen-Repo paketieren (dist committen) oder die Datei mit --pbiviz <datei> angeben.`);
    }
    pbiviz[v] = { file: path.join(KITCHEN, rel), label: `${ref}:${rel}` };
}
const reports = exampleReports(ROOT);
say(`\nPlan:\n  Adapter bauen aus .kitchen (${ref}, ${head.out})\n` + Object.keys(VISUALS).map(v => `  ${pbivizName(v, next[v])}  ← ${pbiviz[v].label}`).join("\n")
    + `\n  Beispielberichte neu registrieren: ${reports.map(r => path.relative(ROOT, r)).join(", ") || "keine"}`
    + `\n  Dateinamen in README.md, TESTEN.md, docs/, skill/ heben, CHANGELOG ergänzen${has("--no-test") ? "" : ", npm test"}`);
if (DRY) { say("\n(--dry-run: nichts geändert)"); process.exit(0); }

// ---------------------------------------------------------------- 4 · Checkout unter .kitchen/ und Adapter bauen
say("\n▸ Kitchen-Stand auschecken");
if (fs.existsSync(KITCHEN)) {
    if (git(["rev-parse", "--git-dir"], KITCHEN).code !== 0) { fail(`${KITCHEN} gibt es schon und ist kein Git-Checkout. Ordner entfernen.`); }
    const c = git(["checkout", "--detach", "--force", ref], KITCHEN);
    if (c.code !== 0) { fail(`git checkout ${ref} in .kitchen: ${c.out}`); }
} else {
    const w = git(["worktree", "add", "--detach", KITCHEN, ref], clone);
    if (w.code !== 0) { fail(`git worktree add: ${w.out}`); }
}
if (!isKitchen(KITCHEN)) { fail(`Kein Visual-Quellcode unter ${KITCHEN}.`); }
say(`  ${KITCHEN} auf ${git(["rev-parse", "--short", "HEAD"], KITCHEN).out}`);

say("\n▸ Adapter bauen");
const b = spawnSync(process.execPath, [path.join(HERE, "build.mjs"), "--kitchen", KITCHEN], { stdio: "inherit" });
if (b.status !== 0) { fail("visuals build fehlgeschlagen (Ausgabe oben)."); }

// ---------------------------------------------------------------- 5 · .pbiviz übernehmen
say("\n▸ .pbiviz nach visuals/pbiviz/");
const pbDir = path.join(ROOT, "visuals", "pbiviz");
fs.mkdirSync(pbDir, { recursive: true });
for (const v of Object.keys(VISUALS)) {
    for (const f of fs.readdirSync(pbDir)) {
        if (visualOf(f) === v && f !== pbivizName(v, next[v])) { fs.rmSync(path.join(pbDir, f)); say(`  entfernt ${f}`); }
    }
    fs.copyFileSync(pbiviz[v].file, path.join(pbDir, pbivizName(v, next[v])));
    say(`  ${pbivizName(v, next[v])}`);
}

// ---------------------------------------------------------------- 6 · Beispielberichte
say("\n▸ Beispielberichte registrieren");
for (const r of reports) {
    const had = fs.existsSync(path.join(r, "CustomVisuals"));
    if (!had) { say(`  ${path.relative(ROOT, r)}: keine Custom Visuals, übersprungen`); continue; }
    const done = Object.keys(VISUALS).map(v => { const x = registerVisual(r, path.join(pbDir, pbivizName(v, next[v]))); return `${VISUALS[v].label} ${x.version}`; });
    say(`  ${path.relative(ROOT, r)}: ${done.join(", ")}`);
}

// ---------------------------------------------------------------- 7 · Doku
say("\n▸ Doku");
const docFiles = ["README.md", "TESTEN.md", ...walk(path.join(ROOT, "docs")), ...walk(path.join(ROOT, "skill"))]
    .map(f => path.resolve(ROOT, f)).filter(f => /\.md$/.test(f) && fs.existsSync(f));
let skillChanged = false;
for (const f of docFiles) {
    const src = fs.readFileSync(f, "utf8");
    const { text, count } = replaceVersionsInText(src, next);
    if (count) {
        fs.writeFileSync(f, text); say(`  ${path.relative(ROOT, f)}: ${count} Dateiname(n)`);
        if (f.startsWith(path.join(ROOT, "skill", "dwg"))) { skillChanged = true; }
    }
}
if (skillChanged) { say("  skill/dwg geändert: skill/dwg.zip neu bauen (Befehl in skill/README.md)"); }
const cl = path.join(ROOT, "CHANGELOG.md");
fs.writeFileSync(cl, changelogWithVisuals(fs.readFileSync(cl, "utf8"), next, before));
say("  CHANGELOG.md: Zeile unter Unreleased");

// ---------------------------------------------------------------- 8 · Tests
if (!has("--no-test")) {
    say("\n▸ npm test (einige Minuten)");
    const t = spawnSync(WIN ? "npm.cmd" : "npm", ["test"], { cwd: ROOT, stdio: "inherit", shell: WIN });
    if (t.status !== 0) { fail("npm test rot. Die Änderungen liegen im Arbeitsverzeichnis, nichts committet."); }
}

// ---------------------------------------------------------------- 9 · Commit
const summary = Object.entries(VISUALS).map(([v, { label }]) => `${label} ${next[v]}`).join(", ");
const paths = ["visuals/dist", "visuals/pbiviz", "examples", "README.md", "CHANGELOG.md", "TESTEN.md", "docs", "skill"];
if (has("--commit")) {
    const a = git(["add", "-A", "--", ...paths], ROOT);
    if (a.code !== 0) { fail(`git add: ${a.out}`); }
    const c = git(["commit", "-q", "-m", `Visuals: ${summary}`], ROOT);
    if (c.code !== 0) { fail(`git commit: ${c.out}`); }
    say(`\n✓ committet: Visuals: ${summary} (${git(["rev-parse", "--short", "HEAD"], ROOT).out}); pushen nach Prüfung.`);
} else {
    say(`\n✓ ${summary} eingespielt. Prüfen mit git status, dann:\n  git add -A -- ${paths.join(" ")}\n  git commit -m "Visuals: ${summary}"`);
}

function walk(dir) {
    if (!fs.existsSync(dir)) { return []; }
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
