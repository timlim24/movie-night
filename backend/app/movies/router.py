from fastapi import APIRouter, Depends, Query

from app.movies import tmdb
from app.shared.auth import CurrentUser, current_user

router = APIRouter(prefix="/api", tags=["movies"])


@router.get("/movies/search")
def search(q: str = Query(min_length=1, max_length=100), _: CurrentUser = Depends(current_user)) -> list[dict]:
    return tmdb.search(q)[:12]


@router.get("/movies/{movie_id}")
def movie(movie_id: int, _: CurrentUser = Depends(current_user)) -> dict:
    return tmdb.details(movie_id)


@router.get("/genres")
def genres(_: CurrentUser = Depends(current_user)) -> list[dict]:
    return [{"id": k, "name": v} for k, v in tmdb.genres().items()]
