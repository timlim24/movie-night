import hashlib

from app.shared.auth import CurrentUser
from app.shared.errors import DomainError
from app.users import repository as repo

MASCOTS = ["popcorn", "reel", "clapper", "ticket", "soda", "star"]


def default_mascot(user_id: str) -> str:
    return MASCOTS[int(hashlib.sha1(user_id.encode()).hexdigest(), 16) % len(MASCOTS)]


def public(profile: dict) -> dict:
    return {k: profile.get(k) for k in ("id", "name", "picture", "mascot")}


def ensure_profile(user: CurrentUser) -> dict:
    profile = repo.get_profile(user.id)
    if profile:
        return profile
    return repo.create_profile(
        {"id": user.id, "name": user.name, "email": user.email, "picture": user.picture, "mascot": default_mascot(user.id)}
    )


def update_profile(user: CurrentUser, name: str | None, mascot: str | None) -> dict:
    ensure_profile(user)
    fields: dict = {}
    if name is not None:
        name = name.strip()
        if not 1 <= len(name) <= 40:
            raise DomainError("Ім'я має бути від 1 до 40 символів")
        fields["name"] = name
    if mascot is not None:
        if mascot not in MASCOTS:
            raise DomainError("Невідомий маскот")
        fields["mascot"] = mascot
    return repo.update_profile(user.id, fields) if fields else repo.get_profile(user.id)


def connect_friends(user_id: str, others: list[str]) -> None:
    for other in others:
        if other != user_id:
            repo.upsert_friend(user_id, other)
            repo.upsert_friend(other, user_id)


def friends(user_id: str) -> list[dict]:
    items = repo.list_friends(user_id)
    profiles = repo.get_profiles([i["friendId"] for i in items])
    out = []
    for i in items:
        p = profiles.get(i["friendId"])
        if p:
            out.append({**public(p), "roomsTogether": i.get("roomsTogether", 1), "lastSeenAt": i.get("lastSeenAt")})
    return sorted(out, key=lambda f: f.get("lastSeenAt") or "", reverse=True)


def friend_ids(user_id: str) -> list[str]:
    return [i["friendId"] for i in repo.list_friends(user_id)]
