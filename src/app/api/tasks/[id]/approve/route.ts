import { NextResponse } from "next/server";
import { approveTask } from "@/server/task-service";

function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const task = await approveTask(id);
    return NextResponse.json(task);
  } catch (error) {
    return errorResponse(error);
  }
}
