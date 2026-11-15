# Notes for coding agents

- Backend is a modular monolith: `backend/app/<module>/{router,service,repository,api}.py`.
  Other modules import ONLY `<module>/api.py`. Layers: router → service → repository. Enforced by `backend/.venv/bin/lint-imports`.
- Pure logic lives in `recommendations/scoring.py` and `rooms/logic.py` — keep it I/O-free and covered by `backend/tests`.
- Domain errors (`app/shared/errors.py`) are mapped to HTTP codes in `app/main.py`; don't raise HTTPException in services.
- Auth: API Gateway verifies the Cognito JWT; the app reads claims via `shared/auth.current_user`. Every DynamoDB key uses the caller's `sub`.
  Two deliberate exceptions in `rooms`: an invite is written to a friend's partition and friends' `PRESENCE` is read —
  both only after checking the friendship edge stored under the caller's own `sub`.
- Test: `cd backend && .venv/bin/pytest && .venv/bin/lint-imports`; frontend: `cd frontend && npx tsc -b`.
- Deploy: `scripts/deploy.sh` (full) or `scripts/deploy-frontend.sh`. Secrets come from `.env`, never commit them.
- UI copy is Ukrainian.
