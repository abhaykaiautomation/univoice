"""Python mirror of config/languages.ts.

Single source of truth for supported languages on the agents side. Adding a
third language means adding one entry here (plus a corresponding translator
agent registered with the worker) — nothing else should hardcode "en" / "es".
"""

from __future__ import annotations

LanguageCode = str  # "en" | "es" — kept as str since Python has no string-literal union

LANGUAGES: dict[LanguageCode, str] = {
    "en": "English",
    "es": "Español",
}


def is_language_code(value: str) -> bool:
    return value in LANGUAGES


def translator_agent_name(source_lang: LanguageCode, target_lang: LanguageCode) -> str:
    return f"{source_lang}_to_{target_lang}"
