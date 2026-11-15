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
