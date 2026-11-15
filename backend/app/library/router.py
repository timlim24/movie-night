from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.library import service
from app.shared.auth import CurrentUser, current_user

router = APIRouter(prefix="/api/library", tags=["library"])


class AddBody(BaseModel):
    movieId: int
    rating: float | None = None
    rewatch: bool = False


class PatchBody(BaseModel):
    rewatch: bool | None = None
    myRating: float | None = None
    clearRating: bool = False


class ImportEntry(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    year: int | str | None = None
    rating: float | str | None = None
    watchedAt: str | None = None


class ImportBody(BaseModel):
    items: list[ImportEntry]


class LetterboxdBody(BaseModel):
    username: str = Field(min_length=2, max_length=100)


@router.get("")
def list_library(user: CurrentUser = Depends(current_user)) -> list[dict]:
    return service.list_library(user.id)


@router.post("")
def add(body: AddBody, user: CurrentUser = Depends(current_user)) -> dict:
    return service.add(user.id, body.movieId, body.rating, body.rewatch)


@router.patch("/{movie_id}")
def patch(movie_id: int, body: PatchBody, user: CurrentUser = Depends(current_user)) -> dict:
    fields: dict = {}
    if body.rewatch is not None:
        fields["rewatch"] = body.rewatch
    if body.clearRating:
        fields["myRating"] = None
    elif body.myRating is not None:
        fields["myRating"] = body.myRating
    return service.update(user.id, movie_id, fields)


@router.delete("/{movie_id}", status_code=204)
def delete(movie_id: int, user: CurrentUser = Depends(current_user)) -> None:
    service.remove(user.id, movie_id)


@router.post("/import")
def import_csv(body: ImportBody, user: CurrentUser = Depends(current_user)) -> dict:
    return service.import_titles(user.id, [e.model_dump() for e in body.items])


@router.post("/letterboxd")
def import_letterboxd(body: LetterboxdBody, user: CurrentUser = Depends(current_user)) -> dict:
    return service.import_letterboxd_rss(user.id, body.username)
