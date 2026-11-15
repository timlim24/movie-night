from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.rooms import service
from app.shared.auth import CurrentUser, current_user

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


class Filters(BaseModel):
    genres: list[int] = []
    maxRuntime: int | None = None
    yearFrom: int | None = None
    yearTo: int | None = None
    includeRewatch: bool = True


class CreateBody(BaseModel):
    filters: Filters = Filters()


class VoteBody(BaseModel):
    movieId: int
    like: bool


class ChooseBody(BaseModel):
    movieId: int


class MascotBody(BaseModel):
    mascot: str


@router.post("")
def create(body: CreateBody, user: CurrentUser = Depends(current_user)) -> dict:
    return service.create(user, body.filters.model_dump())


@router.get("/{code}")
def get_room(code: str, deck: int = 1, user: CurrentUser = Depends(current_user)) -> dict:
    return service.state(user, code, include_deck=bool(deck))


@router.post("/{code}/join")
def join(code: str, user: CurrentUser = Depends(current_user)) -> dict:
    return service.join(user, code)


@router.put("/{code}/filters")
def filters(code: str, body: Filters, user: CurrentUser = Depends(current_user)) -> dict:
    return service.update_filters(user, code, body.model_dump())


@router.post("/{code}/mascot")
def mascot(code: str, body: MascotBody, user: CurrentUser = Depends(current_user)) -> dict:
    return service.set_mascot(user, code, body.mascot)


@router.post("/{code}/start")
def start(code: str, user: CurrentUser = Depends(current_user)) -> dict:
    return service.start(user, code)


@router.post("/{code}/next-round")
def next_round(code: str, user: CurrentUser = Depends(current_user)) -> dict:
    return service.next_round(user, code)


@router.post("/{code}/votes")
def vote(code: str, body: VoteBody, user: CurrentUser = Depends(current_user)) -> dict:
    return service.vote(user, code, body.movieId, body.like)


@router.post("/{code}/choose")
def choose(code: str, body: ChooseBody, user: CurrentUser = Depends(current_user)) -> dict:
    return service.choose(user, code, body.movieId)
