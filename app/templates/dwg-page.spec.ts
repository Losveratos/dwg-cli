// dwg: Tests der Seiten-Hilfsfunktionen. Von `dwg app page` geschrieben, wird bei jedem Lauf ersetzt.
import { describe, expect, it } from 'vitest';

import { daxQuery } from '../vendor/dwg-visuals/dwg-visuals.js';
import {
  absorbHeight,
  applyOptions,
  combineFilters,
  defaultChoices,
  FILTER_BAR_H,
  findPage,
  fitHeight,
  fixedChipText,
  fixedFilterChips,
  formatSlicerValue,
  isEmptyValue,
  MIN_FIT,
  MIN_STAGE_WIDTH,
  navGroups,
  normColumn,
  pageHeight,
  pageId,
  pageLabel,
  pageRegion,
  persistedChoices,
  RESOLUTION_WIDTH,
  sameValues,
  selectionFilters,
  selectionLabel,
  slicerChips,
  slicerDefaults,
  slicerFilters,
  slicerQuery,
  slicerValues,
  stageChrome,
  stagePage,
  stageScale,
  templateCount,
  tileBox,
  tileFilters,
  toggleSlicerValue,
  uiText,
  visualLocale,
  withoutHeaders,
  type DwgAppSpec,
  type DwgPageSpec,
  type DwgSlicerSpec,
} from './dwg-page';

const page: DwgPageSpec = {
  name: 'Test',
  width: 1920,
  height: 1080,
  filters: [{ column: "'Calender'[Year]", values: [2026] }],
  tiles: [
    { id: 'a', visual: 'chartkitchen', rect: [0, 0, 960, 540], bindings: { category: "'Calender'[Month Name Short]", actual: "'Sales Demo'[AC]" } },
    { id: 'b', visual: 'chartkitchen', rect: [960, 0, 960, 540], bindings: { category: "'Sales Demo'[Country]", actual: "'Sales Demo'[AC]" } },
  ],
};

