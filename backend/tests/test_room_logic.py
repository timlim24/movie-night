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


def with_prefs(uid, genres=(), runtime=None, eras=(), veto=()):
    return {"userId": uid, "name": uid.upper(), "prefs": {"genres": list(genres), "veto": list(veto), "maxRuntime": runtime, "eras": list(eras)}}


def test_alone_in_a_room_there_are_no_matches():
    assert logic.matches(IDS, [member("a", {1: True, 2: True})]) == []


def test_clean_prefs_limits_and_validates():
    assert logic.clean_prefs({"genres": [35, 35, 27], "veto": [27, 18]}) == {"genres": [35, 27], "veto": [18], "maxRuntime": None, "eras": []}
    assert logic.clean_prefs({"era": "new"})["eras"] == ["new"]  # old single-era shape still accepted
    for bad in ({"genres": [1, 2, 3, 4]}, {"veto": [1, 2, 3, 4]}, {"maxRuntime": 30}, {"eras": ["future"]}):
        try:
            logic.clean_prefs(bad)
        except ValueError:
            continue
        raise AssertionError(f"accepted {bad}")


def test_veto_beats_someone_elses_wish():
    room = [with_prefs("a", [27, 35]), with_prefs("b", [10749], veto=[27])]
    c = logic.combine(room)
    assert c["vetoed"] == [27]
    assert c["genrePicks"] == [[35], [10749]]
    only_horror = logic.combine([with_prefs("a", [27]), with_prefs("b", veto=[27])])
    assert only_horror["genrePicks"] == []  # nothing left of a's wish — a no longer constrains


def test_eras_take_the_overlap_or_fall_back_to_union():
    c = logic.combine([with_prefs("a", eras=["modern", "new"]), with_prefs("b", eras=["new"]), with_prefs("c")])
    assert c["eras"] == ["new"] and not c["erasConflict"] and c["yearRanges"] == [[2010, None]]
    c = logic.combine([with_prefs("a", eras=["classic"]), with_prefs("b", eras=["new"])])
    assert c["eras"] == ["classic", "new"] and c["erasConflict"]


def test_strictest_runtime_and_open_room():
    assert logic.combine([with_prefs("a", runtime=150), with_prefs("b", runtime=120)])["maxRuntime"] == 120
    c = logic.combine([{"userId": "a"}])
    assert c["genrePicks"] == [] and c["maxRuntime"] is None and c["yearRanges"] == [] and c["vetoed"] == []


def test_proposals():
    card = {"id": 7, "title": "Film", "year": 2000, "poster": "p", "overview": "x"}
    props = logic.add_proposal([], card, seen=set())
    assert props == [{"id": 7, "title": "Film", "year": 2000, "poster": "p"}]
    assert logic.add_proposal(props, card, seen=set()) == props  # idempotent
    for proposals, seen in (([], {7}), ([{"id": i} for i in range(3)], set())):
        try:
            logic.add_proposal(proposals, card, seen)
        except ValueError:
            continue
        raise AssertionError("accepted")
    members = [{"name": "Анна К", "proposals": [{"id": 7}, {"id": 8}]}, {"name": "Богдан", "proposals": [{"id": 7}]}]
    assert logic.pinned(members, seen={8}) == [{"id": 7, "by": ["Анна", "Богдан"]}]
