#!/usr/bin/env node
// dwg-Installer: richtet die dwg cli nach dem Klonen ein, aktualisiert sie oder prüft sie.
//
//   git clone https://github.com/Losveratos/dwg-cli && cd dwg-cli && node install.mjs
//
//   node install.mjs            einrichten (oder erneut einrichten)
//   node install.mjs --update   git pull, dann einrichten
//   node install.mjs --check    nur prüfen, nichts ändern (= node dwg.mjs doctor)
//
// Optionen: --kitchen <pfad> | --clone-kitchen   Kitchen-Repo (Visual-Quellcode, nur für `dwg visuals build`)
//           --no-browser   kein Chromium für die Browser-Tests
//           --no-skill     Skill nicht nach ~/.claude/skills kopieren
//           --skill-dir <pfad>   anderes Skill-Verzeichnis
//           --force        auch einen fremden Skill „dwg“ ersetzen
//           --full-test    am Ende alle Tests inkl. Browser (dauert einige Minuten)
//
// Schritte: Voraussetzungen → (git pull) → npm ci in dwg/ → Chromium für Playwright → Kitchen-Repo finden →
// Skill für alle Claude-Code-Sitzungen → Selbsttest. Jeder Schritt sagt, was er tut; nichts außerhalb von Repo,
// Kitchen-Klon und Skill-Verzeichnis wird angefasst.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { consistency, installedVersions, latestVersions, versionReport } from "./visuals/lib/release.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = HERE;
const KITCHEN_URL = "https://github.com/Losveratos/PowerBI-Kitchen-";
const WIN = process.platform === "win32";

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const CHECK = has("--check");
const UPDATE = has("--update");

const results = [];
const step = title => console.log(`\n▸ ${title}`);
const ok = (msg) => { results.push(["ok", msg]); console.log(`  ✓ ${msg}`); };
const warn = (msg) => { results.push(["warn", msg]); console.log(`  ! ${msg}`); };
const fail = (msg) => { results.push(["fail", msg]); console.log(`  ✗ ${msg}`); };

/** Befehl ausführen; Node-Skripte ohne Shell, npm/npx/git unter Windows über die Shell (mit Anführungszeichen). */
function run(cmd, args, opts = {}) {
    const quote = a => (WIN && /[\s&()]/.test(a) ? `"${a}"` : a);
    const r = cmd === process.execPath
        ? spawnSync(cmd, args, { cwd: opts.cwd ?? ROOT, encoding: "utf8", stdio: opts.quiet ? "pipe" : "inherit", env: { ...process.env, ...opts.env } })
        : spawnSync(WIN ? `${cmd}` : cmd, WIN ? args.map(quote) : args,
            { cwd: opts.cwd ?? ROOT, encoding: "utf8", shell: WIN, stdio: opts.quiet ? "pipe" : "inherit", env: { ...process.env, ...opts.env } });
    return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

// ---------------------------------------------------------------- 1 · Voraussetzungen
step("Voraussetzungen");
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor >= 20) { ok(`Node ${process.versions.node}`); } else { fail(`Node ${process.versions.node}: mindestens Node 20 nötig (empfohlen 22)`); }
const git = run("git", ["--version"], { quiet: true });
if (git.code === 0) { ok(git.out); } else { warn("git nicht gefunden: --update und --clone-kitchen gehen nicht"); }
const npm = run("npm", ["--version"], { quiet: true });
if (npm.code === 0) {
    ok(`npm ${npm.out}`);
    if (Number(npm.out.split(".")[0]) < 11) { warn("Für Rayfin-Apps npm 11 nehmen: `npx -y npm@11 install` im App-Ordner"); }
} else { fail("npm nicht gefunden"); }
if (!fs.existsSync(path.join(ROOT, "dwg.mjs"))) { fail(`Kein dwg unter ${ROOT}`); }
if (results.some(([s]) => s === "fail")) { finish(); }

// ---------------------------------------------------------------- 2 · Aktualisieren
if (UPDATE && !CHECK) {
    step("Repo aktualisieren (git pull --ff-only)");
    const pull = run("git", ["pull", "--ff-only"]);
    if (pull.code === 0) { ok("Repo ist aktuell"); } else { fail("git pull ging nicht (lokale Änderungen oder abweichender Stand?). Bitte selbst klären, dann neu starten."); finish(); }
}