describe('dwg-page', () => {
  it('macht aus einer Auswahl TREATAS-Filter je Spalte', () => {
    const f = selectionFilters({ tile: 'a', keys: [{ 'Calender[Month Name Short]': 'Mär' }, { 'Calender[Month Name Short]': 'Apr' }] });
    expect(f).toEqual([{ column: "'Calender'[Month Name Short]", values: ['Mär', 'Apr'] }]);
  });

  it('filtert nur die anderen Kacheln, die Seitenfilter gelten überall', () => {
    const sel = { tile: 'a', keys: [{ 'Calender[Month Name Short]': 'Mär' }] };
    expect(tileFilters(page, 'a', sel)).toHaveLength(1);
    expect(tileFilters(page, 'b', sel)).toHaveLength(2);
    const q = daxQuery('chartkitchen', page.tiles[1].bindings, { filters: tileFilters(page, 'b', sel) });
    expect(q.query).toContain(`TREATAS({"Mär"}, 'Calender'[Month Name Short])`);
    expect(q.query).toContain(`TREATAS({2026}, 'Calender'[Year])`);
  });

  it('nimmt eigene Kachelfilter nur in diese Kachel mit', () => {
    const p: DwgPageSpec = {
      ...page,
      tiles: [page.tiles[0], { ...page.tiles[1], filters: [{ column: "'Sales Demo'[Country]", values: ['DE', 'AT'] }] }],
    };
    expect(tileFilters(p, 'a', null)).toHaveLength(1);
    expect(tileFilters(p, 'b', null)).toEqual([...page.filters!, { column: "'Sales Demo'[Country]", values: ['DE', 'AT'] }]);
    const sel = { tile: 'a', keys: [{ 'Calender[Month Name Short]': 'Mär' }] };
    expect(tileFilters(p, 'b', sel)).toHaveLength(3);
  });

  it('beschriftet den Filter-Chip', () => {
    expect(selectionLabel({ tile: 'a', keys: [{ 'Sales Demo[Country]': 'DE' }] })).toBe('Country: DE');
    expect(selectionLabel(null)).toBe('');
  });

  it('skaliert Kacheln wie Power BI und stapelt sie auf schmalen Bildschirmen', () => {
    expect(tileBox(page.tiles[1], page, 960)).toEqual({ position: 'absolute', left: 480, top: 0, width: 480, height: 270 });
    expect(tileBox(page.tiles[1], page, 600).position).toBe('relative');
  });

  it('zeigt im fließenden Modus nur den Inhaltsbereich ohne Rahmen-Zonen', () => {
    const framed: DwgPageSpec = {
      ...page,
      zones: {
        header: { x: 0, y: 0, w: 1920, h: 96 },
        filter: { x: 0, y: 96, w: 300, h: 948 },
        footer: { x: 0, y: 1044, w: 1920, h: 36 },
        content: { x: 327, y: 123, w: 1566, h: 894 },
      },
    };
    const region = pageRegion(framed, true);
    expect(region).toEqual({ x: 300, y: 96, w: 1620, h: 948 });
    expect(pageRegion(framed)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    const tile = { ...page.tiles[0], rect: [327, 123, 1566, 134] as [number, number, number, number] };
    // 1620 Seitenpixel auf 1215 Bildschirmpixel: Maßstab 3/4
    expect(tileBox(tile, framed, 1215, 900, region)).toEqual({ position: 'absolute', left: 20.25, top: 20.25, width: 1174.5, height: 100.5 });
    expect(pageHeight(framed, 1215, region)).toBe(711);
  });

  it('überträgt eine Full-HD-Seite pixelgenau ins HD-Raster (pixelgrid)', () => {
    const chrome = {
      header: { on: true, h: 64 },
      filter: { on: true, side: 'left' as const, w: 200 },
      footer: { on: true, h: 24 },
    };
    const fhd: DwgPageSpec = {
      ...page,
      zones: {
        header: { x: 0, y: 0, w: 1920, h: 96 },
        filter: { x: 0, y: 96, w: 300, h: 948 },
        footer: { x: 0, y: 1044, w: 1920, h: 36 },
        content: { x: 327, y: 123, w: 1566, h: 894 },
      },
      tiles: [
        { ...page.tiles[0], rect: [327, 123, 1566, 134] },
        { ...page.tiles[1], rect: [327, 275, 1566, 742] },
      ],
    };
    const hd = stagePage(fhd, 1280, chrome);
    expect([hd.width, hd.height]).toEqual([1280, 720]);
    expect(hd.zones?.content).toEqual({ x: 218, y: 80, w: 1044, h: 600 });
    expect(hd.tiles.map((t) => t.rect)).toEqual([
      [218, 80, 1044, 90],
      [218, 182, 1044, 498],
    ]);
    expect(stagePage(fhd, 1920, chrome)).toBe(fhd);

    // Filter-Panel eingeklappt: keine Filterzone, Kopf mit Filterleiste (64 + 26 bei 1280), Kacheln über die ganze Breite
    const open = stagePage(fhd, 1920, chrome, { collapsed: false, height: 1080 });
    expect(open).toBe(fhd);
    const closed = stagePage(fhd, 1920, chrome, { collapsed: true });
    expect(closed.zones?.filter).toBeUndefined();
    expect(closed.zones?.header).toEqual({ x: 0, y: 0, w: 1920, h: 135 });
    expect(closed.zones?.content).toEqual({ x: 27, y: 160, w: 1866, h: 858 });
    expect(closed.tiles.map((t) => t.rect)).toEqual([
      [27, 160, 1866, 128],
      [27, 306, 1866, 712],
    ]);
    expect(stageChrome(chrome, true)).toEqual({ ...chrome, header: { on: true, h: 64 + FILTER_BAR_H }, filter: { ...chrome.filter, on: false } });
    expect(stageChrome(chrome, false)).toBe(chrome);

    // auf die Fensterhöhe eingepasst: die Hauptkachel nimmt die 120 px auf, die KPI-Karten bleiben, Fuß bleibt unten
    const fit = stagePage(fhd, 1920, chrome, { height: 960 });
    expect([fit.width, fit.height]).toEqual([1920, 960]);
    expect(fit.zones?.footer).toEqual({ x: 0, y: 924, w: 1920, h: 36 });
    expect(fit.tiles.map((t) => t.rect)).toEqual([
      [327, 123, 1566, 134],
      [327, 275, 1566, 622],
    ]);
    expect(stagePage(fhd, 1920, chrome, { height: 960, collapsed: true }).tiles.map((t) => t.rect)).toEqual([
      [27, 160, 1866, 128],
      [27, 306, 1866, 592],
    ]);
    // höher (gemeldeter Platzbedarf): die Hauptkachel wächst
    expect(stagePage(fhd, 1920, chrome, { height: 1180 }).tiles.map((t) => t.rect)).toEqual([
      [327, 125, 1566, 134],
      [327, 277, 1566, 838],
    ]);
  });

  it('gleicht die Höhe über die Hauptkachel aus, sonst gleichmäßig im Raster', () => {
    // Karten oben, Hauptkachel, zwei Kacheln darunter: die unteren rücken nach
    expect(absorbHeight([[0, 0, 100, 20], [0, 30, 100, 60], [0, 100, 40, 10], [60, 100, 40, 10]], 110, 90)).toEqual([
      [0, 0, 100, 20],
      [0, 30, 100, 40],
      [0, 80, 40, 10],
      [60, 80, 40, 10],
    ]);
    // zwei gleich hohe Kacheln im Band der Hauptkachel schrumpfen mit
    expect(absorbHeight([[0, 0, 60, 50], [70, 0, 30, 50]], 50, 40)).toEqual([
      [0, 0, 60, 40],
      [70, 0, 30, 40],
    ]);
    // Kachel ragt teilweise ins Band: kein Ausgleich
    expect(absorbHeight([[0, 0, 60, 50], [70, 10, 30, 60]], 70, 60)).toBeNull();
    // Hauptkachel fiele unter 40 %
    expect(absorbHeight([[0, 0, 100, 50]], 50, 10)).toBeNull();
  });

  it('passt die Bühne in die Fensterhöhe: höchstens Seitenhöhe, mindestens MIN_FIT', () => {
    expect(fitHeight(984, 1, 1080)).toBe(984);
    expect(fitHeight(700, 0.75, 1080)).toBe(933);
    expect(fitHeight(2000, 1, 1080)).toBe(1080);
    expect(fitHeight(300, 1, 1080)).toBe(Math.round(1080 * MIN_FIT));
    expect(fitHeight(0, 1, 1080)).toBe(1080);
  });

  it('skaliert die Bühne gleichmäßig, mit Mindestfaktor statt weiter zu schrumpfen', () => {
    expect(RESOLUTION_WIDTH).toEqual({ fullhd: 1920, hd: 1280 });
    expect(stageScale(1920, 1920)).toBe(1);
    expect(stageScale(1440, 1920)).toBe(0.75);
    expect(stageScale(1000, 1920)).toBe(MIN_STAGE_WIDTH / 1920);
    expect(stageScale(1440, 1280)).toBe(1.125);
    expect(stageScale(5000, 1920)).toBe(2);
  });

  it('blendet Titelblöcke und Bedienleisten der Visuals aus, ohne andere Objekte zu verlieren', () => {
    const ck = withoutHeaders('chartkitchen', { chart: { orientation: 'cards' }, ibcsTitle: { kpi: 'Umsatz' } });
    expect(ck).toEqual({
      chart: { orientation: 'cards', chartButtons: false, cumulativeButton: false },
      ibcsTitle: { kpi: 'Umsatz', show: false },
    });
    expect(withoutHeaders('pnl', { titleBlock: { measureLine: 'GuV' } })).toEqual({
      titleBlock: { measureLine: 'GuV', show: false },
      toolbar: { show: false },
    });
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue('')).toBe(true);
    expect(isEmptyValue(0)).toBe(false);
  });
});

