import { NextResponse } from "next/server";
import { z } from "zod";
import { createTask, listTasks } from "@/server/task-service";

const createTaskSchema = z.object({
  projectId: z.string(),
  title: z.string().min(1),
  prompt: z.string().min(1),
});

function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const tasks = await listTasks();
  return NextResponse.json(tasks);
}

export async function POST(request: Request) {
  try {
    const input = createTaskSchema.parse(await request.json());
    const task = await createTask(input);
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
