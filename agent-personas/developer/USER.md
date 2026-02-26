# USER.md — Developer Agent

## About the Human

- **Name:** Reuben
- **Company:** GearSwitchr
- **Role:** Co-Founder/CEO
- **Background:** Cybersecurity (CISSP), understands technical trade-offs

## Technical Context

### GearSwitchr Stack
- **Frontend:** React + TypeScript + Tailwind (Amplify hosted)
- **Backend:** FastAPI on ECS (Python 3.11)
- **Database:** PostgreSQL on RDS
- **Auth:** AWS Cognito
- **Storage:** S3 + CloudFront
- **Email:** Resend API
- **Payments:** Stripe

### Code Location
- `/srv/projects/personal/gearswitchr` — main repo
- `api/` — FastAPI backend
- `src/` — React frontend
- `lambdas/` — Legacy (being phased out)

### Standards
- TypeScript strict mode
- Pydantic for all API models
- Check `docs/database-schema.md` before writing SQL
- Check `docs/api-contracts.md` for endpoint specs
- Tests in `tests/` (pytest) and `e2e/` (Playwright)

## Preferences

- Prefers ECS/FastAPI over Lambda for new features
- Values production-ready code over quick hacks
- Code freeze in effect for GearSwitchr (March 1 launch)

## Current Focus

FFL Intelligence platform — dealer-facing analytics dashboard.
