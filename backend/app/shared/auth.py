"""Who is calling?

AuthN is done before the Lambda runs: API Gateway's JWT authorizer verifies the Cognito
ID token (signature, issuer, audience, expiry). Here we only read the verified claims.
AuthZ (what this user may do) lives in each module's service.
"""

from dataclasses import dataclass

from fastapi import HTTPException, Request

from app.shared.config import settings


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str
    name: str
    picture: str | None


def _claims_from_event(request: Request) -> dict | None:
    event = request.scope.get("aws.event") or {}
    return (((event.get("requestContext") or {}).get("authorizer") or {}).get("jwt") or {}).get("claims")


def current_user(request: Request) -> CurrentUser:
    claims = _claims_from_event(request)
    if not claims and settings().dev_auth:
        dev = request.headers.get("X-Dev-User")
        if dev:
            claims = {"sub": dev, "email": f"{dev}@dev.local", "name": dev.title()}
    if not claims or "sub" not in claims:
        raise HTTPException(status_code=401, detail="unauthorized")

    email = claims.get("email", "")
    name = (claims.get("name") or "").strip() or (email.split("@")[0] if email else "Глядач")
    return CurrentUser(id=claims["sub"], email=email, name=name, picture=claims.get("picture") or None)
