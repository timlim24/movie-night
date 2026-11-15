from app.library import letterboxd
from app.library import repository as repo
from app.movies import api as movies
from app.shared.errors import DomainError, NotFound

MAX_IMPORT_BATCH = 60


def _item_from_card(card: dict, source: str, **extra) -> dict:
    return {
        "movieId": card["id"],
        "title": card["title"],
        "originalTitle": card.get("originalTitle", ""),
        "year": card.get("year"),
        "poster": card.get("poster"),
        "genreIds": card.get("genreIds", []),
        "genres": card.get("genres", []),
        "tmdbRating": card.get("rating"),
        "popularity": card.get("popularity"),
        "source": source,
        "rewatch": False,
        "addedAt": repo.now(),
        **{k: v for k, v in extra.items() if v is not None},
    }


def _validate_rating(rating: float | None) -> None:
    if rating is not None and not (0.5 <= rating <= 5 and (rating * 2).is_integer()):
        raise DomainError("Оцінка — від 0.5 до 5 з кроком 0.5")


def list_library(user_id: str) -> list[dict]:
    return sorted(repo.list_items(user_id), key=lambda i: i.get("watchedAt") or i.get("addedAt") or "", reverse=True)


def add(user_id: str, movie_id: int, rating: float | None, rewatch: bool) -> dict:
    _validate_rating(rating)
    card = movies.details(movie_id)
    item = _item_from_card(card, "manual", myRating=rating)
    item["rewatch"] = rewatch
    repo.put_items(user_id, [item], keep_user_fields=False)
    return item


def update(user_id: str, movie_id: int, fields: dict) -> dict:
    if "myRating" in fields:
        _validate_rating(fields["myRating"])
    if "rewatch" in fields and not isinstance(fields["rewatch"], bool):
        raise DomainError("rewatch must be true/false")
    if not fields:
        item = repo.get_item(user_id, movie_id)
        if not item:
            raise NotFound("Цього фільму немає в бібліотеці")
        return item
    try:
        return repo.update_item(user_id, movie_id, fields)
    except Exception as e:
        if "ConditionalCheckFailed" in type(e).__name__ or "ConditionalCheckFailed" in str(e):
            raise NotFound("Цього фільму немає в бібліотеці") from e
        raise


def remove(user_id: str, movie_id: int) -> None:
    repo.delete_item(user_id, movie_id)


def import_titles(user_id: str, entries: list[dict]) -> dict:
    """CSV import: match {title, year} against TMDB search. One batch must fit in one API call (< 29 s)."""
    if len(entries) > MAX_IMPORT_BATCH:
        raise DomainError(f"Не більше {MAX_IMPORT_BATCH} фільмів за раз")

    def match(e: dict) -> dict | None:
        year = int(e["year"]) if str(e.get("year") or "").isdigit() else None
        results = movies.search(e["title"], year=year)
        if not results and year:
            results = movies.search(e["title"])
        return results[0] if results else None

    matches = movies.parallel(match, entries)
    items, missing = [], []
    for entry, card in zip(entries, matches):
        if card is None:
            missing.append(entry["title"])
            continue
        rating = entry.get("rating")
        rating = float(rating) if rating not in (None, "") else None
        items.append(_item_from_card(card, "letterboxd", myRating=rating, watchedAt=entry.get("watchedAt") or None))
    if items:
        repo.put_items(user_id, items)
    return {"imported": len(items), "notFound": missing}


def import_letterboxd_rss(user_id: str, username: str) -> dict:
    entries = letterboxd.fetch_rss(username)
    if not entries:
        return {"imported": 0, "notFound": [], "note": "У профілі немає переглядів у щоденнику"}
    cards = movies.parallel(lambda e: movies.details(e["movieId"]), entries)
    items = []
    for e, card in zip(entries, cards):
        if card is None:
            continue
        rating = e["myRating"]
        if rating is None and e["liked"]:
            rating = 4.5  # a ♥ without stars still means "loved it"
        items.append(_item_from_card(card, "letterboxd", myRating=rating, watchedAt=e["watchedAt"]))
    if items:
        repo.put_items(user_id, items)
    return {"imported": len(items), "notFound": [e["title"] for e, c in zip(entries, cards) if c is None]}
