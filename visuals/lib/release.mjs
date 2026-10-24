// Visual-Stand: welche Version von ChartKitchen und P&L steckt im Adapter (dist/BUILD.json), in visuals/pbiviz/ und
// in den Beispielberichten, welche ist veröffentlicht (Share-Repo, Kitchen-Download), und die Textbausteine, die
// `dwg visuals update` in README, Doku und CHANGELOG schreibt. Reine Funktionen, von update.mjs und install.mjs genutzt.
import fs from "node:fs";
import path from "node:path";
import { registeredVisuals } from "../../pbip/lib/report.mjs";

/** Die beiden Visuals: Ordner im Kitchen-Repo, Paketname (Präfix der GUID), Anzeigename */
export const VISUALS = {
    chartkitchen: { dir: "ibcsInspiredChartDeck", pkg: "chartKitchenByDatenWG", label: "ChartKitchen" },
    pnl: { dir: "pnlByDatenWG", pkg: "pnlByDatenWG", label: "P&L" },
};

/** Quellen für die veröffentlichte Version */
export const SOURCES = {
    share: "https://api.github.com/repos/Losveratos/Power-BI-Custom-Visuals-byDatenWG/git/trees/HEAD?recursive=1",
    latest: "https://datenwgknowledgekitchen.com/downloads/latest.json",
};

const VERSION = String.raw`\d+\.\d+\.\d+\.\d+`;
/** Version aus einem .pbiviz-Dateinamen (…<GUID>.1.5.3.0.pbiviz → 1.5.3.0; die GUID endet selbst auf Ziffern) */
export function versionOfFile(name) {
    return String(name).match(new RegExp(`\\.(${VERSION})\\.pbiviz$`))?.[1] ?? null;
}

/** Dateiname der .pbiviz in visuals/pbiviz/ (ohne GUID, wie bisher) */
export const pbivizName = (visual, version) => `${VISUALS[visual].pkg}.${version}.pbiviz`;

/** Visual-Kennung zu einem Paketnamen oder einer GUID (chartKitchenByDatenWGD9DE… → chartkitchen) */
export function visualOf(name) {
    return Object.keys(VISUALS).find(v => String(name).startsWith(VISUALS[v].pkg)) ?? null;
}

/** 1.53.0.0 gegen 1.52.3.0: negativ, 0, positiv */
export function compareVersions(a, b) {
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d) { return d; }
    }
    return 0;
}

/** Beispielberichte unter examples/ (eine Ebene tief) */
export function exampleReports(root) {
    const base = path.join(root, "examples");
    if (!fs.existsSync(base)) { return []; }
    const out = [];
    for (const e of fs.readdirSync(base, { withFileTypes: true })) {
        if (!e.isDirectory()) { continue; }
        const p = path.join(base, e.name);
        if (e.name.endsWith(".Report")) { out.push(p); continue; }
        for (const s of fs.readdirSync(p, { withFileTypes: true })) {
            if (s.isDirectory() && s.name.endsWith(".Report")) { out.push(path.join(p, s.name)); }
        }
    }
    return out;
}

/**
 * Was im Repo steckt: Adapter (BUILD.json), .pbiviz-Dateien je Visual, eingetragene Versionen je Beispielbericht.
 * Fehlt BUILD.json, ist `build` leer.
 */
export function installedVersions(root) {
    const buildFile = path.join(root, "visuals", "dist", "BUILD.json");
    const build = fs.existsSync(buildFile) ? JSON.parse(fs.readFileSync(buildFile, "utf8")).versions ?? {} : {};
    const pbiviz = Object.fromEntries(Object.keys(VISUALS).map(v => [v, []]));
    const dir = path.join(root, "visuals", "pbiviz");
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
        const v = visualOf(f), ver = versionOfFile(f);
        if (v && ver) { pbiviz[v].push(ver); }
    }
    const reports = {};
    for (const r of exampleReports(root)) {
        const found = {};
        for (const [guid, info] of Object.entries(registeredVisuals(r))) {
            const v = visualOf(guid);
            if (v) { found[v] = info.version; }
        }
        reports[path.relative(root, r).split(path.sep).join("/")] = found;
    }
    return { build, pbiviz, reports };
}

/** Widersprüche im Repo: .pbiviz oder Beispielbericht nicht auf dem Stand des Adapters */
export function consistency(installed) {
    const problems = [];
    for (const [v, { label }] of Object.entries(VISUALS)) {
        const b = installed.build[v];
        if (!b) { problems.push(`${label}: Adapter ohne Version (visuals/dist/BUILD.json fehlt, erst dwg visuals build)`); continue; }
        const files = installed.pbiviz[v] ?? [];
        if (!files.length) { problems.push(`${label} ${b}: keine .pbiviz in visuals/pbiviz/`); }
        else if (!files.includes(b)) { problems.push(`${label}: Adapter ${b}, .pbiviz ${files.join(", ")}`); }
        else if (files.length > 1) { problems.push(`${label}: mehrere .pbiviz in visuals/pbiviz/ (${files.join(", ")}), nur ${b} behalten`); }
        for (const [report, versions] of Object.entries(installed.reports)) {
            if (versions[v] && versions[v] !== b) { problems.push(`${label}: Adapter ${b}, ${report} hat ${versions[v]}`); }
        }
    }
    return problems;
}

