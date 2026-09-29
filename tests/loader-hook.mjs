import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve as resolvePath, dirname } from "node:path";
import { existsSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolvePath(HERE, "..", "src");

const TS_EXTS = [".ts", ".tsx"];
const INDEX = ["/index.ts", "/index.tsx"];

function tryResolveFile(basePath) {
  if (existsSync(basePath)) return basePath;
  for (const ext of TS_EXTS) {
    if (existsSync(basePath + ext)) return basePath + ext;
  }
  for (const idx of INDEX) {
    if (existsSync(basePath + idx)) return basePath + idx;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const base = resolvePath(SRC, rel);
    const found = tryResolveFile(base);
    if (found) return nextResolve(pathToFileURL(found).href, context);
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    // Auto-append .ts / index.ts for extensionless relative imports.
    if (context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
      const parentPath = fileURLToPath(context.parentURL);
      const base = resolvePath(dirname(parentPath), specifier);
      const found = tryResolveFile(base);
      if (found) return nextResolve(pathToFileURL(found).href, context);
    }
  }
  return nextResolve(specifier, context);
}
