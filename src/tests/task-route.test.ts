import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import type { NextRequest } from "next/server";
import { PATCH } from "@/app/api/tasks/[id]/route";
import { signToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
    },
    task: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const userFindUnique = prisma.user.findUnique as unknown as Mock;
const membershipFindUnique = prisma.membership.findUnique as unknown as Mock;
const taskFindUnique = prisma.task.findUnique as unknown as Mock;
const taskUpdate = prisma.task.update as unknown as Mock;

function patchRequest(userId: string, body: unknown): NextRequest {
  return new Request("http://localhost/api/tasks/task_1", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${signToken({ userId, email: `${userId}@example.com` })}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as NextRequest;
}

async function callPatch(userId: string, body: unknown = { title: "Updated title" }) {
  return PATCH(patchRequest(userId, body), {
    params: Promise.resolve({ id: "task_1" }),
  });
}

describe("PATCH /api/tasks/:id authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      email: `${where.id}@example.com`,
      name: "Test User",
    }));

    taskFindUnique.mockResolvedValue({
      id: "task_1",
      projectId: "project_1",
      title: "Original title",
      description: null,
      status: "todo",
      assigneeId: null,
      createdById: "creator_1",
      position: 0,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    taskUpdate.mockResolvedValue({
      id: "task_1",
      projectId: "project_1",
      title: "Updated title",
      description: null,
      status: "todo",
      assigneeId: null,
      createdById: "creator_1",
      position: 0,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      assignee: null,
    });
  });

  it("returns 403 when a viewer updates a task", async () => {
    membershipFindUnique.mockResolvedValue({ role: "viewer" });

    const res = await callPatch("viewer_1");

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "viewers cannot update tasks" });
    expect(taskUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 when a non-member updates a task", async () => {
    membershipFindUnique.mockResolvedValue(null);

    const res = await callPatch("outsider_1");

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "you are not a member of this project" });
    expect(taskUpdate).not.toHaveBeenCalled();
  });

  it("allows a member to update a task", async () => {
    membershipFindUnique.mockResolvedValue({ role: "member" });

    const res = await callPatch("member_1");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.task.title).toBe("Updated title");
    expect(taskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task_1" },
        data: { title: "Updated title" },
      }),
    );
  });

  it("allows an admin to update a task", async () => {
    membershipFindUnique.mockResolvedValue({ role: "admin" });

    const res = await callPatch("admin_1", { status: "done" });

    expect(res.status).toBe(200);
    expect(taskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task_1" },
        data: { status: "done" },
      }),
    );
  });
});
