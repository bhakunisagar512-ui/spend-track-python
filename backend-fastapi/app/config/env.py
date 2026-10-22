import os
from pathlib import Path

from dotenv import load_dotenv


def load_env():
    # Same as require('dotenv').config(): read ./.env from the working directory,
    # never overriding variables already set in the environment
    load_dotenv(Path(os.getcwd()) / ".env", override=False)


load_env()
