"""DynamoDB access shared by all modules.

Single-table design. Each module owns its own key prefixes and never reads another module's items:
  users:    PK=USER#<id>  SK=PROFILE
  social:   PK=USER#<id>  SK=FRIEND#<otherId>
  library:  PK=USER#<id>  SK=MOVIE#<tmdbId>
  rooms:    PK=ROOM#<code> SK=META | MEMBER#<userId>
            PK=USER#<id>  SK=INVITE#<code>   (written by a friend who is in that room)
            PK=USER#<id>  SK=PRESENCE        (the room this user is in now; read by their friends)
"""

from decimal import Decimal
from functools import lru_cache
from typing import Any

import boto3

from app.shared.config import settings


@lru_cache
def table():
    return boto3.resource("dynamodb").Table(settings().table_name)


def to_db(value: Any) -> Any:
    """Python → DynamoDB: floats become Decimal (DynamoDB has no float type)."""
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: to_db(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [to_db(v) for v in value]
    return value


def from_db(value: Any) -> Any:
    """DynamoDB → Python: Decimal becomes int or float."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, dict):
        return {k: from_db(v) for k, v in value.items()}
    if isinstance(value, list):
        return [from_db(v) for v in value]
    return value


def query_prefix(pk: str, sk_prefix: str) -> list[dict]:
    from boto3.dynamodb.conditions import Key

    items: list[dict] = []
    kwargs = {"KeyConditionExpression": Key("PK").eq(pk) & Key("SK").begins_with(sk_prefix)}
    while True:
        resp = table().query(**kwargs)
        items.extend(from_db(i) for i in resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            return items
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def batch_get(keys: list[dict]) -> list[dict]:
    """Up to any number of {PK, SK} keys; missing items are simply absent from the result."""
    out: list[dict] = []
    name = table().name
    client = table().meta.client  # the resource's client already converts DynamoDB types
    for i in range(0, len(keys), 100):
        request = {name: {"Keys": keys[i : i + 100]}}
        for _ in range(5):
            resp = client.batch_get_item(RequestItems=request)
            out.extend(from_db(r) for r in resp.get("Responses", {}).get(name, []))
            request = resp.get("UnprocessedKeys") or {}
            if not request:
                break
    return out
