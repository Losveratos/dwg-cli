// Unit-Tests für pixelgrid.mjs gegen die Tabellen in KONZEPT-PIXELRASTER.md (Knowledge Kitchen, assets/mockup),
// Abschnitt 3: „Standard-Chrome, Filter rechts“ und „Ohne Filter“, dazu die Garantien aus Abschnitt 2.
//   node layout/test.mjs
import assert from "node:assert/strict";
import { MOCKUP_CHROME, DWG_CHROME, zones, place, line, spans, solveMargins, cellOf, transfer, slicerStack, inside, R } from "./pixelgrid.mjs";

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`  ok  ${name}`); };
const noFilter = { ...MOCKUP_CHROME, filter: { ...MOCKUP_CHROME.filter, on: false } };
/** Spalte j..j+s in Zwölfteln (bzw. 24steln) als Breite */
const colW = (z, from, to, den = 12) => line(to, den, z.pitch.x) - line(from, den, z.pitch.x) - z.g;

// Canvas · k · g · Rand L/R/O/U · Inhalt · Spaltenschritt · 1 Spalte · KPI (3 Sp.) · Zeilenschritt · halbe KPI
const STANDARD = [
    ["HD", 1280, 720, 1, 12, [18, 18, 20, 20], [1044, 600], 88, 76, 252, 51, [120, 120]],
    ["FHD", 1920, 1080, 1.5, 18, [27, 27, 27, 27], [1566, 906], 132, 114, 378, 77, [180, 180]],
    ["UHD", 3840, 2160, 3, 36, [54, 54, 54, 54], [3132, 1812], 264, 228, 756, 154, [360, 360]],
    ["4:3", 1280, 960, 1, 12, [18, 18, 20, 20], [1044, 840], 88, 76, 252, 71, [120, 120]],
    ["Hoch", 1080, 1920, 0.844, 10, [16, 17, 13, 14], [878, 1826], 74, 64, 212, 153, [101, 101]],
    ["1366", 1366, 768, 1.067, 13, [19, 19, 17, 18], [1115, 647], 94, 81, 269, 55, [128, 128]],
    ["1600", 1600, 900, 1.25, 15, [22, 23, 23, 24], [1305, 753], 110, 95, 315, 64, [150, 150]],
];

test("Standard-Chrome, Filter rechts: alle sieben Canvas wie in der Tabelle", () => {
    for (const [name, w, h, k, g, m, content, step, col, kpi, rowStep, half] of STANDARD) {
        const z = zones({ w, h }, MOCKUP_CHROME);
        const at = `${name} ${w}×${h}`;
        assert.equal(Math.round(z.k * 1000) / 1000, k, `${at}: k`);
        assert.equal(z.g, g, `${at}: g`);
        assert.deepEqual([z.margins.l, z.margins.r, z.margins.t, z.margins.b], m, `${at}: Ränder`);
        assert.deepEqual([z.content.w, z.content.h], content, `${at}: Inhalt`);
        assert.equal(z.pitch.x / 12, step, `${at}: Spaltenschritt`);
        assert.equal(colW(z, 0, 1), col, `${at}: 1 Spalte`);
        assert.equal(colW(z, 0, 3), kpi, `${at}: KPI`);
        assert.equal(z.pitch.y / 12, rowStep, `${at}: Zeilenschritt`);
        assert.deepEqual([colW(z, 0, 3, 24), colW(z, 3, 6, 24)], half, `${at}: halbe KPI`);
    }
});

// Canvas · Rand L/R/O/U · Spaltenschritt · 1 Spalte · KPI · halbe KPI (null = ±1 px)
const WITHOUT_FILTER = [
    ["HD", 1280, 720, [16, 16, 20, 20], 105, 93, 303, null],
    ["FHD", 1920, 1080, [27, 27, 27, 27], 157, 139, 453, null],
    ["UHD", 3840, 2160, [54, 54, 54, 54], 314, 278, 906, [435, 435]],
    ["4:3", 1280, 960, [16, 16, 20, 20], 105, 93, 303, null],
    ["Hoch", 1080, 1920, [17, 17, 13, 14], 88, 78, 254, [122, 122]],
    ["1366", 1366, 768, [17, 18, 17, 18], 112, 99, 323, [155, 155]],
    ["1600", 1600, 900, [21, 22, 23, 24], 131, 116, 378, null],
];

test("Ohne Filter: alle sieben Canvas wie in der Tabelle (FHD Rand 27 rundum, Spaltenschritt 157)", () => {
    for (const [name, w, h, m, step, col, kpi, half] of WITHOUT_FILTER) {
        const z = zones({ w, h }, noFilter);
        const at = `${name} ohne Filter`;
        assert.deepEqual([z.margins.l, z.margins.r, z.margins.t, z.margins.b], m, `${at}: Ränder`);
        assert.equal(z.pitch.x / 12, step, `${at}: Spaltenschritt`);
        assert.equal(colW(z, 0, 1), col, `${at}: 1 Spalte`);
        assert.equal(colW(z, 0, 3), kpi, `${at}: KPI`);
        const halves = [colW(z, 0, 3, 24), colW(z, 3, 6, 24)];
        if (half) { assert.deepEqual(halves, half, `${at}: halbe KPI`); }
        else { assert.ok(Math.abs(halves[0] - halves[1]) <= 1, `${at}: halbe KPI ±1 px (${halves})`); }
    }
});

