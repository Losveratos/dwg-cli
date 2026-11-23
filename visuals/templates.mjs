// Template-Katalog (dist/templates.json): die Templates von ChartKitchen (C01 ff.) und P&L (T01A–12H, ab 1.8 11A) mit Titel,
// Zweck, Gruppe, den Format-Objekten, die das Visual beim Anwenden schreibt, und den Datenrollen, die sie brauchen.
// Eine Quelle für dwg templates, dwg tile add und MockupKitchen; die Werte kommen aus dem Visual-Code, nicht von Hand:
//   ChartKitchen: CHART_TEMPLATES, TEMPLATE_GROUPS, TEMPLATE_TILE_EN, TEMPLATE_NEEDS aus src/visual.ts. Die Konstanten
//                 sind nicht exportiert; sie werden per TypeScript-Parser herausgelöst (reine Literale), der Visual-Code
//                 bleibt unverändert.
//   P&L:          src/hub.ts (templateSwitches, HUB_GALLERY) und MEGA_PRESETS aus src/megatable.ts, gebündelt für Node.
//                 Ab 1.7 schreibt ein Template auch statement.stockMode (T05A Bilanz, T05B Cashflow). Ab 1.8 kennt die
//                 Galerie Ansichts-Vorlagen ohne Mega-Template (VIEW_PRESETS, ROI-Baum 11A): sie schreiben nur
//                 Karten-Schalter (columns.*) und die Ansicht (state.uiState), kein columns.template.
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
            // export * statt einer Namensliste: VIEW_PRESETS gibt es erst ab P&L 1.8
            contents: 'export * from "./hub";\nexport { MEGA_PRESETS, MEGA_PRESET_KEYS } from "./megatable";\n',
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
    // ChartKitchen 1.57: Rollen, die TEMPLATE_NEEDS (eine Rolle je Template) nicht nennt, laut AGENT-GUIDE des Visuals;
    // eine hier genannte Stufe überschreibt die abgeleitete (C24 läuft ohne Blasengröße leer)
    for (const [r, n] of Object.entries(CK_EXTRA[id] ?? {})) {
        if (!info[r]) { continue; }   // ältere Visual-Stände ohne diese Rolle
        const i = out.findIndex(x => x.role === r);
        if (i >= 0) { out[i] = role(info, r, n); } else { out.push(role(info, r, n)); }
    }
    out.push(role(info, "comments", "optional"));
    return out.filter((r, i) => out.findIndex(x => x.role === r.role) === i);
}

/**
 * Zusatzrollen neuer ChartKitchen-Templates (1.57) über TEMPLATE_NEEDS hinaus: C23 Zeitpfad je Einheit (series),
 * C24 Blasen mit Anteil (bubbleSize und bubbleShare, sonst keine Kreissegmente), C18 Abweichungs-Scatter (Serie,
 * Blasengröße, Small Multiples), C20 Bestand und Fluss (Flussarten und Bestand als Mitglieder der Serie, Forecast-Flag,
 * Bestand alternativ über lineMeasure).
 */
const CK_EXTRA = {
    C18: { series: "recommended", bubbleSize: "optional", multiples: "optional" },
    C20: { series: "required", fcFlag: "optional", lineMeasure: "optional" },
    C23: { series: "required", multiples: "optional", bubbleSize: "optional" },
    C24: { bubbleSize: "required", bubbleShare: "required", series: "recommended" },
};

/**
 * Preset-Schalter eines ChartKitchen-Templates nach Objekten: Schlüssel mit Punkt („scale.refLine“) gehören in ihr eigenes
 * Objekt, so wie das Visual sie beim Anwenden trennt; alle anderen in chart
 */
