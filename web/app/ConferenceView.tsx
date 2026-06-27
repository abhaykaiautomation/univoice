"use client";

import { useState } from "react";
import {
  AudioTrack,
  ControlBar,
  GridLayout,
  ParticipantTile,
  StartAudio,
  useLocalParticipant,
  useTrackVolume,
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
  roomName: string;
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
export function ConferenceView({ myLang, roomName }: ConferenceViewProps) {
  const { localParticipant } = useLocalParticipant();
  const [showRoster, setShowRoster] = useState(false);
  const videoTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]).filter(
    (trackRef) => trackRef.participant.kind !== ParticipantKind.AGENT,
  );
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });

  const audibleTracks = audioTracks.filter((trackRef) =>
    shouldPlay(trackRef, myLang, localParticipant.identity),
  );

  // One row per real person's own mic (excludes agent-published translation
  // tracks) — this is the audio test/roster panel: a live level meter per
  // name lets you see whether a mic is actually capturing sound, independent
  // of whether you can hear anything play back.
  const rosterTracks = audioTracks.filter(
    (trackRef) =>
      trackRef.participant.kind !== ParticipantKind.AGENT &&
      !parseTranslatedTrackMetadata(trackRef.publication.trackName),
  );

  const myLangLabel = LANGUAGES.find((l) => l.code === myLang)?.label ?? myLang;

  return (
    <div
      style={{ height: "100%", display: "flex", flexDirection: "column", background: "#000", position: "relative" }}
    >
      <div
        style={{
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#1a1a1a",
          color: "#fff",
          fontSize: 14,
        }}
      >
        <span>{roomName}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span>
            Your language: <strong>{myLangLabel}</strong>
          </span>
          <button
            onClick={() => setShowRoster((v) => !v)}
            style={{
              background: showRoster ? "#2563eb" : "#2a2a2e",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Audio test ({rosterTracks.length})
          </button>
        </div>
      </div>
      {showRoster && (
        <div
          style={{
            position: "absolute",
            top: 50,
            right: 16,
            width: 260,
            background: "#1a1a1a",
            color: "#fff",
            borderRadius: 8,
            padding: 12,
            zIndex: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          {rosterTracks.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: "#9a9a9e" }}>No one's mic is published yet.</p>
          )}
          {rosterTracks.map((trackRef) => (
            <ParticipantAudioRow
              key={trackRef.participant.identity}
              trackRef={trackRef}
              myLang={myLang}
              audioTracks={audioTracks}
            />
          ))}
        </div>
      )}
      <div style={{ flex: 1 }}>
        <GridLayout tracks={videoTracks}>
          <ParticipantTile />
        </GridLayout>
      </div>
      {audibleTracks.map((trackRef) => (
        <AudioTrack key={trackRef.publication.trackSid} trackRef={trackRef} />
      ))}
      <StartAudio label="Click to enable audio" className="univoice-start-audio" />
      <ControlBar
        controls={{ microphone: true, camera: true, screenShare: false, chat: false, settings: false, leave: true }}
        variation="verbose"
      />
    </div>
  );
}

interface ParticipantAudioRowProps {
  trackRef: TrackReference;
  myLang: LanguageCode;
  audioTracks: TrackReference[];
}

function ParticipantAudioRow({ trackRef, myLang, audioTracks }: ParticipantAudioRowProps) {
  const volume = useTrackVolume(trackRef);
  const meta = parseParticipantMetadata(trackRef.participant.metadata);
  const name = meta?.displayName ?? trackRef.participant.identity;
  const langLabel = meta ? LANGUAGES.find((l) => l.code === meta.lang)?.label ?? meta.lang : "?";
  const muted = trackRef.publication.isMuted;

  let status: string;
  if (trackRef.participant.isLocal) {
    status = "This is you";
  } else if (meta?.lang === myLang) {
    status = "Direct (same language)";
  } else {
    const translating = audioTracks.some((t) => {
      const translation = parseTranslatedTrackMetadata(t.publication.trackName);
      return translation?.sourceIdentity === trackRef.participant.identity && translation.targetLang === myLang;
    });
    status = translating ? "Translating live" : "Waiting for translation…";
  }

  return (
    <div style={{ padding: "6px 0", borderBottom: "1px solid #333" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 13 }}>
          {muted ? "\u{1F507}" : "\u{1F3A4}"} {name} <span style={{ color: "#9a9a9e" }}>· {langLabel}</span>
        </span>
        <div style={{ width: 48, height: 6, background: "#333", borderRadius: 3, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              background: volume > 0.05 ? "#22c55e" : "#444",
              width: `${Math.min(100, volume * 200)}%`,
            }}
          />
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#9a9a9e", marginTop: 2 }}>{status}</div>
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