test("Standardprojekt FHD: KPIs bei x = 27/423/819/1215, Breite 378, Höhe 167; Hauptzeile 1038 + 510", () => {
    const z = zones({ w: 1920, h: 1080 }, MOCKUP_CHROME);
    const kpis = [0, 3, 6, 9].map(a => place(z, a, a + 3, 0, 12));
    // Zeilen 1:4 (KPI-Zeile ein Fünftel): Nenner 5
    const row = (c, d) => [line(c, 5, z.pitch.y), line(d, 5, z.pitch.y)];
    assert.deepEqual(kpis.map(r => r[0]), [27, 423, 819, 1215]);
    assert.ok(kpis.every(r => r[2] === 378));
    assert.equal(row(0, 1)[1] - row(0, 1)[0] - z.g, 167);
    assert.deepEqual([colW(z, 0, 8), colW(z, 8, 12)], [1038, 510]);
});

test("Garantien: gleicher Bruch gleiches Pixel, Zwischenraum genau g, bündig mit dem Inhaltsrand", () => {
    for (const [, w, h] of STANDARD) {
        for (const chrome of [MOCKUP_CHROME, noFilter, DWG_CHROME]) {
            const z = zones({ w, h }, chrome);
            assert.equal(z.pitch.x % 12, 0);
            assert.equal(z.pitch.y % 12, 0);
            for (const parts of [[1, 1], [1, 1, 1], [1, 1, 1, 1], [1, 2, 1], [8, 4], [3, 3, 3, 3]]) {
                const S = parts.reduce((s, v) => s + v, 0);
                let a = 0;
                const rects = parts.map(p => { const r = place(z, a * 12 / S, (a + p) * 12 / S, 0, 12); a += p; return r; });
                assert.equal(rects[0][0], z.content.x, "bündig links");
                const last = rects.at(-1);
                assert.equal(last[0] + last[2], z.content.x + z.content.w, "bündig rechts");
                for (let i = 1; i < rects.length; i++) { assert.equal(rects[i][0] - (rects[i - 1][0] + rects[i - 1][2]), z.g, "Zwischenraum g"); }
            }
            // gleiche Brüche über verschiedene Nenner: 6/12 = 12/24 = 1/2
            assert.equal(line(6, 12, z.pitch.x), line(12, 24, z.pitch.x));
            assert.equal(line(6, 12, z.pitch.x), line(1, 2, z.pitch.x));
        }
    }
});

test("Ränder: lösbar in 320 bis 4000 px, höchstens 3 px Abweichung, Vorrang P mod 24", () => {
    for (let w = 320; w <= 4000; w += 7) {
        const z = zones({ w, h: R(w * 9 / 16) }, MOCKUP_CHROME);
        assert.equal(z.pitch.x % 12, 0, `${w}`);
        assert.ok(Math.abs(z.margins.l - z.m0) <= 3 && z.margins.r - z.margins.l <= 1, `${w}`);
    }
    // Vorrang: P mod 24 vor Symmetrie
    const s = solveMargins(1350, 23, 15);
    assert.deepEqual(s, { mL: 22, mR: 23, P: 1320 });
});

test("Gewichteter Split (Brüche), Rasterlage und Übertragung FHD → HD", () => {
    assert.deepEqual(spans([8, 4]), [[0, 2 / 3], [2 / 3, 1]]);
    assert.deepEqual(spans([1, 1, 1], 0, 12), [[0, 4], [4, 8], [8, 12]]);
    const fhd = zones({ w: 1920, h: 1080 }, DWG_CHROME), hd = zones({ w: 1280, h: 720 }, DWG_CHROME);
    const karten = place(fhd, 0, 12, 0, 2), haupt = place(fhd, 0, 12, 2, 12);
    assert.deepEqual(karten, [327, 123, 1566, 134]);
    assert.deepEqual(haupt, [327, 275, 1566, 742]);
    assert.deepEqual(cellOf(fhd, haupt), { a: 0, b: 12, c: 2, d: 12, den: 12 });
    assert.equal(cellOf(fhd, [330, 123, 1566, 134]), null);
    // pixelgenau ins HD-Raster: Zwischenraum dort genau 12, bündig mit dem HD-Inhalt
    const k2 = transfer(karten, fhd, hd), h2 = transfer(haupt, fhd, hd);
    assert.equal(k2[0], hd.content.x);
    assert.equal(h2[1] - (k2[1] + k2[3]), hd.g);
    assert.equal(h2[1] + h2[3], hd.content.y + hd.content.h);
    // freie Rechtecke proportional
    const free = transfer([400, 200, 600, 300], fhd, hd);
    assert.ok(inside(hd, free));
});

test("dwg-Chrome (Kopf 64, Filter links) und Slicer-Stapel", () => {
    const z = zones({ w: 1920, h: 1080 }, DWG_CHROME);
    assert.deepEqual(z.header, { x: 0, y: 0, w: 1920, h: 96 });
    assert.deepEqual(z.filter, { x: 0, y: 96, w: 300, h: 948 });
    assert.deepEqual(z.footer, { x: 0, y: 1044, w: 1920, h: 36 });
    assert.deepEqual(z.content, { x: 327, y: 123, w: 1566, h: 894 });
    assert.deepEqual(slicerStack(z, 2), [[27, 123, 246, 78], [27, 219, 246, 78]]);
    assert.ok(inside(z, place(z, 0, 12, 0, 12)));
    assert.ok(!inside(z, [300, 123, 1593, 438]));
});

console.log(`pixelgrid: ${n} Tests grün`);
