import type { LanguageCode } from "./languages";

// Set by the client on join (and baked into the LiveKit access token), read
// by other clients and by the translator agents to know each participant's
// chosen language.
export interface ParticipantMetadata {
  displayName: string;
  lang: LanguageCode;
}

export function encodeParticipantMetadata(meta: ParticipantMetadata): string {
  return JSON.stringify(meta);
}

export function parseParticipantMetadata(raw: string | undefined): ParticipantMetadata | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.displayName === "string" && typeof parsed?.lang === "string") {
      return parsed as ParticipantMetadata;
    }
  } catch {
    // not valid JSON / not our metadata shape
  }
  return null;
}
