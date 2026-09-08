import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// Bundle the project's named ES module imports into a classic content script.
// Each module has its own scope, preserving aliases and avoiding name collisions.
export async function bundleContent(entry) {
  const ids = new Map();
  const modules = [];
  async function visit(path) {
    path = resolve(path);
    if (ids.has(path)) return ids.get(path);
    const id = ids.size;
    ids.set(path, id);
    let source = await readFile(path, "utf8");
    const imports = [...source.matchAll(/^import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];\s*$/gm)];
    for (const match of imports) {
      if (!match[2].startsWith(".")) throw new Error(`Unsupported import: ${match[2]}`);
      const dependency = await visit(resolve(dirname(path), match[2]));
      const names = match[1].trim().replace(/\s+as\s+/g, ": ");
      source = source.replace(match[0], `const { ${names} } = modules[${dependency}];`);
    }
    const exports = [];
    source = source.replace(/\bexport\s+(?=(?:async\s+)?function\s+|class\s+|const\s+|let\s+)/g, "");
    const original = await readFile(path, "utf8");
    for (const match of original.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let)\s+(\w+)/g)) exports.push(match[1]);
    source = source.replace(/^export\s+\{([^}]+)\};\s*$/gm, (_, names) => {
      exports.push(...names.split(",").map(name => name.trim()));
      return "";
    });
    modules.push(`modules[${id}] = (() => {\n${source}\nreturn { ${exports.join(", ")} };\n})();`);
    return id;
  }
  await visit(entry);
  return `(() => {\n"use strict";\nconst modules = [];\n${modules.join("\n")}\n})();\n`;
}
