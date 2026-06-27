"use client";

import { LiveKitRoom } from "@livekit/components-react";
import type { LanguageCode } from "@univoice/config";
import { ConferenceView } from "./ConferenceView";

interface RoomViewProps {
  token: string;
  serverUrl: string;
  myLang: LanguageCode;
  roomName: string;
  onLeave: () => void;
}

export function RoomView({ token, serverUrl, myLang, roomName, onLeave }: RoomViewProps) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      audio
      video
      connect
      className="univoice-room"
      onDisconnected={onLeave}
    >
      <ConferenceView myLang={myLang} roomName={roomName} />
    </LiveKitRoom>
  );
}
