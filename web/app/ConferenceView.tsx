"use client";

import { useState } from "react";
import {
  AudioTrack,
  CarouselLayout,
  DisconnectButton,
  FocusLayout,
  FocusLayoutContainer,
  GridLayout,
  LayoutContextProvider,
  ParticipantTile,
  StartAudio,
  TrackToggle,
  useChat,
  useDataChannel,
  useLocalParticipant,
  useParticipantAttribute,
  useParticipants,
  usePinnedTracks,
  useTrackVolume,
  useTracks,
} from "@livekit/components-react";
import {
  LANGUAGES,
  parseParticipantMetadata,
  parseTranslatedTrackMetadata,
  type LanguageCode,
} from "@univoice/config";
import { ParticipantKind, Track, type Participant, type TrackPublication } from "livekit-client";
import type { TrackReference, TrackReferenceOrPlaceholder } from "@livekit/components-core";

interface ConferenceViewProps {
  myLang: LanguageCode;
  roomName: string;
}

type PanelKind = "none" | "people" | "chat" | "more";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "👏", "🎉"];

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
  const participants = useParticipants();
  const [panel, setPanel] = useState<PanelKind>("none");
  const [viewMode, setViewMode] = useState<"grid" | "speaker">("grid");
  const [reactions, setReactions] = useState<{ id: number; emoji: string }[]>([]);
  const [recordNotice, setRecordNotice] = useState(false);
  const [seenChatCount, setSeenChatCount] = useState(0);
  const chat = useChat();

  const videoTracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]).filter((trackRef) => trackRef.participant.kind !== ParticipantKind.AGENT);

  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });

  const audibleTracks = audioTracks.filter((trackRef) =>
    shouldPlay(trackRef, myLang, localParticipant.identity),
  );

  // One row per real person's own mic (excludes agent-published translation
  // tracks) — the People panel's live level meter per name lets you see
  // whether a mic is actually capturing sound, independent of whether you
  // can hear anything play back.
  const rosterTracks = audioTracks.filter(
    (trackRef) =>
      trackRef.participant.kind !== ParticipantKind.AGENT &&
      !parseTranslatedTrackMetadata(trackRef.publication.trackName),
  );

  const isHandRaised = useParticipantAttribute("raisedHand", { participant: localParticipant }) === "1";

  function toggleRaiseHand() {
    localParticipant.setAttributes({ raisedHand: isHandRaised ? "0" : "1" });
  }

  function showReaction(emoji: string) {
    const id = Date.now() + Math.random();
    setReactions((r) => [...r, { id, emoji }]);
    setTimeout(() => setReactions((r) => r.filter((x) => x.id !== id)), 2000);
  }

  const { send: sendReaction } = useDataChannel("reaction", (msg) => {
    showReaction(new TextDecoder().decode(msg.payload));
  });

  function sendReactionEmoji(emoji: string) {
    sendReaction(new TextEncoder().encode(emoji), {});
    showReaction(emoji);
    setPanel("none");
  }

  const myLangLabel = LANGUAGES.find((l) => l.code === myLang)?.label ?? myLang;
  const realParticipants = participants.filter((p) => p.kind !== ParticipantKind.AGENT);
  const unreadChatCount = panel === "chat" ? 0 : chat.chatMessages.length - seenChatCount;

  function setPanelAndMarkChatRead(p: PanelKind | ((prev: PanelKind) => PanelKind)) {
    setPanel((prev) => {
      const next = typeof p === "function" ? p(prev) : p;
      if (next === "chat") setSeenChatCount(chat.chatMessages.length);
      return next;
    });
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#000",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <TopRibbon
        roomName={roomName}
        myLangLabel={myLangLabel}
        panel={panel}
        setPanel={setPanelAndMarkChatRead}
        viewMode={viewMode}
        setViewMode={setViewMode}
        isHandRaised={isHandRaised}
        toggleRaiseHand={toggleRaiseHand}
        onRecordClick={() => setRecordNotice(true)}
        peopleCount={realParticipants.length}
        unreadChatCount={unreadChatCount}
      />

      {recordNotice && (
        <Callout onClose={() => setRecordNotice(false)}>
          Recording needs LiveKit's server-side Egress feature wired up to cloud storage (S3/GCS)
          — that's infrastructure we haven't set up yet, not just a code change. Ask to set it up
          if you want this enabled.
        </Callout>
      )}

      {panel === "people" && (
        <SidePanel title={`People (${realParticipants.length})`} onClose={() => setPanel("none")}>
          {rosterTracks.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: "#9a9a9e" }}>No one's mic is published yet.</p>
          )}
          {rosterTracks.map((trackRef) => (
            <ParticipantRow key={trackRef.participant.identity} trackRef={trackRef} myLang={myLang} audioTracks={audioTracks} />
          ))}
        </SidePanel>
      )}

      {panel === "chat" && <ChatPanel chat={chat} onClose={() => setPanel("none")} />}

      {panel === "more" && (
        <SidePanel title="More" onClose={() => setPanel("none")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {REACTION_EMOJIS.map((emoji) => (
              <button key={emoji} onClick={() => sendReactionEmoji(emoji)} style={moreMenuItemStyle}>
                {emoji} Send reaction
              </button>
            ))}
          </div>
        </SidePanel>
      )}

      <ReactionOverlay reactions={reactions} />

      <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
        <LayoutContextProvider>
          {viewMode === "grid" ? (
            <GridLayout tracks={videoTracks}>
              <ParticipantTile />
            </GridLayout>
          ) : (
            <SpeakerView tracks={videoTracks} />
          )}
        </LayoutContextProvider>
      </div>

      {audibleTracks.map((trackRef) => (
        <AudioTrack key={trackRef.publication.trackSid} trackRef={trackRef} />
      ))}
      <StartAudio label="Click to enable audio" className="univoice-start-audio" />
    </div>
  );
}

