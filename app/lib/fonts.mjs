// dwg: Schriften der App lokal statt von fremden Servern. Die Rayfin-Vorlage lädt Geist und JetBrains Mono von
// fonts.googleapis.com (index.html). `dwg app page` legt die Schriften (woff2 + OFL) unter
// packages/frontend/src/vendor/dwg-fonts/ ab, bindet sie in index.html ein (Vite bündelt CSS und woff2 mit) und
// entfernt die Links zu Schrift-Diensten. `dwg check --app` meldet fremde Schriften, die übrig sind.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FONTS = path.resolve(HERE, "../fonts");
/** Pfad der Schrift-CSS in der App, wie er in index.html steht (Vite löst ihn vom Projektordner aus auf) */
export const FONT_CSS_HREF = "/src/vendor/dwg-fonts/dwg-fonts.css";

/** Bekannte Schrift-Dienste: jede Anfrage dorthin verrät die IP des Nutzers an Dritte */
const HOSTS = [
    "fonts\\.googleapis\\.com", "fonts\\.gstatic\\.com", "use\\.typekit\\.net", "p\\.typekit\\.net", "fonts\\.bunny\\.net",
    "fast\\.fonts\\.net", "fonts\\.cdnfonts\\.com", "use\\.fontawesome\\.com", "cdn\\.jsdelivr\\.net/npm/@fontsource",
    "unpkg\\.com/@fontsource",
];
export const FONT_HOST_RX = new RegExp(`(?:https?:)?//(?:${HOSTS.join("|")})`, "i");
/** ganze <link>-Zeile, deren href auf einen Schrift-Dienst zeigt (preconnect, dns-prefetch, stylesheet, preload) */
const LINK_RX = new RegExp(`^[ \\t]*<link\\b[^>]*\\bhref\\s*=\\s*["'](?:https?:)?//(?:${HOSTS.join("|")})[^"']*["'][^>]*>[ \\t]*\\r?\\n?`, "gim");

/** Links zu Schrift-Diensten aus index.html entfernen und die lokale Schrift-CSS einbinden (idempotent). */
export function localizeFontsHtml(html) {
    const removed = (html.match(LINK_RX) ?? []).length;
    let out = html.replace(LINK_RX, "");
    const linked = out.includes(FONT_CSS_HREF);
    if (!linked) {
        const tag = `<link rel="stylesheet" href="${FONT_CSS_HREF}" />`;
        out = /<\/head>/i.test(out)
            ? out.replace(/([ \t]*)<\/head>/i, (_, ind) => `${ind}  ${tag}\n${ind}</head>`)
            : `${tag}\n${out}`;
    }
    return { html: out, removed, added: !linked };
}

/** Schriften nach src/vendor/dwg-fonts/ kopieren und index.html umstellen. @returns {string[]} geschriebene Pfade */
export function installFonts(front) {
    const dst = path.join(front, "src", "vendor", "dwg-fonts");
    fs.rmSync(dst, { recursive: true, force: true });
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(FONTS)) { fs.copyFileSync(path.join(FONTS, f), path.join(dst, f)); }
    const written = ["src/vendor/dwg-fonts/"];
    const index = path.join(front, "index.html");
    if (fs.existsSync(index)) {
        const before = fs.readFileSync(index, "utf8");
        const r = localizeFontsHtml(before);
        if (r.html !== before) {
            fs.writeFileSync(index, r.html);
            written.push(`index.html (${[r.removed && `${r.removed} Links zu Schrift-Diensten entfernt`, r.added && "Schriften lokal eingebunden"]
                .filter(Boolean).join(", ")})`);
        }
    }
    return written;
}

function* sourceFiles(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (["node_modules", "dist", "build", ".git"].includes(e.name)) { continue; }
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { yield* sourceFiles(p); }
        else if (/\.(html?|css|scss|less|tsx?|jsx?|mjs)$/i.test(e.name)) { yield p; }
    }
}

/**
 * Fremde Schriften in einer Rayfin-App: Verweise auf Schrift-Dienste in index.html und unter src/ (Links, @import,
 * @font-face-Quellen, Strings im Code). @returns {{ file: string, line: number, text: string }[]}
 */
export function foreignFonts(appDir) {
    const front = path.join(appDir, "packages", "frontend");
    if (!fs.existsSync(front)) { throw new Error(`${appDir} ist keine Rayfin-App (packages/frontend fehlt).`); }
    const files = [path.join(front, "index.html"), ...(fs.existsSync(path.join(front, "src")) ? sourceFiles(path.join(front, "src")) : [])]
        .filter(f => fs.existsSync(f));
    const out = [];
    for (const f of files) {
        fs.readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
            if (FONT_HOST_RX.test(line)) {
                out.push({ file: path.relative(appDir, f).split(path.sep).join("/"), line: i + 1, text: line.trim().slice(0, 160) });
            }
        });
    }
    return out;
}
