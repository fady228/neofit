# NeoFit

Strength and conditioning for strikers. Log workouts offline, track PRs and exercise history, build your own programs, and get scored on eight athletic pillars against athletes like you.

- `backend/`  NestJS 12, Prisma 7, PostgreSQL 16
- `mobile/`   Expo SDK 58, React Native 0.88, TypeScript
- Design: the "Bold Ring" canvas (31 screens plus a flow map)

## Run it

```bash
docker compose up -d                    # Postgres on :5432

cd backend
cp .env.example .env
npm install
npx prisma generate
# First migration. Create it without applying, append the partial indexes, then apply:
npx prisma migrate dev --name init --create-only
cat prisma/sql/partial-indexes.sql >> prisma/migrations/*_init/migration.sql
npx prisma migrate dev
npm run seed:demo                       # reference data + demo coach/athletes (password123)
npm run build && npm start              # API on :3000

cd ../mobile
cp .env.example .env                    # set EXPO_PUBLIC_API_URL for your device
npm install
npx expo start
```

Demo logins (after `seed:demo`): `jamal@neofit.dev`, `sarah@neofit.dev`, coaches `dana@neofit.dev`, `marcus@neofit.dev`. Password `password123`.

Checks: `cd backend && npm run test:e2e` (API must be running) and `npm run typecheck` in both folders.

## Read this before you ship

1. **Norms and zones are starting points.** Target zones are suggested defaults the athlete can edit; have a coach review them before launch (`target_zones.reviewedBy`).
2. **Norms are placeholders.** `prisma/seed.ts` creates synthetic normal curves named "DEV PLACEHOLDER" so scoring works end to end. Replace them with sourced norm sets (see the norm-sourcing notes: FitnessVolt API, OpenPowerlifting for ceilings, FRIEND for VO2max, Marins/Cooper for push-ups). The app labels every score "Provisional" while a norm set is provisional. Have the licences reviewed before reusing published tables.
3. **Auth is built-in email and password** (JWT, bcrypt). `User.authId` is ready for Firebase Auth, Clerk or Supabase if you prefer to swap it.
4. **Use HTTPS in production.** Android blocks cleartext HTTP outside development.
5. **Media upload is not built.** Avatars and post images need object storage (S3 or R2) and a signed-upload endpoint.

## How scoring works

Lift logs feed scoring automatically: the best estimated 1RM (Epley, up to 12 reps) over 56 days is divided by bodyweight (chin-ups count bodyweight plus added load).

**Strength pillars use a target zone, not a percentile.** For a fighter, more strength stops paying off at some point, so the axis fills to 100 when you reach your zone and stays there. Past the zone the app says "maintain" and points you at power and speed. NeoFit ships suggested zones (`target_zones`, by sex); each athlete can edit or reset them (`athlete_target_zones`). The suggested numbers are starting points scaled from the book's ratios and common S&C practice, not validated ceilings. Percentile against lifters is still shown as context, never as the score, and zone pillars are not ranked on leaderboards.

Other pillars (power, aerobic, anaerobic, endurance) compare you with athletes like you: the value is matched to a norm cell by sex, age and bodyweight and interpolated to a percentile. Cooper distance converts to VO2max first. Lower-is-better tests (shuttle time) invert correctly. Goals (Punch power) combine pillar scores by weight and re-weight when a pillar is untested.

## Offline

The in-progress workout is saved on the phone on every change. Finished workouts go into a queue and sync with `POST /sync/push`, which is idempotent (client-generated UUIDs), so retries never duplicate sets or PRs.
