import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { Script } from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
const requiredFiles = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  "src/offscreen/offscreen.html",
  ...manifest.content_scripts.flatMap((script) => script.js)
];

for (const file of requiredFiles) await readFile(join(root, file));

async function collectJavaScript(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectJavaScript(path));
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) files.push(path);
  }
  return files;
}

const javascriptFiles = await collectJavaScript(join(root, "src"));
const failures = [];
for (const file of javascriptFiles) {
  const source = await readFile(file, "utf8");
  // Parse module syntax without executing extension-only globals such as chrome.
  const parseableSource = source
    .replace(/^\s*import\s+.*?;\s*$/gm, "")
    .replace(/^\s*export\s+\{[^}]+\};\s*$/gm, "")
    .replace(/\bexport\s+(?=(async\s+function|const|function|class)\b)/g, "");
  try {
    new Script(parseableSource, { filename: file });
  } catch (error) {
    failures.push(`${relative(root, file)}\n${error.message}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Manifest references and ${javascriptFiles.length} JavaScript files are valid.`);
}
