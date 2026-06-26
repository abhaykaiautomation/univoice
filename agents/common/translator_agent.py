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
  - A short grace period (STOP_GRACE_SECONDS) on the "stop" side absorbs
    micro-pauses mid-sentence so a session isn't torn down and recreated
    every time the speaker takes a breath.

Phase 3 note: the forward() loop below is a passthrough — it copies audio
frames unchanged from the subscribed source track onto the published
"translation" track. This proves the subscribe -> agent -> publish ->
client-consume pipeline end to end. Phase 4 replaces the body of forward()
with a TranslationProvider session.
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

SAMPLE_RATE = 48_000
NUM_CHANNELS = 1
STOP_GRACE_SECONDS = 1.5


@dataclass
class SpeakerSession:
    identity: str
    audio_stream: rtc.AudioStream
    audio_source: rtc.AudioSource
    local_track: rtc.LocalAudioTrack
    publication: rtc.LocalTrackPublication
    forward_task: "asyncio.Task[None]"
    stop_task: "asyncio.Task[None] | None" = None


def create_entrypoint(source_lang: LanguageCode, target_lang: LanguageCode):
    logger = logging.getLogger(f"translator.{source_lang}_to_{target_lang}")

    async def entrypoint(ctx: JobContext) -> None:
        await ctx.connect(auto_subscribe=AutoSubscribe.SUBSCRIBE_NONE)
        room = ctx.room
        logger.info("connected to room %s as %s", room.name, room.local_participant.identity)

        # identity -> subscribed RemoteAudioTrack, for every participant
        # currently speaking `source_lang`.
        source_tracks: dict[str, rtc.RemoteAudioTrack] = {}
        sessions: dict[str, SpeakerSession] = {}
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

            track = source_tracks.get(identity)
            if track is None:
                return

            audio_stream = rtc.AudioStream(track, sample_rate=SAMPLE_RATE, num_channels=NUM_CHANNELS)
            audio_source = rtc.AudioSource(SAMPLE_RATE, NUM_CHANNELS)
            track_name = TranslatedTrackMetadata(source_identity=identity, target_lang=target_lang).encode()
            local_track = rtc.LocalAudioTrack.create_audio_track(track_name, audio_source)
            publication = await room.local_participant.publish_track(
                local_track,
                rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE),
            )

            async def forward() -> None:
                try:
                    async for event in audio_stream:
                        await audio_source.capture_frame(event.frame)
                except asyncio.CancelledError:
                    pass

            sessions[identity] = SpeakerSession(
                identity=identity,
                audio_stream=audio_stream,
                audio_source=audio_source,
                local_track=local_track,
                publication=publication,
                forward_task=asyncio.create_task(forward()),
            )
            logger.info("started session for %s (%s -> %s)", identity, source_lang, target_lang)

        async def stop_session(identity: str) -> None:
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
