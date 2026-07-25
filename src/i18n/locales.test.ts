import { describe, it, expect } from "vitest";
import { LANGUAGES } from "./languages";
import en from "./locales/en.json";
import zhHans from "./locales/zh-Hans.json";
import zhHant from "./locales/zh-Hant.json";
import es from "./locales/es.json";
import hi from "./locales/hi.json";
import ar from "./locales/ar.json";
import ptBR from "./locales/pt-BR.json";
import ru from "./locales/ru.json";
import ja from "./locales/ja.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
// Imported under an alias: a bare `it` would shadow vitest's test function.
import itIT from "./locales/it.json";
import ko from "./locales/ko.json";

/**
 * Translations are written by hand and by translators, far from the code that
 * consumes them. These are the failures that survive review and only show up in
 * production, in a language the author cannot read: a key that never got
 * translated and renders blank, a dropped `{{count}}` that leaves a sentence
 * with a hole, a `<b>` that vanishes and takes the markup with it, or a plural
 * set that is right for English and wrong for Russian.
 */

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
  it: itIT,
  ko,
};

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** Flatten to dotted paths -> string. */
function flatten(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else if (v && typeof v === "object") Object.assign(out, flatten(v, key));
  }
  return out;
}

/** Drop the plural suffix so `print.pages_few` and `print.pages_one` compare equal. */
const base = (key: string) => key.replace(PLURAL_SUFFIX, "");
const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
const tags = (s: string) => [...s.matchAll(/<\/?(br|em|b)\s*\/?>/g)].map((m) => m[1]).sort();

const enFlat = flatten(en);
const enBaseKeys = new Set(Object.keys(enFlat).map(base));
/** Base keys that are pluralized in the source. */
const enPluralBases = new Set(
  Object.keys(enFlat).filter((k) => PLURAL_SUFFIX.test(k)).map(base),
);
/** One representative English string per base key, for comparing shape. */
const enByBase = new Map<string, string>();
for (const [k, v] of Object.entries(enFlat)) if (!enByBase.has(base(k))) enByBase.set(base(k), v);

describe("translation bundles", () => {
  it("ships a bundle for every language except the bundled default", () => {
    const declared = LANGUAGES.map((l) => l.code).filter((c) => c !== "en");
    expect(Object.keys(BUNDLES).sort()).toEqual([...declared].sort());
  });

  for (const [code, bundle] of Object.entries(BUNDLES)) {
    describe(code, () => {
      const flat = flatten(bundle);
      const keys = Object.keys(flat);

      it("covers every key in the source, with nothing extra", () => {
        const theirs = new Set(keys.map(base));
        expect([...enBaseKeys].filter((k) => !theirs.has(k))).toEqual([]); // missing
        expect([...theirs].filter((k) => !enBaseKeys.has(k))).toEqual([]); // stray
      });

      it("has no empty or untranslated-looking values", () => {
        expect(keys.filter((k) => flat[k].trim() === "")).toEqual([]);
      });

      it("keeps every interpolation placeholder", () => {
        const wrong = keys.filter(
          (k) => placeholders(flat[k]).join() !== placeholders(enByBase.get(base(k)) ?? "").join(),
        );
        expect(wrong).toEqual([]);
      });

      it("keeps every inline markup tag", () => {
        const wrong = keys.filter(
          (k) => tags(flat[k]).join() !== tags(enByBase.get(base(k)) ?? "").join(),
        );
        expect(wrong).toEqual([]);
      });

      it("uses exactly the plural categories this language actually has", () => {
        // The whole point of per-language plural keys: English's one/other is
        // wrong for Russian (one/few/many/other) and wrong for Japanese (other).
        const expected = [...new Intl.PluralRules(code).resolvedOptions().pluralCategories].sort();
        for (const b of enPluralBases) {
          const got = keys
            .filter((k) => base(k) === b)
            .map((k) => PLURAL_SUFFIX.exec(k)?.[1])
            .filter(Boolean)
            .sort();
          expect({ key: b, categories: got }).toEqual({ key: b, categories: expected });
        }
      });
    });
  }
});
