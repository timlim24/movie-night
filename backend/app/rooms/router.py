from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.rooms import service
from app.shared.auth import CurrentUser, current_user

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


class Settings(BaseModel):
    includeRewatch: bool = True


class Prefs(BaseModel):
    genres: list[int] = []
    veto: list[int] = []
    maxRuntime: int | None = None
    eras: list[str] = []


class ProposeBody(BaseModel):
    movieId: int


class CreateBody(BaseModel):
    filters: Settings = Settings()


class InviteBody(BaseModel):
    userIds: list[str]


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


@router.get("/live")
def live(user: CurrentUser = Depends(current_user)) -> dict:
    """Invites + friends' open rooms. Declared before /{code} so 'live' is not read as a room code."""
    return service.live(user)


@router.get("/{code}")
def get_room(code: str, deck: int = 1, user: CurrentUser = Depends(current_user)) -> dict:
    return service.state(user, code, include_deck=bool(deck))


@router.post("/{code}/join")
def join(code: str, user: CurrentUser = Depends(current_user)) -> dict:
    return service.join(user, code)


@router.put("/{code}/filters")
def settings(code: str, body: Settings, user: CurrentUser = Depends(current_user)) -> dict:
    return service.update_settings(user, code, body.model_dump())


@router.put("/{code}/prefs")
def prefs(code: str, body: Prefs, user: CurrentUser = Depends(current_user)) -> dict:
    return service.set_prefs(user, code, body.model_dump())


@router.post("/{code}/invite")
def invite(code: str, body: InviteBody, user: CurrentUser = Depends(current_user)) -> dict:
    return service.invite(user, code, body.userIds)


@router.delete("/{code}/invite", status_code=204)
def dismiss_invite(code: str, user: CurrentUser = Depends(current_user)) -> None:
    service.dismiss_invite(user, code)


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


@router.post("/{code}/proposals")
def propose(code: str, body: ProposeBody, user: CurrentUser = Depends(current_user)) -> dict:
    return service.propose(user, code, body.movieId)


@router.delete("/{code}/proposals/{movie_id}")
def unpropose(code: str, movie_id: int, user: CurrentUser = Depends(current_user)) -> dict:
    return service.unpropose(user, code, movie_id)
