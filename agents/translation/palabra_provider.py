"""Interface-complete stub for a Palabra-backed TranslationProvider.
Not implemented — selecting TRANSLATION_PROVIDER=palabra fails fast and
loudly rather than silently doing nothing.
"""

from __future__ import annotations

from typing import Awaitable, Callable

from .provider import TranslationSession


class PalabraSession:
    async def push_audio(self, pcm_frame: bytes) -> None:
        raise NotImplementedError

    async def aclose(self) -> None:
        raise NotImplementedError


class PalabraProvider:
    def __init__(self, api_key: str, api_secret: str) -> None:
        self._api_key = api_key
        self._api_secret = api_secret

    async def start_session(
        self,
        source_lang: str,
        target_lang: str,
        on_audio: Callable[[bytes], Awaitable[None]],
        on_transcript: Callable[[str, bool], Awaitable[None]],
    ) -> TranslationSession:
        raise NotImplementedError("PalabraProvider is a stub — set TRANSLATION_PROVIDER=openai")