function ckObjects(id, props) {
    const objects = { chart: { template: id, templateApplied: id } };
    for (const [k, v] of Object.entries(props)) {
        const dot = k.indexOf(".");
        if (dot > 0) { (objects[k.slice(0, dot)] ??= {})[k.slice(dot + 1)] = v; } else { objects.chart[k] = v; }
    }
    return objects;
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
            objects: ckObjects(id, props),
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
 *   Bestände (1.7, Templates mit statement.stockMode): Das Visual liest Bestand oder Fluss aus Token im Zeilentyp
 *   (`Account stock`, `Account opening`). T05B (Cashflow, stockMode auto) braucht den Zeilentyp: ohne Token summiert es
 *   den Anfangsbestand über die Monate. T05A (Bilanz) setzt ohne Token „Alle Zeilen Bestand“ (allStock), dort reicht die
 *   Empfehlung. Den Stand am Stichtag wählt das Visual aus den Monatswerten, deshalb ist die Periode bei beiden empfohlen
 *   (ohne sie muss jedes Measure selbst den Stand am Stichtag liefern).
 */
function pnlRoles(id, sw, preset, info) {
    const c = sw.cols;
    const stockMode = sw.stmt?.stockMode;
    const rowTypeNeed = stockMode === "auto" ? "required" : null;
    const out = [role(info, "levels", "required", { alt: ["account", "parent"] }), role(info, "ac", "required")];
    const usesPy = c.showPY || c.dPyAbs || c.dPyBar || c.dPyWaterfall || c.dPyPct || c.dPyPin || c.minuend === "py";
    const usesPl = c.showPL || c.dPlAbs || c.dPlBar || c.dPlWaterfall || c.dPlPct || c.dPlPin || c.minuend === "pl";
    const usesFc = c.minuend === "fc";
    out.push(role(info, "py", usesPy ? "required" : "optional"));
    out.push(role(info, "pl", usesPl ? "required" : "optional"));
    out.push(role(info, "fc", usesFc ? "required" : preset.blockKind === "fy" ? "recommended" : "optional"));
    if (preset.blockKind === "fy") { out.push(role(info, "fcFy", "required"), role(info, "plFy", "recommended")); }
    out.push(role(info, "period", c.secondBlock || stockMode ? "recommended" : "optional"));
    const statement = !/^T0[12]/.test(id);
    for (const r of ["account", "accountName", "sortOrder", "rowType", "formulaDef", "signConvention", "displayInvert", "varianceInvert"]) {
        out.push(role(info, r, r === "rowType" && rowTypeNeed ? rowTypeNeed : statement ? "recommended" : "optional"));
    }
    // Eltern-ID: nur mit Konto-ID zusammen als Ersatz für die Ebenen (alt von levels)
    out.push(role(info, "parent", "optional"));
    out.push(role(info, "comment", "optional"), role(info, "colCategory", "optional"));
    return out;
}

/**
 * Rollen einer Ansichts-Vorlage (P&L 1.8). Bekannt ist nur der Baum (ROI-Baum 11A): ein Werttreiberbaum über Formel- und
 * KPI-Zeilen. Ebenen und AC sind Pflicht, Zeilentyp und Formel auch (ohne sie fällt die Wurzel auf die Summe zurück,
 * ein gewöhnlicher Hierarchiebaum statt DuPont; das KPI-Format Faktor/Betrag steht im Zeilentyp). PL wird empfohlen (die
 * Planjahre), die Periode auch (Jahre als Spalten jeder Karte; Monate ergeben zwölf und mehr Säulen je Karte).
 */
function pnlViewRoles(view, id, info) {
    if (view !== "tree") { throw new Error(`Ansichts-Vorlage ${id}: Ansicht „${view}“ kennt der Template-Katalog nicht.`); }
    const out = [role(info, "levels", "required", { alt: ["account", "parent"] }), role(info, "ac", "required"),
        role(info, "pl", "recommended"), role(info, "py", "optional"), role(info, "fc", "optional"),
        role(info, "period", "recommended")];
    for (const r of ["account", "accountName", "sortOrder", "rowType", "formulaDef", "signConvention", "displayInvert", "varianceInvert"]) {
        out.push(role(info, r, r === "rowType" || r === "formulaDef" ? "required" : "optional"));
    }
    out.push(role(info, "parent", "optional"), role(info, "comment", "optional"), role(info, "colCategory", "optional"));
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
            // 1.8 Ansichts-Vorlage (ROI-Baum 11A): Karten-Schalter und Ansicht, das Mega-Template bleibt, wie es ist
            const vp = hub.VIEW_PRESETS?.[t.tpl];
            if (vp) {
                out.push({
                    id: t.tpl, visual: "pnl", data: "statement", view: vp.view,
                    group: { id: g.id, title: text(loc, g.title) },
                    title: text(loc, t.title), use: text(loc, t.use),
                    objects: { columns: { ...vp.cols }, state: { uiState: JSON.stringify({ view: vp.view, treeV: 2 }) } },
                    roles: pnlViewRoles(vp.view, t.tpl, info),
                });
                continue;
            }
            if (!hub.MEGA_PRESETS[t.tpl]) { throw new Error(`P&L-Galerie-Kachel ${t.tpl} ohne Mega-Preset und ohne Ansichts-Vorlage (Template-Katalog).`); }
            const sw = hub.templateSwitches(t.tpl);
            const objects = { columns: { template: t.tpl, templateApplied: t.tpl, ...sw.cols }, numbers: { ...sw.nums } };
            if (Object.keys(sw.title).length) { objects.titleBlock = { ...sw.title }; }
            if (Object.keys(sw.stmt ?? {}).length) { objects.statement = { ...sw.stmt }; }
            out.push({
                id: t.tpl, visual: "pnl",
                // T01/T02: Strukturtabellen (Ebenen = Regionen, Kunden, Produkte), Bestands-Templates (1.7, Gruppe balance):
                // Bilanz und Cashflow (Ebenen = Bestandskonten), sonst GuV-Statement (Ebenen = Konten)
                data: /^T0[12]/.test(t.tpl) ? "structure" : g.id === "balance" ? "balance" : "statement",
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
