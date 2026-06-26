"""The "translated track metadata" contract from the architecture doc:
{"kind": "translation", "sourceIdentity": str, "targetLang": str}.

LiveKit tracks have no generic per-track metadata field (only participants
do), so this is encoded as JSON into the published track's `name` — the one
free-form string field available on a track. The web client parses it back
out of `publication.trackName`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from .languages import LanguageCode


@dataclass(frozen=True)
class TranslatedTrackMetadata:
    source_identity: str
    target_lang: LanguageCode
    kind: str = "translation"

    def encode(self) -> str:
        return json.dumps(
            {
                "kind": self.kind,
                "sourceIdentity": self.source_identity,
                "targetLang": self.target_lang,
            }
        )
