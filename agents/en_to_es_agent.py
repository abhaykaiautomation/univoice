"""Translator agent: subscribes to English speech, publishes Spanish-tagged
translation tracks. Phase 3: passthrough only (see common/translator_agent.py)."""

import logging

from dotenv import load_dotenv
from livekit.agents import WorkerOptions, cli

from common.languages import translator_agent_name
from common.translator_agent import create_entrypoint

load_dotenv()
logging.basicConfig(level=logging.INFO)

SOURCE_LANG = "en"
TARGET_LANG = "es"

if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=create_entrypoint(SOURCE_LANG, TARGET_LANG),
            agent_name=translator_agent_name(SOURCE_LANG, TARGET_LANG),
        )
    )
