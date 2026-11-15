"""Room use cases. AuthZ lives here: who may start, vote, choose."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from app.library import api as library
from app.recommendations import api as recs
from app.rooms import logic
from app.rooms import repository as repo
from app.shared.auth import CurrentUser
from app.shared.errors import Conflict, DomainError, Forbidden, NotFound
from app.users import api as users

GENRE_LIMIT = 6


def clean_filters(raw: dict | None) -> dict:
    raw = raw or {}
    genres = [int(g) for g in (raw.get("genres") or [])][:GENRE_LIMIT]
    max_runtime = raw.get("maxRuntime")
    if max_runtime is not None:
        max_runtime = int(max_runtime)
        if not 60 <= max_runtime <= 400:
            raise DomainError("Тривалість — від 60 до 400 хвилин")
    year_from, year_to = raw.get("yearFrom"), raw.get("yearTo")
    for y in (year_from, year_to):
        if y is not None and not 1900 <= int(y) <= 2100:
            raise DomainError("Рік має бути між 1900 і 2100")
    if year_from and year_to and int(year_from) > int(year_to):
        raise DomainError("Рік «від» більший за рік «до»")
    return {
        "genres": genres,
        "maxRuntime": max_runtime,
        "yearFrom": int(year_from) if year_from else None,
        "yearTo": int(year_to) if year_to else None,
        "includeRewatch": bool(raw.get("includeRewatch", True)),
    }


def _member_from_profile(profile: dict) -> dict:
    return {
        "userId": profile["id"],
        "name": profile["name"],
        "picture": profile.get("picture"),
        "mascot": profile.get("mascot"),
        "joinedAt": repo.now(),
    }


def _load(code: str) -> tuple[dict, list[dict]]:
    meta, members = repo.get_room(logic.normalize_code(code))
    if not meta:
        raise NotFound("Кімнату не знайдено — перевір код")
    return meta, members


def _require_member(user: CurrentUser, members: list[dict]) -> dict:
    me = next((m for m in members if m["userId"] == user.id), None)
    if not me:
        raise Forbidden("Спочатку приєднайся до кімнати")
    return me


def _require_host(user: CurrentUser, meta: dict) -> None:
    if meta["hostId"] != user.id:
        raise Forbidden("Це може зробити лише ведучий кімнати")


def view(user: CurrentUser, meta: dict, members: list[dict], include_deck: bool = True) -> dict:
    deck = meta.get("deck") or []
    deck_ids = [c["id"] for c in deck]
    me = next((m for m in members if m["userId"] == user.id), None)
    public_members = [
        {
            "userId": m["userId"],
            "name": m["name"],
            "picture": m.get("picture"),
            "mascot": m.get("mascot"),
            "isHost": m["userId"] == meta["hostId"],
            "progress": logic.progress(deck_ids, m),
            "likes": sum(1 for k, v in (m.get("votes") or {}).items() if v and int(k) in deck_ids),
            "lastVote": m.get("lastVote"),
        }
        for m in members
    ]
    base = {
        "code": meta["code"],
        "status": meta["status"],
        "hostId": meta["hostId"],
        "isHost": meta["hostId"] == user.id,
        "isMember": me is not None,
        "members": public_members,
        "filters": meta.get("filters") or {},
        "round": meta.get("round", 0),
        "deckSize": len(deck),
        "createdAt": meta.get("createdAt"),
    }
    if not me:
        return base
    by_id = {c["id"]: c for c in deck}
    return {
        **base,
        "deck": deck if include_deck else None,
        "myVotes": {k: v for k, v in (me.get("votes") or {}).items()},
        "matches": logic.matches(deck_ids, members),
        "results": logic.results(deck, members),
        "everyoneDone": logic.everyone_done(deck_ids, members),
        "chosen": by_id.get(meta.get("chosenId")) if meta.get("chosenId") else None,
    }


def create(user: CurrentUser, filters: dict | None) -> dict:
    profile = users.ensure_profile(user)
    meta = {
        "hostId": user.id,
        "status": "lobby",
        "filters": clean_filters(filters),
        "round": 0,
        "seenIds": [],
        "createdAt": repo.now(),
    }
    for _ in range(8):
        code = logic.new_code()
        if repo.create_room({**meta, "code": code}, _member_from_profile(profile)):
            return state(user, code)
    raise Conflict("Не вдалося створити кімнату, спробуй ще раз")


def state(user: CurrentUser, code: str, include_deck: bool = True) -> dict:
    meta, members = _load(code)
    return view(user, meta, members, include_deck)


def join(user: CurrentUser, code: str) -> dict:
    meta, members = _load(code)
    if any(m["userId"] == user.id for m in members):
        return view(user, meta, members)
    if meta["status"] == "done":
        raise Conflict("Ця кімната вже обрала фільм")
    if len(members) >= logic.MAX_MEMBERS:
        raise Conflict(f"У кімнаті вже {logic.MAX_MEMBERS} людей")
    profile = users.ensure_profile(user)
    repo.put_member(meta["code"], _member_from_profile(profile))
    users.connect_friends(user.id, [m["userId"] for m in members])
    return state(user, meta["code"])


def update_filters(user: CurrentUser, code: str, filters: dict) -> dict:
    meta, _ = _load(code)
    _require_host(user, meta)
    if meta["status"] != "lobby":
        raise Conflict("Фільтри можна змінити лише до старту")
    repo.update_meta(meta["code"], {"filters": clean_filters(filters)})
    return state(user, meta["code"])


def set_mascot(user: CurrentUser, code: str, mascot: str) -> dict:
    meta, members = _load(code)
    _require_member(user, members)
    if mascot not in users.MASCOTS:
        raise DomainError("Невідомий маскот")
    repo.update_member(meta["code"], user.id, {"mascot": mascot})
    return state(user, meta["code"], include_deck=False)


def _build_deck(meta: dict, members: list[dict], exclude: set[int]) -> list[dict]:
    with ThreadPoolExecutor(max_workers=max(1, len(members))) as pool:
        libraries = list(pool.map(lambda m: library.get_library(m["userId"]), members))
    rec_members = [recs.Member(user_id=m["userId"], name=m["name"], library=lib) for m, lib in zip(members, libraries)]
    return recs.build_deck(rec_members, recs.Filters.from_dict(meta.get("filters")), exclude=exclude)


def start(user: CurrentUser, code: str) -> dict:
    meta, members = _load(code)
    _require_host(user, meta)
    if meta["status"] != "lobby":
        raise Conflict("Кімната вже стартувала")
    deck = _build_deck(meta, members, exclude=set())
    repo.update_meta(
        meta["code"],
        {"status": "swiping", "deck": deck, "round": 1, "seenIds": [c["id"] for c in deck], "startedAt": repo.now()},
    )
    return state(user, meta["code"])


def next_round(user: CurrentUser, code: str) -> dict:
    """No match? Twenty fresh films, none of the ones already shown."""
    meta, members = _load(code)
    _require_host(user, meta)
    if meta["status"] == "lobby":
        raise Conflict("Кімната ще не стартувала")
    seen = set(meta.get("seenIds") or [])
    deck = _build_deck(meta, members, exclude=seen)
    for m in members:
        repo.update_member(meta["code"], m["userId"], {"votes": {}})
    repo.update_meta(
        meta["code"],
        {"status": "swiping", "deck": deck, "round": int(meta.get("round", 1)) + 1, "seenIds": [*seen, *(c["id"] for c in deck)]},
        remove=["chosenId"],
    )
    return state(user, meta["code"])


def vote(user: CurrentUser, code: str, movie_id: int, like: bool) -> dict:
    meta, members = _load(code)
    _require_member(user, members)
    if meta["status"] != "swiping":
        raise Conflict("Зараз не час голосувати")
    if movie_id not in {c["id"] for c in meta.get("deck") or []}:
        raise DomainError("Цього фільму немає в колоді")
    repo.set_vote(meta["code"], user.id, movie_id, like)
    return state(user, meta["code"], include_deck=False)


def choose(user: CurrentUser, code: str, movie_id: int) -> dict:
    meta, _ = _load(code)
    _require_host(user, meta)
    if movie_id not in {c["id"] for c in meta.get("deck") or []}:
        raise DomainError("Цього фільму немає в колоді")
    repo.update_meta(meta["code"], {"status": "done", "chosenId": movie_id, "chosenAt": repo.now()})
    return state(user, meta["code"])
