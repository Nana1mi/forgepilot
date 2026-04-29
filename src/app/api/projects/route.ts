import { NextResponse } from "next/server";
import { z } from "zod";
import { createProject, listProjects } from "@/server/project-service";

const createProjectSchema = z.object({
  repoUrl: z.string().url(),
  name: z.string().min(1),
});

function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  try {
    const input = createProjectSchema.parse(await request.json());
    const project = await createProject(input);
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
