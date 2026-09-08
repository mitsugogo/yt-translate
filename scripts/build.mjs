import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { bundleContent } from "./bundle-content.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = join(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root, "src"), join(output, "src"), { recursive: true });

const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
for (const contentScript of manifest.content_scripts) {
  for (const entry of contentScript.js) {
    const bundled = await bundleContent(join(root, entry));
    new Script(bundled, { filename: entry });
    await writeFile(join(output, entry), bundled, "utf8");
  }
}
await writeFile(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await cp(join(root, "README.md"), join(output, "README.md"));

const requiredFiles = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  "src/offscreen/offscreen.html",
  ...manifest.content_scripts.flatMap((script) => script.js)
];

for (const relativePath of requiredFiles) await stat(join(output, relativePath));
console.log(`Built Chrome extension: ${output}`);
