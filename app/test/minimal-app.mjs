// Minimal-App für die Browser-Tests: gerade so viel Rayfin-Gerüst, wie `dwg app page` braucht (rayfin/rayfin.yml mit
// Konnektor, packages/frontend/src/hooks/use-semantic-model-query.ts). Den Hook ersetzt der Testrahmen ohnehin durch
// einen Mock; React kommt aus node_modules. So testen die Browser-Tests echten erzeugten Code ohne echte App.
import fs from "node:fs";
import path from "node:path";
import { generateAppPages } from "../lib/app.mjs";

/**
 * Leert dir, legt die Minimal-App an und schreibt die Seiten der Spec hinein.
 * @returns {{ app: string, src: string, gen: object }}
 */
export async function minimalApp(dir, spec, { connector = "test", model } = {}) {
    fs.rmSync(dir, { recursive: true, force: true });
    const src = path.join(dir, "packages", "frontend", "src");
    fs.mkdirSync(path.join(dir, "rayfin"), { recursive: true });
    fs.mkdirSync(path.join(src, "hooks"), { recursive: true });
    fs.writeFileSync(path.join(src, "hooks", "use-semantic-model-query.ts"), "");
    fs.writeFileSync(path.join(dir, "rayfin", "rayfin.yml"), `connectors:\n  - name: ${connector}\n    type: fabric-semanticmodel\n`);
    const gen = await generateAppPages({ appDir: dir, spec, connector, model });
    return { app: dir, src, gen };
}
