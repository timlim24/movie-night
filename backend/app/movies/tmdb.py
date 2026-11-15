"""TMDB adapter. The only file that knows TMDB's URLs and JSON shape.

Lambda containers are reused between invocations, so the HTTP client (connection pool),
the genre list and movie details are cached at module level.
"""

from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from typing import Any, Callable, Iterable, TypeVar

import httpx

from app.shared.config import settings
from app.shared.errors import NotFound, UpstreamError

BASE = "https://api.themoviedb.org/3"
IMG = "https://image.tmdb.org/t/p"
LANG = "uk-UA"

T = TypeVar("T")
R = TypeVar("R")

_details_cache: dict[int, dict] = {}
_cache_lock = threading.Lock()
_MAX_CACHE = 2000


@lru_cache
def _token() -> str:
    s = settings()
    if s.tmdb_token:
        return s.tmdb_token
    import boto3

    resp = boto3.client("ssm").get_parameter(Name=s.tmdb_token_param, WithDecryption=True)
    return resp["Parameter"]["Value"]


@lru_cache
def _client() -> httpx.Client:
    return httpx.Client(
        base_url=BASE,
        headers={"Authorization": f"Bearer {_token()}", "Accept": "application/json"},
        timeout=httpx.Timeout(6.0, connect=3.0),
        limits=httpx.Limits(max_connections=32, max_keepalive_connections=32),
    )


def _get(path: str, **params: Any) -> dict:
    params = {k: v for k, v in params.items() if v is not None and v != ""}
    params.setdefault("language", LANG)
    for attempt in range(2):
        try:
            r = _client().get(path, params=params)
        except httpx.HTTPError as e:
            if attempt == 1:
                raise UpstreamError(f"TMDB unavailable: {e.__class__.__name__}") from e
            continue
        if r.status_code == 404:
            raise NotFound("movie not found")
        if r.status_code == 429 or r.status_code >= 500:
            if attempt == 1:
                raise UpstreamError(f"TMDB error {r.status_code}")
            continue
        r.raise_for_status()
        return r.json()
    raise UpstreamError("TMDB unavailable")


def parallel(fn: Callable[[T], R], items: Iterable[T], workers: int = 16) -> list[R | None]:
    """Run fn over items concurrently; a failed item becomes None instead of failing the batch."""

    def safe(x: T) -> R | None:
        try:
            return fn(x)
        except Exception:
            return None

    items = list(items)
    if not items:
        return []
    with ThreadPoolExecutor(max_workers=min(workers, len(items))) as pool:
        return list(pool.map(safe, items))


def _img(path: str | None, size: str) -> str | None:
    return f"{IMG}/{size}{path}" if path else None


def _year(date: str | None) -> int | None:
    return int(date[:4]) if date and len(date) >= 4 and date[:4].isdigit() else None


@lru_cache
def genres() -> dict[int, str]:
    data = _get("/genre/movie/list")
    return {g["id"]: g["name"].capitalize() for g in data.get("genres", [])}


def summary(raw: dict) -> dict:
    """List/search result → the short card the app uses everywhere."""
    gmap = genres()
    genre_ids = raw.get("genre_ids") or [g["id"] for g in raw.get("genres", [])]
    return {
        "id": raw["id"],
        "title": raw.get("title") or raw.get("original_title") or "",
        "originalTitle": raw.get("original_title") or "",
        "year": _year(raw.get("release_date")),
        "genreIds": genre_ids,
        "genres": [gmap[g] for g in genre_ids if g in gmap],
        "rating": round(float(raw.get("vote_average") or 0), 1),
        "votes": int(raw.get("vote_count") or 0),
        "popularity": round(float(raw.get("popularity") or 0), 1),
        "poster": _img(raw.get("poster_path"), "w500"),
        "backdrop": _img(raw.get("backdrop_path"), "w780"),
        "overview": raw.get("overview") or "",
    }


def details(movie_id: int) -> dict:
    """Full card: summary + runtime, tagline, director, top cast."""
    with _cache_lock:
        if movie_id in _details_cache:
            return _details_cache[movie_id]

    raw = _get(f"/movie/{movie_id}", append_to_response="credits")
    card = summary(raw)
    if not card["overview"]:
        en = _get(f"/movie/{movie_id}", language="en-US")
        card["overview"] = en.get("overview") or ""
    credits = raw.get("credits") or {}
    card.update(
        {
            "runtime": raw.get("runtime") or None,
            "tagline": raw.get("tagline") or "",
            "director": next((c["name"] for c in credits.get("crew", []) if c.get("job") == "Director"), None),
            "cast": [c["name"] for c in sorted(credits.get("cast", []), key=lambda c: c.get("order", 99))[:6]],
        }
    )
    with _cache_lock:
        if len(_details_cache) >= _MAX_CACHE:
            _details_cache.clear()
        _details_cache[movie_id] = card
    return card


def search(query: str, year: int | None = None, page: int = 1) -> list[dict]:
    data = _get("/search/movie", query=query, primary_release_year=year, page=page, include_adult="false")
    return [summary(r) for r in data.get("results", [])]


def recommendations(movie_id: int) -> list[dict]:
    data = _get(f"/movie/{movie_id}/recommendations", page=1)
    return [summary(r) for r in data.get("results", [])]


def discover(**params: Any) -> list[dict]:
    params.setdefault("include_adult", "false")
    data = _get("/discover/movie", **params)
    return [summary(r) for r in data.get("results", [])]
