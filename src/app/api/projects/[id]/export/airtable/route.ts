import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  unauthorized,
  forbidden,
  notFound,
  getProjectMembership,
  canEditTasks,
} from "@/lib/auth";
import { exportTasksToAirtable, type ExportTask } from "@/lib/airtable";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id: projectId } = await params;
  const membership = await getProjectMembership(user.id, projectId);
  if (!membership) return forbidden("you are not a member of this project");
  if (!canEditTasks(membership.role)) {
    return forbidden("viewers cannot export tasks");
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tasks: {
        include: {
          assignee: { select: { name: true, email: true } },
          createdBy: { select: { name: true, email: true } },
        },
        orderBy: [{ status: "asc" }, { position: "asc" }],
      },
    },
  });
  if (!project) return notFound("project not found");

  const tasks: ExportTask[] = project.tasks.map((task) => ({
    id: task.id,
    projectId: task.projectId,
    projectName: project.name,
    title: task.title,
    description: task.description,
    status: task.status,
    assignee: task.assignee,
    createdBy: task.createdBy,
    position: task.position,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }));

  try {
    const exportResult = await exportTasksToAirtable(tasks);
    return NextResponse.json({ export: exportResult });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Airtable export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
