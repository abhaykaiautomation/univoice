"""Translator agent: subscribes to English speech, publishes Spanish-tagged
translation tracks via the TranslationProvider selected by TRANSLATION_PROVIDER
(see common/translator_agent.py and translation/factory.py)."""

import logging

from dotenv import load_dotenv
from livekit.agents import WorkerOptions, cli

from common.languages import translator_agent_name
from common.translator_agent import create_entrypoint
from translation.factory import get_provider

load_dotenv()
logging.basicConfig(level=logging.INFO)

SOURCE_LANG = "en"
TARGET_LANG = "es"

if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=create_entrypoint(SOURCE_LANG, TARGET_LANG, get_provider()),
            agent_name=translator_agent_name(SOURCE_LANG, TARGET_LANG),
        )
    )
