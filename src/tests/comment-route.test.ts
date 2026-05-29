import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import type { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/tasks/[id]/comments/route";
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
    },
    comment: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const userFindUnique = prisma.user.findUnique as unknown as Mock;
const membershipFindUnique = prisma.membership.findUnique as unknown as Mock;
const taskFindUnique = prisma.task.findUnique as unknown as Mock;
const commentFindMany = prisma.comment.findMany as unknown as Mock;
const commentCreate = prisma.comment.create as unknown as Mock;

function request(method: "GET" | "POST", userId: string, body?: unknown): NextRequest {
  return new Request("http://localhost/api/tasks/task_1/comments", {
    method,
    headers: {
      Authorization: `Bearer ${signToken({ userId, email: `${userId}@example.com` })}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  }) as NextRequest;
}

async function callGet(userId: string) {
  return GET(request("GET", userId), {
    params: Promise.resolve({ id: "task_1" }),
  });
}

async function callPost(userId: string, body: unknown = { body: "Looks good" }) {
  return POST(request("POST", userId, body), {
    params: Promise.resolve({ id: "task_1" }),
  });
}

describe("task comments route authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      email: `${where.id}@example.com`,
      name: "Test User",
    }));

    taskFindUnique.mockResolvedValue({ projectId: "project_1" });

    commentFindMany.mockResolvedValue([
      {
        id: "comment_1",
        taskId: "task_1",
        authorId: "viewer_1",
        body: "First comment",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        author: { id: "viewer_1", name: "Viewer", email: "viewer@example.com" },
      },
    ]);

    commentCreate.mockResolvedValue({
      id: "comment_2",
      taskId: "task_1",
      authorId: "member_1",
      body: "Looks good",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      author: { id: "member_1", name: "Member", email: "member@example.com" },
    });
  });

  it("allows a viewer to read comments", async () => {
    membershipFindUnique.mockResolvedValue({ role: "viewer" });

    const res = await callGet("viewer_1");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.comments).toHaveLength(1);
    expect(commentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { taskId: "task_1" },
        orderBy: { createdAt: "asc" },
      }),
    );
  });

  it("returns 403 when a non-member reads comments", async () => {
    membershipFindUnique.mockResolvedValue(null);

    const res = await callGet("outsider_1");

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "you are not a member of this project" });
    expect(commentFindMany).not.toHaveBeenCalled();
  });

  it("returns 403 when a viewer posts a comment", async () => {
    membershipFindUnique.mockResolvedValue({ role: "viewer" });

    const res = await callPost("viewer_1");

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "viewers cannot comment on tasks" });
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("allows a member to post a comment", async () => {
    membershipFindUnique.mockResolvedValue({ role: "member" });

    const res = await callPost("member_1");

    expect(res.status).toBe(201);
    expect(commentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          taskId: "task_1",
          authorId: "member_1",
          body: "Looks good",
        },
      }),
    );
  });

  it("allows an admin to post a comment", async () => {
    membershipFindUnique.mockResolvedValue({ role: "admin" });

    const res = await callPost("admin_1", { body: "Approved" });

    expect(res.status).toBe(201);
    expect(commentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          taskId: "task_1",
          authorId: "admin_1",
          body: "Approved",
        },
      }),
    );
  });
});
