"""Pure room rules: who voted, what matched, what the results are. No I/O."""

from __future__ import annotations

import random

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L: easy to read aloud and type
CODE_LENGTH = 5
MAX_MEMBERS = 12


def new_code(rng: random.Random | None = None) -> str:
    rng = rng or random.SystemRandom()
    return "".join(rng.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def normalize_code(code: str) -> str:
    return code.strip().upper()


def tally(deck_ids: list[int], members: list[dict]) -> dict[int, dict[str, list[str]]]:
    """movieId → {'likes': [userIds], 'dislikes': [userIds]} for the current deck."""
    out = {mid: {"likes": [], "dislikes": []} for mid in deck_ids}
    for m in members:
        for mid_str, like in (m.get("votes") or {}).items():
            mid = int(mid_str)
            if mid in out:
                out[mid]["likes" if like else "dislikes"].append(m["userId"])
    return out


def matches(deck_ids: list[int], members: list[dict]) -> list[int]:
    """Films every member in the room liked — in deck order."""
    if not members:
        return []
    t = tally(deck_ids, members)
    everyone = {m["userId"] for m in members}
    return [mid for mid in deck_ids if set(t[mid]["likes"]) >= everyone]


def results(deck: list[dict], members: list[dict]) -> list[dict]:
    """Films liked by at least one person: most likes first, then TMDB rating."""
    t = tally([c["id"] for c in deck], members)
    rows = [
        {"movieId": c["id"], "likes": t[c["id"]]["likes"], "dislikes": t[c["id"]]["dislikes"], "rating": c.get("rating") or 0}
        for c in deck
        if t[c["id"]]["likes"]
    ]
    rows.sort(key=lambda r: (len(r["likes"]), -len(r["dislikes"]), r["rating"]), reverse=True)
    return rows


def progress(deck_ids: list[int], member: dict) -> int:
    votes = member.get("votes") or {}
    ids = {str(i) for i in deck_ids}
    return sum(1 for k in votes if k in ids)


def everyone_done(deck_ids: list[int], members: list[dict]) -> bool:
    return bool(members) and all(progress(deck_ids, m) >= len(deck_ids) for m in members)


# ── Everyone's mood for tonight ──────────────────────────────────────────────
# Each member picks up to 3 genres, a max runtime and an era. The room combines them:
# genres stay per person (the deck prefers films that cover *everyone's* picks),
# the strictest runtime wins, and eras are a union (any picked era is fine).

MAX_GENRES = 3
ERAS: dict[str, tuple[int | None, int | None]] = {
    "classic": (None, 1989),
    "modern": (1990, 2009),
    "new": (2010, None),
}


def clean_prefs(raw: dict | None) -> dict:
    """Validates one member's picks. Raises ValueError with a user-facing message."""
    raw = raw or {}
    genres = list(dict.fromkeys(int(g) for g in (raw.get("genres") or [])))
    if len(genres) > MAX_GENRES:
        raise ValueError(f"Можна обрати до {MAX_GENRES} жанрів")
    max_runtime = raw.get("maxRuntime")
    if max_runtime is not None:
        max_runtime = int(max_runtime)
        if not 60 <= max_runtime <= 400:
            raise ValueError("Тривалість — від 60 до 400 хвилин")
    era = raw.get("era") or None
    if era is not None and era not in ERAS:
        raise ValueError("Невідома епоха")
    return {"genres": genres, "maxRuntime": max_runtime, "era": era}


def combine(members: list[dict], include_rewatch: bool = True) -> dict:
    """All members' prefs → the filters the deck is built with (and the summary the lobby shows)."""
    prefs = [m.get("prefs") or {} for m in members]
    picks = [list(p["genres"]) for p in prefs if p.get("genres")]
    runtimes = [int(p["maxRuntime"]) for p in prefs if p.get("maxRuntime")]
    eras = [p["era"] for p in prefs if p.get("era") in ERAS]
    return {
        "genrePicks": picks,
        "maxRuntime": min(runtimes) if runtimes else None,
        "eras": sorted(set(eras), key=list(ERAS).index),
        "yearRanges": [list(ERAS[e]) for e in eras],
        "includeRewatch": include_rewatch,
    }
