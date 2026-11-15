"""Settings from the environment. One place, read once."""

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    table_name: str
    tmdb_token_param: str
    tmdb_token: str
    dev_auth: bool


@lru_cache
def settings() -> Settings:
    return Settings(
        table_name=os.environ.get("TABLE_NAME", "movie-night"),
        tmdb_token_param=os.environ.get("TMDB_TOKEN_PARAM", ""),
        tmdb_token=os.environ.get("TMDB_TOKEN", ""),
        # Local development only: trust an X-Dev-User header instead of API Gateway claims.
        dev_auth=os.environ.get("DEV_AUTH") == "1",
    )
