"""Pure recommendation logic: no I/O, fully unit-tested.

The idea: a film is a good pick for a group when
  1. nobody in the room has seen it — unless everyone who saw it is happy to rewatch,
  2. TMDB recommends it for films people in the room rated highly (seed hits; more members = better),
  3. it is in the genres the group watches most (and the ones picked for tonight),
  4. it is well rated and reasonably popular.
Every score comes with human-readable reasons that the card shows.
"""

from __future__ import annotations

import math
import random
from collections import defaultdict
from dataclasses import dataclass, field


MIN_RUNTIME = 60


@dataclass
class Member:
    user_id: str
    name: str
    library: list[dict]


@dataclass
class Filters:
    genres: list[int] = field(default_factory=list)
    max_runtime: int | None = None
    year_from: int | None = None
    year_to: int | None = None
    include_rewatch: bool = True
    min_votes: int = 150

    @classmethod
    def from_dict(cls, d: dict | None) -> "Filters":
        d = d or {}
        return cls(
            genres=[int(g) for g in d.get("genres") or []],
            max_runtime=d.get("maxRuntime") or None,
            year_from=d.get("yearFrom") or None,
            year_to=d.get("yearTo") or None,
            include_rewatch=bool(d.get("includeRewatch", True)),
        )


@dataclass
class Candidate:
    movie: dict
    seed_hits: list[tuple[str, str, str]] = field(default_factory=list)  # (user_id, member name, seed title)
    rewatch_by: list[str] = field(default_factory=list)
    score: float = 0.0
    reasons: list[str] = field(default_factory=list)


def watched_index(members: list[Member]) -> dict[int, list[tuple[Member, bool]]]:
    idx: dict[int, list[tuple[Member, bool]]] = defaultdict(list)
    for m in members:
        for item in m.library:
            idx[item["movieId"]].append((m, bool(item.get("rewatch"))))
    return idx


def excluded_ids(index: dict[int, list[tuple[Member, bool]]], include_rewatch: bool) -> set[int]:
    """Seen by someone who does not want to rewatch → never suggest."""
    out = set()
    for movie_id, entries in index.items():
        if not include_rewatch or any(not rewatch for _, rewatch in entries):
            out.add(movie_id)
    return out


def rewatchable(index: dict[int, list[tuple[Member, bool]]]) -> dict[int, list[str]]:
    """Seen only by people who marked it 'happy to rewatch' → movieId: [their names]."""
    return {mid: [m.name for m, _ in entries] for mid, entries in index.items() if all(r for _, r in entries)}


def _weight(item: dict) -> float:
    r = item.get("myRating")
    if r is not None:
        return max(0.0, (float(r) - 2.0) / 3.0)  # 2★ or less = no signal, 5★ = 1
    return 0.5


def genre_preferences(members: list[Member]) -> dict[int, float]:
    """Each member counts equally (a 900-film library does not outvote a 20-film one); max = 1."""
    total: dict[int, float] = defaultdict(float)
    for m in members:
        per: dict[int, float] = defaultdict(float)
        for item in m.library:
            for g in item.get("genreIds") or []:
                per[g] += _weight(item)
        top = max(per.values(), default=0)
        for g, v in per.items():
            total[g] += v / top if top else 0
    top = max(total.values(), default=0)
    return {g: v / top for g, v in total.items()} if top else {}


def pick_seeds(members: list[Member], filters: Filters, per_member: int = 4, cap: int = 16) -> list[tuple[Member, dict]]:
    """Films each member loved most — the starting points for 'more like this'."""
    seeds: list[tuple[Member, dict]] = []
    wanted = set(filters.genres)
    for m in members:
        def key(item: dict) -> tuple:
            fits = 1 if wanted and wanted & set(item.get("genreIds") or []) else 0
            mine = item.get("myRating")
            rating = float(mine) if mine is not None else float(item.get("tmdbRating") or 0) / 2
            return (fits, rating, item.get("watchedAt") or item.get("addedAt") or "")

        good = [i for i in m.library if i.get("myRating") is None or float(i["myRating"]) >= 3.5]
        for item in sorted(good, key=key, reverse=True)[:per_member]:
            seeds.append((m, item))
    return seeds[:cap]


def passes_filters(movie: dict, filters: Filters) -> bool:
    if filters.genres and not set(filters.genres) & set(movie.get("genreIds") or []):
        return False
    year = movie.get("year")
    if filters.year_from and (not year or year < filters.year_from):
        return False
    if filters.year_to and (not year or year > filters.year_to):
        return False
    runtime = movie.get("runtime")
    if runtime and runtime < MIN_RUNTIME:
        return False  # shorts, TV specials
    if filters.max_runtime and runtime and runtime > filters.max_runtime:
        return False
    return bool(movie.get("poster"))


def score(c: Candidate, members_count: int, prefs: dict[int, float], filters: Filters, genre_names: dict[int, str]) -> Candidate:
    m = c.movie
    reasons: list[str] = []
    s = 0.0

    hitters = {uid for uid, _, _ in c.seed_hits}
    if hitters:
        s += 2.0 * len(hitters) / max(1, members_count) + 0.25 * min(len(c.seed_hits), 4)
        _, who, seed_title = c.seed_hits[0]
        if len(hitters) > 1:
            reasons.append(f"Пасує до смаків {len(hitters)} учасників")
        reasons.append(f"Схожий на «{seed_title}» (фаворит — {who})")

    genre_ids = m.get("genreIds") or []
    if genre_ids and prefs:
        g_score = sum(prefs.get(g, 0) for g in genre_ids) / len(genre_ids)
        s += 1.5 * g_score
        best = max(genre_ids, key=lambda g: prefs.get(g, 0))
        if prefs.get(best, 0) >= 0.6 and best in genre_names:
            reasons.append(f"Улюблений жанр компанії — {genre_names[best].lower()}")

    if filters.genres and set(filters.genres) & set(genre_ids):
        s += 0.5

    rating = float(m.get("rating") or 0)
    votes = int(m.get("votes") or 0)
    quality = max(-0.5, min(1.0, (rating - 6.0) / 2.5)) * min(1.0, votes / 400)
    s += 1.2 * quality
    if rating >= 7.5 and votes >= 400:
        reasons.append(f"Рейтинг TMDB {rating:.1f}")

    s += 0.6 * min(1.0, math.log10(float(m.get("popularity") or 0) + 1) / 3)

    if c.rewatch_by:
        s += 0.3
        reasons.insert(0, f"{', '.join(c.rewatch_by)} — готові передивитись")

    c.score = s
    c.reasons = reasons[:3]
    return c


def rank(candidates: list[Candidate], rng: random.Random | None = None, jitter: float = 0.25) -> list[Candidate]:
    """Highest score first; a little jitter so two rooms with the same people do not get identical decks."""
    rng = rng or random.Random()
    return sorted(candidates, key=lambda c: c.score + rng.uniform(0, jitter), reverse=True)
