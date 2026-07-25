import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../i18n/languages";
import { chooseLanguage } from "../i18n";

/**
 * Language chooser. A native <select> on purpose: thirteen options is too many
 * for a row of buttons, and the platform picker is the one control that is
 * already accessible, keyboard-driven and usable on a phone.
 *
 * Every option names itself in its own language — the language menu is the one
 * place a user cannot be assumed to read the language currently on screen.
 */
export function LanguagePicker({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? i18n.language ?? "en";

  return (
    <select
      className={`lang-picker${className ? ` ${className}` : ""}`}
      value={current}
      aria-label={t("lang.choose")}
      title={t("lang.label")}
      onChange={(e) => {
        void chooseLanguage(e.target.value);
      }}
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.native}
        </option>
      ))}
    </select>
  );
}
