"""The TranslationProvider abstraction. All speech-to-speech translation goes
through this interface — agent logic never calls a vendor SDK directly, so
swapping providers is a config change (TRANSLATION_PROVIDER env var), not a
code change. See openai_provider.py for the only implemented backend so far
and palabra_provider.py for the interface-complete stub.
"""

from __future__ import annotations

from typing import Awaitable, Callable, Protocol


class TranslationSession(Protocol):
    async def push_audio(self, pcm_frame: bytes) -> None: ...
    async def aclose(self) -> None: ...


class TranslationProvider(Protocol):
    async def start_session(
        self,
        source_lang: str,
        target_lang: str,
        on_audio: Callable[[bytes], Awaitable[None]],
        on_transcript: Callable[[str, bool], Awaitable[None]],
    ) -> TranslationSession: ...