function SpeakerView({ tracks }: { tracks: TrackReferenceOrPlaceholder[] }) {
  const pinned = usePinnedTracks();
  const focusTrack: TrackReferenceOrPlaceholder | undefined = pinned[0] ?? tracks[0];
  if (!focusTrack) return null;
  const carouselTracks = tracks.filter((t) => t.publication?.trackSid !== focusTrack.publication?.trackSid);

  return (
    <FocusLayoutContainer>
      <CarouselLayout tracks={carouselTracks}>
        <ParticipantTile />
      </CarouselLayout>
      <FocusLayout trackRef={focusTrack} />
    </FocusLayoutContainer>
  );
}

interface TopRibbonProps {
  roomName: string;
  myLangLabel: string;
  panel: PanelKind;
  setPanel: (p: PanelKind | ((prev: PanelKind) => PanelKind)) => void;
  viewMode: "grid" | "speaker";
  setViewMode: (v: "grid" | "speaker") => void;
  isHandRaised: boolean;
  toggleRaiseHand: () => void;
  onRecordClick: () => void;
  peopleCount: number;
  unreadChatCount: number;
}

function TopRibbon({
  roomName,
  myLangLabel,
  panel,
  setPanel,
  viewMode,
  setViewMode,
  isHandRaised,
  toggleRaiseHand,
  onRecordClick,
  peopleCount,
  unreadChatCount,
}: TopRibbonProps) {
  function togglePanel(p: PanelKind) {
    setPanel((prev) => (prev === p ? "none" : p));
  }

  return (
    <div style={{ background: "#1a1a1a", color: "#fff" }}>
      <div
        style={{
          padding: "4px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 13,
          borderBottom: "1px solid #2a2a2e",
        }}
      >
        <span>{roomName}</span>
        <span>
          Your language: <strong>{myLangLabel}</strong>
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "6px 8px",
          overflowX: "auto",
        }}
      >
        <RibbonButton icon="⏺" label="Record" onClick={onRecordClick} />
        <RibbonButton
          icon="💬"
          label={unreadChatCount > 0 ? `Chat (${unreadChatCount})` : "Chat"}
          active={panel === "chat"}
          onClick={() => togglePanel("chat")}
        />
        <RibbonButton icon="👥" label={`People (${peopleCount})`} active={panel === "people"} onClick={() => togglePanel("people")} />
        <RibbonButton icon="✋" label="Raise" active={isHandRaised} onClick={toggleRaiseHand} />
        <RibbonButton icon="😀" label="React" active={panel === "more"} onClick={() => togglePanel("more")} />
        <RibbonButton
          icon={viewMode === "grid" ? "▦" : "▭"}
          label={viewMode === "grid" ? "Grid view" : "Speaker view"}
          onClick={() => setViewMode(viewMode === "grid" ? "speaker" : "grid")}
        />
        <RibbonButton icon="⋯" label="More" active={panel === "more"} onClick={() => togglePanel("more")} />
        <div style={{ width: 1, height: 28, background: "#3a3a3e", margin: "0 4px" }} />
        <TrackToggle source={Track.Source.Camera} className="univoice-ribbon-toggle" />
        <TrackToggle source={Track.Source.Microphone} className="univoice-ribbon-toggle" />
        <TrackToggle source={Track.Source.ScreenShare} className="univoice-ribbon-toggle" captureOptions={{ audio: false }} />
        <DisconnectButton className="univoice-ribbon-leave">Leave</DisconnectButton>
      </div>
    </div>
  );
}

function RibbonButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        padding: "4px 8px",
        borderRadius: 6,
        border: "none",
        background: active ? "#2563eb" : "transparent",
        color: "#fff",
        fontSize: 11,
        whiteSpace: "nowrap",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      {label}
    </button>
  );
}

function Callout({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 56,
        left: 16,
        right: 16,
        zIndex: 20,
        background: "#2a2a2e",
        color: "#fff",
        borderRadius: 8,
        padding: 12,
        fontSize: 13,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <span style={{ flex: 1 }}>{children}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#9a9a9e", cursor: "pointer" }}>
        ✕
      </button>
    </div>
  );
}

function SidePanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 56,
        right: 16,
        width: 280,
        maxHeight: "70%",
        overflowY: "auto",
        background: "#1a1a1a",
        color: "#fff",
        borderRadius: 8,
        padding: 12,
        zIndex: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>{title}</strong>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#9a9a9e", cursor: "pointer" }}>
          ✕
        </button>
      </div>
      {children}
    </div>
  );
}

interface ChatHandle {
  chatMessages: ReturnType<typeof useChat>["chatMessages"];
  send: ReturnType<typeof useChat>["send"];
  isSending: boolean;
}

function ChatPanel({ chat, onClose }: { chat: ChatHandle; onClose: () => void }) {
  const { chatMessages, send, isSending } = chat;
  const [text, setText] = useState("");

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await send(text.trim());
    setText("");
  }

  return (
    <SidePanel title="Chat" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto", marginBottom: 8 }}>
        {chatMessages.length === 0 && (
          <p style={{ margin: 0, fontSize: 13, color: "#9a9a9e" }}>No messages yet.</p>
        )}
        {chatMessages.map((m) => (
          <div key={m.id} style={{ fontSize: 13 }}>
            <strong>{m.from?.name || m.from?.identity || "Someone"}:</strong> {m.message}
          </div>
        ))}
      </div>
      <form onSubmit={handleSend} style={{ display: "flex", gap: 6 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message"
          style={{ flex: 1, padding: 8, borderRadius: 6, border: "1px solid #3a3a3e", background: "#2a2a2e", color: "#fff", fontSize: 13 }}
        />
        <button
          type="submit"
          disabled={isSending}
          style={{ padding: "8px 12px", borderRadius: 6, border: "none", background: "#2563eb", color: "#fff", cursor: "pointer" }}
        >
          Send
        </button>
      </form>
    </SidePanel>
  );
}

function ReactionOverlay({ reactions }: { reactions: { id: number; emoji: string }[] }) {
  return (
    <div style={{ position: "absolute", bottom: 70, right: 16, zIndex: 15, pointerEvents: "none" }}>
      {reactions.map((r) => (
        <div key={r.id} style={{ fontSize: 28, animation: "univoice-float-up 2s ease-out forwards" }}>
          {r.emoji}
        </div>
      ))}
    </div>
  );
}

interface ParticipantRowProps {
  trackRef: TrackReference;
  myLang: LanguageCode;
  audioTracks: TrackReference[];
}

function ParticipantRow({ trackRef, myLang, audioTracks }: ParticipantRowProps) {
  const volume = useTrackVolume(trackRef);
  const meta = parseParticipantMetadata(trackRef.participant.metadata);
  const name = meta?.displayName ?? trackRef.participant.identity;
  const langLabel = meta ? LANGUAGES.find((l) => l.code === meta.lang)?.label ?? meta.lang : "?";
  const muted = trackRef.publication.isMuted;
  const handRaised = useParticipantAttribute("raisedHand", { participant: trackRef.participant as Participant }) === "1";

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
          {muted ? "\u{1F507}" : "\u{1F3A4}"} {handRaised ? "✋ " : ""}
          {name} <span style={{ color: "#9a9a9e" }}>· {langLabel}</span>
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

const moreMenuItemStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderRadius: 6,
  border: "none",
  background: "#2a2a2e",
  color: "#fff",
  fontSize: 13,
  cursor: "pointer",
};

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
