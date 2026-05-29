import { beforeEach, describe, expect, it, vi } from "vitest";

const airtableMock = vi.hoisted(() => ({
  table: {
    select: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("airtable", () => ({
  default: vi.fn().mockImplementation(() => ({
    base: vi.fn(() => vi.fn(() => airtableMock.table)),
  })),
}));

import { exportTasksToAirtable, type ExportTask } from "@/lib/airtable";

function task(id: string): ExportTask {
  return {
    id,
    projectId: "project_1",
    projectName: "Launch",
    title: `Task ${id}`,
    description: null,
    status: "todo",
    assignee: { name: "Assignee", email: "assignee@example.com" },
    createdBy: { name: "Creator", email: "creator@example.com" },
    position: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };
}

function page(records: unknown[]) {
  return { firstPage: vi.fn().mockResolvedValue(records) };
}

describe("exportTasksToAirtable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AIRTABLE_API_KEY = "pat_test";
    process.env.AIRTABLE_BASE_ID = "app_test";
    process.env.AIRTABLE_TABLE_NAME = "Tasks";
    delete process.env.AIRTABLE_TASKS_TABLE;
  });

  it("creates a record when a task has not been exported", async () => {
    airtableMock.table.select.mockReturnValue(page([]));
    airtableMock.table.create.mockResolvedValue({ id: "rec_new" });

    const result = await exportTasksToAirtable([task("task_1")]);

    expect(result).toMatchObject({ total: 1, succeeded: 1, failed: 0 });
    expect(airtableMock.table.create).toHaveBeenCalledWith(
      expect.objectContaining({
        "Task ID": "task_1",
        Title: "Task task_1",
      }),
    );
  });

  it("updates an existing Airtable record for idempotent re-export", async () => {
    airtableMock.table.select.mockReturnValue(page([{ id: "rec_existing" }]));
    airtableMock.table.update.mockResolvedValue({ id: "rec_existing" });

    const result = await exportTasksToAirtable([task("task_1")]);

    expect(result.results[0]).toMatchObject({ ok: true, action: "updated" });
    expect(airtableMock.table.create).not.toHaveBeenCalled();
    expect(airtableMock.table.update).toHaveBeenCalledWith(
      "rec_existing",
      expect.objectContaining({ "Task ID": "task_1" }),
    );
  });

  it("supports the legacy AIRTABLE_TASKS_TABLE env var", async () => {
    delete process.env.AIRTABLE_TABLE_NAME;
    process.env.AIRTABLE_TASKS_TABLE = "Tasks";
    airtableMock.table.select.mockReturnValue(page([]));
    airtableMock.table.create.mockResolvedValue({ id: "rec_new" });

    const result = await exportTasksToAirtable([task("task_1")]);

    expect(result.succeeded).toBe(1);
  });

  it("retries transient Airtable failures", async () => {
    const transient = Object.assign(new Error("rate limited"), { statusCode: 429 });
    airtableMock.table.select
      .mockReturnValueOnce({ firstPage: vi.fn().mockRejectedValue(transient) })
      .mockReturnValueOnce(page([]));
    airtableMock.table.create.mockResolvedValue({ id: "rec_new" });

    const result = await exportTasksToAirtable([task("task_1")]);

    expect(result.succeeded).toBe(1);
    expect(airtableMock.table.select).toHaveBeenCalledTimes(2);
  });

  it("does not retry permanent failures and continues with remaining tasks", async () => {
    const permanent = Object.assign(new Error("bad request"), { statusCode: 422 });
    airtableMock.table.select.mockReturnValue(page([]));
    airtableMock.table.create
      .mockRejectedValueOnce(permanent)
      .mockResolvedValueOnce({ id: "rec_second" });

    const result = await exportTasksToAirtable([task("task_1"), task("task_2")]);

    expect(result).toMatchObject({ total: 2, succeeded: 1, failed: 1 });
    expect(result.results[0]).toMatchObject({ taskId: "task_1", ok: false });
    expect(result.results[1]).toMatchObject({ taskId: "task_2", ok: true });
    expect(airtableMock.table.create).toHaveBeenCalledTimes(2);
  });
});
