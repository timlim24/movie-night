from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.shared.auth import CurrentUser, current_user
from app.users import service

router = APIRouter(prefix="/api", tags=["users"])


class ProfilePatch(BaseModel):
    name: str | None = None
    mascot: str | None = None


@router.get("/me")
def me(user: CurrentUser = Depends(current_user)) -> dict:
    p = service.ensure_profile(user)
    return {**service.public(p), "email": p.get("email")}


@router.patch("/me")
def patch_me(body: ProfilePatch, user: CurrentUser = Depends(current_user)) -> dict:
    p = service.update_profile(user, body.name, body.mascot)
    return {**service.public(p), "email": p.get("email")}


@router.get("/friends")
def friends(user: CurrentUser = Depends(current_user)) -> list[dict]:
    return service.friends(user.id)
