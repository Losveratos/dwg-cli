// Template-Katalog (dist/templates.json): die Templates von ChartKitchen (C01–C13) und P&L (T01A–12H) mit Titel,
// Zweck, Gruppe, den Format-Objekten, die das Visual beim Anwenden schreibt, und den Datenrollen, die sie brauchen.
// Eine Quelle für dwg templates, dwg tile add und MockupKitchen; die Werte kommen aus dem Visual-Code, nicht von Hand:
//   ChartKitchen: CHART_TEMPLATES, TEMPLATE_GROUPS, TEMPLATE_TILE_EN, TEMPLATE_NEEDS aus src/visual.ts. Die Konstanten
//                 sind nicht exportiert; sie werden per TypeScript-Parser herausgelöst (reine Literale), der Visual-Code
//                 bleibt unverändert.
//   P&L:          src/hub.ts (templateSwitches, HUB_GALLERY) und MEGA_PRESETS aus src/megatable.ts, gebündelt für Node.
// Titel und Zweck in DE und EN aus den stringResources der Visuals. Die Rollen-Regeln stehen unten (ckRoles, pnlRoles).
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const CK_NAMES = ["CHART_TEMPLATES", "TEMPLATE_GROUPS", "TEMPLATE_TILE_EN", "TEMPLATE_NEEDS"];
const LANGS = { de: "de-DE", en: "en-US" };

const dataUrl = js => "data:text/javascript;base64," + Buffer.from(js).toString("base64");

/** Nicht exportierte Konstanten (reine Literale) aus einer TS-Datei als Modul laden */
async function constsOf(file, names) {
    const text = fs.readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2020, true);
    const found = new Map();
    for (const st of sf.statements) {
        if (!ts.isVariableStatement(st)) { continue; }
        for (const d of st.declarationList.declarations) {
            if (ts.isIdentifier(d.name) && names.includes(d.name.text) && d.initializer) {
                found.set(d.name.text, d.initializer.getText(sf));
            }
        }
    }
    const missing = names.filter(n => !found.has(n));
    if (missing.length) { throw new Error(`${path.basename(file)}: ${missing.join(", ")} nicht gefunden (Template-Katalog).`); }
    const src = [...found].map(([n, init]) => `export const ${n} = ${init};`).join("\n");
    const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
    return import(dataUrl(js));
}

/** src/hub.ts und die Presets aus src/megatable.ts (reine Module ohne Power-BI-Import) für Node bündeln und laden */
async function pnlHub(dir) {
    const r = await esbuild.build({
        stdin: {
            contents: 'export { templateSwitches, HUB_GALLERY } from "./hub";\nexport { MEGA_PRESETS, MEGA_PRESET_KEYS } from "./megatable";\n',
            resolveDir: path.join(dir, "src"), loader: "ts",
        },
        bundle: true, platform: "node", format: "esm", write: false,
        logLevel: "warning", tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    });
    return import(dataUrl(r.outputFiles[0].text));
}

function locales(dir) {
    const out = {};
    for (const [k, loc] of Object.entries(LANGS)) {
        const f = path.join(dir, "stringResources", loc, "resources.resjson");
        out[k] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
    }
    return out;
}

/** { de, en } aus einem Ressourcenschlüssel, englischer Ersatztext, wenn er fehlt */
const text = (loc, key, en) => ({ de: loc.de[key] ?? loc.en[key] ?? en ?? key, en: loc.en[key] ?? en ?? key });

function roleInfo(dir, loc) {
    const caps = JSON.parse(fs.readFileSync(path.join(dir, "capabilities.json"), "utf8"));
    return Object.fromEntries(caps.dataRoles.map(r => [r.name, {
        kind: r.kind, label: text(loc, r.displayNameKey, r.displayName),
    }]));
}

const role = (info, name, need, extra = {}) => {
    if (!info[name]) { throw new Error(`Rolle ${name} fehlt in capabilities.json (Template-Katalog).`); }
    return { role: name, need, kind: info[name].kind, label: info[name].label, ...extra };
};

