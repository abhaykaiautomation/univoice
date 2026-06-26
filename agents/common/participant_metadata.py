"""Python mirror of config/participant.ts — reads the metadata the client
bakes into each participant's access token: {"displayName": str, "lang": str}.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from .languages import LanguageCode, is_language_code


@dataclass(frozen=True)
class ParticipantMetadata:
    display_name: str
    lang: LanguageCode


def parse_participant_metadata(raw: str | None) -> ParticipantMetadata | None:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    display_name = parsed.get("displayName") if isinstance(parsed, dict) else None
    lang = parsed.get("lang") if isinstance(parsed, dict) else None
    if not isinstance(display_name, str) or not isinstance(lang, str) or not is_language_code(lang):
        return None
    return ParticipantMetadata(display_name=display_name, lang=lang)
