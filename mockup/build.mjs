// dwg mockup build: holt die gemeinsamen MockupKitchen-Bausteine aus dem Kitchen-Repo (PowerBI-Kitchen-).
// Quelle bleibt das Kitchen-Repo; hier liegt nur der gebaute Stand (committet wie visuals/dist, damit dwg ohne
// Kitchen-Klon läuft). Nicht von Hand ändern: im Kitchen-Repo ändern, dann neu holen.
//
//   node dwg.mjs mockup build [--kitchen <pfad>]   holen, mockup/vendor/manifest.json schreiben
//   node dwg.mjs mockup build --check              nur vergleichen: Abweichung vom Kitchen-Repo → Exit 1
//
// Was wohin (Pfade relativ zu dwg/):
//   assets/mockup/pixelgrid.js   → layout/pixelgrid.mjs (ES-Modul: Inhalt unverändert, dazu Export-Zeilen) und
//                                   mockup/vendor/pixelgrid.js (CommonJS, für gridcheck.js)
//   assets/mockup/pixelgrid.d.ts → layout/pixelgrid.d.ts
//   assets/mockup/gridcheck.js, a11y.js → mockup/vendor/ (dwg lint)
//   Skill mockup-to-powerbi: mockup_spec.py, mockup_to_pbir.py, Schema → mockup/vendor/skill/ (dwg mockup import)
// Kitchen-Repo: --kitchen, DWG_KITCHEN oder ein Klon neben diesem Repo (wie dwg visuals build).
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DWG = path.resolve(HERE, "..");
export const VENDOR = path.join(HERE, "vendor");
const MANIFEST = path.join(VENDOR, "manifest.json");

const CJS_LINE = "  if (typeof module !== 'undefined' && module.exports) module.exports = api;\n";

/** ES-Modul aus pixelgrid.js: Inhalt unverändert bis auf die CommonJS-Zeile (Bundler warnen sonst), die IIFE legt die
 *  API auf globalThis, darunter benannte Exporte */
function esm(text, from) {
    if (!text.includes(CJS_LINE)) { throw new Error(`${from}: CommonJS-Zeile nicht gefunden (Aufbau geändert?), ES-Modul nicht erzeugt.`); }
    const require = createRequire(import.meta.url);
    const tmp = path.join(VENDOR, ".probe.cjs");
    fs.mkdirSync(VENDOR, { recursive: true });
    fs.writeFileSync(tmp, text);
    let keys;
    try { delete require.cache[tmp]; keys = Object.keys(require(tmp)); } finally { fs.rmSync(tmp, { force: true }); }
    return `// Erzeugt von \`dwg mockup build\` aus ${from} im Kitchen-Repo. Nicht von Hand ändern, dort ändern und neu holen.\n` +
        text.replace(CJS_LINE, "  // (CommonJS-Export entfällt im ES-Modul, siehe unten)\n").replace(/\s*$/, "\n") +
        "\n// ---- ES-Modul (dwg mockup build) ----\n" +
        "const MK_PIXELGRID = (typeof window !== 'undefined' ? window : globalThis).MK_PIXELGRID;\n" +
        `export const { ${keys.join(", ")} } = MK_PIXELGRID;\n` +
        "export default MK_PIXELGRID;\n";
}

/** Quelle (relativ zum Kitchen-Repo) → Ziele (relativ zu dwg/), optional umgeformt */
export const FILES = [
    { from: "assets/mockup/pixelgrid.js", to: "layout/pixelgrid.mjs", make: esm },
    { from: "assets/mockup/pixelgrid.js", to: "mockup/vendor/pixelgrid.js" },
    { from: "assets/mockup/pixelgrid.d.ts", to: "layout/pixelgrid.d.ts" },
    { from: "assets/mockup/gridcheck.js", to: "mockup/vendor/gridcheck.js" },
    { from: "assets/mockup/a11y.js", to: "mockup/vendor/a11y.js" },
    { from: ".claude/skills/mockup-to-powerbi/scripts/mockup_spec.py", to: "mockup/vendor/skill/scripts/mockup_spec.py" },
    { from: ".claude/skills/mockup-to-powerbi/scripts/mockup_to_pbir.py", to: "mockup/vendor/skill/scripts/mockup_to_pbir.py" },
    { from: ".claude/skills/mockup-to-powerbi/references/mockup-spec.schema.json", to: "mockup/vendor/skill/references/mockup-spec.schema.json" },
];

// Zeilenenden vereinheitlicht (LF): ein Windows-Checkout mit autocrlf darf den Hash nicht ändern
const lf = s => String(s).replace(/\r\n/g, "\n");
const sha = s => crypto.createHash("sha256").update(lf(s), "utf8").digest("hex");
const isKitchen = p => !!p && fs.existsSync(path.join(p, "assets", "mockup", "pixelgrid.js"));

