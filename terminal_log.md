Setup :
docker-compose up --build
docker-compose exec web npm run db:seed
npm test
Application started successfully on localhost:3000.

Initial Bug Discovery :
Logged in using viewer account:

dev@example.com
password123
Observed:

viewer could edit task title
viewer could move task status
viewer could save updates successfully

Curl Proof Before Fix:
curl -X PATCH http://localhost:3000/api/tasks/<TASK_ID> \
-H "Authorization: Bearer <VIEWER_TOKEN>" \
-H "Content-Type: application/json" \
-d '{"title":"Unauthorized Update"}'
Result:
200 OK

Fix Applied :
Added membership and role validation inside:

src/app/api/tasks/[id]/route.ts
Used existing getProjectMembership() and canEditTasks() helpers.

Tests Added :
Added route tests for:

viewer blocked
non-member blocked
member allowed
admin allowed

Curl Proof After Fix :
curl -X PATCH http://localhost:3000/api/tasks/<TASK_ID> \
-H "Authorization: Bearer <VIEWER_TOKEN>" \
-H "Content-Type: application/json" \
-d '{"title":"Unauthorized Update"}'
Result:
403 Forbidden

Final Validation :
npm test
npm run typecheck
All tests passing successfully.

___________________________________________________________________________________________________

Part 3a - Task Comments
Implemented append-only task comments feature.

Features added:

chronological comments
author name + timestamp
member/admin can post comments
viewers can only read comments
no edit/delete support
Database:

added Comment model
added migration for task_comments table
APIs added:

GET /api/tasks/[id]/comments
POST /api/tasks/[id]/comments
Authorization:

reused existing getProjectMembership()
reused canEditTasks()
Tests added:

viewer can read comments
viewer cannot post comments
non-member blocked
member/admin allowed to post
Validation:

docker-compose exec web npm test
docker-compose exec web npm run typecheck
All tests passing.

UX Fix - Scrollable Task Modal
While testing comments, task modal was growing outside viewport after many comments were added.

Fix:

added scrollable modal body
kept actions/buttons accessible
preserved existing functionality