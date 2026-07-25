import { describe, it, expect } from "vitest";
import { allLocalePaths, languageFromPath, localePath } from "./paths";
import { LANGUAGE_CODES } from "./languages";

const BASE = "/mirror-wall-studio/";

describe("locale URL paths", () => {
  it("serves English from the root and every other language from a subpath", () => {
    expect(localePath(BASE, "en")).toBe("/mirror-wall-studio/");
    expect(localePath(BASE, "de")).toBe("/mirror-wall-studio/de/");
    expect(localePath(BASE, "zh-Hans")).toBe("/mirror-wall-studio/zh-Hans/");
    expect(localePath(BASE, "pt-BR")).toBe("/mirror-wall-studio/pt-BR/");
  });

  it("works at a root base, as the dev server serves it", () => {
    expect(localePath("/", "en")).toBe("/");
    expect(localePath("/", "ru")).toBe("/ru/");
    expect(languageFromPath("/", "/ru/")).toBe("ru");
    expect(languageFromPath("/", "/")).toBe(null);
  });

  it("reads the language back out of a path", () => {
    expect(languageFromPath(BASE, "/mirror-wall-studio/de/")).toBe("de");
    expect(languageFromPath(BASE, "/mirror-wall-studio/zh-Hant/")).toBe("zh-Hant");
    expect(languageFromPath(BASE, "/mirror-wall-studio/ar/index.html")).toBe("ar");
  });

  it("round-trips every language we ship", () => {
    for (const code of LANGUAGE_CODES) {
      const path = localePath(BASE, code);
      const back = languageFromPath(BASE, path);
      expect(back ?? "en").toBe(code);
    }
  });

  it("treats the root as carrying no language segment", () => {
    expect(languageFromPath(BASE, "/mirror-wall-studio/")).toBe(null);
    expect(languageFromPath(BASE, "/mirror-wall-studio")).toBe(null);
    // English is only served from the root, so /en/ is not a language path.
    expect(languageFromPath(BASE, "/mirror-wall-studio/en/")).toBe(null);
  });

  it("ignores path segments that are not languages", () => {
    expect(languageFromPath(BASE, "/mirror-wall-studio/assets/index.js")).toBe(null);
    expect(languageFromPath(BASE, "/mirror-wall-studio/sitemap.xml")).toBe(null);
    expect(languageFromPath(BASE, "/mirror-wall-studio/sv/")).toBe(null);
  });

  it("accepts a case-mangled locale segment", () => {
    expect(languageFromPath(BASE, "/mirror-wall-studio/ZH-HANS/")).toBe("zh-Hans");
    expect(languageFromPath(BASE, "/mirror-wall-studio/pt-br/")).toBe("pt-BR");
  });

  it("lists one path per language, all distinct", () => {
    const all = allLocalePaths(BASE);
    expect(all).toHaveLength(LANGUAGE_CODES.length);
    expect(new Set(all.map((a) => a.path)).size).toBe(all.length);
    expect(all[0]).toEqual({ code: "en", path: BASE });
  });
});