/** Kitchen-Pfad, den `node install.mjs` im Skill vermerkt hat (~/.claude/skills/dwg/.dwg-installed.json) */
function installedKitchen() {
    try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", "skills", "dwg", ".dwg-installed.json"), "utf8")).kitchen ?? null; }
    catch { return null; }
}

export function findKitchen(argv = process.argv) {
    const i = argv.indexOf("--kitchen");
    const cands = [i > 0 ? argv[i + 1] : null, process.env.DWG_KITCHEN, path.resolve(DWG, "../PowerBI-Kitchen-"), installedKitchen()];
    return cands.filter(Boolean).map(p => path.resolve(p)).find(isKitchen) ?? null;
}

function gitInfo(dir) {
    const run = args => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
    const head = run(["rev-parse", "HEAD"]), branch = run(["rev-parse", "--abbrev-ref", "HEAD"]);
    const dirty = run(["status", "--porcelain", "--", ...new Set(FILES.map(f => f.from))]);
    return head.status === 0
        ? { commit: head.stdout.trim(), branch: branch.stdout.trim(), dirty: dirty.stdout.trim() !== "" }
        : { commit: null, branch: null, dirty: null };
}

/** Prüft die geholten Dateien gegen manifest.json (ohne Kitchen-Repo). @returns {{ manifest, bad: string[] }} */
export function verifyVendor() {
    const mf = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    const bad = [];
    for (const f of FILES) {
        const info = mf.files[f.to], file = path.join(DWG, f.to);
        if (!info) { bad.push(`${f.to}: fehlt im Manifest (dwg mockup build ausführen)`); continue; }
        if (!fs.existsSync(file)) { bad.push(`${f.to}: fehlt`); continue; }
        if (sha(fs.readFileSync(file, "utf8")) !== info.sha256) { bad.push(`${f.to}: von Hand geändert (Hash passt nicht zu manifest.json)`); }
    }
    return { manifest: mf, bad };
}

function main() {
    const check = process.argv.includes("--check");
    const kitchen = findKitchen();
    if (!kitchen && check) {
        const { bad, manifest } = verifyVendor();
        const k = manifest.kitchen;
        console.log(bad.length ? `Geholte Dateien passen nicht zum Manifest:\n  ${bad.join("\n  ")}\n→ node dwg.mjs mockup build --kitchen <pfad>`
            : `Kitchen-Repo nicht gefunden; geholte Dateien unverändert seit ${k.branch ?? "?"} ${k.commit?.slice(0, 7) ?? "?"} (Vergleich mit dem Kitchen-Repo: --kitchen <pfad>).`);
        process.exit(bad.length ? 1 : 0);
    }
    if (!kitchen) {
        console.error("Kitchen-Repo mit assets/mockup/pixelgrid.js nicht gefunden. --kitchen <pfad> oder DWG_KITCHEN setzen.");
        process.exit(1);
    }
    const drift = [], files = {};
    for (const f of FILES) {
        const src = path.join(kitchen, f.from), dst = path.join(DWG, f.to);
        if (!fs.existsSync(src)) { console.error(`fehlt im Kitchen-Repo: ${f.from}`); process.exit(1); }
        const text = lf(fs.readFileSync(src, "utf8"));
        const out = f.make ? f.make(text, f.from) : text;
        files[f.to] = { from: f.from, sourceSha256: sha(text), sha256: sha(out) };
        const same = fs.existsSync(dst) && sha(fs.readFileSync(dst, "utf8")) === files[f.to].sha256;
        if (!same) { drift.push(f.to); }
        if (!check && !same) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, out); }
    }
    const git = gitInfo(kitchen);
    const at = `${git.branch ?? "?"} ${git.commit?.slice(0, 7) ?? "?"}${git.dirty ? ", mit lokalen Änderungen" : ""}`;
    if (check) {
        if (drift.length) { console.log(`Abweichung vom Kitchen-Repo (${kitchen}, ${at}):\n  ${drift.join("\n  ")}\n→ node dwg.mjs mockup build`); process.exit(1); }
        console.log(`Gemeinsame MockupKitchen-Bausteine sind auf dem Stand des Kitchen-Repos (${at}).`);
        return;
    }
    fs.writeFileSync(path.join(VENDOR, "package.json"), JSON.stringify({ type: "commonjs", private: true,
        description: "von dwg mockup build aus dem Kitchen-Repo geholt, nicht von Hand ändern" }, null, 2) + "\n");
    fs.writeFileSync(MANIFEST, JSON.stringify({
        note: "Erzeugt von `dwg mockup build`. Quelle ist das Kitchen-Repo (PowerBI-Kitchen-), nicht von Hand ändern.",
        kitchen: { branch: git.branch, commit: git.commit, dirty: git.dirty }, files,
    }, null, 2) + "\n");
    console.log(`Gemeinsame MockupKitchen-Bausteine aus ${kitchen} (${at}):`);
    for (const f of FILES) { console.log(`  ${drift.includes(f.to) ? "neu   " : "gleich"} ${f.to}`); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { main(); }
