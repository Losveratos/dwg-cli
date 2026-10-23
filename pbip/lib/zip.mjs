// Minimaler ZIP-Leser (Stored und Deflate) für .pbiviz-Dateien, ohne Abhängigkeiten.
import zlib from "node:zlib";

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** @returns {Record<string, Buffer>} Dateiname → Inhalt (Ordner-Einträge entfallen) */
export function readZip(buf) {
    let eocd = buf.length - 22;
    while (eocd >= 0 && buf.readUInt32LE(eocd) !== EOCD) { eocd--; }
    if (eocd < 0) { throw new Error("Keine ZIP-Datei (Endsatz fehlt)."); }
    const count = buf.readUInt16LE(eocd + 10);
    let off = buf.readUInt32LE(eocd + 16);
    const files = {};
    for (let i = 0; i < count; i++) {
        if (buf.readUInt32LE(off) !== CENTRAL) { throw new Error("ZIP-Verzeichnis beschädigt."); }
        const method = buf.readUInt16LE(off + 10);
        const size = buf.readUInt32LE(off + 20);
        const nameLen = buf.readUInt16LE(off + 28);
        const extraLen = buf.readUInt16LE(off + 30);
        const commentLen = buf.readUInt16LE(off + 32);
        const local = buf.readUInt32LE(off + 42);
        const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
        off += 46 + nameLen + extraLen + commentLen;
        if (name.endsWith("/")) { continue; }
        if (buf.readUInt32LE(local) !== LOCAL) { throw new Error(`ZIP-Eintrag ${name} beschädigt.`); }
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const data = buf.subarray(start, start + size);
        if (method === 0) { files[name] = Buffer.from(data); }
        else if (method === 8) { files[name] = zlib.inflateRawSync(data); }
        else { throw new Error(`ZIP-Methode ${method} wird nicht unterstützt (${name}).`); }
    }
    return files;
}
