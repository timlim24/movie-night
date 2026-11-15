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

MAX_INVITES_PER_CALL = 20


def clean_settings(raw: dict | None) -> dict:
    """Room-wide settings the host controls. Everything else is each member's own prefs."""
    return {"includeRewatch": bool((raw or {}).get("includeRewatch", True))}


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
            "prefs": m.get("prefs") or {},
        }
        for m in members
    ]
    settings = meta.get("filters") or {}
    base = {
        "code": meta["code"],
        "status": meta["status"],
        "hostId": meta["hostId"],
        "isHost": meta["hostId"] == user.id,
        "isMember": me is not None,
        "members": public_members,
        "filters": clean_settings(settings),
        "combined": logic.combine(members, clean_settings(settings)["includeRewatch"]),
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
        "hostName": profile["name"],
        "status": "lobby",
        "filters": clean_settings(filters),
        "round": 0,
        "seenIds": [],
        "createdAt": repo.now(),
    }
    for _ in range(8):
        code = logic.new_code()
        if repo.create_room({**meta, "code": code}, _member_from_profile(profile)):
            repo.set_presence(user.id, code)
            return state(user, code)
    raise Conflict("Не вдалося створити кімнату, спробуй ще раз")


def state(user: CurrentUser, code: str, include_deck: bool = True) -> dict:
    meta, members = _load(code)
    return view(user, meta, members, include_deck)


def join(user: CurrentUser, code: str) -> dict:
    meta, members = _load(code)
    repo.delete_invite(user.id, meta["code"])
    if any(m["userId"] == user.id for m in members):
        repo.set_presence(user.id, meta["code"])
        return view(user, meta, members)
    if meta["status"] == "done":
        raise Conflict("Ця кімната вже обрала фільм")
    if len(members) >= logic.MAX_MEMBERS:
        raise Conflict(f"У кімнаті вже {logic.MAX_MEMBERS} людей")
    profile = users.ensure_profile(user)
    repo.put_member(meta["code"], _member_from_profile(profile))
    repo.set_presence(user.id, meta["code"])
    users.connect_friends(user.id, [m["userId"] for m in members])
    return state(user, meta["code"])


def update_settings(user: CurrentUser, code: str, settings: dict) -> dict:
    meta, _ = _load(code)
    _require_host(user, meta)
    if meta["status"] != "lobby":
        raise Conflict("Налаштування можна змінити лише до старту")
    repo.update_meta(meta["code"], {"filters": clean_settings(settings)})
    return state(user, meta["code"])


def set_prefs(user: CurrentUser, code: str, prefs: dict) -> dict:
    """Every member says what they are in the mood for: up to 3 genres, runtime, era."""
    meta, members = _load(code)
    _require_member(user, members)
    if meta["status"] != "lobby":
        raise Conflict("Побажання можна змінити лише до старту")
    try:
        clean = logic.clean_prefs(prefs)
    except ValueError as e:
        raise DomainError(str(e)) from e
    repo.update_member(meta["code"], user.id, {"prefs": clean})
    return state(user, meta["code"], include_deck=False)


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
    include_rewatch = clean_settings(meta.get("filters"))["includeRewatch"]
    filters = recs.Filters.from_dict(logic.combine(members, include_rewatch))
    return recs.build_deck(rec_members, filters, exclude=exclude)


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


# ── friends: invites and hopping into a friend's room ────────────────────────


def invite(user: CurrentUser, code: str, user_ids: list[str]) -> dict:
    """Any member can call their friends in. Only real friends (shared a room before) can be invited."""
    meta, members = _load(code)
    me = _require_member(user, members)
    if meta["status"] == "done":
        raise Conflict("Ця кімната вже обрала фільм")
    friends = set(users.friend_ids(user.id))
    inside = {m["userId"] for m in members}
    wanted = list(dict.fromkeys(user_ids))[:MAX_INVITES_PER_CALL]
    if any(u not in friends for u in wanted):
        raise Forbidden("Запрошувати можна лише друзів")
    sent = [u for u in wanted if u not in inside]
    for friend in sent:
        repo.put_invite(
            friend,
            {"code": meta["code"], "fromId": user.id, "fromName": me["name"], "fromMascot": me.get("mascot"), "at": repo.now()},
        )
    return {"invited": sent}


def dismiss_invite(user: CurrentUser, code: str) -> None:
    repo.delete_invite(user.id, logic.normalize_code(code))


def live(user: CurrentUser) -> dict:
    """What is happening around me right now: invites I got and rooms my friends are sitting in."""
    invites = repo.list_invites(user.id)
    friend_ids = users.friend_ids(user.id)
    presences = repo.get_presences([*friend_ids, user.id])
    mine = presences.pop(user.id, {}).get("code")

    metas = repo.get_metas([i["code"] for i in invites] + [p["code"] for p in presences.values()])
    open_codes = {c for c, m in metas.items() if m.get("status") != "done"}

    by_room: dict[str, list[str]] = {}
    for friend_id, p in presences.items():
        if p["code"] in open_codes:
            by_room.setdefault(p["code"], []).append(friend_id)
    profiles = users.get_profiles([f for ids in by_room.values() for f in ids])

    def room_info(c: str) -> dict:
        m = metas[c]
        return {"code": c, "status": m["status"], "hostName": m.get("hostName"), "joined": c == mine}

    friend_rooms = [
        {**room_info(c), "friends": [users.public(profiles[f]) for f in ids if f in profiles]}
        for c, ids in by_room.items()
    ]
    friend_rooms.sort(key=lambda r: (r["joined"], r["status"] != "lobby"))
    return {
        "invites": [
            {**room_info(i["code"]), "from": {"id": i["fromId"], "name": i["fromName"], "mascot": i.get("fromMascot")}, "at": i["at"]}
            for i in sorted(invites, key=lambda i: i["at"], reverse=True)
            if i["code"] in open_codes and i["code"] != mine
        ],
        "friendRooms": [r for r in friend_rooms if r["friends"]],
    }