const slicers: DwgSlicerSpec[] = [
  { column: "'Calender'[Year]", label: 'Jahr', default: [2026] },
  { column: "'Sales Demo'[Country]", label: 'Land', multi: true },
  { column: "'Calender'[Month Name Short]", label: 'Monat', multi: true, sortBy: "'Calender'[Month]" },
];

describe('dwg-page · Slicer', () => {
  it('startet mit den Standardwerten, „alle“ filtert nicht', () => {
    const state = slicerDefaults(slicers);
    expect(state).toEqual({ "'Calender'[Year]": [2026], "'Sales Demo'[Country]": [], "'Calender'[Month Name Short]": [] });
    expect(slicerFilters(slicers, state)).toEqual([{ column: "'Calender'[Year]", values: [2026] }]);
  });

  it('Einfachauswahl ersetzt, Mehrfachauswahl schaltet um', () => {
    expect(toggleSlicerValue(slicers[0], [2026], 2025)).toEqual([2025]);
    expect(toggleSlicerValue(slicers[0], [2026], 2026)).toEqual([]);
    expect(toggleSlicerValue(slicers[1], ['DE'], 'AT')).toEqual(['DE', 'AT']);
    expect(toggleSlicerValue(slicers[1], ['DE', 'AT'], 'DE')).toEqual(['AT']);
    expect(sameValues(['DE', 'AT'], ['AT', 'DE'])).toBe(true);
    expect(sameValues([2026], ['2026'])).toBe(false);
  });

  it('Slicer gelten für alle Kacheln, zusammen mit Querfilter und Seitenfilter', () => {
    const extra = slicerFilters(slicers, { ...slicerDefaults(slicers), "'Sales Demo'[Country]": ['DE', 'AT'] });
    const sel = { tile: 'a', keys: [{ 'Calender[Month Name Short]': 'Mär' }] };
    // Seitenfilter und Slicer auf dieselbe Spalte (Year): eine TREATAS-Liste, Schnittmenge
    expect(tileFilters(page, 'a', sel, extra)).toEqual([
      { column: "'Calender'[Year]", values: [2026] },
      { column: "'Sales Demo'[Country]", values: ['DE', 'AT'] },
    ]);
    const q = daxQuery('chartkitchen', page.tiles[1].bindings, { filters: tileFilters(page, 'b', sel, extra) });
    expect(q.query).toContain(`TREATAS({"DE", "AT"}, 'Sales Demo'[Country])`);
    expect(q.query).toContain(`TREATAS({"Mär"}, 'Calender'[Month Name Short])`);
    expect(q.query.match(/'Calender'\[Year\]\)/g)).toHaveLength(1);
  });

  it('zeigt aktive Slicer als Chips für die Filterleiste, „Alle“ ohne Chip', () => {
    const defaults = slicerDefaults(slicers);
    expect(slicerChips(slicers, defaults, defaults)).toEqual([
      { column: "'Calender'[Year]", label: 'Jahr', values: '2026', changed: false },
    ]);
    const state = { ...defaults, "'Calender'[Year]": [2025], "'Sales Demo'[Country]": ['DE', 'AT', 'CH', 'IT'] };
    expect(slicerChips(slicers, state, defaults)).toEqual([
      { column: "'Calender'[Year]", label: 'Jahr', values: '2025', changed: true },
      { column: "'Sales Demo'[Country]", label: 'Land', values: 'DE, AT +2', changed: true },
    ]);
    expect(slicerChips(slicers, { ...defaults, "'Calender'[Year]": [] }, defaults)).toEqual([]);
  });

  it('zählt Templates aus der Spec (verschiedene Kennungen, sonst Seiten)', () => {
    const pages = [{ ...page, template: 'C01' }, { ...page, template: 'C01' }, { ...page, template: 'T02A' }];
    expect(templateCount({ pages })).toBe(2);
    expect(templateCount({ pages: [page, page] })).toBe(2);
  });

  it('Schnittmenge ohne Treffer filtert auf BLANK', () => {
    expect(combineFilters([{ column: "'Calender'[Year]", values: [2025] }], [{ column: 'Calender[Year]', values: [2026] }])).toEqual([
      { column: "'Calender'[Year]", values: [null] },
    ]);
    expect(normColumn('Calender[Year]')).toBe("'Calender'[Year]");
  });

  it('fragt die Werteliste per DAX ab und liest sie aus dem Ergebnis', () => {
    expect(slicerQuery(slicers[0])).toBe("EVALUATE\nSUMMARIZECOLUMNS('Calender'[Year])\nORDER BY 'Calender'[Year]");
    expect(slicerQuery(slicers[2])).toBe(
      "EVALUATE\nSUMMARIZECOLUMNS('Calender'[Month Name Short], 'Calender'[Month])\nORDER BY 'Calender'[Month], 'Calender'[Month Name Short]"
    );
    expect(() => slicerQuery({ column: 'Jahr', label: 'Jahr' })).toThrow(/keine Spaltenreferenz/);
    const table = {
      columns: [{ name: 'Calender[Month Name Short]' }, { name: 'Calender[Month]' }],
      rows: [['Jan', 1], ['Feb', 2], ['Feb', 2]],
    };
    expect(slicerValues(table, slicers[2])).toEqual(['Jan', 'Feb']);
  });

  it('zeigt Werte deutsch an, Jahre ohne Tausenderpunkt', () => {
    expect(formatSlicerValue(2026)).toBe('2026');
    expect(formatSlicerValue(1234.5)).toBe('1.234,5');
    expect(formatSlicerValue('2026-03-01T00:00:00')).toBe('01.03.2026');
    expect(formatSlicerValue(new Date(2026, 2, 1))).toBe('01.03.2026');
    expect(formatSlicerValue(null)).toBe('(leer)');
  });

  it('Datum aus Slicer (ISO-Text) und Klick (Date) ergeben dieselbe Schnittmenge und DATE-Literale', () => {
    const datum = "'Kalender'[Datum]";
    const types = { [datum]: 'dateTime', "'Kunde'[Code]": 'string' };
    const table = { columns: [{ name: 'Kalender[Datum]' }], rows: [['2026-02-01T00:00:00'], ['2026-03-01T00:00:00']] };
    const values = slicerValues(table, { column: datum, label: 'Monat' }, 'dateTime');
    expect(values.every((v) => v instanceof Date)).toBe(true);
    const slicer = slicerFilters([{ column: datum, label: 'Monat' }], { [datum]: values }, types);
    const click = selectionFilters({ tile: 'a', keys: [{ 'Kalender[Datum]': new Date(2026, 2, 1) }] });
    const both = combineFilters(slicer, click);
    expect(both).toHaveLength(1);
    expect(both[0].values).toHaveLength(1);
    const q = daxQuery('chartkitchen', { category: "'Kunde'[Code]", actual: '[AC]' }, { filters: both });
    expect(q.query).toContain(`TREATAS({DATE(2026, 3, 1)}, 'Kalender'[Datum])`);
    // Startauswahl der Spec als ISO-Text wird Date, wie die Werteliste
    expect(slicerDefaults([{ column: datum, label: 'Monat', default: ['2026-03-01'] }], types)[datum][0]).toBeInstanceOf(Date);
    // Textspalte mit datumsähnlichen Werten bleibt Text
    const page2: DwgPageSpec = { ...page, filters: [{ column: "'Kunde'[Code]", values: ['2026-01-01'] }], columnTypes: types };
    expect(daxQuery('chartkitchen', { category: "'Kunde'[Code]", actual: '[AC]' }, { filters: tileFilters(page2, 'a', null) }).query).toContain(
      `TREATAS({"2026-01-01"}, 'Kunde'[Code])`
    );
  });
});

