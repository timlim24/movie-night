import random

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

COMEDY, DRAMA, HORROR = 35, 18, 27


def item(mid, genres, rating=None, rewatch=False):
    return {"movieId": mid, "title": f"Film {mid}", "genreIds": genres, "myRating": rating, "rewatch": rewatch}


def movie(mid, genres, rating=7.0, votes=1000, popularity=50.0, year=2015, runtime=110):
    return {"id": mid, "genreIds": genres, "rating": rating, "votes": votes, "popularity": popularity,
            "year": year, "runtime": runtime, "poster": "p.jpg"}


ANNA = Member("a", "Анна", [item(1, [COMEDY], 5), item(2, [COMEDY, DRAMA], 4.5, rewatch=True)])
BOHDAN = Member("b", "Богдан", [item(2, [COMEDY, DRAMA], 4, rewatch=True), item(3, [HORROR], 1.5)])


def test_seen_without_rewatch_is_excluded_but_shared_rewatch_is_allowed():
    idx = watched_index([ANNA, BOHDAN])
    assert excluded_ids(idx, include_rewatch=True) == {1, 3}
    assert rewatchable(idx) == {2: ["Анна", "Богдан"]}


def test_rewatch_disabled_excludes_everything_seen():
    assert excluded_ids(watched_index([ANNA, BOHDAN]), include_rewatch=False) == {1, 2, 3}


def test_one_person_not_wanting_rewatch_vetoes_it():
    c = Member("c", "Сашко", [item(2, [COMEDY, DRAMA], 3, rewatch=False)])
    assert 2 in excluded_ids(watched_index([ANNA, c]), include_rewatch=True)


def test_genre_preferences_weight_liked_genres_and_ignore_disliked():
    prefs = genre_preferences([ANNA, BOHDAN])
    assert prefs[COMEDY] == 1.0
    assert prefs.get(HORROR, 0) == 0  # a 1.5★ horror is not a preference


def test_seeds_skip_films_the_member_disliked():
    seeds = pick_seeds([BOHDAN], Filters())
    assert [s[1]["movieId"] for s in seeds] == [2]


def test_filters():
    f = Filters(genre_picks=[[COMEDY]], max_runtime=120, year_ranges=[(2000, None)])
    assert passes_filters(movie(10, [COMEDY]), f)
    assert not passes_filters(movie(10, [HORROR]), f)
    assert not passes_filters(movie(10, [COMEDY], runtime=150), f)
    assert not passes_filters(movie(10, [COMEDY], year=1990), f)
    assert not passes_filters({**movie(10, [COMEDY]), "poster": None}, f)


def test_film_recommended_from_both_members_ranks_above_a_generic_one():
    prefs = genre_preferences([ANNA, BOHDAN])
    shared = Candidate(movie(20, [COMEDY]), seed_hits=[("a", "Анна", "Film 1"), ("b", "Богдан", "Film 2")])
    generic = Candidate(movie(21, [COMEDY]))
    for c in (shared, generic):
        score(c, 2, prefs, Filters(), {COMEDY: "Комедія"})
    assert shared.score > generic.score
    assert shared.reasons[0] == "Пасує до смаків 2 учасників"
    ranked = rank([generic, shared], rng=random.Random(1), jitter=0)
    assert ranked[0] is shared


def test_low_vote_count_dampens_rating():
    prefs = {}
    obscure = score(Candidate(movie(30, [DRAMA], rating=9.5, votes=40)), 2, prefs, Filters(), {})
    known = score(Candidate(movie(31, [DRAMA], rating=8.0, votes=5000)), 2, prefs, Filters(), {})
    assert known.score > obscure.score


def test_any_members_genre_passes_but_nobodys_does_not():
    f = Filters(genre_picks=[[COMEDY], [HORROR]])
    assert passes_filters(movie(10, [COMEDY]), f)
    assert passes_filters(movie(11, [HORROR, DRAMA]), f)
    assert not passes_filters(movie(12, [DRAMA]), f)


def test_era_union():
    f = Filters(year_ranges=[(None, 1989), (2010, None)])
    assert passes_filters(movie(10, [DRAMA], year=1975), f)
    assert passes_filters(movie(11, [DRAMA], year=2019), f)
    assert not passes_filters(movie(12, [DRAMA], year=2000), f)


def test_film_covering_everyones_genres_ranks_first_and_says_why():
    f = Filters(genre_picks=[[COMEDY], [HORROR]])
    names = {COMEDY: "Комедія", HORROR: "Жахи"}
    both = score(Candidate(movie(40, [COMEDY, HORROR])), 2, {}, f, names)
    one = score(Candidate(movie(41, [COMEDY], rating=8.5, votes=5000)), 2, {}, f, names)
    assert both.score > one.score
    assert both.reasons[0] == "Під настрій усіх: комедія + жахи"


def test_genre_combos_cover_every_member():
    combos = genre_combos([[COMEDY, DRAMA], [HORROR], [COMEDY]])
    assert combos[0] == sorted([COMEDY, HORROR])
    assert all(len(c) >= 2 for c in combos)
    assert genre_combos([[COMEDY]]) == []
    assert genre_combos([[COMEDY], [COMEDY]]) == []  # one shared genre: the OR query already covers it


def test_legacy_room_filters_still_load():
    f = Filters.from_dict({"genres": [COMEDY], "yearFrom": 2000})
    assert f.genre_picks == [[COMEDY]] and f.year_ranges == [(2000, None)]


def test_vetoed_genre_never_passes():
    f = Filters(genre_picks=[[COMEDY]], vetoed=[HORROR])
    assert passes_filters(movie(1, [COMEDY]), f)
    assert not passes_filters(movie(2, [COMEDY, HORROR]), f)


def test_coverage_outranks_a_great_score():
    f = Filters(genre_picks=[[COMEDY], [DRAMA]])
    names = {COMEDY: "Комедія", DRAMA: "Драма"}
    everyone = score(Candidate(movie(1, [COMEDY, DRAMA], rating=6.0, votes=200, popularity=1)), 2, {}, f, names)
    half = score(
        Candidate(movie(2, [COMEDY], rating=9.0, votes=9000, popularity=900), seed_hits=[("a", "Анна", "X"), ("b", "Богдан", "Y")]),
        2, {COMEDY: 1.0}, f, names,
    )
    assert half.score > everyone.score  # on raw score the half-match would win…
    assert rank([half, everyone], rng=random.Random(0))[0] is everyone  # …but full coverage goes first
