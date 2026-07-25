// Turn the single built index.html into one prerendered, fully-translated page
// per language, plus a sitemap that lists them all.
//
// Every language is a real document at its own URL — `/`, `/de/`, `/zh-Hans/` —
// carrying translated body copy, its own <title>/description, a self-referencing
// canonical, and reciprocal hreflang links to all the others. That is what makes
// the translations indexable: a crawler that never runs JavaScript still sees a
// complete page in each language.
//
// Run after `vite build` and the SSR build of src/prerender-entry.tsx.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const distDir = path.join(root, "dist");
const indexPath = path.join(distDir, "index.html");
const entryPath = path.join(root, ".prerender", "prerender-entry.js");

for (const p of [indexPath, entryPath]) {
  if (!fs.existsSync(p)) {
    console.error(`[prerender] missing ${path.relative(root, p)} — did the build run?`);
    process.exit(1);
  }
}

const { renderLanding, LANGUAGES, APP_URL } = await import(pathToFileURL(entryPath).href);

const site = new URL(APP_URL);
const ORIGIN = site.origin;
const BASE = site.pathname.endsWith("/") ? site.pathname : `${site.pathname}/`;
const urlFor = (code) => (code === "en" ? `${ORIGIN}${BASE}` : `${ORIGIN}${BASE}${code}/`);

const template = fs.readFileSync(indexPath, "utf8");
const ROOT_DIV = '<div id="root"></div>';
if (!template.includes(ROOT_DIV)) {
  console.error("[prerender] could not find an empty #root in dist/index.html");
  process.exit(1);
}

const escapeAttr = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Reciprocal alternates. Every page links to every language including itself —
 * Google treats a set of hreflang links as valid only if each page in the set
 * confirms the others, so a missing self-reference invalidates the whole group.
 * x-default points at English as the fallback for unmatched visitors.
 */
const alternates = [
  ...LANGUAGES.map((l) => `    <link rel="alternate" hreflang="${l.code}" href="${urlFor(l.code)}" />`),
  `    <link rel="alternate" hreflang="x-default" href="${urlFor("en")}" />`,
].join("\n");

/** Replace the content="…" of a meta tag matched by one of its other attributes. */
function setMeta(html, attr, name, content) {
  const re = new RegExp(`(<meta\\s+${attr}="${name}"\\s+content=")[^"]*(")`, "i");
  if (re.test(html)) return html.replace(re, `$1${escapeAttr(content)}$2`);
  // The multi-line form Vite leaves untouched: attr on one line, content on the next.
  const multi = new RegExp(`(<meta\\s*\\n\\s*${attr}="${name}"\\s*\\n\\s*content=")[^"]*(")`, "i");
  return html.replace(multi, `$1${escapeAttr(content)}$2`);
}

function buildPage(page) {
  const { lang, dir, title, description, html } = page;
  const canonical = urlFor(lang);
  const og = LANGUAGES.find((l) => l.code === lang)?.og ?? "en_US";

  let out = template;
  out = out.replace(/<html lang="[^"]*"[^>]*>/i, `<html lang="${lang}" dir="${dir}">`);
  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeText(title)}</title>`);
  out = setMeta(out, "name", "description", description);
  out = setMeta(out, "property", "og:title", title);
  out = setMeta(out, "property", "og:description", description);
  out = setMeta(out, "property", "og:locale", og);
  out = setMeta(out, "property", "og:url", canonical);
  out = setMeta(out, "name", "twitter:title", title);
  out = setMeta(out, "name", "twitter:description", description);
  out = out.replace(
    /<link rel="canonical" href="[^"]*" \/>/i,
    `<link rel="canonical" href="${canonical}" />`,
  );
  // Structured data describes this document, so it moves with it.
  out = out.replace(/"url": "[^"]*"/g, `"url": "${canonical}"`);
  out = out.replace(
    /("@type": \["SoftwareApplication", "WebApplication"\],)/,
    `$1\n        "inLanguage": "${lang}",`,
  );
  out = out.replace("</head>", `${alternates}\n  </head>`);
  out = out.replace(ROOT_DIV, `<div id="root">${html}</div>`);
  return out;
}

const written = [];
for (const { code } of LANGUAGES) {
  const page = await renderLanding(code);
  if (!page.html || page.html.length < 500) {
    console.error(`[prerender] ${code}: rendered markup looks empty (${page.html?.length ?? 0} chars)`);
    process.exit(1);
  }
  if (!page.title || !page.description) {
    console.error(`[prerender] ${code}: missing meta.title or meta.description in the translation`);
    process.exit(1);
  }
  const out = buildPage(page);
  // A page that still claims to be English, or still carries the English
  // canonical, would quietly compete with the root page for the same keywords.
  if (code !== "en" && (out.includes('<html lang="en"') || !out.includes(urlFor(code)))) {
    console.error(`[prerender] ${code}: page head was not localized`);
    process.exit(1);
  }

  const target = code === "en" ? indexPath : path.join(distDir, code, "index.html");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, out);
  written.push({ code, bytes: out.length });
}

// --- sitemap: one entry per language, each listing the whole alternate set ---
const urls = LANGUAGES.map(({ code }) => {
  const links = [
    ...LANGUAGES.map(
      (l) => `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${urlFor(l.code)}" />`,
    ),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${urlFor("en")}" />`,
  ].join("\n");
  return `  <url>\n    <loc>${urlFor(code)}</loc>\n${links}\n    <changefreq>monthly</changefreq>\n    <priority>${code === "en" ? "1.0" : "0.8"}</priority>\n  </url>`;
}).join("\n");

fs.writeFileSync(
  path.join(distDir, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`,
);

console.log(
  `[prerender] ${written.length} localized pages + sitemap.xml — ` +
    written.map((w) => `${w.code} (${Math.round(w.bytes / 1024)}kB)`).join(", "),
);
