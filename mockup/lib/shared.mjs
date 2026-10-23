// Gemeinsame MockupKitchen-Bausteine, von `dwg mockup build` aus dem Kitchen-Repo geholt (nicht von Hand ändern):
// Pixelraster (layout/pixelgrid.mjs), Rasterprüfung gridcheck.js und Barrierefreiheit a11y.js (mockup/vendor/).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as PG from "../../layout/pixelgrid.mjs";   // legt MK_PIXELGRID auch auf globalThis, gridcheck.js nutzt es

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VENDOR = path.resolve(HERE, "../vendor");
const require = createRequire(path.join(VENDOR, "package.json"));

export { PG };
/** MockupKitchen gridcheck.js: check() (Kanten, Zwischenräume), checkLattice() (Raster, Bündigkeit, Inhaltsbereich) */
export const GC = require("./gridcheck.js");
/** MockupKitchen a11y.js: check() (Kontrast, Schrift, Kachelgrößen, Titel, Dichte), contrastRatio() */
export const A11Y = require("./a11y.js");
/** Skripte des Skills mockup-to-powerbi (Konverter mockup_to_pbir.py) */
export const SKILL_SCRIPTS = path.join(VENDOR, "skill", "scripts");
