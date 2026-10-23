// Browser-Test der von `dwg app page` erzeugten Seite: echter App-Code (DwgPage, DwgVisual,
// Adapter), nur der Konnektor ist ersetzt (mock-query.ts oder mock-minidax.ts). Gebaut von e2e.mjs,
// die Seite kommt über den Alias @page.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { DwgPage } from '@app/dwg/DwgPage';
// @ts-expect-error Alias, den e2e.mjs auf src/dwg/pages/<seite>.ts setzt
import { page } from '@page';

function Harness() {
  const [isDark, setDark] = useState(false);
  return (
    <div style={{ padding: 16, background: isDark ? '#0f1114' : '#f4f4f1', minHeight: '100vh' }}>
      <button id="theme" type="button" onClick={() => { setDark((d) => !d); document.documentElement.dataset.theme = isDark ? 'light' : 'dark'; }}>
        Hell / Dunkel
      </button>
      <DwgPage page={page} connection="test" isDark={isDark} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
