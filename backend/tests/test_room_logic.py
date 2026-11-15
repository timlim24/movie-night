import random

from app.rooms import logic

DECK = [{"id": 1, "rating": 7.0}, {"id": 2, "rating": 8.0}, {"id": 3, "rating": 6.0}]
IDS = [1, 2, 3]


def member(uid, votes):
    return {"userId": uid, "votes": {str(k): v for k, v in votes.items()}}


def test_code_uses_only_unambiguous_characters():
    code = logic.new_code(random.Random(42))
    assert len(code) == logic.CODE_LENGTH
    assert not set(code) & set("0O1IL")


def test_match_requires_every_member():
    a = member("a", {1: True, 2: True})
    b = member("b", {1: True, 2: False})
    assert logic.matches(IDS, [a, b]) == [1]
    c = member("c", {})
    assert logic.matches(IDS, [a, b, c]) == []  # someone has not voted yet


def test_results_only_liked_films_sorted_by_likes_then_rating():
    a = member("a", {1: True, 2: True, 3: False})
    b = member("b", {1: False, 2: True, 3: False})
    rows = logic.results(DECK, [a, b])
    assert [r["movieId"] for r in rows] == [2, 1]
    assert rows[0]["likes"] == ["a", "b"]


def test_votes_from_a_previous_deck_are_ignored():
    a = member("a", {99: True, 1: True})
    assert logic.progress(IDS, a) == 1


def test_everyone_done():
    a = member("a", {1: True, 2: False, 3: True})
    b = member("b", {1: True})
    assert not logic.everyone_done(IDS, [a, b])
    assert logic.everyone_done(IDS, [a])


def with_prefs(uid, genres=(), runtime=None, era=None):
    return {"userId": uid, "prefs": {"genres": list(genres), "maxRuntime": runtime, "era": era}}


def test_clean_prefs_limits_genres_and_validates():
    assert logic.clean_prefs({"genres": [35, 35, 27]}) == {"genres": [35, 27], "maxRuntime": None, "era": None}
    for bad in ({"genres": [1, 2, 3, 4]}, {"maxRuntime": 30}, {"era": "future"}):
        try:
            logic.clean_prefs(bad)
        except ValueError:
            continue
        raise AssertionError(f"accepted {bad}")


def test_combine_keeps_picks_per_person_strictest_runtime_and_era_union():
    room = [with_prefs("a", [35], 150, "new"), with_prefs("b", [27, 53], 120, "classic"), with_prefs("c")]
    c = logic.combine(room, include_rewatch=False)
    assert c["genrePicks"] == [[35], [27, 53]]  # "c" picked nothing and does not constrain
    assert c["maxRuntime"] == 120
    assert c["eras"] == ["classic", "new"]
    assert c["yearRanges"] == [[2010, None], [None, 1989]]
    assert c["includeRewatch"] is False


def test_combine_with_no_prefs_is_open():
    c = logic.combine([{"userId": "a"}])
    assert c["genrePicks"] == [] and c["maxRuntime"] is None and c["yearRanges"] == []
