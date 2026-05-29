
1. Missing authorization check in PATCH /api/tasks/:id
File: src/app/api/tasks/[id]/route.ts
Category: Security
Severity: Critical

PATCH task API was allowing viewer users to update task title and status. Create and delete APIs were checking membership properly using canEditTasks() but PATCH route was missing the same validation.

Fix:
Added membership + role validation before prisma.task.update() and blocked viewer/non-member users with 403.

Curl used:

curl -X PATCH http://localhost:3000/api/tasks/<TASK_ID> \
-H "Authorization: Bearer <VIEWER_TOKEN>" \
-H "Content-Type: application/json" \
-d '{"title":"test"}'
Before fix:
Task was getting updated successfully.

After fix:
403 Forbidden returned.

2. Editable UI exposed to read-only viewers
File: src/components/TaskDetail.tsx
Category: UX / Security
Severity: Medium

Viewer users can still see editable fields and update buttons in task detail modal even though backend blocks the update now. UI should also respect role permissions properly.

Fix:
Disable or hide edit actions for viewer role users.

3. Missing frontend permission gating
File: src/components/TaskBoard.tsx, src/components/TaskCard.tsx
Category: Architecture
Severity: Medium

Frontend currently allows viewers to attempt drag/drop and edit interactions. Backend rejects the request, but frontend should ideally stop unauthorized actions earlier itself.

Fix:
Add role-based gating before enabling edit or drag interactions.

4. Authorization logic is duplicated across routes
File: src/app/api/tasks/[id]/route.ts
Category: Architecture
Severity: Medium

Task create/delete routes were using centralized permission helpers properly, but PATCH route had separate logic and missed the authorization check completely. This inconsistency caused the security issue.

Fix:
Keep authorization flow shared and reusable across all task mutation APIs.