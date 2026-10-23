// Browser-Test des App-Rahmens (DwgShell): echter erzeugter Code aus `dwg app page`, nur der Konnektor
// ist ersetzt (mock-minidax.ts). Gebaut von shell.mjs, die App-Spec kommt über den Alias @shell.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { DwgShell } from '@app/dwg/DwgShell';
// @ts-expect-error Alias, den shell.mjs auf src/dwg/apps/<spec>.ts setzt
import { app } from '@shell';

function Harness() {
  const [isDark, setDark] = useState(false);
  return (
    <DwgShell
      app={app}
      connection="test"
      isDark={isDark}
      subtitle="Test des App-Rahmens mit synthetischen Daten"
      actions={
        <button
          id="theme"
          type="button"
          onClick={() => {
            setDark((d) => !d);
            document.documentElement.dataset.theme = isDark ? 'light' : 'dark';
          }}
        >
          Hell / Dunkel
        </button>
      }
      footer="Demodaten. IBCS® ist eine eingetragene Marke des IBCS Institute."
    />
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
