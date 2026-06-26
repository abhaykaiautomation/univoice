"use client";

import { useState } from "react";
import { DEFAULT_LANGUAGE, LANGUAGES, type LanguageCode } from "@univoice/config";
import { RoomView } from "./RoomView";

interface SessionInfo {
  token: string;
  serverUrl: string;
  roomName: string;
  displayName: string;
  lang: LanguageCode;
}

export default function Home() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [roomName, setRoomName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [lang, setLang] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!roomName.trim() || !displayName.trim()) return;

    setJoining(true);
    setError(null);
    try {
      const identity = `${displayName}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName, identity, name: displayName, lang }),
      });
      if (!res.ok) {
        throw new Error(`Token server responded with ${res.status}`);
      }
      const data = await res.json();
      setSession({
        token: data.token,
        serverUrl: data.url,
        roomName,
        displayName,
        lang,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join room");
    } finally {
      setJoining(false);
    }
  }

  if (session) {
    return (
      <RoomView
        token={session.token}
        serverUrl={session.serverUrl}
        myLang={session.lang}
        onLeave={() => setSession(null)}
      />
    );
  }

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: 16,
      }}
    >
      <h1>UniVoice</h1>
      <form
        onSubmit={handleJoin}
        style={{ display: "flex", flexDirection: "column", gap: 12, width: 280 }}
      >
        <input
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
        <input
          placeholder="Room name"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          required
        />
        <fieldset style={{ display: "flex", gap: 16, border: "none", padding: 0 }}>
          {LANGUAGES.map((l) => (
            <label key={l.code} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                name="lang"
                value={l.code}
                checked={lang === l.code}
                onChange={() => setLang(l.code)}
              />
              {l.label}
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={joining}>
          {joining ? "Joining..." : "Join room"}
        </button>
        {error && <p style={{ color: "salmon" }}>{error}</p>}
      </form>
    </main>
  );
}
