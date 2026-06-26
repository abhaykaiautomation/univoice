"""TranslationProvider backed by OpenAI's gpt-realtime-translate model.

This connects directly to OpenAI's dedicated realtime-translation WebSocket
endpoint (wss://api.openai.com/v1/realtime/translations) rather than via the
`openai` SDK's `client.realtime.connect()` helper: that helper targets the
older, general conversational realtime endpoint (/v1/realtime) and has no
typed support yet for this separate, newer /v1/realtime/translations
endpoint. The protocol below (event names, field names, audio format) was
verified against OpenAI's current realtime-translation docs, not guessed.

Audio contract: PCM16 mono @ 24kHz, base64-encoded over the wire, both
directions. The agent's per-speaker pipeline (common/translator_agent.py)
is configured at that same rate so no resampling is needed anywhere.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import json
import logging
from typing import Awaitable, Callable

import websockets

from .provider import TranslationProvider, TranslationSession

logger = logging.getLogger("translation.openai")

REALTIME_TRANSLATE_URL = "wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate"


class OpenAIRealtimeTranslateSession:
    def __init__(self, ws: websockets.ClientConnection, receive_task: "asyncio.Task[None]") -> None:
        self._ws = ws
        self._receive_task = receive_task

    async def push_audio(self, pcm_frame: bytes) -> None:
        await self._ws.send(
            json.dumps(
                {
                    "type": "session.input_audio_buffer.append",
                    "audio": base64.b64encode(pcm_frame).decode("ascii"),
                }
            )
        )

    async def aclose(self) -> None:
        with contextlib.suppress(Exception):
            await self._ws.send(json.dumps({"type": "session.close"}))
        self._receive_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._receive_task
        with contextlib.suppress(Exception):
            await self._ws.close()


class OpenAIRealtimeTranslateProvider:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    async def start_session(
        self,
        source_lang: str,
        target_lang: str,
        on_audio: Callable[[bytes], Awaitable[None]],
        on_transcript: Callable[[str, bool], Awaitable[None]],
    ) -> TranslationSession:
        # source_lang isn't sent: the model auto-detects the spoken language
        # and only needs to be told what to translate into.
        ws = await websockets.connect(
            REALTIME_TRANSLATE_URL,
            additional_headers={"Authorization": f"Bearer {self._api_key}"},
        )
        await ws.send(
            json.dumps(
                {
                    "type": "session.update",
                    "session": {"audio": {"output": {"language": target_lang}}},
                }
            )
        )

        async def receive_loop() -> None:
            try:
                async for raw in ws:
                    event = json.loads(raw)
                    etype = event.get("type")
                    if etype == "session.output_audio.delta":
                        await on_audio(base64.b64decode(event["delta"]))
                    elif etype == "session.output_transcript.delta":
                        # The API streams continuous fragments with no
                        # finality marker, so every chunk is reported as
                        # non-final.
                        await on_transcript(event["delta"], False)
                    elif etype == "error":
                        logger.error("realtime translate error: %s", event)
            except websockets.exceptions.ConnectionClosed:
                pass

        receive_task = asyncio.create_task(receive_loop())
        return OpenAIRealtimeTranslateSession(ws, receive_task)
