"use client";

import {
  AudioTrack,
  DisconnectButton,
  GridLayout,
  ParticipantTile,
  useTracks,
} from "@livekit/components-react";
import { parseParticipantMetadata, type LanguageCode } from "@univoice/config";
import { Track } from "livekit-client";

interface ConferenceViewProps {
  myLang: LanguageCode;
}

// Video is shown for every participant regardless of language (per spec).
// Audio is filtered per the client subscription rule: until Phase 3/4 add
// translation tracks, the only audio that exists is each speaker's original,
// so the rule reduces to "play original audio only from same-language
// speakers" — other-language speech is simply silent for now.
export function ConferenceView({ myLang }: ConferenceViewProps) {
  const videoTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });

  const audibleTracks = audioTracks.filter((trackRef) => {
    if (trackRef.participant.isLocal) return false;
    const meta = parseParticipantMetadata(trackRef.participant.metadata);
    return meta?.lang === myLang;
  });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1 }}>
        <GridLayout tracks={videoTracks}>
          <ParticipantTile />
        </GridLayout>
      </div>
      {audibleTracks.map((trackRef) => (
        <AudioTrack key={trackRef.publication.trackSid} trackRef={trackRef} />
      ))}
      <div style={{ padding: 12, textAlign: "center" }}>
        <DisconnectButton>Leave room</DisconnectButton>
      </div>
    </div>
  );
}
