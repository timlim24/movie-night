"""Letterboxd without an API: the public RSS feed (last ~100 diary entries, with TMDB ids)
and the CSV export (parsed in the browser, sent here as {title, year, rating})."""

import re
import xml.etree.ElementTree as ET

import httpx

from app.shared.errors import DomainError, NotFound, UpstreamError

NS = {"letterboxd": "https://letterboxd.com", "tmdb": "https://themoviedb.org"}
USERNAME = re.compile(r"^[A-Za-z0-9_]{2,30}$")


def parse_rss(xml_text: str) -> list[dict]:
    root = ET.fromstring(xml_text)
    out: dict[int, dict] = {}
    for item in root.iter("item"):
        tmdb_id = item.findtext("tmdb:movieId", namespaces=NS)
        if not tmdb_id or not tmdb_id.isdigit():
            continue  # lists and non-film entries
        rating = item.findtext("letterboxd:memberRating", namespaces=NS)
        entry = {
            "movieId": int(tmdb_id),
            "title": item.findtext("letterboxd:filmTitle", namespaces=NS) or "",
            "year": item.findtext("letterboxd:filmYear", namespaces=NS),
            "myRating": float(rating) if rating else None,
            "liked": (item.findtext("letterboxd:memberLike", namespaces=NS) or "") == "Yes",
            "watchedAt": item.findtext("letterboxd:watchedDate", namespaces=NS),
        }
        out.setdefault(entry["movieId"], entry)  # newest entry wins
    return list(out.values())


def fetch_rss(username: str) -> list[dict]:
    username = username.strip().lstrip("@")
    m = re.search(r"letterboxd\.com/([A-Za-z0-9_]+)", username)
    if m:
        username = m.group(1)
    if not USERNAME.match(username):
        raise DomainError("Невірний нікнейм Letterboxd")
    try:
        r = httpx.get(
            f"https://letterboxd.com/{username}/rss/",
            headers={"User-Agent": "Mozilla/5.0 (compatible; MovieNight/1.0)"},
            timeout=8.0,
            follow_redirects=True,
        )
    except httpx.HTTPError as e:
        raise UpstreamError("Letterboxd не відповідає") from e
    if r.status_code == 404:
        raise NotFound("Такого профілю на Letterboxd немає")
    if r.status_code != 200:
        raise UpstreamError(f"Letterboxd відповів {r.status_code}. Спробуй імпорт CSV")
    return parse_rss(r.text)