// ---------------------------------------------------------------- ChartKitchen

/**
 * Rollen eines ChartKitchen-Templates (Regeln von dwg, abgeleitet aus den Template-Werten):
 *   Kategorie und Ist immer Pflicht. comparisonMode py/plan macht Vorjahr bzw. Plan zur Pflicht; „auto“ mit Abweichung
 *   empfiehlt das Vorjahr. Zeitverlauf-Templates empfehlen den Forecast (schraffierte Monate). Scatter braucht die
 *   X-Achse. Was das Visual selbst als Zusatzbedarf nennt (TEMPLATE_NEEDS: Serie, Small Multiples, Blasengröße), wird
 *   Pflicht, „(optional)“ im Text wird Empfehlung.
 */
function ckRoles(id, props, group, needs, info) {
    const out = [role(info, "category", "required"), role(info, "actual", "required")];
    const variance = props.showAbsoluteVariance || props.showRelativeVariance;
    const cmp = props.comparisonMode;
    if (cmp === "py") { out.push(role(info, "previousYear", "required")); }
    else if (cmp === "plan") { out.push(role(info, "plan", "required")); }
    else if (props.orientation !== "scatter" && id !== "C13") {
        out.push(role(info, "previousYear", variance ? "recommended" : "optional"), role(info, "plan", "optional"));
    }
    if (cmp === "py" && props.orientation !== "scatter") { out.push(role(info, "plan", "optional")); }
    if (cmp === "plan") { out.push(role(info, "previousYear", "optional")); }
    if (props.orientation === "scatter") {
        out.push(role(info, "xValue", "required"), role(info, "previousYear", "optional"), role(info, "xPrevious", "optional"));
    }
    if (id === "C13") { out.push(role(info, "previousYear", "recommended"), role(info, "plan", "optional")); }
    if (props.orientation !== "scatter") { out.push(role(info, "forecast", group === "time" ? "recommended" : "optional")); }
    if (props.orientation === "waterfall") { out.push(role(info, "rowType", "optional")); }
    const need = needs[id];
    if (need && !out.some(r => r.role === need.role)) {
        out.push(role(info, need.role, /optional/i.test(need.en) ? "recommended" : "required"));
    }
    out.push(role(info, "comments", "optional"));
    return out.filter((r, i) => out.findIndex(x => x.role === r.role) === i);
}

async function chartKitchen(dir) {
    const c = await constsOf(path.join(dir, "src", "visual.ts"), CK_NAMES);
    const loc = locales(dir);
    const info = roleInfo(dir, loc);
    const groupOf = Object.fromEntries(c.TEMPLATE_GROUPS.flatMap(g => g.codes.map(code => [code, g])));
    const out = [];
    // Reihenfolge der Template-Galerie im Visual (nach Zweck), Templates ohne Gruppe am Ende
    const ordered = [...new Set([...c.TEMPLATE_GROUPS.flatMap(g => g.codes), ...Object.keys(c.CHART_TEMPLATES)])]
        .filter(id => c.CHART_TEMPLATES[id]);
    for (const id of ordered) {
        const props = c.CHART_TEMPLATES[id];
        const g = groupOf[id];
        const [tEn, uEn] = c.TEMPLATE_TILE_EN[id] ?? [id, ""];
        out.push({
            id, visual: "chartkitchen",
            group: g ? { id: g.id, title: text(loc, g.key, g.en) } : null,
            title: text(loc, `Hub_TplT_${id}`, tEn),
            use: text(loc, `Hub_TplU_${id}`, uEn),
            objects: { chart: { template: id, templateApplied: id, ...props } },
            roles: ckRoles(id, props, g?.id, c.TEMPLATE_NEEDS, info),
        });
    }
    return out;
}

// ---------------------------------------------------------------- P&L

