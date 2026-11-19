// dwg: fabscan.json neben der App, damit der Governance-Scanner fabscan die Abfragen der App gegen das Modell prüfen
// kann (sonst LIN-NO-MODEL, wenn das Modell nicht im selben Repo liegt). dwg kennt das Modell aus `app page --model`.
// Format (fabscan, Kitchen-Repo fabric-app-scanner/):
//   { "connectors": { "<App-Ordner>:<Konnektor>": "<Modellname>" }, "models": ["<Ordner, der das *.SemanticModel enthält>"] }
// fabscan liest die Datei aus dem Ordner, den es prüft (`fabscan <App-Ordner>`), Pfade relativ zu diesem Ordner.
// Unter "models" sucht fabscan (wie --models) *.SemanticModel-Ordner darin; der Modellordner selbst wird nicht erkannt,
// deshalb steht dort der Elternordner des Modells.
import fs from "node:fs";
import path from "node:path";

/** Anzeigename des Modells wie in fabscan: displayName aus .platform, sonst Ordnername ohne .SemanticModel */
export function modelName(modelDir) {
    const folder = path.basename(path.resolve(modelDir));
    const plain = folder.replace(/\.SemanticModel$/i, "");
    try {
        const p = JSON.parse(fs.readFileSync(path.join(modelDir, ".platform"), "utf8").replace(/^﻿/, ""));
        return p?.metadata?.displayName || plain;
    } catch { return plain; }
}

/** Zuordnung Konnektor → Modell in <appDir>/fabscan.json eintragen; vorhandene Einträge bleiben. @returns Pfad und Inhalt */
export function writeFabscanConfig({ appDir, connector, modelDir }) {
    const file = path.join(appDir, "fabscan.json");
    let cfg = {};
    if (fs.existsSync(file)) {
        try { cfg = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")); }
        catch (e) { throw new Error(`${file}: ${e.message} (fabscan.json reparieren oder löschen)`); }
        if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) { throw new Error(`${file}: erwartet ein JSON-Objekt.`); }
    }
    const app = path.basename(path.resolve(appDir));
    const name = modelName(modelDir);
    // echte Pfade: unter Windows sonst Kurznamen (MICHAE~1) gegen lange Namen, der relative Pfad liefe über die Wurzel
    const real = p => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
    const rel = path.relative(real(appDir), path.dirname(real(modelDir))).split(path.sep).join("/") || ".";
    const connectors = { ...(cfg.connectors ?? {}), [`${app}:${connector}`]: name };
    const models = [...new Set([...(Array.isArray(cfg.models) ? cfg.models : []), rel])];
    const out = { ...cfg, connectors, models };
    const text = `${JSON.stringify(out, null, 2)}\n`;
    const changed = !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text;
    if (changed) { fs.writeFileSync(file, text); }
    return { file, config: out, model: name, changed };
}
