from __future__ import annotations

import os

from .openai_provider import OpenAIRealtimeTranslateProvider
from .palabra_provider import PalabraProvider
from .provider import TranslationProvider


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def get_provider() -> TranslationProvider:
    provider = os.environ.get("TRANSLATION_PROVIDER", "openai")
    if provider == "openai":
        return OpenAIRealtimeTranslateProvider(api_key=_require_env("OPENAI_API_KEY"))
    if provider == "palabra":
        return PalabraProvider(
            api_key=_require_env("PALABRA_API_KEY"),
            api_secret=_require_env("PALABRA_API_SECRET"),
        )
    raise ValueError(f"Unknown TRANSLATION_PROVIDER: {provider!r}")
