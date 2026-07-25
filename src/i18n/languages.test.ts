import { describe, it, expect } from "vitest";
import { LANGUAGES, LANGUAGE_CODES, normalizeLanguage, isRtl } from "./languages";

describe("language negotiation", () => {
  it("keeps a tag we ship verbatim", () => {
    for (const code of LANGUAGE_CODES) {
      expect(normalizeLanguage(code)).toBe(code);
    }
  });

  it("falls back from a region to its base language", () => {
    expect(normalizeLanguage("de-AT")).toBe("de");
    expect(normalizeLanguage("de-CH")).toBe("de");
    expect(normalizeLanguage("fr-CA")).toBe("fr");
    expect(normalizeLanguage("es-MX")).toBe("es");
    expect(normalizeLanguage("ru-BY")).toBe("ru");
  });

  it("routes Chinese by script, inferring it from the region", () => {
    expect(normalizeLanguage("zh")).toBe("zh-Hans");
    expect(normalizeLanguage("zh-CN")).toBe("zh-Hans");
    expect(normalizeLanguage("zh-SG")).toBe("zh-Hans");
    expect(normalizeLanguage("zh-Hans-CN")).toBe("zh-Hans");
    expect(normalizeLanguage("zh-TW")).toBe("zh-Hant");
    expect(normalizeLanguage("zh-HK")).toBe("zh-Hant");
    expect(normalizeLanguage("zh-MO")).toBe("zh-Hant");
    expect(normalizeLanguage("zh-Hant-TW")).toBe("zh-Hant");
  });

  it("sends every Portuguese to the one variant we ship", () => {
    expect(normalizeLanguage("pt")).toBe("pt-BR");
    expect(normalizeLanguage("pt-PT")).toBe("pt-BR");
    expect(normalizeLanguage("pt-BR")).toBe("pt-BR");
  });

  it("accepts underscores and odd casing from older platforms", () => {
    expect(normalizeLanguage("PT_br")).toBe("pt-BR");
    expect(normalizeLanguage("ZH_TW")).toBe("zh-Hant");
    expect(normalizeLanguage("DE")).toBe("de");
  });

  it("falls back to English for anything we do not ship", () => {
    expect(normalizeLanguage("sv")).toBe("en");
    expect(normalizeLanguage("cy-GB")).toBe("en");
    expect(normalizeLanguage("")).toBe("en");
    expect(normalizeLanguage(undefined)).toBe("en");
    expect(normalizeLanguage(null)).toBe("en");
  });

  it("marks exactly the right-to-left languages", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("en")).toBe(false);
    expect(isRtl("he")).toBe(false); // not shipped
  });

  it("has a unique, non-empty native name for every language", () => {
    const natives = LANGUAGES.map((l) => l.native);
    expect(new Set(natives).size).toBe(natives.length);
    expect(natives.every((n) => n.trim().length > 0)).toBe(true);
    expect(LANGUAGES[0].code).toBe("en"); // English first, and the fallback
  });
});