describe('dwg-page · Navigation', () => {
  const p = (name: string, template?: string, group?: string): DwgPageSpec => ({ ...page, name, template, group });
  const app: DwgAppSpec = {
    name: 'Showcase',
    slicers,
    resolution: 'fullhd',
    visualHeaders: false,
    pages: [p('Karten', 'C01', 'ChartKitchen · Überblick'), p('Säulen', 'C03', 'ChartKitchen · Zeitverlauf'), p('Linie', 'C04', 'ChartKitchen · Zeitverlauf'), p('C13 Tabelle', 'C13', 'ChartKitchen · Überblick'), p('Ohne Gruppe')],
  };

  it('ordnet Seiten Gruppen zu, in der Reihenfolge des ersten Auftretens', () => {
    expect(navGroups(app.pages).map((g) => [g.group, g.pages.map(pageId)])).toEqual([
      ['ChartKitchen · Überblick', ['c01', 'c13']],
      ['ChartKitchen · Zeitverlauf', ['c03', 'c04']],
      ['Seiten', ['ohne-gruppe']],
    ]);
  });

  it('beschriftet Seiten mit Template-Kennung, ohne sie zu verdoppeln', () => {
    expect(pageLabel(app.pages[1])).toBe('C03 Säulen');
    expect(pageLabel(app.pages[3])).toBe('C13 Tabelle');
    expect(pageLabel(app.pages[4])).toBe('Ohne Gruppe');
  });

  it('findet die Seite zum Link, sonst die erste', () => {
    expect(findPage(app, '#c04').name).toBe('Linie');
    expect(findPage(app, '#ohne-gruppe').name).toBe('Ohne Gruppe');
    expect(findPage(app, '#gibtsnicht').name).toBe('Karten');
    expect(findPage(app, '').name).toBe('Karten');
  });

  it('zeigt feste Filter als Chips, Kachelfilter mit Kacheln', () => {
    const p2: DwgPageSpec = {
      ...page,
      filters: [...(page.filters ?? []), { column: "'Calender'[Month]", values: [1, 2, 3, 4] }],
      tiles: [{ ...page.tiles[0], title: 'Umsatz', filters: [{ column: "'Sales Demo'[Scenario]", values: ['Actual'] }] }, page.tiles[1]],
    };
    const chips = fixedFilterChips(p2);
    expect(chips.map((c) => fixedChipText(c).text)).toEqual(['Year: 2026', 'Month: 1 bis 4', 'Scenario: Actual']);
    expect(fixedChipText(chips[2]).scope).toBe('nur Umsatz');
    expect(fixedChipText(chips[0]).scope).toBeNull();
  });
});

