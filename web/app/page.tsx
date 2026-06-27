"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { DEFAULT_LANGUAGE, LANGUAGES, type LanguageCode } from "@univoice/config";
import { RoomView } from "./RoomView";

interface SessionInfo {
  token: string;
  serverUrl: string;
  roomName: string;
  displayName: string;
  lang: LanguageCode;
}

type Mode = "home" | "create" | "join" | "details";

function randomMeetingId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export default function Home() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [mode, setMode] = useState<Mode>("home");
  const [roomName, setRoomName] = useState("");
  const [joinIdInput, setJoinIdInput] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [lang, setLang] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);

  // Opening a shared meeting link (?room=<id>) goes straight to the join
  // details step instead of the home page.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setRoomName(room);
      setMode("details");
    }
  }, []);

  function handleCreateLink() {
    setRoomName(randomMeetingId());
    setCopied(false);
    setMode("create");
  }

  function handleJoinWithId() {
    if (!joinIdInput.trim()) return;
    setRoomName(joinIdInput.trim());
    setMode("details");
  }

  async function handleCopyLink() {
    const link = `${window.location.origin}/?room=${roomName}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  function goHome() {
    setMode("home");
    setRoomName("");
    setJoinIdInput("");
    setError(null);
  }

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
        roomName={session.roomName}
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
          width: 380,
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

        {mode === "home" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={handleCreateLink} style={primaryCardStyle}>
              🔗 Create a meeting link
            </button>
            <button onClick={() => setMode("join")} style={secondaryCardStyle}>
              # Join with a meeting ID
            </button>
          </div>
        )}

        {mode === "create" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#9a9a9e" }}>
              Share this link with the other person — opening it takes them straight to joining
              this meeting.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input readOnly value={`${typeof window !== "undefined" ? window.location.origin : ""}/?room=${roomName}`} style={{ ...inputStyle, flex: 1 }} />
              <button onClick={handleCopyLink} style={{ ...smallButtonStyle, width: 72 }}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button onClick={() => setMode("details")} style={primaryButtonStyle}>
              Continue
            </button>
            <button onClick={goHome} style={linkButtonStyle}>
              ← Back
            </button>
          </div>
        )}

        {mode === "join" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input
              placeholder="Meeting ID"
              value={joinIdInput}
              onChange={(e) => setJoinIdInput(e.target.value)}
              style={inputStyle}
              autoFocus
            />
            <button onClick={handleJoinWithId} disabled={!joinIdInput.trim()} style={primaryButtonStyle}>
              Continue
            </button>
            <button onClick={goHome} style={linkButtonStyle}>
              ← Back
            </button>
          </div>
        )}

        {mode === "details" && (
          <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: "#2a2a2e",
                fontSize: 13,
                color: "#9a9a9e",
              }}
            >
              Meeting ID: <strong style={{ color: "#fff" }}>{roomName}</strong>
            </div>
            <input
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              style={inputStyle}
              autoFocus
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

            <button type="submit" disabled={joining} style={primaryButtonStyle}>
              {joining ? "Joining..." : "Join room"}
            </button>
            {error && (
              <p style={{ margin: 0, fontSize: 13, color: "#f87171", textAlign: "center" }}>
                {error}
              </p>
            )}
            <button type="button" onClick={goHome} style={linkButtonStyle}>
              ← Back
            </button>
          </form>
        )}
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

const primaryButtonStyle: CSSProperties = {
  padding: "12px 0",
  borderRadius: 8,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};

const smallButtonStyle: CSSProperties = {
  padding: "10px 0",
  borderRadius: 8,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const primaryCardStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 10,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  fontSize: 15,
  fontWeight: 600,
  textAlign: "left",
  cursor: "pointer",
};

const secondaryCardStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 10,
  border: "1px solid #3a3a3e",
  background: "#2a2a2e",
  color: "#fff",
  fontSize: 15,
  fontWeight: 600,
  textAlign: "left",
  cursor: "pointer",
};

const linkButtonStyle: CSSProperties = {
  padding: 0,
  border: "none",
  background: "none",
  color: "#9a9a9e",
  fontSize: 13,
  cursor: "pointer",
  textAlign: "left",
};
