"""Shared translator agent core, parameterized by (source_lang, target_lang).
en_to_es and es_to_en are both thin launchers around create_entrypoint().

Concurrency model — the core efficiency property of this architecture:
  - The agent stays subscribed to every source-language participant's
    microphone track for as long as they're in the room. That's just
    bandwidth; it's cheap and lets us react instantly when they start
    talking.
  - A per-speaker "session" — the forwarding loop, the published
    translation track, and (from Phase 4 on) the paid TranslationProvider
    connection — only exists while that speaker is in the room's
    active-speaker set. So cost scales with how many people are
    concurrently *talking*, not with how many people are in the room.
  - A grace period (STOP_GRACE_SECONDS) on the "stop" side absorbs natural
    pauses — between words, breaths, even between sentences — so a session
    isn't torn down and reconnected (full WebSocket handshake to the
    TranslationProvider) every time the speaker pauses. LiveKit's
    active_speakers_changed is a noisy, sub-second signal that toggles
    on/off even mid-utterance, so this needs real headroom or every pause
    becomes a visible latency spike.
  - start_session() claims `identity` synchronously (the `starting` set)
    before doing anything async. Without that, two active_speakers_changed
    events arriving close together (which happens routinely, since the
    signal flaps) would both see "no session yet" and both proceed to open
    a second, redundant TranslationProvider connection and published track
    for the same speaker.

Phase 4: each session's forward() loop pushes the source speaker's audio
into a TranslationProvider session (e.g. OpenAIRealtimeTranslateProvider)
and streams the translated audio it returns onto the published track. The
provider is injected by the caller (en_to_es_agent.py / es_to_en_agent.py)
based on the TRANSLATION_PROVIDER env var — this module never imports a
vendor SDK directly. Audio runs at 24kHz PCM16 mono throughout this
pipeline because that's what OpenAI's realtime-translation endpoint
requires; using the same rate end-to-end avoids any resampling.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from dataclasses import dataclass

from livekit import rtc
from livekit.agents import AutoSubscribe, JobContext

from .languages import LanguageCode
from .participant_metadata import parse_participant_metadata
from .track_metadata import TranslatedTrackMetadata
from translation.provider import TranslationProvider, TranslationSession

SAMPLE_RATE = 24_000
NUM_CHANNELS = 1
STOP_GRACE_SECONDS = 5.0


@dataclass
class SpeakerSession:
    identity: str
    audio_stream: rtc.AudioStream
    audio_source: rtc.AudioSource
    local_track: rtc.LocalAudioTrack
    publication: rtc.LocalTrackPublication
    translation_session: TranslationSession
    forward_task: "asyncio.Task[None]"
    stop_task: "asyncio.Task[None] | None" = None


def create_entrypoint(source_lang: LanguageCode, target_lang: LanguageCode, provider: TranslationProvider):
    logger = logging.getLogger(f"translator.{source_lang}_to_{target_lang}")

    async def entrypoint(ctx: JobContext) -> None:
        await ctx.connect(auto_subscribe=AutoSubscribe.SUBSCRIBE_NONE)
        room = ctx.room
        logger.info("connected to room %s as %s", room.name, room.local_participant.identity)

        # identity -> subscribed RemoteAudioTrack, for every participant
        # currently speaking `source_lang`.
        source_tracks: dict[str, rtc.RemoteAudioTrack] = {}
        sessions: dict[str, SpeakerSession] = {}
        # Identities with a start_session() call in flight (claimed
        # synchronously, before any await) — see module docstring.
        starting: set[str] = set()
        # Mirrors the most recent active_speakers_changed event. Needed
        # because track subscription is negotiated asynchronously: a
        # participant can show up as an active speaker before their mic
        # track finishes subscribing, so track_subscribed re-checks this set.
        active_ids: set[str] = set()

        def is_source_lang(participant: rtc.Participant) -> bool:
            meta = parse_participant_metadata(participant.metadata)
            return meta is not None and meta.lang == source_lang

        def mic_publication(participant: rtc.Participant) -> "rtc.RemoteTrackPublication | None":
            for pub in participant.track_publications.values():
                if pub.source == rtc.TrackSource.SOURCE_MICROPHONE:
                    return pub
            return None

        def maybe_subscribe(participant: rtc.RemoteParticipant) -> None:
            if not is_source_lang(participant):
                return
            pub = mic_publication(participant)
            logger.debug("maybe_subscribe %s metadata=%r mic_pub=%s", participant.identity, participant.metadata, pub)
            if pub is not None and not pub.subscribed:
                pub.set_subscribed(True)

        async def start_session(identity: str) -> None:
            existing = sessions.get(identity)
            if existing is not None:
                if existing.stop_task is not None:
                    existing.stop_task.cancel()
                    existing.stop_task = None
                return

            if identity in starting:
                return

            track = source_tracks.get(identity)
            if track is None:
                return

            starting.add(identity)
            try:
                audio_stream = rtc.AudioStream(track, sample_rate=SAMPLE_RATE, num_channels=NUM_CHANNELS)
                audio_source = rtc.AudioSource(SAMPLE_RATE, NUM_CHANNELS)
                track_name = TranslatedTrackMetadata(source_identity=identity, target_lang=target_lang).encode()
                local_track = rtc.LocalAudioTrack.create_audio_track(track_name, audio_source)
                publication = await room.local_participant.publish_track(
                    local_track,
                    rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE),
                )

                async def on_audio(pcm: bytes) -> None:
                    samples_per_channel = len(pcm) // 2 // NUM_CHANNELS
                    if samples_per_channel == 0:
                        return
                    frame = rtc.AudioFrame(pcm, SAMPLE_RATE, NUM_CHANNELS, samples_per_channel)
                    await audio_source.capture_frame(frame)

                async def on_transcript(text: str, is_final: bool) -> None:
                    logger.debug("transcript [%s]: %s", identity, text)

                translation_session = await provider.start_session(source_lang, target_lang, on_audio, on_transcript)

                async def forward() -> None:
                    try:
                        async for event in audio_stream:
                            await translation_session.push_audio(bytes(event.frame.data))
                    except asyncio.CancelledError:
                        pass

                sessions[identity] = SpeakerSession(
                    identity=identity,
                    audio_stream=audio_stream,
                    audio_source=audio_source,
                    local_track=local_track,
                    publication=publication,
                    translation_session=translation_session,
                    forward_task=asyncio.create_task(forward()),
                )
                logger.info("started session for %s (%s -> %s)", identity, source_lang, target_lang)
            except Exception:
                logger.exception("error starting session for %s", identity)
            finally:
                starting.discard(identity)

            # The speaker may have disconnected (or stopped being relevant)
            # while we were busy connecting — clean up rather than leave a
            # dangling session for someone no longer in the room.
            if identity not in active_ids and identity in sessions:
                schedule_stop(identity)

        async def stop_session(identity: str) -> None:
            starting.discard(identity)
            session = sessions.pop(identity, None)
            if session is None:
                return
            try:
                if session.stop_task is not None and session.stop_task is not asyncio.current_task():
                    session.stop_task.cancel()
                session.forward_task.cancel()
                # Wait for the forward loop to actually unwind before closing
                # the stream it's reading from — closing out from under it
                # can otherwise hang.
                with contextlib.suppress(asyncio.CancelledError):
                    await session.forward_task
                await session.audio_stream.aclose()
                await session.translation_session.aclose()
                await room.local_participant.unpublish_track(session.publication.sid)
                await session.audio_source.aclose()
                logger.info("stopped session for %s", identity)
            except Exception:
                logger.exception("error stopping session for %s", identity)

        async def stop_session_after_grace(identity: str) -> None:
            try:
                await asyncio.sleep(STOP_GRACE_SECONDS)
            except asyncio.CancelledError:
                return
            logger.debug("grace period elapsed for %s, stopping", identity)
            await stop_session(identity)

        def schedule_stop(identity: str) -> None:
            session = sessions.get(identity)
            if session is None or session.stop_task is not None:
                return
            session.stop_task = asyncio.create_task(stop_session_after_grace(identity))

        @room.on("track_published")
        def _on_track_published(publication, participant):
            # A source-lang participant's mic can be published after they've
            # already connected (or after a metadata update) — re-check here
            # rather than relying solely on participant_connected.
            maybe_subscribe(participant)

        @room.on("track_subscribed")
        def _on_track_subscribed(track, publication, participant):
            logger.debug("track_subscribed %s source=%s", participant.identity, publication.source)
            if isinstance(track, rtc.RemoteAudioTrack) and publication.source == rtc.TrackSource.SOURCE_MICROPHONE:
                source_tracks[participant.identity] = track
                if participant.identity in active_ids:
                    asyncio.create_task(start_session(participant.identity))

        @room.on("track_unsubscribed")
        def _on_track_unsubscribed(track, publication, participant):
            source_tracks.pop(participant.identity, None)

        @room.on("participant_connected")
        def _on_participant_connected(participant: rtc.RemoteParticipant):
            maybe_subscribe(participant)

        @room.on("participant_metadata_changed")
        def _on_participant_metadata_changed(participant, old_metadata, new_metadata):
            maybe_subscribe(participant)

        @room.on("participant_disconnected")
        def _on_participant_disconnected(participant: rtc.RemoteParticipant):
            asyncio.create_task(stop_session(participant.identity))

        @room.on("active_speakers_changed")
        def _on_active_speakers_changed(speakers: list[rtc.Participant]):
            logger.debug("active speakers: %s", [p.identity for p in speakers])
            active_ids.clear()
            active_ids.update(p.identity for p in speakers if is_source_lang(p))
            for identity in active_ids:
                asyncio.create_task(start_session(identity))
            for identity in list(sessions.keys()):
                if identity not in active_ids:
                    schedule_stop(identity)

        # Pick up anyone already in the room when we join.
        for participant in room.remote_participants.values():
            maybe_subscribe(participant)

    return entrypoint