describe('dwg-page · Sprache und Live-Optionen', () => {
  it('liefert Bedientexte deutsch (Standard) und englisch, Werte im Gebietsschema der Visuals', () => {
    expect(uiText().all).toBe('Alle');
    expect(uiText('en').all).toBe('All');
    expect(uiText('en').selected(2)).toBe('2 selected');
    expect(visualLocale()).toBe('de-DE');
    expect(visualLocale('en')).toBe('en-US');
    expect(visualLocale('en', 'en-GB')).toBe('en-GB');
    expect(formatSlicerValue(1234.5)).toBe('1.234,5');
    expect(formatSlicerValue(1234.5, 'en')).toBe('1,234.5');
    expect(formatSlicerValue(null)).toBe('(leer)');
    expect(formatSlicerValue(null, 'en')).toBe('(blank)');
    expect(formatSlicerValue('2026-03-01T00:00:00', 'en')).toBe('03/01/2026');
    expect(navGroups([{ name: 'A', width: 1920, height: 1080, tiles: [] }], 'en')[0].group).toBe('Pages');
  });

  it('erkennt die Startwahl aus den Objekten, mischt Optionen in ihrer Reihenfolge und folgt dem Visual', () => {
    const options = [
      { id: 'v', label: 'V', choices: [{ label: 'Zahlen', set: { columns: { dPyAbs: true } } }, { label: 'Grafik', set: { columns: { dPyAbs: false, dPyBar: true } } }] },
      { id: 'py', label: 'PY', choices: [{ label: 'An', set: { columns: { showPY: true } } }, { label: 'Aus', set: { columns: { showPY: false, dPyAbs: false, dPyBar: false } } }] },
    ];
    const objects = { columns: { dPyAbs: true, showPY: true, minuend: 'ac' } };
    expect(defaultChoices(options, objects)).toEqual([0, 0]);
    expect(defaultChoices(options, {})).toEqual([-1, -1]);
    expect(applyOptions(objects, options, [1, 0]).columns).toEqual({ dPyAbs: false, dPyBar: true, showPY: true, minuend: 'ac' });
    expect(applyOptions(objects, options, [1, 1]).columns).toEqual({ dPyAbs: false, dPyBar: false, showPY: false, minuend: 'ac' });
    expect(applyOptions(objects, options, [-1, -1])).toEqual(objects);
    const after = { columns: { ...objects.columns, showPY: false, dPyAbs: false, dPyBar: false } };
    // V berührt, aber keine Wahl passt (-1, kein Knopf gedrückt); PY passt zu „Aus“
    expect(persistedChoices(options, [0, 0], objects, after)).toEqual([-1, 1]);
    expect(defaultChoices([{ id: 'e', label: 'E', choices: [{ label: 'leer', set: { columns: {} } }] }], objects)).toEqual([-1]);
  });
});
