"use client";

import {
  AudioTrack,
  ControlBar,
  GridLayout,
  ParticipantTile,
  useLocalParticipant,
  useTracks,
} from "@livekit/components-react";
import {
  LANGUAGES,
  parseParticipantMetadata,
  parseTranslatedTrackMetadata,
  type LanguageCode,
} from "@univoice/config";
import { ParticipantKind, Track, type TrackPublication } from "livekit-client";
import type { TrackReference } from "@livekit/components-core";

interface ConferenceViewProps {
  myLang: LanguageCode;
}

// Video is shown for every participant regardless of language (per spec).
// Audio is filtered per the client subscription rule:
//   - an original track plays if its publisher's lang == myLang and isn't me
//   - a translation track (tagged via its trackName, since LiveKit tracks
//     have no generic metadata field) plays if its targetLang == myLang and
//     its sourceIdentity isn't me
// Everything else (other-language originals once a translation exists,
// translations meant for the other language) stays unplayed. Translator
// agents are hidden bots, not people on a call, so they're excluded from
// the video grid (they never publish camera tracks, but withPlaceholder
// would otherwise render an empty tile for them).
export function ConferenceView({ myLang }: ConferenceViewProps) {
  const { localParticipant } = useLocalParticipant();
  const videoTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]).filter(
    (trackRef) => trackRef.participant.kind !== ParticipantKind.AGENT,
  );
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });

  const audibleTracks = audioTracks.filter((trackRef) =>
    shouldPlay(trackRef, myLang, localParticipant.identity),
  );

  const myLangLabel = LANGUAGES.find((l) => l.code === myLang)?.label ?? myLang;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "8px 16px",
          textAlign: "center",
          background: "#1a1a1a",
          color: "#fff",
          fontSize: 14,
        }}
      >
        Your language: <strong>{myLangLabel}</strong>
      </div>
      <div style={{ flex: 1 }}>
        <GridLayout tracks={videoTracks}>
          <ParticipantTile />
        </GridLayout>
      </div>
      {audibleTracks.map((trackRef) => (
        <AudioTrack key={trackRef.publication.trackSid} trackRef={trackRef} />
      ))}
      <ControlBar
        controls={{ microphone: true, camera: true, screenShare: false, chat: false, settings: false, leave: true }}
        variation="minimal"
      />
    </div>
  );
}

function shouldPlay(trackRef: TrackReference, myLang: LanguageCode, myIdentity: string): boolean {
  const publication: TrackPublication = trackRef.publication;
  const translation = parseTranslatedTrackMetadata(publication.trackName);

  if (translation) {
    return translation.targetLang === myLang && translation.sourceIdentity !== myIdentity;
  }

  if (trackRef.participant.isLocal) return false;
  const meta = parseParticipantMetadata(trackRef.participant.metadata);
  return meta?.lang === myLang;
}
