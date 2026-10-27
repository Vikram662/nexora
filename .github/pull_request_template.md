## What changed

<!-- One or two sentences. PR title follows the commit format: type(scope): subject -->

## Why

## How it was tested

- [ ] `backend`: typecheck, lint, unit tests, build
- [ ] `frontend`: typecheck, lint, build
- [ ] Checked in the browser (screenshots below for UI changes)

## Checklist

- [ ] No new cross-module import in `backend/libs/modules/*`
- [ ] No secret, DB access or partner key in `frontend/`
- [ ] Env keys added to `.env.example` and `README.md`
- [ ] DB change has a Prisma migration (or `database/manual/` SQL + rollback)
- [ ] Rollback steps known

## Rollback
