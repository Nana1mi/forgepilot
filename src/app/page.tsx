"use client";

// 首页：展示所有项目列表，支持克隆新仓库和删除已有项目
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { useState } from "react";
import { FolderGit, Plus, Trash2, Loader2 } from "lucide-react";
import { getProjectStatusLabel } from "@/lib/status";

export default function HomePage() {
  const utils = trpc.useUtils();
  const { data: projects, isLoading } = trpc.project.list.useQuery();
  const createMutation = trpc.project.create.useMutation({
    onSuccess: () => utils.project.list.invalidate(),
  });
  const deleteMutation = trpc.project.delete.useMutation({
    onSuccess: () => utils.project.list.invalidate(),
  });

  const [repoUrl, setRepoUrl] = useState("");
  const [name, setName] = useState("");

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-8 text-3xl font-bold tracking-tight">ForgePilot 项目列表</h1>

        <div className="mb-8 rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">新建项目</h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="仓库链接 (https://github.com/...)"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
            <input
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="项目名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              onClick={() => {
                if (repoUrl && name) createMutation.mutate({ repoUrl, name });
              }}
              disabled={createMutation.isPending || !repoUrl || !name}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              克隆
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects?.map((project) => (
            <div
              key={project.id}
              className="group rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:bg-accent/50"
            >
              <div className="mb-3 flex items-start justify-between">
                <FolderGit className="h-5 w-5 text-muted-foreground" />
                <button
                  className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  aria-label={`删除项目 ${project.name}`}
                  title="删除项目"
                  onClick={() => deleteMutation.mutate({ id: project.id })}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </button>
              </div>
              <Link href={`/projects/${project.id}`} className="block">
                <h3 className="font-semibold text-card-foreground">{project.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground line-clamp-1">{project.repoUrl}</p>
              </Link>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-secondary px-2 py-0.5">{project.tasks.length} 个任务</span>
                <span className="rounded-full bg-secondary px-2 py-0.5">
                  {getProjectStatusLabel(project.status)}
                </span>
              </div>
            </div>
          ))}
          {projects?.length === 0 && (
            <div className="col-span-full text-center text-sm text-muted-foreground py-12">
              暂无项目，克隆一个仓库开始吧。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
