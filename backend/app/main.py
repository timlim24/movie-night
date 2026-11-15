"""Composition root: mounts each module's router and maps domain errors to HTTP in one place."""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from mangum import Mangum

from app.library.router import router as library_router
from app.movies.router import router as movies_router
from app.rooms.router import router as rooms_router
from app.shared.errors import DomainError
from app.users.router import router as users_router

logging.getLogger().setLevel(logging.INFO)

app = FastAPI(title="Movie Night API", docs_url="/api/docs", openapi_url="/api/openapi.json")

for r in (users_router, movies_router, library_router, rooms_router):
    app.include_router(r)


@app.exception_handler(DomainError)
def domain_error(_: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"detail": exc.message})


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


handler = Mangum(app, lifespan="off")