// ---------------------------------------------------------------- 3 · Abhängigkeiten
step("Abhängigkeiten");
const pkg = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8"));
const missing = Object.keys(pkg.devDependencies).filter(d => !fs.existsSync(path.join(HERE, "node_modules", d, "package.json")));
if (CHECK) {
    if (missing.length) { fail(`fehlen: ${missing.join(", ")} (node install.mjs)`); } else { ok("alle Pakete installiert"); }
} else {
    const r = run("npm", ["ci", "--no-audit", "--no-fund"], { cwd: HERE });
    if (r.code === 0) { ok("npm ci"); } else { fail("npm ci fehlgeschlagen (Ausgabe oben)"); finish(); }
}

// ---------------------------------------------------------------- 4 · Browser für die Tests
step("Chromium für die Browser-Tests (Playwright)");
const probe = `import("playwright").then(async ({ chromium }) => { const b = await chromium.launch(); await b.close(); console.log("ok"); }).catch(e => { console.error(e.message.split("\\n")[0]); process.exit(1); })`;
const launch = () => run(process.execPath, ["--input-type=module", "-e", probe], { cwd: HERE, quiet: true });
let browser = launch();
if (browser.code !== 0 && !CHECK && !has("--no-browser")) {
    console.log("  Chromium wird geladen (einmalig, etwa 150 MB) …");
    run("npx", ["playwright", "install", "chromium"], { cwd: HERE });
    browser = launch();
}
if (browser.code === 0) { ok("Chromium startet"); }
else if (has("--no-browser")) { warn("übersprungen (--no-browser): Browser-Tests laufen nicht"); }
else { warn(`Chromium startet nicht: ${browser.out.slice(0, 160)}. Browser-Tests laufen erst danach (npx playwright install chromium).`); }

// ---------------------------------------------------------------- 5 · Kitchen-Repo
step("Kitchen-Repo (Visual-Quellcode, nur für `dwg visuals build`)");
const kitchenCandidates = [val("--kitchen"), process.env.DWG_KITCHEN, path.resolve(ROOT, "..", "PowerBI-Kitchen-")].filter(Boolean);
const isKitchen = p => fs.existsSync(path.join(p, "ibcsInspiredChartDeck", "src", "visual.ts"));
let kitchen = kitchenCandidates.find(isKitchen);
if (!kitchen && has("--clone-kitchen") && !CHECK) {
    const target = path.resolve(ROOT, "..", "PowerBI-Kitchen-");
    console.log(`  klone ${KITCHEN_URL} nach ${target} …`);
    if (run("git", ["clone", "--depth", "1", KITCHEN_URL, target]).code === 0 && isKitchen(target)) { kitchen = target; }
}
if (kitchen) { ok(`gefunden: ${kitchen}`); }
else { warn("nicht gefunden. Nötig nur, um den Adapter neu zu bauen (neues Visual-Release): --clone-kitchen oder --kitchen <pfad>"); }

// ---------------------------------------------------------------- 5b · Visual-Stand
step("Visual-Stand (Adapter, .pbiviz, Beispielberichte, veröffentlicht)");
{
    const installed = installedVersions(ROOT);
    const problems = consistency(installed);
    if (problems.length) { for (const p of problems) { warn(`${p} (dwg visuals update)`); } }
    else { ok(`Adapter, .pbiviz und ${Object.keys(installed.reports).length} Beispielberichte auf einem Stand`); }
    let latest = null;
    try { latest = await latestVersions(); }
    catch (e) { warn(`veröffentlichte Version nicht abrufbar (${e.message.split(";")[0].trim()}); offline?`); }
    for (const l of versionReport(installed, latest)) { (l.level === "ok" ? ok : warn)(l.text); }
    if (latest) { console.log(`  Quelle: ${latest.source}`); }
}

