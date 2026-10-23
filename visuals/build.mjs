// Bündelt den Adapter samt ChartKitchen- und P&L-Quellcode als ESM-Paket nach dist/.
// Die Visuals kommen unverändert aus einem Klon des Repos PowerBI-Kitchen- (ibcsInspiredChartDeck,
// pnlByDatenWG): Pfad über DWG_KITCHEN oder --kitchen <pfad>, Standard ist ein Klon neben diesem Repo.
// powerbi-visuals-api ist nur ein leerer Shim (zur Laufzeit nur Typen). dist/ wird committet, damit
// Apps den Adapter ohne Kitchen-Klon nutzen können.
// Rollen und Sprachressourcen kommen aus capabilities.json bzw. stringResources/
// und werden nach src/_generated.ts geschrieben. Der Template-Katalog landet in dist/templates.json.
import { execSync } from "node:child_process";
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildTemplates } from "./templates.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argKitchen = process.argv.indexOf("--kitchen");
const REPO = path.resolve(argKitchen > 0 ? process.argv[argKitchen + 1]
    : process.env.DWG_KITCHEN ?? path.join(HERE, "../../PowerBI-Kitchen-"));
if (!fs.existsSync(path.join(REPO, "ibcsInspiredChartDeck", "src", "visual.ts"))) {
    console.error(`Kitchen-Repo nicht gefunden unter ${REPO}. DWG_KITCHEN oder --kitchen <pfad> setzen.`);
    process.exit(1);
}
const VISUALS = {
    chartkitchen: path.join(REPO, "ibcsInspiredChartDeck"),
    pnl: path.join(REPO, "pnlByDatenWG"),
};

function roles(dir) {
    const caps = JSON.parse(fs.readFileSync(path.join(dir, "capabilities.json"), "utf8"));
    const kind = Object.fromEntries(caps.dataRoles.map(r => [r.name, r.kind]));
    const cat = caps.dataViewMappings[0].categorical;
    const order = [
        ...cat.categories.select.map(s => s.for.in),
        ...cat.values.select.map(s => s.bind.to),
    ];
    const max = {};
    for (const [role, c] of Object.entries(caps.dataViewMappings[0].conditions[0])) { max[role] = c.max; }
    return { kind, order, max };
}

function locales(dir) {
    const out = {};
    const res = path.join(dir, "stringResources");
    for (const loc of fs.readdirSync(res)) {
        const f = path.join(res, loc, "resources.resjson");
        if (fs.existsSync(f)) { out[loc] = JSON.parse(fs.readFileSync(f, "utf8")); }
    }
    return out;
}

function version(dir) {
    return JSON.parse(fs.readFileSync(path.join(dir, "pbiviz.json"), "utf8")).visual.version;
}

const generated = {
    ROLES: { chartkitchen: roles(VISUALS.chartkitchen), pnl: roles(VISUALS.pnl) },
    VERSIONS: { chartkitchen: version(VISUALS.chartkitchen), pnl: version(VISUALS.pnl) },
};
fs.writeFileSync(path.join(HERE, "src/_generated.ts"),
    "// erzeugt von build.mjs aus capabilities.json und pbiviz.json, nicht von Hand ändern\n" +
    Object.entries(generated).map(([k, v]) => `export const ${k} = ${JSON.stringify(v)} as const;`).join("\n") + "\n");
// Sprachressourcen getrennt je Visual, damit sie mit dem Visual-Chunk nachgeladen werden
for (const [name, dir] of Object.entries(VISUALS)) {
    fs.writeFileSync(path.join(HERE, `src/visuals/_locales-${name}.ts`),
        "// erzeugt von build.mjs aus stringResources/, nicht von Hand ändern\n" +
        `export const LOCALES: Record<string, Record<string, string>> = ${JSON.stringify(locales(dir))};\n`);
}

