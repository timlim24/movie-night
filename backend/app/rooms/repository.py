import time
from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key

from app.shared.db import from_db, table, to_db

ROOM_TTL_SECONDS = 2 * 24 * 3600


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ttl() -> int:
    return int(time.time()) + ROOM_TTL_SECONDS


def _pk(code: str) -> str:
    return f"ROOM#{code}"


def create_room(meta: dict, host: dict) -> bool:
    """False if the code is already taken."""
    client = table().meta.client
    try:
        table().put_item(
            Item=to_db({"PK": _pk(meta["code"]), "SK": "META", "ttl": _ttl(), **meta}),
            ConditionExpression="attribute_not_exists(PK)",
        )
    except client.exceptions.ConditionalCheckFailedException:
        return False
    put_member(meta["code"], host)
    return True


def get_room(code: str) -> tuple[dict | None, list[dict]]:
    """Meta + all members in one query (they share the partition)."""
    resp = table().query(KeyConditionExpression=Key("PK").eq(_pk(code)), ConsistentRead=True)
    meta, members = None, []
    for item in (from_db(i) for i in resp.get("Items", [])):
        if item["SK"] == "META":
            meta = item
        elif item["SK"].startswith("MEMBER#"):
            members.append(item)
    members.sort(key=lambda m: m.get("joinedAt", ""))
    return meta, members


def put_member(code: str, member: dict) -> None:
    table().put_item(Item=to_db({"PK": _pk(code), "SK": f"MEMBER#{member['userId']}", "ttl": _ttl(), "votes": {}, **member}))


def update_meta(code: str, fields: dict, remove: list[str] | None = None) -> None:
    names = {f"#{k}": k for k in [*fields, *(remove or [])]}
    expr = "SET " + ", ".join(f"#{k} = :{k}" for k in fields)
    if remove:
        expr += " REMOVE " + ", ".join(f"#{k}" for k in remove)
    table().update_item(
        Key={"PK": _pk(code), "SK": "META"},
        UpdateExpression=expr,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues={f":{k}": v for k, v in to_db(fields).items()},
    )


def update_member(code: str, user_id: str, fields: dict) -> None:
    table().update_item(
        Key={"PK": _pk(code), "SK": f"MEMBER#{user_id}"},
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in fields),
        ExpressionAttributeNames={f"#{k}": k for k in fields},
        ExpressionAttributeValues={f":{k}": v for k, v in to_db(fields).items()},
        ConditionExpression="attribute_exists(PK)",
    )


def set_vote(code: str, user_id: str, movie_id: int, like: bool) -> None:
    """Each member writes only their own item, so simultaneous swipes never conflict."""
    table().update_item(
        Key={"PK": _pk(code), "SK": f"MEMBER#{user_id}"},
        UpdateExpression="SET votes.#m = :like, lastVote = :last",
        ExpressionAttributeNames={"#m": str(movie_id)},
        ExpressionAttributeValues={":like": like, ":last": {"movieId": movie_id, "like": like, "at": now()}},
        ConditionExpression="attribute_exists(PK)",
    )
