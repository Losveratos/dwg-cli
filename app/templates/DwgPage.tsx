// dwg: eine Seite aus der App-Spec. Jede Kachel fragt das Semantikmodell per DAX ab
// (daxQuery), ein Klick in einer Kachel filtert die anderen (TREATAS), der Filter-Chip
// hebt die Auswahl auf. Feste Filter der Spec (Seite und Kacheln) stehen als nicht klickbare Chips davor
// (FixedFilterChips; DwgShell zeigt sie im Seitenkopf). Filter von außen (Slicer im Filter-Panel von DwgShell) gelten für
// alle Kacheln. Mit `fixedWidth` liegt die Seite in Bühnenpixeln (DwgShell skaliert sie als Ganzes),
// sonst skaliert sie auf die gemessene Breite. Kacheln mit `options` bekommen rechts ein einklappbares Panel mit
// Live-Optionen (Formatbereich, ohne neue Abfrage). Sprache der Bedienelemente `lang` (Standard de), Gebietsschema der
// Visuals `locale` (Standard aus lang). Von `dwg app page` geschrieben, wird bei jedem Lauf ersetzt.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { useSemanticModelQuery } from '@/hooks/use-semantic-model-query';

import { daxQuery, type DaxFilter, type SelectionKey, type VisualObjects } from '../vendor/dwg-visuals/dwg-visuals.js';
import {
  applyOptions,
  defaultChoices,
  fixedChipText,
  fixedFilterChips,
  fitToTile,
  pageHeight,
  pageRegion,
  persistedChoices,
  selectionLabel,
  tileBox,
  tileFilters,
  uiText,
  visualLocale,
  withoutHeaders,
  type DwgBox,
  type DwgFixedChip,
  type DwgLang,
  type DwgPageSpec,
  type DwgSelection,
  type DwgTileSpec,
  type DwgUiText,
} from './dwg-page';
import { DwgVisual } from './DwgVisual';

const FONT = "'Geist', 'Segoe UI', system-ui, sans-serif";

/** Farben der Bedienelemente in den Kacheln (Optionen-Panel); DwgShell reicht ihre Palette durch */
export interface DwgTileColors {
  surface: string;
  panel: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
}
const TILE_COLORS: Record<'light' | 'dark', DwgTileColors> = {
  light: { surface: '#ffffff', panel: '#fbfaf7', border: '#e1dfd6', text: '#1f2328', muted: '#5f6368', accent: '#c25a2d', accentSoft: 'rgba(194, 90, 45, 0.10)' },
  dark: { surface: '#16191d', panel: '#14171a', border: '#2c3138', text: '#e8eaed', muted: '#9aa0a6', accent: '#d9774b', accentSoft: 'rgba(217, 119, 75, 0.16)' },
};

/** Überlauf eines Visuals bis zu dieser Höhe gilt als Rundung (P&L füllt die Kachel mit layout.maximize) */
const NEED_TOLERANCE = 4;

/**
 * Überlauf des Inhalts eines Visuals mit eigenem Bildlauf (P&L: .pnl-root) in Layoutpixeln: Unterkante des letzten
 * Blocks ohne dessen Innenabstand gegen die sichtbare Höhe. scrollHeight zählte den Innenabstand unter der Fußnote mit.
 */
function contentOverflow(root: HTMLElement): number {
  const last = root.lastElementChild as HTMLElement | null;
  if (!last) return 0;
  const box = root.getBoundingClientRect();
  const k = root.offsetHeight > 0 ? box.height / root.offsetHeight : 1;
  const pad = parseFloat(getComputedStyle(last).paddingBottom) || 0;
  const bottom = (last.getBoundingClientRect().bottom - box.top) / (k || 1) + root.scrollTop - pad;
  return Math.round(bottom - root.clientHeight);
}

function friendly(message: string, t: DwgUiText): string {
  if (/401|403|forbidden|permission|unauthori/i.test(message)) return t.noPermission;
  if (/capacity|429|throttl/i.test(message)) return t.capacity;
  return message;
}

interface OptionsPanelProps {
  tile: DwgTileSpec;
  chosen: number[];
  setChosen: (next: number[]) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  c: DwgTileColors;
  k: number;
  t: DwgUiText;
}

