"""End-to-end check against the deployed stack: two test users go through the whole flow.

Usage: backend/.venv/bin/python scripts/e2e.py
Needs AWS credentials (creates/uses two Cognito test users named e2e-*@example.com).
"""

import json
import secrets
import subprocess
import sys

import boto3
import httpx

TF = json.loads(subprocess.check_output(["terraform", "-chdir=infra", "output", "-json"]))
APP = TF["app_url"]["value"]
POOL = TF["user_pool_id"]["value"]
CLIENT = TF["e2e_client_id"]["value"]
idp = boto3.client("cognito-idp", region_name="us-east-1")


def token_for(email: str, name: str) -> str:
    password = "E2e-" + secrets.token_urlsafe(12) + "1a"
    try:
        idp.admin_create_user(
            UserPoolId=POOL, Username=email, MessageAction="SUPPRESS",
            UserAttributes=[{"Name": "email", "Value": email}, {"Name": "email_verified", "Value": "true"},
                            {"Name": "name", "Value": name}],
        )
    except idp.exceptions.UsernameExistsException:
        pass
    idp.admin_set_user_password(UserPoolId=POOL, Username=email, Password=password, Permanent=True)
    auth = idp.initiate_auth(ClientId=CLIENT, AuthFlow="USER_PASSWORD_AUTH",
                             AuthParameters={"USERNAME": email, "PASSWORD": password})
    return auth["AuthenticationResult"]["IdToken"]


def client(token: str) -> httpx.Client:
    return httpx.Client(base_url=APP, headers={"Authorization": f"Bearer {token}"}, timeout=30)


def check(resp: httpx.Response, label: str) -> dict:
    ok = resp.status_code < 400
    print(f"{'✓' if ok else '✗'} {label}: {resp.status_code}")
    if not ok:
        print("   ", resp.text[:300])
        sys.exit(1)
    return resp.json() if resp.content else {}


anna = client(token_for("e2e-anna@example.com", "Анна (тест)"))
bohdan = client(token_for("e2e-bohdan@example.com", "Богдан (тест)"))


r = httpx.get(f"{APP}/api/me")
print(f"{'✓' if r.status_code == 401 else '✗'} no token → {r.status_code}")

me = check(anna.get("/api/me"), "profile")
print("   ", me["name"], me["mascot"])
found = check(anna.get("/api/movies/search", params={"q": "Інтерстеллар"}), "search")
print("   ", found[0]["title"], found[0]["year"])
check(anna.post("/api/library", json={"movieId": found[0]["id"], "rating": 5}), "add to library")
check(anna.patch(f"/api/library/{found[0]['id']}", json={"rewatch": True}), "rewatch switch")
imp = check(bohdan.post("/api/library/import", json={"items": [
    {"title": "The Dark Knight", "year": 2008, "rating": "4.5"},
    {"title": "Amélie", "year": 2001, "rating": "5"},
    {"title": "zzzz not a film qqq", "year": 1900}]}), "CSV import")
print("   ", imp)
rss = bohdan.post("/api/library/letterboxd", json={"username": "davidehrlich"})
print(f"{'✓' if rss.status_code < 400 else '!'} Letterboxd RSS: {rss.status_code} {rss.text[:120]}")

room = check(anna.post("/api/rooms", json={"filters": {"includeRewatch": True}}), "create room")
code = room["code"]
print("    code", code)
preview = check(bohdan.get(f"/api/rooms/{code}"), "non-member preview")
assert preview["isMember"] is False

# Bohdan was in a room with Anna in earlier runs, so they are friends: Anna can call him in.
inv = check(anna.post(f"/api/rooms/{code}/invite", json={"userIds": [bohdan.get("/api/me").json()["id"]]}), "invite friend")
assert inv["invited"], inv
r = anna.post(f"/api/rooms/{code}/invite", json={"userIds": ["not-a-friend"]})
print(f"{'✓' if r.status_code == 403 else '✗'} cannot invite strangers: {r.status_code}")
live = check(bohdan.get("/api/rooms/live"), "live (invites + friends' rooms)")
assert any(i["code"] == code for i in live["invites"]), live
assert any(fr["code"] == code for fr in live["friendRooms"]), live
print(f"    invite from {live['invites'][0]['from']['name']}, friend rooms: {[fr['code'] for fr in live['friendRooms']]}")

