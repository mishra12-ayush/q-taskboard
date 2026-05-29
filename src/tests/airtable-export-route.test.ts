import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "@/app/api/projects/[id]/export/airtable/route";
import { signToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { exportTasksToAirtable } from "@/lib/airtable";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/airtable", () => ({
  exportTasksToAirtable: vi.fn(),
}));

const userFindUnique = prisma.user.findUnique as unknown as Mock;
const membershipFindUnique = prisma.membership.findUnique as unknown as Mock;
const projectFindUnique = prisma.project.findUnique as unknown as Mock;
const exportMock = exportTasksToAirtable as unknown as Mock;

function request(userId: string): NextRequest {
  return new Request("http://localhost/api/projects/project_1/export/airtable", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${signToken({ userId, email: `${userId}@example.com` })}`,
    },
  }) as NextRequest;
}

async function callPost(userId: string) {
  return POST(request(userId), {
    params: Promise.resolve({ id: "project_1" }),
  });
}

describe("POST /api/projects/:id/export/airtable", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      email: `${where.id}@example.com`,
      name: "Test User",
    }));

    projectFindUnique.mockResolvedValue({
      id: "project_1",
      name: "Launch",
      tasks: [
        {
          id: "task_1",
          projectId: "project_1",
          title: "Prepare launch",
          description: null,
          status: "todo",
          assignee: { name: "Assignee", email: "assignee@example.com" },
          createdBy: { name: "Creator", email: "creator@example.com" },
          position: 0,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ],
    });

    exportMock.mockResolvedValue({
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [{ taskId: "task_1", title: "Prepare launch", ok: true }],
    });
  });

  it("returns 403 for viewers", async () => {
    membershipFindUnique.mockResolvedValue({ role: "viewer" });

    const res = await callPost("viewer_1");

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "viewers cannot export tasks" });
    expect(exportMock).not.toHaveBeenCalled();
  });

  it("returns 403 for non-members", async () => {
    membershipFindUnique.mockResolvedValue(null);

    const res = await callPost("outsider_1");

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "you are not a member of this project" });
    expect(exportMock).not.toHaveBeenCalled();
  });

  it("allows members to export project tasks", async () => {
    membershipFindUnique.mockResolvedValue({ role: "member" });

    const res = await callPost("member_1");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.export).toMatchObject({ total: 1, succeeded: 1, failed: 0 });
    expect(exportMock).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "task_1",
        projectId: "project_1",
        projectName: "Launch",
        title: "Prepare launch",
      }),
    ]);
  });

  it("allows admins to export project tasks", async () => {
    membershipFindUnique.mockResolvedValue({ role: "admin" });

    const res = await callPost("admin_1");

    expect(res.status).toBe(200);
    expect(exportMock).toHaveBeenCalled();
  });
});
