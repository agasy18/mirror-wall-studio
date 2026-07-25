import { DEFAULT_LANGUAGE, LANGUAGE_CODES } from "./languages";

/**
 * Each language is a real URL, not a client-side mode: `/`, `/de/`, `/zh-Hans/`.
 *
 * That is what makes the localization indexable — every language is a separate
 * document a crawler can fetch, with its own <title>, its own prerendered copy
 * and reciprocal hreflang links. It also removes the guesswork at runtime: the
 * language is read off the path, so the page that was served and the language
 * the app renders can never disagree.
 *
 * Pure module: no DOM. `base` is Vite's BASE_URL ("/" in dev,
 * "/mirror-wall-studio/" in production), always with a trailing slash.
 */

/** The URL path a language lives at. English is the root — no `/en/` prefix. */
export function localePath(base: string, code: string): string {
  return code === DEFAULT_LANGUAGE ? base : `${base}${code}/`;
}

/**
 * The language a path encodes, or null if it carries no language segment.
 *
 * Null means "the root document", which is English — distinguished from a match
 * on purpose, because only an unprefixed path is a candidate for redirecting a
 * first-time visitor to their own language.
 */
export function languageFromPath(base: string, pathname: string): string | null {
  const path = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\/+/, "");
  const segment = path.split("/")[0] ?? "";
  if (!segment) return null;
  const match = LANGUAGE_CODES.find((c) => c.toLowerCase() === segment.toLowerCase());
  // `en` is only ever served from the root, so an explicit /en/ is not a match.
  return match && match !== DEFAULT_LANGUAGE ? match : null;
}

/** Every language's path, for building hreflang alternates and the sitemap. */
export function allLocalePaths(base: string): Array<{ code: string; path: string }> {
  return LANGUAGE_CODES.map((code) => ({ code, path: localePath(base, code) }));
}
