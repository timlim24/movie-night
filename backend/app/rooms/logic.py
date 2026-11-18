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
    """Films every member in the room liked — in deck order.

    Alone in a room there are no matches: every like would "match", which only interrupts swiping.
    """
    if len(members) < 2:
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
# Approval + veto, the usual way to make a group decision without one person steamrolling the rest:
#   • "хочу"   — up to 3 genres a member would enjoy;
#   • "точно ні" — up to 3 genres a member refuses. One veto removes the genre for the whole room,
#     even from someone else's "хочу" (two friends who want opposite things then meet in the middle);
#   • runtime — the strictest wins;
#   • eras    — each member ticks the eras they are fine with; the room takes the overlap. If there is
#     no overlap at all we fall back to everything picked and say so in the lobby.

MAX_GENRES = 3
MAX_VETO = 3
ERAS: dict[str, tuple[int | None, int | None]] = {
    "classic": (None, 1989),
    "modern": (1990, 2009),
    "new": (2010, None),
}
MAX_PROPOSALS = 3


def clean_prefs(raw: dict | None) -> dict:
    """Validates one member's picks. Raises ValueError with a user-facing message."""
    raw = raw or {}
    genres = list(dict.fromkeys(int(g) for g in (raw.get("genres") or [])))
    veto = [g for g in dict.fromkeys(int(g) for g in (raw.get("veto") or [])) if g not in genres]
    if len(genres) > MAX_GENRES:
        raise ValueError(f"Можна обрати до {MAX_GENRES} жанрів")
    if len(veto) > MAX_VETO:
        raise ValueError(f"Відмовитись можна максимум від {MAX_VETO} жанрів")
    max_runtime = raw.get("maxRuntime")
    if max_runtime is not None:
        max_runtime = int(max_runtime)
        if not 60 <= max_runtime <= 400:
            raise ValueError("Тривалість — від 60 до 400 хвилин")
    eras = list(raw.get("eras") or ([raw["era"]] if raw.get("era") else []))
    if any(e not in ERAS for e in eras):
        raise ValueError("Невідома епоха")
    eras = [e for e in ERAS if e in eras]
    return {"genres": genres, "veto": veto, "maxRuntime": max_runtime, "eras": eras}


def _eras_of(prefs: dict) -> list[str]:
    return list(prefs.get("eras") or ([prefs["era"]] if prefs.get("era") else []))


def combine(members: list[dict], include_rewatch: bool = True) -> dict:
    """All members' prefs → the filters the deck is built with (and the summary the lobby shows)."""
    prefs = [m.get("prefs") or {} for m in members]
    vetoed = sorted({int(g) for p in prefs for g in p.get("veto") or []})
    picks = [[g for g in p["genres"] if g not in vetoed] for p in prefs if p.get("genres")]
    picks = [p for p in picks if p]  # a pick fully vetoed by others no longer constrains anything
    runtimes = [int(p["maxRuntime"]) for p in prefs if p.get("maxRuntime")]

    era_sets = [set(_eras_of(p)) & set(ERAS) for p in prefs]
    era_sets = [e for e in era_sets if e]
    agreed = set.intersection(*era_sets) if era_sets else set()
    conflict = bool(era_sets) and not agreed
    eras = [e for e in ERAS if e in (set.union(*era_sets) if conflict else agreed)]
    return {
        "genrePicks": picks,
        "vetoed": vetoed,
        "maxRuntime": min(runtimes) if runtimes else None,
        "eras": eras,
        "erasConflict": conflict,
        "yearRanges": [list(ERAS[e]) for e in eras],
        "includeRewatch": include_rewatch,
    }


def add_proposal(proposals: list[dict], card: dict, seen: set[int]) -> list[dict]:
    """A member suggests their own film for the next deck. Raises ValueError with a user-facing message."""
    if any(p["id"] == card["id"] for p in proposals):
        return proposals
    if card["id"] in seen:
        raise ValueError("Цей фільм уже був у колоді цієї кімнати")
    if len(proposals) >= MAX_PROPOSALS:
        raise ValueError(f"Можна запропонувати до {MAX_PROPOSALS} фільмів — прибери один")
    return [*proposals, {k: card.get(k) for k in ("id", "title", "year", "poster")}]


def pinned(members: list[dict], seen: set[int]) -> list[dict]:
    """Members' proposals → [{id, by: [names]}] for the deck, skipping films already shown in this room."""
    out: dict[int, list[str]] = {}
    for m in members:
        for p in m.get("proposals") or []:
            if p["id"] not in seen:
                out.setdefault(p["id"], []).append(m["name"].split(" ")[0])
    return [{"id": mid, "by": by} for mid, by in out.items()]
