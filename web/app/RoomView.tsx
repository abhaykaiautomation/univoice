"use client";

import { LiveKitRoom } from "@livekit/components-react";
import type { LanguageCode } from "@univoice/config";
import { ConferenceView } from "./ConferenceView";

interface RoomViewProps {
  token: string;
  serverUrl: string;
  myLang: LanguageCode;
  onLeave: () => void;
}

export function RoomView({ token, serverUrl, myLang, onLeave }: RoomViewProps) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      audio
      video
      connect
      style={{ height: "100vh" }}
      onDisconnected={onLeave}
    >
      <ConferenceView myLang={myLang} />
    </LiveKitRoom>
  );
}
