import { NextResponse } from "next/server";
import {
  AccessToken,
  RoomAgentDispatch,
  RoomConfiguration,
  type VideoGrant,
} from "livekit-server-sdk";
import { allTranslatorAgentNames, encodeParticipantMetadata, isLanguageCode } from "@univoice/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

interface TokenRequestBody {
  roomName?: string;
  identity?: string;
  name?: string;
  lang?: string;
}

export async function POST(req: Request) {
  const LIVEKIT_URL = requireEnv("LIVEKIT_URL");
  const LIVEKIT_API_KEY = requireEnv("LIVEKIT_API_KEY");
  const LIVEKIT_API_SECRET = requireEnv("LIVEKIT_API_SECRET");

  const { roomName, identity, name, lang } = (await req.json()) as TokenRequestBody;

  if (!roomName || !identity) {
    return NextResponse.json({ error: "roomName and identity are required" }, { status: 400 });
  }
  if (!lang || !isLanguageCode(lang)) {
    return NextResponse.json({ error: "lang must be one of the supported language codes" }, { status: 400 });
  }

  const displayName = name ?? identity;
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name: displayName,
    ttl: "10m",
    metadata: encodeParticipantMetadata({ displayName, lang }),
  });

  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canUpdateOwnMetadata: true,
  };
  at.addGrant(grant);

  // Requests both translator agents on room creation. LiveKit only applies
  // this the first time the room is created, so it's harmless to send on
  // every join — whoever happens to create the room wires up the agents.
  at.roomConfig = new RoomConfiguration({
    agents: allTranslatorAgentNames().map((agentName) => new RoomAgentDispatch({ agentName })),
  });

  const token = await at.toJwt();
  return NextResponse.json({ token, url: LIVEKIT_URL });
}
