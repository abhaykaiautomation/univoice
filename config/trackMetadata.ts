import type { LanguageCode } from "./languages";

// Set by a translator agent on each track it publishes. LiveKit tracks have
// no generic per-track metadata field (only participants do), so this is
// JSON-encoded into the published track's `name` and read back from
// `publication.trackName` on the client.
export interface TranslatedTrackMetadata {
  kind: "translation";
  sourceIdentity: string;
  targetLang: LanguageCode;
}

export function parseTranslatedTrackMetadata(trackName: string | undefined): TranslatedTrackMetadata | null {
  if (!trackName) return null;
  try {
    const parsed = JSON.parse(trackName);
    if (
      parsed?.kind === "translation" &&
      typeof parsed?.sourceIdentity === "string" &&
      typeof parsed?.targetLang === "string"
    ) {
      return parsed as TranslatedTrackMetadata;
    }
  } catch {
    // not valid JSON / not our metadata shape — it's a plain original track
  }
  return null;
}
