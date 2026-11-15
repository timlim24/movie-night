from datetime import datetime, timezone

from app.shared.db import from_db, query_prefix, table, to_db


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _key(user_id: str, movie_id: int) -> dict:
    return {"PK": f"USER#{user_id}", "SK": f"MOVIE#{movie_id}"}


def list_items(user_id: str) -> list[dict]:
    return query_prefix(f"USER#{user_id}", "MOVIE#")


def get_item(user_id: str, movie_id: int) -> dict | None:
    item = table().get_item(Key=_key(user_id, movie_id)).get("Item")
    return from_db(item) if item else None


def put_items(user_id: str, items: list[dict], keep_user_fields: bool = True) -> None:
    """Upsert many films. If a film is already in the library, the user's own rewatch flag survives."""
    existing = {i["movieId"]: i for i in list_items(user_id)} if keep_user_fields else {}
    with table().batch_writer(overwrite_by_pkeys=["PK", "SK"]) as batch:
        for item in items:
            old = existing.get(item["movieId"])
            if old:
                item = {**item, "rewatch": old.get("rewatch", False), "addedAt": old.get("addedAt", item["addedAt"])}
                if item.get("myRating") is None and old.get("myRating") is not None:
                    item["myRating"] = old["myRating"]
            batch.put_item(Item=to_db({**_key(user_id, item["movieId"]), **item}))


def update_item(user_id: str, movie_id: int, fields: dict) -> dict:
    sets = []
    removes = []
    names: dict = {}
    values: dict = {}
    for k, v in fields.items():
        names[f"#{k}"] = k
        if v is None:
            removes.append(f"#{k}")
        else:
            sets.append(f"#{k} = :{k}")
            values[f":{k}"] = to_db(v)
    expr = ""
    if sets:
        expr += "SET " + ", ".join(sets)
    if removes:
        expr += " REMOVE " + ", ".join(removes)
    kwargs = {
        "Key": _key(user_id, movie_id),
        "UpdateExpression": expr.strip(),
        "ExpressionAttributeNames": names,
        "ConditionExpression": "attribute_exists(PK)",
        "ReturnValues": "ALL_NEW",
    }
    if values:
        kwargs["ExpressionAttributeValues"] = values
    return from_db(table().update_item(**kwargs)["Attributes"])


def delete_item(user_id: str, movie_id: int) -> None:
    table().delete_item(Key=_key(user_id, movie_id))