// ---------------------------------------------------------------- 6 · Skill für Claude
step("Skill „dwg“ für alle Claude-Code-Sitzungen");
const skillSrc = path.join(ROOT, "skill", "dwg");
const skillRoot = path.resolve(val("--skill-dir") ?? path.join(os.homedir(), ".claude", "skills"));
const skillDst = path.join(skillRoot, "dwg");
const MARKER = ".dwg-installed.json";
const localSection = () => [
    "",
    "## Lokale Installation",
    "",
    `- dwg-cli: \`${ROOT}\``,
    `- Kitchen-Repo: ${kitchen ? `\`${kitchen}\`` : "nicht eingerichtet (nur für `dwg visuals build` nötig)"}`,
    `- Eingerichtet am ${new Date().toISOString().slice(0, 10)} mit \`node install.mjs\`; aktualisieren mit`,
    "  `node install.mjs --update` im Repo, prüfen mit `node dwg.mjs doctor`.",
    "- Arbeite in diesem Repo-Pfad. Liegt die Sitzung woanders, den Nutzer bitten, das Repo zu öffnen.",
    "",
].join("\n");
const srcSkill = fs.readFileSync(path.join(skillSrc, "SKILL.md"), "utf8");
if (CHECK) {
    if (!fs.existsSync(path.join(skillDst, "SKILL.md"))) { warn(`nicht installiert in ${skillRoot} (node install.mjs)`); }
    else if (!fs.readFileSync(path.join(skillDst, "SKILL.md"), "utf8").startsWith(srcSkill)) { warn("installiert, aber älter als im Repo (node install.mjs)"); }
    else { ok(`aktuell in ${skillDst}`); }
} else if (has("--no-skill")) {
    warn(`übersprungen (--no-skill). Ohne Installer kennt Claude Code den Skill nicht; von Hand: ${path.join(ROOT, "skill", "dwg")} nach ${skillDst} kopieren.`);
} else if (fs.existsSync(skillDst) && !fs.existsSync(path.join(skillDst, MARKER)) && !has("--force")) {
    warn(`${skillDst} gibt es schon und stammt nicht von diesem Installer. Nicht ersetzt (--force zum Ersetzen).`);
} else {
    fs.rmSync(skillDst, { recursive: true, force: true });
    fs.cpSync(skillSrc, skillDst, { recursive: true });
    fs.writeFileSync(path.join(skillDst, "SKILL.md"), srcSkill + localSection());
    fs.writeFileSync(path.join(skillDst, MARKER), JSON.stringify({ repo: ROOT, kitchen: kitchen ?? null, installed: new Date().toISOString() }, null, 2) + "\n");
    ok(`kopiert nach ${skillDst}`);
    console.log(`  Für Claude Desktop (Chat): ${path.join(ROOT, "skill", "dwg.zip")} unter Einstellungen → Fähigkeiten → Skills hochladen.`);
}

// ---------------------------------------------------------------- 7 · Selbsttest
step(has("--full-test") ? "Selbsttest (alle Tests, mit Browser)" : "Selbsttest (schnell, ohne Browser)");
if (!missing.length || !CHECK) {
    const quick = [
        ["CLI startet", ["dwg.mjs"]],
        ["Adapter (Unit)", ["visuals/test/unit.mjs"]],
        ["App-Generator (Unit)", ["app/test/unit.mjs"]],
        ["GuV-Demo-Set (Mini-DAX, Kontrollwerte)", ["app/test/guv.mjs"]],
        ["Templates und tile add", ["templates/test/unit.mjs"]],
    ];
    for (const [name, args] of quick) {
        const r = run(process.execPath, args, { quiet: true });
        if (r.code === 0) { ok(name); } else { fail(`${name}: ${r.out.split("\n").slice(-3).join(" | ").slice(0, 300)}`); }
    }
    if (has("--full-test")) {
        const r = run("npm", ["test"], { cwd: HERE });
        if (r.code === 0) { ok("alle Tests grün (npm test)"); } else { fail("npm test fehlgeschlagen (Ausgabe oben)"); }
    }
} else {
    warn("übersprungen, Pakete fehlen");
}
finish();

function finish() {
    const n = s => results.filter(([x]) => x === s).length;
    console.log(`\n${n("fail") ? "✗" : "✓"} dwg ${CHECK ? "geprüft" : "eingerichtet"}: ${n("ok")} ok, ${n("warn")} Hinweise, ${n("fail")} Fehler`);
    if (!n("fail") && !CHECK) {
        console.log([
            "",
            "Nächste Schritte:",
            "  node dwg.mjs                      Befehle anzeigen",
            "  node dwg.mjs templates            Templates von ChartKitchen und P&L",
            "  npm test                          alle Tests inkl. Browser",
            "  In Claude Code: „Bau mir mit dwg eine Seite aus Template C03 auf meinem Modell.“",
        ].join("\n"));
    }
    process.exit(n("fail") ? 1 : 0);
}
