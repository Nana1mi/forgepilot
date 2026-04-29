"use client";

// 项目详情页：展示仓库信息、任务列表，支持创建新任务
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Plus, Loader2, GitBranch, ListChecks } from "lucide-react";
import { getTaskStatusClassName, getTaskStatusLabel } from "@/lib/status";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const utils = trpc.useUtils();
  const { data: project, isLoading } = trpc.project.getById.useQuery({ id }, { refetchInterval: 3000 });
  const createTask = trpc.task.create.useMutation({
    onSuccess: () => utils.project.getById.invalidate({ id }),
  });

  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");

  if (isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  if (!project) return <div className="flex min-h-screen items-center justify-center">项目不存在</div>;

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> 返回首页
        </Link>
        <h1 className="text-3xl font-bold">{project.name}</h1>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <GitBranch className="h-4 w-4" />
          {project.repoUrl}
        </div>

        <div className="mt-8 rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">新建任务</h2>
          <div className="flex flex-col gap-3">
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="任务标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="描述你希望 AI 完成的工作..."
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <button
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 self-start"
              onClick={() => {
                if (title && prompt) createTask.mutate({ projectId: id, title, prompt });
              }}
              disabled={createTask.isPending || !title || !prompt}
            >
              {createTask.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              创建任务
            </button>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <ListChecks className="h-5 w-5" /> 任务列表
          </h2>
          <div className="space-y-3">
            {project.tasks.map((task) => (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className="block rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-accent/50"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{task.title}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${getTaskStatusClassName(task.status)}`}>
                    {getTaskStatusLabel(task.status)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{task.prompt}</p>
              </Link>
            ))}
            {project.tasks.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">暂无任务。</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