/**
 * Rollen eines P&L-Templates (Regeln von dwg, aus den Schaltern des Templates):
 *   Ebenen (oder Konto-ID mit Eltern-ID) und AC sind Pflicht. Der Minuend FC/PL macht FC bzw. PL zur Pflicht; jede
 *   PY- bzw. PL-Spalte oder -Abweichung macht PY bzw. PL zur Pflicht. Mit zweitem Block (Monat | YTD) wird die Periode
 *   empfohlen (ohne sie zeigt das Visual nur den Hauptblock); der FY-Ausblick (12G) braucht FC Gesamtjahr, PL Gesamtjahr wird empfohlen.
 *   T01/T02 sind Strukturtabellen (Regionen, Produkte); T03, T04 und die 12er sind GuV-Statements, dort werden die
 *   Logikspalten (Zeilentyp, Formel, Vorzeichen, Umkehr, Sortierung) empfohlen.
 */
function pnlRoles(id, sw, preset, info) {
    const c = sw.cols;
    const out = [role(info, "levels", "required", { alt: ["account", "parent"] }), role(info, "ac", "required")];
    const usesPy = c.showPY || c.dPyAbs || c.dPyBar || c.dPyWaterfall || c.dPyPct || c.dPyPin || c.minuend === "py";
    const usesPl = c.showPL || c.dPlAbs || c.dPlBar || c.dPlWaterfall || c.dPlPct || c.dPlPin || c.minuend === "pl";
    const usesFc = c.minuend === "fc";
    out.push(role(info, "py", usesPy ? "required" : "optional"));
    out.push(role(info, "pl", usesPl ? "required" : "optional"));
    out.push(role(info, "fc", usesFc ? "required" : preset.blockKind === "fy" ? "recommended" : "optional"));
    if (preset.blockKind === "fy") { out.push(role(info, "fcFy", "required"), role(info, "plFy", "recommended")); }
    out.push(role(info, "period", c.secondBlock ? "recommended" : "optional"));
    const statement = !/^T0[12]/.test(id);
    for (const r of ["account", "accountName", "sortOrder", "rowType", "formulaDef", "signConvention", "displayInvert", "varianceInvert"]) {
        out.push(role(info, r, statement ? "recommended" : "optional"));
    }
    // Eltern-ID: nur mit Konto-ID zusammen als Ersatz für die Ebenen (alt von levels)
    out.push(role(info, "parent", "optional"));
    out.push(role(info, "comment", "optional"), role(info, "colCategory", "optional"));
    return out;
}

async function pnl(dir) {
    const hub = await pnlHub(dir);
    const loc = locales(dir);
    const info = roleInfo(dir, loc);
    const out = [];
    for (const g of hub.HUB_GALLERY) {
        for (const t of g.tiles) {
            if (t.tpl === "off") { continue; }
            const sw = hub.templateSwitches(t.tpl);
            const objects = { columns: { template: t.tpl, templateApplied: t.tpl, ...sw.cols }, numbers: { ...sw.nums } };
            if (Object.keys(sw.title).length) { objects.titleBlock = { ...sw.title }; }
            out.push({
                id: t.tpl, visual: "pnl",
                // T01/T02: Strukturtabellen (Ebenen = Regionen, Kunden, Produkte), sonst GuV-Statement (Ebenen = Konten)
                data: /^T0[12]/.test(t.tpl) ? "structure" : "statement",
                group: { id: g.id, title: text(loc, g.title) },
                title: text(loc, t.title), use: text(loc, t.use),
                objects,
                roles: pnlRoles(t.tpl, sw, hub.MEGA_PRESETS[t.tpl], info),
            });
        }
    }
    return out;   // Reihenfolge der Template-Galerie im Visual (nach Zweck)
}

/** Katalog beider Visuals; versions aus pbiviz.json */
export async function buildTemplates(visuals, versions) {
    const templates = [...await chartKitchen(visuals.chartkitchen), ...await pnl(visuals.pnl)];
    const ids = new Set();
    for (const t of templates) {
        if (ids.has(t.id)) { throw new Error(`Template ${t.id} doppelt (Template-Katalog).`); }
        ids.add(t.id);
    }
    return { versions, templates };
}