// formattingutils bringt die Globalize-Kulturdaten aller Sprachen mit (~750 KB).
// Die Visuals sind in DE, EN, ES und JA lokalisiert, mehr Kulturen braucht es nicht.
const KEEP_CULTURES = /^(de|en|es|ja)(-|$)/;
const slimGlobalize = {
    name: "slim-globalize",
    setup(build) {
        build.onLoad({ filter: /powerbiGlobalizeLocales\.js$/ }, async args => {
            const { locales } = await import(pathToFileURL(args.path).href);   // Windows: Pfad als file://-URL
            const kept = Object.fromEntries(Object.entries(locales).filter(([k]) => KEEP_CULTURES.test(k)));
            return { contents: `exports.locales = ${JSON.stringify(kept)};`, loader: "js" };
        });
    },
};

const common = {
    plugins: [slimGlobalize],
    // Chunk-Hashes hängen sonst am absoluten Pfad des Checkouts (Sourcemap-Quellen): fest auf visuals/ beziehen
    absWorkingDir: HERE,
    bundle: true,
    format: "esm",
    splitting: true,
    minify: true,
    sourcemap: "external",   // .map ohne Verweis im Bundle: Apps bekommen dist ohne Maps
    target: "es2020",
    chunkNames: "chunks/[name]-[hash]",
    loader: { ".less": "empty" },
    alias: {
        "powerbi-visuals-api": path.join(HERE, "src/pbi-shim.ts"),
        "@kitchen/chartkitchen": path.join(VISUALS.chartkitchen, "src", "visual.ts"),
        "@kitchen/pnl": path.join(VISUALS.pnl, "src", "visual.ts"),
    },
    nodePaths: [path.join(HERE, "..", "node_modules")],
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    metafile: true,
    logLevel: "warning",
};

fs.rmSync(path.join(HERE, "dist"), { recursive: true, force: true });
const result = await esbuild.build({
    ...common,
    entryPoints: [path.join(HERE, "src/index.ts")],
    outdir: path.join(HERE, "dist"),
    entryNames: "dwg-visuals",
});

const sizes = Object.entries(result.metafile.outputs)
    .filter(([f]) => f.endsWith(".js"))
    .map(([f, o]) => `${f}  ${(o.bytes / 1024).toFixed(0)} KB`);   // Pfade relativ zu absWorkingDir
// Typdeklarationen für Apps (dist/dwg-visuals.d.ts → dist/types/index.d.ts)
execSync(`node "${path.join(HERE, "..", "node_modules", "typescript", "bin", "tsc")}" -p tsconfig.types.json`, { cwd: HERE, stdio: "inherit" });
fs.writeFileSync(path.join(HERE, "dist", "dwg-visuals.d.ts"), 'export * from "./types/index";\n');
fs.writeFileSync(path.join(HERE, "dist", "BUILD.json"), JSON.stringify({
    versions: generated.VERSIONS,
    kitchenCommit: (() => { try { return execSync("git rev-parse --short HEAD", { cwd: REPO }).toString().trim(); } catch { return null; } })(),
}, null, 2) + "\n");
// Template-Katalog für dwg templates, dwg tile add und MockupKitchen (visuals/templates.mjs)
const catalog = await buildTemplates(VISUALS, generated.VERSIONS);
fs.writeFileSync(path.join(HERE, "dist", "templates.json"), JSON.stringify(catalog, null, 2) + "\n");
sizes.push(`dist${path.sep}templates.json  ${catalog.templates.length} Templates`);
console.log(`visuals gebaut (ChartKitchen ${generated.VERSIONS.chartkitchen}, P&L ${generated.VERSIONS.pnl}):\n  ` + sizes.join("\n  "));

// Demo-Seite (demo/index.html lädt demo/build/main.js)
if (process.argv.includes("--demo")) {
    fs.rmSync(path.join(HERE, "demo/build"), { recursive: true, force: true });
    await esbuild.build({
        ...common,
        entryPoints: [path.join(HERE, "demo/main.ts")],
        outdir: path.join(HERE, "demo/build"),
        entryNames: "[name]",
    });
    console.log("Demo gebaut: demo/build/main.js");
}
