# TaskBoard — Project Management App

A Next.js 15 fullstack application for managing projects, tasks, and team members. TypeScript + Prisma + PostgreSQL on the server, React 19 + TanStack Query on the client.

## Quick Setup (Docker — Recommended)

```bash
# Clone and enter the repo
git clone <repo-url> && cd taskboard

# Start the app and database
docker-compose up --build

# In a separate terminal, set up the database
docker-compose exec web npm run db:seed

# Run the test suite
docker-compose exec web npm test

# The app is now running at http://localhost:3000
```

## Manual Setup (without Docker)

Requires: Node.js 20+, PostgreSQL 15+

```bash
# Run the setup script (installs deps, sets up DB, configures git hooks)
chmod +x bin/setup
./bin/setup

# Or do it manually:
npm install
git config core.hooksPath .git-hooks
cp .env.example .env   # then edit DATABASE_URL if your local Postgres differs
npx prisma migrate deploy
npx prisma generate
npm run db:seed
npm test
npm run dev
```

## AI Tool Conversation Tracking

**This repository is configured to automatically capture your AI coding tool conversation history with each git commit.** This includes conversations from Claude Code, Cursor, Aider, Continue.dev, Cody, Cline, and Windsurf.

This is part of the Ajackus evaluation process. We evaluate how you collaborate with AI tools — your prompting strategy, how you break down problems, and how you review AI suggestions. The captured conversations help us understand your workflow.

**How it works:**
- A pre-commit git hook runs automatically before each commit
- It copies conversation files from AI tool directories (e.g., `.claude/`, `.cursor/`) into `.ai-conversations/`
- These files are staged and included in your commit
- You don't need to do anything — it happens automatically

**What's captured:** Only AI tool conversation logs stored in the project directory. No system files, browsing history, or anything outside this repository.

**If you prefer a tool that doesn't store local conversations** (like browser-based ChatGPT), the screen recording will capture your interactions instead. No additional action needed from you.

## Seed Data

The seed file creates:
- 5 users across 3 projects with different roles (admin / member / viewer)
- 3 projects with realistic task distributions
- 12 tasks spanning all four statuses (`todo`, `in_progress`, `review`, `done`)

All user passwords are: `password123`

| Email | Role on which project |
|-------|----------------------|
| meera@taskboard.dev | admin on Q3 Launch & Internal Tools, member on Onboarding |
| arjun@taskboard.dev | admin on Onboarding, member on Q3 Launch |
| kavya@example.com | member on Q3 Launch |
| dev@example.com | viewer on Q3 Launch |
| lina@example.com | member on Onboarding |

## Authentication

Register or login to get a JWT token:

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"meera@taskboard.dev","password":"password123"}'

# Use the returned token
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/projects
```

## Airtable Task Export

Required environment variables:

```bash
AIRTABLE_API_KEY=pat_your_airtable_personal_access_token
AIRTABLE_BASE_ID=app_your_base_id
AIRTABLE_TABLE_NAME=Tasks
```

`AIRTABLE_TASKS_TABLE` is still accepted as a fallback for older local setups.

Expected Airtable table structure for `AIRTABLE_TABLE_NAME`:

| Field name | Type |
|------------|------|
| Task ID | Single line text, unique |
| Project ID | Single line text |
| Project Name | Single line text |
| Title | Single line text |
| Description | Long text |
| Status | Single select or single line text |
| Assignee Name | Single line text |
| Assignee Email | Email or single line text |
| Created By Name | Single line text |
| Created By Email | Email or single line text |
| Position | Number |
| Created At | Date/time or single line text |
| Updated At | Date/time or single line text |

Setup and validation commands:

```bash
npm install
npx prisma migrate deploy
npx prisma generate
npm run db:seed
npm run typecheck
npm test
npm run dev
```

Proof curl:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"meera@taskboard.dev","password":"password123"}' \
  | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).token))")

PROJECT_ID=$(curl -s http://localhost:3000/api/projects \
  -H "Authorization: Bearer $TOKEN" \
  | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).projects[0].id))")

curl -X POST "http://localhost:3000/api/projects/$PROJECT_ID/export/airtable" \
  -H "Authorization: Bearer $TOKEN"
```

Loom demo validation steps:

1. Show the `.env` file has the three Airtable variables set.
2. Open Airtable and show the `Tasks` table with the expected fields.
3. Run `npm run typecheck` and `npm test`.
4. Start the app with `npm run dev`.
5. Log in as `meera@taskboard.dev` / `password123`.
6. Open a project where the user is admin/member and click `export to Airtable`.
7. Show the loading state, then the success summary.
8. Refresh Airtable and show task rows were created.
9. Click export again and show rows are updated rather than duplicated because `Task ID` is reused.
10. Log in as `dev@example.com` / `password123` on Q3 Launch and show the export button is hidden.
11. Run the proof curl with the viewer token and show the API returns `403`.

Git commands after validation:

```bash
git status --short
git add package-lock.json README.md src/lib/airtable.ts "src/app/api/projects/[id]/export/airtable/route.ts" "src/app/projects/[id]/page.tsx" src/tests/airtable-service.test.ts src/tests/airtable-export-route.test.ts
git commit -m "Add Airtable task export"
git status --short
```

## API Endpoints

### Auth
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Sign in, get JWT
- `GET /api/users/me` — Current user (authenticated)

### Projects
- `GET /api/projects` — List projects you're a member of (authenticated)
- `POST /api/projects` — Create a project (authenticated; creator becomes admin)
- `GET /api/projects/:id` — Project detail with tasks and members (authenticated)
- `PATCH /api/projects/:id` — Update project (authenticated)
- `DELETE /api/projects/:id` — Delete project (authenticated)

### Tasks
- `GET /api/projects/:id/tasks` — List tasks in a project (authenticated)
- `POST /api/projects/:id/tasks` — Create a task (authenticated)
- `PATCH /api/tasks/:id` — Update a task (authenticated)
- `DELETE /api/tasks/:id` — Delete a task (authenticated)

## Tech Stack

- Node.js 20 (runtime)
- Next.js 15 (App Router) / React 19
- TypeScript 5 (strict mode)
- Prisma 6 + PostgreSQL 16
- TanStack Query 5 (client data)
- Zod 3 (schema validation)
- Tailwind CSS 3
- bcryptjs + jsonwebtoken
- Vitest 2 (testing)