/** Live-Optionen rechts neben dem Visual; eingeklappt bleibt eine schmale Leiste „Optionen“ */
function OptionsPanel({ tile, chosen, setChosen, open, setOpen, c, k, t }: OptionsPanelProps) {
  const options = tile.options ?? [];
  if (!open) {
    return (
      <button
        type="button"
        data-dwg-options-toggle={tile.id}
        aria-expanded={false}
        aria-label={t.showOptions}
        title={t.showOptions}
        onClick={() => setOpen(true)}
        style={{
          flex: `0 0 ${Math.round(30 * k)}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          border: 0,
          borderLeft: `1px solid ${c.border}`,
          background: c.panel,
          color: c.accent,
          cursor: 'pointer',
          font: `600 ${12 * k}px/${16 * k}px ${FONT}`,
          letterSpacing: '0.06em',
        }}
      >
        <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap' }}>‹ {t.options}</span>
      </button>
    );
  }
  return (
    <aside
      aria-label={t.options}
      data-dwg-options={tile.id}
      style={{
        flex: `0 0 ${Math.round(220 * k)}px`,
        boxSizing: 'border-box',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 14 * k,
        padding: `${10 * k}px ${12 * k}px`,
        borderLeft: `1px solid ${c.border}`,
        background: c.panel,
        color: c.text,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 * k }}>
        <h3 style={{ margin: 0, font: `700 ${12 * k}px/${16 * k}px ${FONT}`, letterSpacing: '0.08em', textTransform: 'uppercase', color: c.muted }}>
          {t.options}
        </h3>
        <button
          type="button"
          data-dwg-options-toggle={tile.id}
          aria-expanded
          aria-label={t.hideOptions}
          title={t.hideOptions}
          onClick={() => setOpen(false)}
          style={{
            font: `500 ${12 * k}px/${16 * k}px ${FONT}`,
            padding: `${3 * k}px ${8 * k}px`,
            borderRadius: 6 * k,
            border: `1px solid ${c.border}`,
            background: 'transparent',
            color: c.accent,
            cursor: 'pointer',
          }}
        >
          ›
        </button>
      </div>
      {options.map((o, i) => (
        <div key={o.id} role="group" aria-label={o.label} data-dwg-option={o.id}>
          <p style={{ margin: `0 0 ${5 * k}px`, font: `600 ${12 * k}px/${16 * k}px ${FONT}`, color: c.text }}>{o.label}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 * k }}>
            {o.choices.map((ch, j) => {
              const on = chosen[i] === j;
              return (
                <button
                  key={ch.label}
                  type="button"
                  data-choice={ch.label}
                  aria-pressed={on}
                  onClick={() => setChosen(chosen.map((x, n) => (n === i ? j : x)))}
                  style={{
                    font: `500 ${12 * k}px/${16 * k}px ${FONT}`,
                    padding: `${4 * k}px ${9 * k}px`,
                    borderRadius: 999,
                    border: `${Math.max(1, Math.round(k))}px solid ${on ? c.accent : c.border}`,
                    background: on ? c.accentSoft : c.surface,
                    color: on ? c.accent : c.text,
                    cursor: 'pointer',
                  }}
                >
                  {ch.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}

interface TileProps {
  tile: DwgTileSpec;
  page: DwgPageSpec;
  connection: string;
  selection: DwgSelection | null;
  extraFilters: DaxFilter[];
  clearToken: number;
  isDark: boolean;
  hideHeaders: boolean;
  fit: boolean;
  onSelect: (tile: string, keys: SelectionKey[]) => void;
  onNeed?: (tile: string, height: number) => void;
  c: DwgTileColors;
  k: number;
  t: DwgUiText;
  locale: string;
}

function DwgTile({ tile, page, connection, selection, extraFilters, clearToken, isDark, hideHeaders, fit, onSelect, onNeed, c, k, t, locale }: TileProps) {
  const wrap = useRef<HTMLDivElement>(null);
  // Höhe, die das Visual meldet: Läuft die P&L-Tabelle über ihre Kachel (Bildlauf im Visual), braucht die Kachel
  // ihre Höhe plus den Überlauf (Layoutpixel, also Seitenpixel auch auf der skalierten Bühne)
  const measure = () =>
    requestAnimationFrame(() => {
      const root = wrap.current?.querySelector<HTMLElement>('.pnl-root');
      const section = wrap.current?.parentElement;
      if (!onNeed || !root || !section) return;
      const over = contentOverflow(root);
      // bis NEED_TOLERANCE px sind Rundung beim Füllen (layout.maximize), kein fehlender Inhalt
      if (over > NEED_TOLERANCE) onNeed(tile.id, section.offsetHeight + over + NEED_TOLERANCE);
    });
  const filters = useMemo(
    () => tileFilters(page, tile.id, selection, extraFilters),
    [page, tile.id, selection, extraFilters]
  );
  const q = useMemo(
    () =>
      daxQuery(tile.visual, tile.bindings, {
        filters,
        sortBy: tile.sortBy,
        showItemsWithNoData: tile.showItemsWithNoData,
      }),
    [tile, filters]
  );
  const { data, isLoading, error, refetch } = useSemanticModelQuery({ connection, query: q.query });
  const table = data?.status === 'success' ? data.table : undefined;
  // Fehler beim Rendern (z. B. Ergebnis passt nicht zu den Rollen), je Abfrage
  const [renderError, setRenderError] = useState<{ query: string; message: string } | null>(null);
  const message = error
    ? friendly(error.message, t)
    : data?.status === 'error'
      ? friendly(data.error.message, t)
      : renderError?.query === q.query
        ? renderError.message
        : null;
  const displayNames = useMemo(() => ({ ...q.displayNames, ...tile.displayNames }), [q.displayNames, tile.displayNames]);
  // Live-Optionen, Kopfzeilen aus, Kachel füllen: nur Formatbereich-Overrides, keine neue Abfrage. Was das Visual
  // selbst speichert (Bedienleiste, auf- und zugeklappte Zeilen), führt der Adapter darüber (persistProperties);
  // eine neue Wahl im Optionen-Panel gewinnt für ihre Eigenschaften.
  const [chosen, setChosen] = useState<number[]>(() => defaultChoices(tile.options ?? [], tile.objects));
  const [optionsOpen, setOptionsOpen] = useState(true);
  const objects = useMemo(() => {
    const withOptions = tile.options?.length ? applyOptions(tile.objects, tile.options, chosen) : tile.objects;
    const o = hideHeaders ? withoutHeaders(tile.visual, withOptions) : withOptions;
    return fit ? fitToTile(tile.visual, o) : o;
  }, [hideHeaders, fit, tile.visual, tile.objects, tile.options, chosen]);
  // Speichert das Visual selbst eine Eigenschaft, die eine Option steuert, zeigt das Panel die passende Wahl
  const seen = useRef<VisualObjects>(objects ?? {});
  useEffect(() => {
    seen.current = objects ?? {};
  }, [objects]);
  const onPersist = tile.options?.length
    ? (next: VisualObjects) => {
        const before = seen.current;
        seen.current = next;
        setChosen((prev) => persistedChoices(tile.options ?? [], prev, before, next));
      }
    : undefined;

  return (
    <div ref={wrap} style={{ position: 'relative', display: 'flex', width: '100%', height: '100%' }} data-dwg-tile={tile.id}>
      <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 0, height: '100%' }}>
        {table && (
          <DwgVisual
            visual={tile.visual}
            table={table}
            bindings={q.bindings}
            displayNames={displayNames}
            formats={tile.formats}
            columnTypes={page.columnTypes}
            objects={objects}
            isDark={isDark}
            locale={locale}
            clearToken={clearToken}
            onSelect={(keys) => onSelect(tile.id, keys)}
            onPersist={onPersist}
            onRendered={onNeed && tile.visual === 'pnl' ? measure : undefined}
            onError={(err) => setRenderError({ query: q.query, message: err instanceof Error ? err.message : String(err) })}
          />
        )}
        {isLoading && (
          <div
            className="rounded-full bg-accent px-300 py-100 text-100 text-accent-foreground"
            style={{ position: 'absolute', top: 8, right: 8 }}
          >
            {t.loading}
          </div>
        )}
        {message && (
          <div
            role="alert"
            className="p-400 text-center text-200"
            style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}
          >
            <div>
              <p className="mb-200 font-semibold">
                {tile.title ?? tile.id}: {t.dataMissing}
              </p>
              <p className="mb-300 text-foreground/70">{message}</p>
              <button type="button" className="rounded-md border border-border px-300 py-100" onClick={() => void refetch()}>
                {t.retry}
              </button>
            </div>
          </div>
        )}
      </div>
      {tile.options?.length ? (
        <OptionsPanel tile={tile} chosen={chosen} setChosen={setChosen} open={optionsOpen} setOpen={setOptionsOpen} c={c} k={k} t={t} />
      ) : null}
    </div>
  );
}

const NO_FILTERS: DaxFilter[] = [];

interface ChipProps {
  page: DwgPageSpec;
  isDark: boolean;
  /** Skalierung von Schrift und Abständen (Bühne der Shell) */
  k?: number;
  /** Farben, Standard nach isDark */
  colors?: { text: string; muted: string; border: string; surface: string };
  style?: CSSProperties;
  /** Sprache und Gebietsschema der Texte (Standard de, de-DE) */
  lang?: DwgLang;
  locale?: string;
}

/**
 * Feste Filter aus der App-Spec (page.filters, tile.filters) als Chips, nicht klickbar: Sie gelten immer und
 * stehen nur in der Spec. Wer sie ändern können soll, braucht einen Slicer mit Vorgabe (spec.slicers, default).
 */
export function FixedFilterChips({ page, isDark, k = 1, colors, style, lang = 'de', locale }: ChipProps) {
  const chips = useMemo(() => fixedFilterChips(page, lang, locale), [page, lang, locale]);
  if (!chips.length) return null;
  const c = colors ?? (isDark
    ? { text: '#e8eaed', muted: '#9aa0a6', border: '#2c3138', surface: '#16191d' }
    : { text: '#1f2328', muted: '#5f6670', border: '#d0d4d9', surface: '#ffffff' });
  return (
    <ul
      aria-label={uiText(lang).fixedFilters}
      data-dwg-fixed-filters=""
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6 * k, margin: 0, padding: 0, listStyle: 'none', ...style }}
    >
      {chips.map((chip: DwgFixedChip) => {
        const { text, scope, title } = fixedChipText(chip, lang);
        return (
          <li
            key={`${chip.column}|${chip.values}|${scope ?? ''}`}
            data-dwg-fixed-filter={chip.column}
            title={title}
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 4 * k,
              padding: `${2 * k}px ${8 * k}px`,
              border: `1px solid ${c.border}`,
              borderRadius: 999,
              background: c.surface,
              color: c.text,
              font: `500 ${11 * k}px/${15 * k}px 'Geist', 'Segoe UI', system-ui, sans-serif`,
              whiteSpace: 'nowrap',
              cursor: 'default',
            }}
          >
            {text}
            {scope && <span style={{ fontWeight: 400, color: c.muted }}>· {scope}</span>}
          </li>
        );
      })}
    </ul>
  );
}

interface PageProps {
  page: DwgPageSpec;
  connection: string;
  isDark: boolean;
  /** Filter für alle Kacheln, z. B. aus den Slicern; gleiche Referenz behalten, sonst fragen alle neu ab */
  filters?: DaxFilter[];
  /** sichtbarer Seitenbereich in Seitenpixeln (Standard: ganze Seite), z. B. ohne Rahmen-Zonen der Shell */
  region?: DwgBox;
  /** feste Breite in Bühnenpixeln statt Messen (Auflösungsmodus der Shell); Kacheln auf ganze Pixel */
  fixedWidth?: number;
  /** Rahmen und Fläche je Kachel (z. B. aus DwgShell), zusätzlich zu den Tailwind-Klassen */
  tileStyle?: CSSProperties;
  /** Lage des Filter-Chips (z. B. absolut im Kopf der Bühne); Standard: Zeile über den Kacheln */
  chipStyle?: CSSProperties;
  /** Titelblöcke und Bedienleisten der Visuals ausblenden */
  hideVisualHeaders?: boolean;
  /** feste Filter der Spec als Chips in der Chip-Zeile zeigen (DwgShell zeigt sie im Seitenkopf und setzt false) */
  showFixedFilters?: boolean;
  /** Visuals füllen ihre Kachel (P&L: layout.maximize, siehe fitToTile); DwgShell setzt true */
  fitVisuals?: boolean;
  /**
   * Meldet die Höhe, die eine Kachel braucht, wenn ihr Visual mehr Platz will als sie hat (P&L mit Bildlauf):
   * Kachel-id und nötige Höhe in Seitenpixeln. DwgShell vergrößert damit die Bühne.
   */
  onTileNeed?: (tile: string, height: number) => void;
  /** Sprache der Bedienelemente (Standard: de) */
  lang?: DwgLang;
  /** Gebietsschema der Visuals (Standard aus lang: de-DE bzw. en-US) */
  locale?: string;
  /** Farben und Maßstab der Bedienelemente in den Kacheln (Optionen-Panel), z. B. aus DwgShell */
  colors?: DwgTileColors;
  uiScale?: number;
}

export function DwgPage({
  page,
  connection,
  isDark,
  filters = NO_FILTERS,
  region,
  fixedWidth,
  tileStyle,
  chipStyle,
  hideVisualHeaders = false,
  showFixedFilters = true,
  fitVisuals = false,
  onTileNeed,
  lang = 'de',
  locale,
  colors,
  uiScale = 1,
}: PageProps) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [selection, setSelection] = useState<DwgSelection | null>(null);
  const [clearToken, setClearToken] = useState(0);
  const t = uiText(lang);
  const loc = visualLocale(lang, locale);
  const c = colors ?? TILE_COLORS[isDark ? 'dark' : 'light'];

  useEffect(() => {
    const node = box.current;
    // auch mit fixedWidth messen: beim Wechsel in den fließenden Modus ist die Breite dann schon da
    if (!node) return;
    // Breite 0 (Seite kurz unsichtbar) ignorieren: sonst hängen die Kacheln aus und fragen neu ab
    const measure = () => {
      const w = Math.floor(node.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    if (typeof ResizeObserver === 'undefined') {
      // z. B. jsdom in Tests: einmal messen und auf Fenstergröße reagieren
      const frame = requestAnimationFrame(measure);
      window.addEventListener('resize', measure);
      return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', measure);
      };
    }
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const onSelect = (tile: string, keys: SelectionKey[]) => setSelection(keys.length ? { tile, keys } : null);
  const clear = () => {
    setSelection(null);
    setClearToken((n) => n + 1);
  };
  const w = fixedWidth ?? width;
  const narrow = !fixedWidth && w > 0 && w < 900;
  const area = region ?? pageRegion(page);
  const label = selectionLabel(selection, lang, locale);
  const box0 = (tile: DwgTileSpec) => {
    const b = tileBox(tile, page, w, 900, area);
    return fixedWidth
      ? { ...b, left: Math.round(b.left ?? 0), top: Math.round(b.top ?? 0), width: Math.round(b.width), height: Math.round(b.height) }
      : b;
  };

  return (
    <div className="flex flex-col gap-300">
      <div className="flex min-h-[32px] flex-wrap items-center gap-200" aria-live="polite" style={chipStyle}>
        {showFixedFilters && <FixedFilterChips page={page} isDark={isDark} lang={lang} locale={locale} />}
        {label && (
          <button
            type="button"
            className="rounded-full border border-primary px-300 py-100 text-200 text-primary"
            title={t.clearFilter}
            onClick={clear}
          >
            {label} ×
          </button>
        )}
      </div>
      <div
        ref={box}
        style={
          narrow
            ? { display: 'flex', flexDirection: 'column', gap: 12 }
            : { position: 'relative', height: Math.round(pageHeight(page, w, area)), ...(fixedWidth ? { width: fixedWidth } : {}) }
        }
      >
        {w > 0 &&
          page.tiles.map((tile) => (
            <section
              key={tile.id}
              aria-label={tile.title ?? tile.id}
              className="overflow-hidden rounded-lg border border-border bg-card p-200"
              style={{ ...tileStyle, ...box0(tile), boxSizing: 'border-box' }}
            >
              <DwgTile
                tile={tile}
                page={page}
                connection={connection}
                selection={selection}
                extraFilters={filters}
                clearToken={clearToken}
                isDark={isDark}
                hideHeaders={hideVisualHeaders}
                fit={fitVisuals}
                onSelect={onSelect}
                onNeed={onTileNeed}
                c={c}
                k={uiScale}
                t={t}
                locale={loc}
              />
            </section>
          ))}
      </div>
    </div>
  );
}
