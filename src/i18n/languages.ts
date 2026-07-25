/**
 * The languages the UI ships in.
 *
 * `native` is what the picker shows — a language list is the one place a user
 * cannot be assumed to read the current language, so every entry names itself.
 * English is first and is the fallback; the rest follow by number of speakers.
 */
export interface Language {
  code: string;
  native: string;
  rtl?: boolean;
  /** Open Graph wants language_TERRITORY, which is not the same as our code. */
  og: string;
}

export const LANGUAGES: Language[] = [
  { code: "en", native: "English", og: "en_US" },
  { code: "zh-Hans", native: "简体中文", og: "zh_CN" },
  { code: "zh-Hant", native: "繁體中文", og: "zh_TW" },
  { code: "es", native: "Español", og: "es_ES" },
  { code: "hi", native: "हिन्दी", og: "hi_IN" },
  { code: "ar", native: "العربية", rtl: true, og: "ar_AR" },
  { code: "pt-BR", native: "Português (Brasil)", og: "pt_BR" },
  { code: "ru", native: "Русский", og: "ru_RU" },
  { code: "ja", native: "日本語", og: "ja_JP" },
  { code: "de", native: "Deutsch", og: "de_DE" },
  { code: "fr", native: "Français", og: "fr_FR" },
  { code: "it", native: "Italiano", og: "it_IT" },
  { code: "ko", native: "한국어", og: "ko_KR" },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

export const DEFAULT_LANGUAGE = "en";

export function isRtl(code: string): boolean {
  return LANGUAGES.some((l) => l.code === code && l.rtl);
}

/**
 * Fold whatever the browser reports onto a language we actually ship.
 *
 * `navigator.language` is a BCP-47 tag from a much larger space than our list:
 * "de-AT" must reach German, and Chinese arrives as a region ("zh-CN", "zh-TW")
 * or a script ("zh-Hans") depending on the platform, so script has to be
 * inferred from the region before anything else can match.
 */
export function normalizeLanguage(raw: string | undefined | null): string {
  if (!raw) return DEFAULT_LANGUAGE;
  const tag = raw.replace(/_/g, "-");
  const [base = "", ...rest] = tag.toLowerCase().split("-");

  if (base === "zh") {
    // Traditional in Taiwan, Hong Kong and Macau; Simplified everywhere else.
    const traditional = rest.some((p) => ["hant", "tw", "hk", "mo"].includes(p));
    return traditional ? "zh-Hant" : "zh-Hans";
  }
  if (base === "pt") return "pt-BR"; // the only Portuguese we ship

  const exact = LANGUAGE_CODES.find((c) => c.toLowerCase() === tag.toLowerCase());
  if (exact) return exact;

  const byBase = LANGUAGE_CODES.find((c) => c.toLowerCase() === base);
  return byBase ?? DEFAULT_LANGUAGE;
}
