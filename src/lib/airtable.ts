import Airtable from "airtable";

type ExportUser = {
  name: string;
  email: string;
} | null;

export type ExportTask = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string | null;
  status: string;
  assignee: ExportUser;
  createdBy: ExportUser;
  position: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ExportRecordResult = {
  taskId: string;
  title: string;
  ok: boolean;
  action?: "created" | "updated";
  recordId?: string;
  error?: string;
};

export type ExportResult = {
  total: number;
  succeeded: number;
  failed: number;
  results: ExportRecordResult[];
};

type AirtableTaskFields = Airtable.FieldSet;

function getAirtableTable() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME ?? process.env.AIRTABLE_TASKS_TABLE;

  if (!apiKey || !baseId || !tableName) {
    throw new Error("missing Airtable configuration");
  }

  const airtable = new Airtable({ apiKey, noRetryIfRateLimited: true });
  return airtable.base(baseId)<AirtableTaskFields>(tableName);
}

function taskToFields(task: ExportTask, taskIdField: string): AirtableTaskFields {
  const fields: AirtableTaskFields = {
    "Project ID": task.projectId,
    "Project Name": task.projectName,
    Title: task.title,
    Description: task.description ?? undefined,
    Status: task.status,
    "Assignee Name": task.assignee?.name,
    "Assignee Email": task.assignee?.email,
    "Created By Name": task.createdBy?.name,
    "Created By Email": task.createdBy?.email,
    Position: task.position,
    "Created At": task.createdAt.toISOString(),
    "Updated At": task.updatedAt.toISOString(),
  };
  fields[taskIdField] = task.id;

  return Object.fromEntries(
    Object.entries(fields).filter((entry): entry is [string, string | number] => {
      return entry[1] !== undefined;
    }),
  );
}

function escapeFormulaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isTransientAirtableError(error: unknown): boolean {
  const maybeError = error as { statusCode?: number; code?: string };
  const status = maybeError.statusCode;
  if (status === 429 || (typeof status === "number" && status >= 500)) return true;
  return ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(maybeError.code ?? "");
}

function hasUnknownFieldError(error: unknown, fieldName?: string): boolean {
  const message = errorMessage(error).toLowerCase();
  return message.includes("unknown field") && (!fieldName || message.includes(fieldName.toLowerCase()));
}

function removeUnknownFields(fields: AirtableTaskFields, error: unknown): AirtableTaskFields {
  const message = errorMessage(error);
  const match = message.match(/Unknown field names?:\s*([^()]+)/i);
  if (!match) return fields;

  const unknown = match[1]
    .split(",")
    .map((field) => field.trim().toLowerCase())
    .filter(Boolean);

  return Object.fromEntries(
    Object.entries(fields).filter(([name]) => !unknown.includes(name.toLowerCase())),
  );
}

async function withRetry<T>(operation: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientAirtableError(error) || attempt === maxAttempts) break;
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }

  throw lastError;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const details = error as { message?: string; error?: string; statusCode?: number };
    const message = details.message ?? details.error;
    if (message && details.statusCode) return `${message} (${details.statusCode})`;
    if (message) return message;
  }
  return "Airtable export failed";
}

async function upsertTask(
  table: Airtable.Table<AirtableTaskFields>,
  task: ExportTask,
  taskIdField = process.env.AIRTABLE_TASK_ID_FIELD ?? "Task ID",
): Promise<ExportRecordResult> {
  let fields = taskToFields(task, taskIdField);
  let existing: Airtable.Records<AirtableTaskFields>;

  try {
    existing = await table
      .select({
        filterByFormula: `{${taskIdField}} = "${escapeFormulaString(task.id)}"`,
        maxRecords: 1,
      })
      .firstPage();
  } catch (error) {
    if (taskIdField === "Task ID" && !process.env.AIRTABLE_TASK_ID_FIELD && hasUnknownFieldError(error, "Task ID")) {
      return upsertTask(table, task, "Name");
    }
    if (taskIdField === "Name" && !process.env.AIRTABLE_TASK_ID_FIELD && hasUnknownFieldError(error, "Name")) {
      return upsertTask(table, task, "Title");
    }
    throw error;
  }

  if (existing[0]) {
    let updated;
    try {
      updated = await table.update(existing[0].id, fields);
    } catch (error) {
      if (!hasUnknownFieldError(error)) throw error;
      fields = removeUnknownFields(fields, error);
      updated = await table.update(existing[0].id, fields);
    }
    return {
      taskId: task.id,
      title: task.title,
      ok: true,
      action: "updated",
      recordId: updated.id,
    };
  }

  let created;
  try {
    created = await table.create(fields);
  } catch (error) {
    if (!hasUnknownFieldError(error)) throw error;
    fields = removeUnknownFields(fields, error);
    created = await table.create(fields);
  }

  return {
    taskId: task.id,
    title: task.title,
    ok: true,
    action: "created",
    recordId: created.id,
  };
}

export async function exportTasksToAirtable(tasks: ExportTask[]): Promise<ExportResult> {
  const table = getAirtableTable();
  const results: ExportRecordResult[] = [];

  for (const task of tasks) {
    try {
      results.push(await withRetry(() => upsertTask(table, task)));
    } catch (error) {
      results.push({
        taskId: task.id,
        title: task.title,
        ok: false,
        error: errorMessage(error),
      });
    }
  }

  const succeeded = results.filter((result) => result.ok).length;
  return {
    total: tasks.length,
    succeeded,
    failed: tasks.length - succeeded,
    results,
  };
}