check(bohdan.post(f"/api/rooms/{code}/join"), "join")
live = check(bohdan.get("/api/rooms/live"), "invite gone after joining")
assert not any(i["code"] == code for i in live["invites"]), live

COMEDY, HORROR, ANIMATION, ROMANCE = 35, 27, 16, 10749
check(anna.put(f"/api/rooms/{code}/prefs", json={"genres": [COMEDY, ANIMATION], "veto": [HORROR], "maxRuntime": 150, "eras": ["modern", "new"]}), "anna prefs (with veto)")
st = check(bohdan.put(f"/api/rooms/{code}/prefs", json={"genres": [HORROR, COMEDY], "maxRuntime": 120, "eras": ["new"]}), "bohdan prefs")
print("    combined:", st["combined"])
c = st["combined"]
assert c["maxRuntime"] == 120 and c["eras"] == ["new"] and c["vetoed"] == [HORROR] and [COMEDY] in c["genrePicks"], c
prop = check(bohdan.post(f"/api/rooms/{code}/proposals", json={"movieId": 120467}), "propose own film")  # Grand Budapest Hotel
assert any(p["id"] == 120467 for m in prop["members"] for p in m["proposals"])
r = bohdan.put(f"/api/rooms/{code}/prefs", json={"genres": [1, 2, 3, 4]})
print(f"{'✓' if r.status_code == 400 else '✗'} max 3 genres: {r.status_code}")
r = bohdan.post(f"/api/rooms/{code}/start")
print(f"{'✓' if r.status_code == 403 else '✗'} non-host cannot start: {r.status_code}")
started = check(anna.post(f"/api/rooms/{code}/start"), "start (deck build)")
deck = started["deck"]
print(f"    deck: {len(deck)} films, first: {deck[0]['title']} — {deck[0]['reasons']}")
assert any(c["id"] == 120467 and c.get("proposedBy") for c in deck), "proposal missing from deck"
for card in deck:
    if card.get("proposedBy"):
        continue  # proposals skip the filters on purpose
    assert HORROR not in card["genreIds"], ("vetoed genre", card["title"])
    assert COMEDY in card["genreIds"] or ANIMATION in card["genreIds"], card["title"]
    assert card["year"] >= 2010 and (card["runtime"] or 0) <= 120, (card["title"], card["year"], card["runtime"])
st = check(anna.get(f"/api/rooms/{code}", params={"deck": 0}), "proposals used up after start")
assert not any(m["proposals"] for m in st["members"])
both = [c["title"] for c in deck if COMEDY in c["genreIds"]]
print(f"    comedies (both picked it): {len(both)}/{len(deck)}; top 5: {[c['title'] for c in deck[:5]]}")
for i, card in enumerate(deck):
    anna.post(f"/api/rooms/{code}/votes", json={"movieId": card["id"], "like": i % 2 == 0})
    bohdan.post(f"/api/rooms/{code}/votes", json={"movieId": card["id"], "like": i % 3 == 0})
st = check(anna.get(f"/api/rooms/{code}", params={"deck": 0}), "state after votes")
print(f"    matches={st['matches'][:5]} results={len(st['results'])} everyoneDone={st['everyoneDone']}")
done = check(anna.post(f"/api/rooms/{code}/choose", json={"movieId": st["results"][0]["movieId"]}), "choose")
print("    tonight:", done["chosen"]["title"])
solo = check(anna.post("/api/rooms", json={}), "solo room")
deck = check(anna.post(f"/api/rooms/{solo['code']}/start"), "solo start")["deck"]
st = check(anna.post(f"/api/rooms/{solo['code']}/votes", json={"movieId": deck[0]["id"], "like": True}), "solo like")
assert st["matches"] == [], "a solo like must not be a match"
friends = check(bohdan.get("/api/friends"), "friends")
print("   ", [f["name"] for f in friends])
print("ALL GOOD")
