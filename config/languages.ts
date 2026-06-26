export type LanguageCode = "en" | "es";

export interface LanguageDef {
  code: LanguageCode;
  label: string;
}

// Single source of truth for supported languages. Adding a third language
// means adding one entry here (plus a corresponding translator agent) —
// no other code should hardcode "en" / "es" lists.
export const LANGUAGES: readonly LanguageDef[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export function isLanguageCode(value: string): value is LanguageCode {
  return LANGUAGES.some((l) => l.code === value);
}

// Naming convention shared with the Python agents: one translator agent per
// ordered (source, target) language pair. Adding a language to LANGUAGES
// grows this list automatically — nothing else needs to change.
export function translatorAgentName(sourceLang: LanguageCode, targetLang: LanguageCode): string {
  return `${sourceLang}_to_${targetLang}`;
}

export function allTranslatorAgentNames(): string[] {
  const names: string[] = [];
  for (const source of LANGUAGES) {
    for (const target of LANGUAGES) {
      if (source.code !== target.code) {
        names.push(translatorAgentName(source.code, target.code));
      }
    }
  }
  return names;
}
