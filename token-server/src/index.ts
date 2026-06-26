import "dotenv/config";
import cors from "cors";
import express, { type Request, type Response } from "express";
import { AccessToken, type VideoGrant } from "livekit-server-sdk";
import { encodeParticipantMetadata, isLanguageCode } from "@univoice/config";

const PORT = Number(process.env.PORT ?? 4000);
const LIVEKIT_URL = requireEnv("LIVEKIT_URL");
const LIVEKIT_API_KEY = requireEnv("LIVEKIT_API_KEY");
const LIVEKIT_API_SECRET = requireEnv("LIVEKIT_API_SECRET");
const CORS_ORIGIN = (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(",");

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

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.post("/api/token", async (req: Request<unknown, unknown, TokenRequestBody>, res: Response) => {
  const { roomName, identity, name, lang } = req.body;

  if (!roomName || !identity) {
    res.status(400).json({ error: "roomName and identity are required" });
    return;
  }
  if (!lang || !isLanguageCode(lang)) {
    res.status(400).json({ error: "lang must be one of the supported language codes" });
    return;
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
  };
  at.addGrant(grant);

  const token = await at.toJwt();
  res.json({ token, url: LIVEKIT_URL });
});

app.listen(PORT, () => {
  console.log(`Token server listening on http://localhost:${PORT}`);
});