/**
 * Veröffentlichte Versionen: Share-Repo (beide Visuals, Dateinamen im Git-Baum), sonst latest.json der Kitchen-Seite
 * (nur ChartKitchen). `fetchImpl` zum Testen; Zeitlimit 6 s je Abruf.
 */
export async function latestVersions({ fetchImpl = globalThis.fetch, timeoutMs = 6000 } = {}) {
    const get = async url => {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), timeoutMs);
        try {
            const r = await fetchImpl(url, { signal: ctl.signal, headers: { "User-Agent": "dwg-cli" } });
            if (!r.ok) { throw new Error(`HTTP ${r.status}`); }
            return await r.json();
        } finally { clearTimeout(t); }
    };
    try {
        const tree = await get(SOURCES.share);
        const versions = {};
        for (const { path: p } of tree.tree ?? []) {
            const name = p.split("/").pop();
            const v = visualOf(name), ver = versionOfFile(name);
            if (v && ver && (!versions[v] || compareVersions(ver, versions[v]) > 0)) { versions[v] = ver; }
        }
        if (Object.keys(versions).length) { return { versions, source: "Share-Repo Power-BI-Custom-Visuals-byDatenWG" }; }
        throw new Error("keine .pbiviz im Share-Repo");
    } catch (e1) {
        try {
            const j = await get(SOURCES.latest);
            if (!new RegExp(`^${VERSION}$`).test(j.version ?? "")) { throw new Error("latest.json ohne version"); }
            return { versions: { chartkitchen: j.version }, source: "latest.json der Kitchen-Seite" };
        } catch (e2) {
            throw new Error(`${e1.message}; ${e2.message}`);
        }
    }
}

/** Zeilen für doctor: je Visual Stand im Repo gegen veröffentlicht; `latest` darf null sein (offline) */
export function versionReport(installed, latest) {
    const lines = [];
    for (const [v, { label }] of Object.entries(VISUALS)) {
        const b = installed.build[v];
        if (!b) { continue; }
        const l = latest?.versions?.[v];
        if (!l) { lines.push({ level: "ok", text: `${label} ${b} im Adapter` }); continue; }
        const c = compareVersions(l, b);
        if (c > 0) { lines.push({ level: "warn", text: `${label} ${l} ist veröffentlicht, der Adapter hat ${b} (dwg visuals update)` }); }
        else if (c < 0) { lines.push({ level: "ok", text: `${label} ${b} im Adapter, veröffentlicht ist ${l} (Vorabstand)` }); }
        else { lines.push({ level: "ok", text: `${label} ${b} im Adapter, aktuell` }); }
    }
    return lines;
}

/** Dateinamen der .pbiviz in Texten (README, Doku, Skill) auf die neuen Versionen heben */
export function replaceVersionsInText(text, versions) {
    let count = 0;
    let out = text;
    for (const [v, { pkg }] of Object.entries(VISUALS)) {
        if (!versions[v]) { continue; }
        const rx = new RegExp(`${pkg}\\.${VERSION}\\.pbiviz`, "g");
        out = out.replace(rx, m => { const n = pbivizName(v, versions[v]); if (m !== n) { count++; } return n; });
    }
    return { text: out, count };
}

const CHANGELOG_MARK = "- **Visuals:** adapter, `.pbiviz` and example reports on ";

/** Zeile unter „## Unreleased“ (anlegen, wenn es den Abschnitt nicht gibt), ersetzt eine frühere Visuals-Zeile dort */
export function changelogWithVisuals(text, versions, previous = {}) {
    const parts = Object.entries(VISUALS).filter(([v]) => versions[v]).map(([v, { label }]) => {
        const from = previous[v] && previous[v] !== versions[v] ? ` (from ${previous[v]})` : "";
        return `${label} ${versions[v]}${from}`;
    });
    const line = `${CHANGELOG_MARK}${parts.join(" and ")}.`;
    const nl = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(/\r?\n/);
    let start = lines.findIndex(l => /^## Unreleased\b/.test(l));
    if (start < 0) {
        // Abschnitt direkt nach der Überschrift anlegen; die Leerzeile danach stammt aus dem bestehenden Text
        const title = lines.findIndex(l => /^# /.test(l));
        start = title < 0 ? 0 : title + 1;
        lines.splice(start, 0, "", "## Unreleased");
        start++;
    }
    let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
    if (end < 0) { end = lines.length; }
    // Abschnittsinhalt ohne Leerzeilen am Rand; Visuals-Zeile ersetzen oder anhängen
    const body = lines.slice(start + 1, end);
    while (body.length && body[0].trim() === "") { body.shift(); }
    while (body.length && body[body.length - 1].trim() === "") { body.pop(); }
    const existing = body.findIndex(l => l.startsWith(CHANGELOG_MARK));
    if (existing >= 0) { body[existing] = line; } else { body.push(line); }
    lines.splice(start + 1, end - start - 1, "", ...body, "");
    return lines.join(nl);
}

/** Pfad der .pbiviz einer Version im Kitchen-Repo, relativ (<visual>/dist/<pkg><GUID>.<version>.pbiviz); `files` sind die Namen in dist/ */
export function pbivizPath(visual, version, files) {
    const f = files.find(n => n.startsWith(VISUALS[visual].pkg) && versionOfFile(n) === version);
    return f ? `${VISUALS[visual].dir}/dist/${f}` : null;
}

/** Version aus dem Inhalt einer pbiviz.json */
export const versionOfPbivizJson = text => JSON.parse(text).visual.version;
