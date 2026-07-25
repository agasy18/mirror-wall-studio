// Inject the build-time-rendered landing markup into dist/index.html.
// Run after `vite build` and the SSR build of src/prerender-entry.tsx.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const indexPath = path.join(root, "dist", "index.html");
const entryPath = path.join(root, ".prerender", "prerender-entry.js");

for (const p of [indexPath, entryPath]) {
  if (!fs.existsSync(p)) {
    console.error(`[prerender] missing ${path.relative(root, p)} — did the build run?`);
    process.exit(1);
  }
}

const { renderLanding } = await import(pathToFileURL(entryPath).href);
const markup = renderLanding();

if (!markup || markup.length < 500) {
  console.error(`[prerender] rendered markup looks empty (${markup?.length ?? 0} chars)`);
  process.exit(1);
}

const html = fs.readFileSync(indexPath, "utf8");
const target = '<div id="root"></div>';
if (!html.includes(target)) {
  console.error("[prerender] could not find an empty #root in dist/index.html");
  process.exit(1);
}

fs.writeFileSync(indexPath, html.replace(target, `<div id="root">${markup}</div>`));
console.log(`[prerender] injected ${markup.length} chars of landing markup into dist/index.html`);
