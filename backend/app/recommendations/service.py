"""Builds the swipe deck for a room: gathers candidates from TMDB, then ranks them with scoring.py."""

from __future__ import annotations

from app.movies import api as movies
from app.recommendations.scoring import (
    Candidate,
    Filters,
    Member,
    excluded_ids,
    genre_combos,
    genre_preferences,
    passes_filters,
    pick_seeds,
    rank,
    rewatchable,
    score,
    watched_index,
)
from app.shared.errors import DomainError

MAX_REWATCH_CARDS = 3


def _discover_queries(filters: Filters, prefs: dict[int, float]) -> list[dict]:
    base: dict = {"vote_count.gte": filters.min_votes}
    if filters.max_runtime:
        base["with_runtime.lte"] = filters.max_runtime
    if filters.year_ranges:
        # TMDB takes one date range: ask for the span of all picked eras, scoring.passes_filters trims the gaps.
        lows = [lo for lo, _ in filters.year_ranges]
        highs = [hi for _, hi in filters.year_ranges]
        if None not in lows:
            base["primary_release_date.gte"] = f"{min(lows)}-01-01"
        if None not in highs:
            base["primary_release_date.lte"] = f"{max(highs)}-12-31"

    top_rated = {"sort_by": "vote_average.desc", "vote_count.gte": max(1000, filters.min_votes)}
    queries: list[dict] = []
    # Films that mix several members' genres (comma = AND in TMDB).
    for combo in genre_combos(filters.genre_picks):
        g = {"with_genres": ",".join(map(str, combo))}
        queries += [{**base, **g, "sort_by": "popularity.desc", "page": 1}, {**base, **g, **top_rated, "vote_count.gte": 300, "page": 1}]

    if filters.genre_picks:
        any_genre = {"with_genres": "|".join(map(str, filters.genres))}  # pipe = OR
    elif prefs:
        any_genre = {"with_genres": "|".join(map(str, sorted(prefs, key=prefs.get, reverse=True)[:3]))}
    else:
        any_genre = {}
    queries += [
        {**base, **any_genre, "sort_by": "popularity.desc", "page": 1},
        {**base, **any_genre, "sort_by": "popularity.desc", "page": 2},
        {**base, **any_genre, **top_rated, "page": 1},
        {**base, **any_genre, **top_rated, "page": 2},
    ]
    return queries


def build_deck(members: list[Member], filters: Filters, exclude: set[int] | None = None, size: int = 20) -> list[dict]:
    index = watched_index(members)
    banned = excluded_ids(index, filters.include_rewatch) | set(exclude or ())
    prefs = genre_preferences(members)
    seeds = pick_seeds(members, filters)

    # Fetch everything at once: one recommendations call per seed + four discover pages.
    jobs: list[tuple[str, object]] = [("seed", s) for s in seeds] + [("discover", q) for q in _discover_queries(filters, prefs)]

    def run(job: tuple[str, object]) -> list[dict]:
        kind, arg = job
        if kind == "seed":
            _, item = arg  # type: ignore[misc]
            return movies.recommendations(item["movieId"])
        return movies.discover(**arg)  # type: ignore[arg-type]

    results = movies.parallel(run, jobs)

    pool: dict[int, Candidate] = {}
    for job, found in zip(jobs, results):
        for movie in found or []:
            mid = movie["id"]
            if mid in banned or int(movie.get("votes") or 0) < 50 or not passes_filters(movie, filters):
                continue
            c = pool.setdefault(mid, Candidate(movie=movie))
            if job[0] == "seed":
                member, seed = job[1]  # type: ignore[misc]
                c.seed_hits.append((member.user_id, member.name, seed["title"]))

    if filters.include_rewatch:
        rewatch = rewatchable(index)
        for mid, names in list(rewatch.items()):
            if mid in (exclude or set()):
                continue
            item = next(i for m in members for i in m.library if i["movieId"] == mid)
            movie = {"id": mid, "genreIds": item.get("genreIds"), "year": item.get("year"), "poster": item.get("poster"),
                     "rating": item.get("tmdbRating"), "votes": 1000, "popularity": item.get("popularity")}
            if passes_filters(movie, filters):
                pool.setdefault(mid, Candidate(movie=movie)).rewatch_by = names

    genre_names = movies.genres()
    scored = [score(c, len(members), prefs, filters, genre_names) for c in pool.values()]
    ranked = rank(scored)

    # Cap rewatches so the deck is mostly new films.
    picked: list[Candidate] = []
    rewatches = 0
    for c in ranked:
        if c.rewatch_by:
            if rewatches >= MAX_REWATCH_CARDS:
                continue
            rewatches += 1
        picked.append(c)
        if len(picked) >= size + 8:  # spare cards: some get dropped by the runtime check below
            break

    details = movies.parallel(lambda c: movies.details(c.movie["id"]), picked)
    deck: list[dict] = []
    for c, card in zip(picked, details):
        if card is None or not passes_filters(card, filters):
            continue
        deck.append({**card, "reasons": c.reasons, "rewatchBy": c.rewatch_by})
        if len(deck) >= size:
            break

    if not deck:
        raise DomainError("Під ці фільтри нічого не знайшлося — спробуй послабити їх")
    return deck
