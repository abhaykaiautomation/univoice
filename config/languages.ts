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
