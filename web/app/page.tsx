"use client";

import { useState, type CSSProperties } from "react";
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
      }}
    >
      <div
        style={{
          width: 360,
          background: "#1c1c1e",
          borderRadius: 16,
          padding: 32,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
            }}
          >
            🎥
          </div>
          <h1 style={{ margin: "8px 0 0", fontSize: 22 }}>UniVoice</h1>
          <p style={{ margin: 0, fontSize: 13, color: "#9a9a9e" }}>
            Real-time translated video calls
          </p>
        </div>

        <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input
            placeholder="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            style={inputStyle}
          />
          <input
            placeholder="Room name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            required
            style={inputStyle}
          />

          <div style={{ display: "flex", gap: 8 }}>
            {LANGUAGES.map((l) => {
              const selected = lang === l.code;
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLang(l.code)}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: 8,
                    border: selected ? "1px solid #2563eb" : "1px solid #3a3a3e",
                    background: selected ? "#2563eb" : "#2a2a2e",
                    color: "#fff",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  {l.label}
                </button>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={joining}
            style={{
              padding: "12px 0",
              borderRadius: 8,
              border: "none",
              background: joining ? "#3a3a3e" : "#2563eb",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              cursor: joining ? "default" : "pointer",
            }}
          >
            {joining ? "Joining..." : "Join room"}
          </button>
          {error && (
            <p style={{ margin: 0, fontSize: 13, color: "#f87171", textAlign: "center" }}>
              {error}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}

const inputStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #3a3a3e",
  background: "#2a2a2e",
  color: "#fff",
  fontSize: 14,
};
