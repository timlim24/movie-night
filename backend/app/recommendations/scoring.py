"""Pure recommendation logic: no I/O, fully unit-tested.

The idea: a film is a good pick for a group when
  1. nobody in the room has seen it — unless everyone who saw it is happy to rewatch,
  2. TMDB recommends it for films people in the room rated highly (seed hits; more members = better),
  3. it has no genre anybody vetoed, and it covers the genres *every* member wants tonight
     (comedy from Anna + horror from Bohdan → a horror-comedy). Coverage is the primary sort key:
     a film half the room is in the mood for never outranks one the whole room is,
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
    genre_picks: list[list[int]] = field(default_factory=list)  # one list per member who picked genres
    max_runtime: int | None = None
    year_ranges: list[tuple[int | None, int | None]] = field(default_factory=list)  # any of these is fine
    include_rewatch: bool = True
    vetoed: list[int] = field(default_factory=list)  # a film with any of these genres is never suggested
    min_votes: int = 150

    @property
    def genres(self) -> list[int]:
        """Every genre anybody picked."""
        return sorted({g for pick in self.genre_picks for g in pick})

    @classmethod
    def from_dict(cls, d: dict | None) -> "Filters":
        d = d or {}
        picks = [[int(g) for g in p] for p in d.get("genrePicks") or [] if p]
        if not picks and d.get("genres"):  # older rooms: one shared genre list
            picks = [[int(g) for g in d["genres"]]]
        ranges = [(r[0], r[1]) for r in d.get("yearRanges") or []]
        if not ranges and (d.get("yearFrom") or d.get("yearTo")):
            ranges = [(d.get("yearFrom") or None, d.get("yearTo") or None)]
        return cls(
            genre_picks=picks,
            max_runtime=d.get("maxRuntime") or None,
            year_ranges=ranges,
            include_rewatch=bool(d.get("includeRewatch", True)),
            vetoed=[int(g) for g in d.get("vetoed") or []],
        )


def genre_coverage(genre_ids: list[int], picks: list[list[int]]) -> int:
    """How many members' genre picks this film satisfies."""
    have = set(genre_ids or [])
    return sum(1 for pick in picks if have & set(pick))


def year_fits(year: int | None, r: tuple[int | None, int | None]) -> bool:
    lo, hi = r
    return year is not None and (lo is None or year >= lo) and (hi is None or year <= hi)


def genre_combos(picks: list[list[int]], limit: int = 3) -> list[list[int]]:
    """Genre sets to request with AND, so the candidate pool contains films that mix everyone's picks.

    First the smallest set that touches every member's pick (greedy set cover), then the most
    popular cross-member pairs. Single genres are left to the OR query.
    """
    if len(picks) < 2:
        return []
    freq: dict[int, int] = defaultdict(int)
    for pick in picks:
        for g in set(pick):
            freq[g] += 1

    combos: list[list[int]] = []
    uncovered = list(range(len(picks)))
    cover: list[int] = []
    while uncovered and len(cover) < 3:
        best = max(freq, key=lambda g: (sum(1 for i in uncovered if g in picks[i]), freq[g], -g))
        cover.append(best)
        uncovered = [i for i in uncovered if best not in picks[i]]
    if len(cover) >= 2:
        combos.append(sorted(cover))

    pairs: dict[tuple[int, int], int] = {}
    for i in range(len(picks)):
        for j in range(i + 1, len(picks)):
            for a in picks[i]:
                for b in picks[j]:
                    if a != b:
                        key = (min(a, b), max(a, b))
                        pairs[key] = freq[a] + freq[b]
    for pair in sorted(pairs, key=lambda k: (-pairs[k], k)):
        if len(combos) >= limit:
            break
        if list(pair) not in combos and not set(pair) <= set(combos[0] if combos else []):
            combos.append(list(pair))
    return combos[:limit]


@dataclass
class Candidate:
    movie: dict
    seed_hits: list[tuple[str, str, str]] = field(default_factory=list)  # (user_id, member name, seed title)
    rewatch_by: list[str] = field(default_factory=list)
    score: float = 0.0
    coverage: float = 0.0  # share of members whose wished genres this film has (1.0 when nobody picked)
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
    if filters.vetoed and set(filters.vetoed) & set(movie.get("genreIds") or []):
        return False  # somebody said "точно ні"
    if filters.genre_picks and not genre_coverage(movie.get("genreIds") or [], filters.genre_picks):
        return False  # matches nobody's mood
    if filters.year_ranges and not any(year_fits(movie.get("year"), r) for r in filters.year_ranges):
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

    picks = filters.genre_picks
    mood_reason = None
    c.coverage = 1.0
    if picks:
        covered = genre_coverage(genre_ids, picks)
        c.coverage = covered / len(picks)
        s += 2.4 * c.coverage
        if len(picks) > 1 and covered == len(picks):
            s += 0.6
            in_pick_order = dict.fromkeys(g for pick in picks for g in pick)
            names = [genre_names[g].lower() for g in in_pick_order if g in genre_ids and g in genre_names][:3]
            if len(names) > 1:
                mood_reason = f"Під настрій усіх: {' + '.join(names)}"
            elif names:
                mood_reason = f"{names[0].capitalize()} — хочуть усі"
            else:
                mood_reason = "Під настрій усіх учасників"


    rating = float(m.get("rating") or 0)
    votes = int(m.get("votes") or 0)
    quality = max(-0.5, min(1.0, (rating - 6.0) / 2.5)) * min(1.0, votes / 400)
    s += 1.2 * quality
    if rating >= 7.5 and votes >= 400:
        reasons.append(f"Рейтинг TMDB {rating:.1f}")

    s += 0.6 * min(1.0, math.log10(float(m.get("popularity") or 0) + 1) / 3)

    if mood_reason:
        reasons.insert(0, mood_reason)
    if c.rewatch_by:
        s += 0.3
        reasons.insert(0, f"{', '.join(c.rewatch_by)} — готові передивитись")

    c.score = s
    c.reasons = reasons[:3]
    return c


def rank(candidates: list[Candidate], rng: random.Random | None = None, jitter: float = 0.25) -> list[Candidate]:
    """Films that suit more of the room first, then by score.

    A little jitter so two rooms with the same people do not get identical decks.
    """
    rng = rng or random.Random()
    return sorted(candidates, key=lambda c: (c.coverage, c.score + rng.uniform(0, jitter)), reverse=True)
