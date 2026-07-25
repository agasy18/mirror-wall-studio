import { renderToString } from "react-dom/server";
import { Landing } from "./screens/Landing";
import { i18n } from "./i18n";
import { DEFAULT_LANGUAGE, isRtl } from "./i18n/languages";

// Statically imported so the prerender stays synchronous and self-contained.
// This bundle is a build artefact only — it never ships to a browser, so
// carrying all thirteen languages at once costs nothing at runtime.
import zhHans from "./i18n/locales/zh-Hans.json";
import zhHant from "./i18n/locales/zh-Hant.json";
import es from "./i18n/locales/es.json";
import hi from "./i18n/locales/hi.json";
import ar from "./i18n/locales/ar.json";
import ptBR from "./i18n/locales/pt-BR.json";
import ru from "./i18n/locales/ru.json";
import ja from "./i18n/locales/ja.json";
import de from "./i18n/locales/de.json";
import fr from "./i18n/locales/fr.json";
import it from "./i18n/locales/it.json";
import ko from "./i18n/locales/ko.json";

const BUNDLES: Record<string, Record<string, unknown>> = {
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
  es,
  hi,
  ar,
  "pt-BR": ptBR,
  ru,
  ja,
  de,
  fr,
  it,
  ko,
};

// Re-exported so the page generator has a single source of truth for which
// languages exist and where the site lives.
export { LANGUAGES } from "./i18n/languages";
export { APP_URL, APP_NAME } from "./model/brand";

export interface RenderedPage {
  html: string;
  title: string;
  description: string;
  lang: string;
  dir: "ltr" | "rtl";
}

/**
 * Build-time only. The landing markup is baked into each language's
 * index.html so every page carries real, translated text for crawlers that do
 * not execute JavaScript — which is most of them apart from Googlebot. That is
 * the whole point of giving each language its own URL.
 *
 * Rendered with hasSavedWork=false because the server cannot know: the client's
 * first render matches that, and AppFlow upgrades it after mount.
 */
export async function renderLanding(lang: string): Promise<RenderedPage> {
  if (lang !== DEFAULT_LANGUAGE) {
    const bundle = BUNDLES[lang];
    if (!bundle) throw new Error(`No translation bundle for "${lang}"`);
    i18n.addResourceBundle(lang, "translation", bundle, true, true);
  }
  await i18n.changeLanguage(lang);

  return {
    html: renderToString(<Landing onLaunch={() => {}} hasSavedWork={false} />),
    title: i18n.t("meta.title"),
    description: i18n.t("meta.description"),
    lang,
    dir: isRtl(lang) ? "rtl" : "ltr",
  };
}
