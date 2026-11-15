from datetime import datetime, timezone

from app.shared.db import from_db, query_prefix, table, to_db


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_profile(user_id: str) -> dict | None:
    item = table().get_item(Key={"PK": f"USER#{user_id}", "SK": "PROFILE"}).get("Item")
    return from_db(item) if item else None


def get_profiles(user_ids: list[str]) -> dict[str, dict]:
    ids = list(dict.fromkeys(user_ids))
    out: dict[str, dict] = {}
    name = table().name
    for i in range(0, len(ids), 100):
        keys = [{"PK": f"USER#{u}", "SK": "PROFILE"} for u in ids[i : i + 100]]
        # The resource's client already converts DynamoDB types to Python values.
        resp = table().meta.client.batch_get_item(RequestItems={name: {"Keys": keys}})
        for raw in resp.get("Responses", {}).get(name, []):
            item = from_db(raw)
            out[item["id"]] = item
    return out


def create_profile(profile: dict) -> dict:
    item = {"PK": f"USER#{profile['id']}", "SK": "PROFILE", "createdAt": _now(), **profile}
    try:
        table().put_item(Item=to_db(item), ConditionExpression="attribute_not_exists(PK)")
    except table().meta.client.exceptions.ConditionalCheckFailedException:
        return get_profile(profile["id"]) or item
    return from_db(item)


def update_profile(user_id: str, fields: dict) -> dict:
    names = {f"#{k}": k for k in fields}
    values = {f":{k}": v for k, v in to_db(fields).items()}
    resp = table().update_item(
        Key={"PK": f"USER#{user_id}", "SK": "PROFILE"},
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in fields),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
        ReturnValues="ALL_NEW",
    )
    return from_db(resp["Attributes"])


def upsert_friend(user_id: str, friend_id: str) -> None:
    table().update_item(
        Key={"PK": f"USER#{user_id}", "SK": f"FRIEND#{friend_id}"},
        UpdateExpression="SET friendId = :f, lastSeenAt = :now, since = if_not_exists(since, :now) ADD roomsTogether :one",
        ExpressionAttributeValues={":f": friend_id, ":now": _now(), ":one": 1},
    )


def list_friends(user_id: str) -> list[dict]:
    return query_prefix(f"USER#{user_id}", "FRIEND#")
