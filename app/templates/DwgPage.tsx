// dwg: eine Seite aus der App-Spec. Jede Kachel fragt das Semantikmodell per DAX ab
// (daxQuery), ein Klick in einer Kachel filtert die anderen (TREATAS), der Filter-Chip
// hebt die Auswahl auf. Feste Filter der Spec (Seite und Kacheln) stehen als nicht klickbare Chips davor
// (FixedFilterChips; DwgShell zeigt sie im Seitenkopf). Filter von außen (Slicer im Filter-Panel von DwgShell) gelten für
// alle Kacheln. Mit `fixedWidth` liegt die Seite in Bühnenpixeln (DwgShell skaliert sie als Ganzes),
// sonst skaliert sie auf die gemessene Breite. Von `dwg app page` geschrieben, wird bei jedem Lauf ersetzt.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { useSemanticModelQuery } from '@/hooks/use-semantic-model-query';

import { daxQuery, type DaxFilter, type SelectionKey } from '../vendor/dwg-visuals/dwg-visuals.js';
import {
  fixedChipText,
  fixedFilterChips,
  pageHeight,
  pageRegion,
  selectionLabel,
  tileBox,
  tileFilters,
  withoutHeaders,
  type DwgBox,
  type DwgFixedChip,
  type DwgPageSpec,
  type DwgSelection,
  type DwgTileSpec,
} from './dwg-page';
import { DwgVisual } from './DwgVisual';

function friendly(message: string): string {
  if (/401|403|forbidden|permission|unauthori/i.test(message))
    return 'Keine Berechtigung auf das Semantikmodell (Lesen und Erstellen nötig).';
  if (/capacity|429|throttl/i.test(message))
    return 'Die Fabric-Kapazität ist gerade ausgelastet. Bitte gleich neu laden.';
  return message;
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
  onSelect: (tile: string, keys: SelectionKey[]) => void;
}

function DwgTile({ tile, page, connection, selection, extraFilters, clearToken, isDark, hideHeaders, onSelect }: TileProps) {
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
    ? friendly(error.message)
    : data?.status === 'error'
      ? friendly(data.error.message)
      : renderError?.query === q.query
        ? renderError.message
        : null;
  const displayNames = useMemo(() => ({ ...q.displayNames, ...tile.displayNames }), [q.displayNames, tile.displayNames]);
  // Kopfzeilen aus: nur Formatbereich-Override, keine neue Abfrage
  const objects = useMemo(
    () => (hideHeaders ? withoutHeaders(tile.visual, tile.objects) : tile.objects),
    [hideHeaders, tile.visual, tile.objects]
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }} data-dwg-tile={tile.id}>
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
          clearToken={clearToken}
          onSelect={(keys) => onSelect(tile.id, keys)}
          onError={(err) => setRenderError({ query: q.query, message: err instanceof Error ? err.message : String(err) })}
        />
      )}
      {isLoading && (
        <div
          className="rounded-full bg-accent px-300 py-100 text-100 text-accent-foreground"
          style={{ position: 'absolute', top: 8, right: 8 }}
        >
          lädt …
        </div>
      )}
      {message && (
        <div
          role="alert"
          className="p-400 text-center text-200"
          style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}
        >
          <div>
            <p className="mb-200 font-semibold">{tile.title ?? tile.id}: Daten fehlen</p>
            <p className="mb-300 text-foreground/70">{message}</p>
            <button type="button" className="rounded-md border border-border px-300 py-100" onClick={() => void refetch()}>
              Erneut versuchen
            </button>
          </div>
        </div>
      )}
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
}

/**
 * Feste Filter aus der App-Spec (page.filters, tile.filters) als Chips, nicht klickbar: Sie gelten immer und
 * stehen nur in der Spec. Wer sie ändern können soll, braucht einen Slicer mit Vorgabe (spec.slicers, default).
 */
export function FixedFilterChips({ page, isDark, k = 1, colors, style }: ChipProps) {
  const chips = useMemo(() => fixedFilterChips(page), [page]);
  if (!chips.length) return null;
  const c = colors ?? (isDark
    ? { text: '#e8eaed', muted: '#9aa0a6', border: '#2c3138', surface: '#16191d' }
    : { text: '#1f2328', muted: '#5f6670', border: '#d0d4d9', surface: '#ffffff' });
  return (
    <ul
      aria-label="Feste Filter"
      data-dwg-fixed-filters=""
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6 * k, margin: 0, padding: 0, listStyle: 'none', ...style }}
    >
      {chips.map((chip: DwgFixedChip) => {
        const { text, scope, title } = fixedChipText(chip);
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
}: PageProps) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [selection, setSelection] = useState<DwgSelection | null>(null);
  const [clearToken, setClearToken] = useState(0);

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
    setClearToken((t) => t + 1);
  };
  const w = fixedWidth ?? width;
  const narrow = !fixedWidth && w > 0 && w < 900;
  const area = region ?? pageRegion(page);
  const label = selectionLabel(selection);
  const box0 = (tile: DwgTileSpec) => {
    const b = tileBox(tile, page, w, 900, area);
    return fixedWidth
      ? { ...b, left: Math.round(b.left ?? 0), top: Math.round(b.top ?? 0), width: Math.round(b.width), height: Math.round(b.height) }
      : b;
  };

  return (
    <div className="flex flex-col gap-300">
      <div className="flex min-h-[32px] flex-wrap items-center gap-200" aria-live="polite" style={chipStyle}>
        {showFixedFilters && <FixedFilterChips page={page} isDark={isDark} />}
        {label && (
          <button
            type="button"
            className="rounded-full border border-primary px-300 py-100 text-200 text-primary"
            title="Filter aufheben"
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
                onSelect={onSelect}
              />
            </section>
          ))}
      </div>
    </div>
  );
}
