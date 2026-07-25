import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import { DEFAULT_LANGUAGE, LANGUAGE_CODES, isRtl, normalizeLanguage } from "./languages";
import { languageFromPath, localePath } from "./paths";

export const STORAGE_KEY = "mirror-lang";
const REDIRECT_GUARD = "mirror-lang-redirected";

export const BASE_URL: string = import.meta.env.BASE_URL;

/**
 * Only English is bundled. Every other language is a separate chunk fetched when
 * that language is actually used, so a German visitor downloads English + German
 * and never pays for the other eleven. English has to be bundled synchronously
 * because it is what the build-time prerender renders.
 */
const LOADERS: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  "zh-Hans": () => import("./locales/zh-Hans.json"),
  "zh-Hant": () => import("./locales/zh-Hant.json"),
  es: () => import("./locales/es.json"),
  hi: () => import("./locales/hi.json"),
  ar: () => import("./locales/ar.json"),
  "pt-BR": () => import("./locales/pt-BR.json"),
  ru: () => import("./locales/ru.json"),
  ja: () => import("./locales/ja.json"),
  de: () => import("./locales/de.json"),
  fr: () => import("./locales/fr.json"),
  it: () => import("./locales/it.json"),
  ko: () => import("./locales/ko.json"),
};

// The detector reaches for document/navigator, neither of which exists in the
// build-time prerender — and there is nothing to detect there anyway, since the
// page being rendered already dictates its language.
if (typeof window !== "undefined") i18n.use(LanguageDetector);

i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en } },
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: LANGUAGE_CODES,
    interpolation: { escapeValue: false }, // React escapes for us
    parseMissingKeyHandler: () => "", // never render a raw dotted key path
    react: { useSuspense: false },
    detection: {
      order: ["querystring", "localStorage", "navigator", "htmlTag"],
      lookupQuerystring: "lang",
      lookupLocalStorage: STORAGE_KEY,
      caches: [], // the URL is the record of choice; see rememberLanguage
      convertDetectedLanguage: normalizeLanguage,
    },
  });

/** What the user would prefer, ignoring the URL: ?lang, then storage, then browser. */
export function preferredLanguage(): string {
  const services = i18n.services as unknown as {
    languageDetector?: { detect: () => string | string[] | undefined };
  };
  const raw = services.languageDetector?.detect();
  return normalizeLanguage(Array.isArray(raw) ? raw[0] : raw);
}

/** The language this document was served as — the path is the authority. */
export function servedLanguage(pathname: string): string {
  return languageFromPath(BASE_URL, pathname) ?? DEFAULT_LANGUAGE;
}

function rememberLanguage(code: string) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Private mode: the choice just will not survive a reload.
  }
}

/** Reflect the active language on the document, for the browser and for CSS. */
function applyToDocument(code: string) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = code;
  document.documentElement.dir = isRtl(code) ? "rtl" : "ltr";
  const title = i18n.t("meta.title");
  if (title) document.title = title;
  const desc = document.querySelector('meta[name="description"]');
  const description = i18n.t("meta.description");
  if (desc && description) desc.setAttribute("content", description);
}

/**
 * Load a language's chunk and make it current. Resolves to the language actually
 * in use: a chunk that fails to load (offline, or a stale index after a
 * redeploy) falls back to English rather than leaving the UI half-translated.
 */
export async function activateLanguage(code: string): Promise<string> {
  const target = normalizeLanguage(code);
  if (target !== DEFAULT_LANGUAGE && !i18n.hasResourceBundle(target, "translation")) {
    try {
      const mod = await LOADERS[target]();
      i18n.addResourceBundle(target, "translation", mod.default, true, true);
    } catch {
      await i18n.changeLanguage(DEFAULT_LANGUAGE);
      applyToDocument(DEFAULT_LANGUAGE);
      return DEFAULT_LANGUAGE;
    }
  }
  await i18n.changeLanguage(target);
  applyToDocument(target);
  return target;
}

/**
 * Switch language from the UI without reloading.
 *
 * The URL is rewritten to the new language's path so the address bar stays
 * truthful and a reload or a shared link lands on the prerendered page for that
 * language — but the SPA is not torn down, so switching language in the middle
 * of designing does not throw the user back to the landing page.
 */
export async function chooseLanguage(code: string): Promise<string> {
  const active = await activateLanguage(code);
  rememberLanguage(active);
  if (typeof history !== "undefined") {
    history.replaceState(null, "", localePath(BASE_URL, active) + location.search + location.hash);
  }
  return active;
}

/**
 * On the root document only, send a first-time visitor to their own language.
 *
 * Returns true if a navigation was started, in which case the caller should not
 * bother rendering. Guarded by a session flag so a misconfigured base path can
 * never produce a redirect loop, and skipped entirely once the user has made a
 * choice that matches the page they are on.
 */
export function redirectToPreferredLanguage(): boolean {
  if (typeof location === "undefined") return false;
  const pathLanguage = languageFromPath(BASE_URL, location.pathname) ?? DEFAULT_LANGUAGE;

  // An explicit ?lang= is a direct instruction, so it outranks both the path
  // and the session guard — but it still lands on that language's own URL, so
  // the served page and the rendered language never disagree.
  const explicit = new URLSearchParams(location.search).get("lang");
  if (explicit) {
    const wanted = normalizeLanguage(explicit);
    if (wanted === pathLanguage) return false;
    location.replace(localePath(BASE_URL, wanted) + location.search + location.hash);
    return true;
  }

  if (languageFromPath(BASE_URL, location.pathname)) return false; // already localized
  let guarded = false;
  try {
    guarded = sessionStorage.getItem(REDIRECT_GUARD) === "1";
  } catch {
    guarded = true; // no sessionStorage, no guard — do not risk a loop
  }
  if (guarded) return false;
  const wanted = preferredLanguage();
  if (wanted === DEFAULT_LANGUAGE) return false;
  try {
    sessionStorage.setItem(REDIRECT_GUARD, "1");
  } catch {
    return false;
  }
  location.replace(localePath(BASE_URL, wanted) + location.search + location.hash);
  return true;
}

export { i18n };
