"use client";

// 任务详情页：展示任务状态、AI 生成的计划、执行日志、PR 摘要，支持审批和直接执行
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle, Loader2, Play, AlertCircle } from "lucide-react";
import { getTaskStatusClassName, getTaskStatusLabel } from "@/lib/status";

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const utils = trpc.useUtils();
  const { data: task, isLoading } = trpc.task.getById.useQuery(
    { id },
    {
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "planning" || status === "running" ? 2000 : false;
      },
    }
  );
  const approveMutation = trpc.task.approve.useMutation({
    onSuccess: () => utils.task.getById.invalidate({ id }),
  });
  const runMutation = trpc.task.run.useMutation({
    onSuccess: () => utils.task.getById.invalidate({ id }),
  });

  if (isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  if (!task) return <div className="flex min-h-screen items-center justify-center">任务不存在</div>;

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href={`/projects/${task.project.id}`}
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> 返回项目
        </Link>
        <h1 className="text-3xl font-bold">{task.title}</h1>
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${getTaskStatusClassName(task.status)}`}
          >
            {task.status === "completed" ? (
              <CheckCircle className="h-3 w-3" />
            ) : task.status === "failed" || task.status === "error" ? (
              <AlertCircle className="h-3 w-3" />
            ) : task.status === "running" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {getTaskStatusLabel(task.status)}
          </span>
          <span>{new Date(task.createdAt).toLocaleString()}</span>
        </div>

        <div className="mt-6 space-y-6">
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-2 text-lg font-semibold">提示词</h2>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{task.prompt}</p>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">实施计划</h2>
              {task.status === "awaiting_approval" && (
                <button
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  onClick={() => approveMutation.mutate({ id })}
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  审批并执行
                </button>
              )}
              {(task.status === "pending" || task.status === "failed" || task.status === "error") && (
                <button
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  onClick={() => runMutation.mutate({ id })}
                  disabled={runMutation.isPending}
                >
                  {runMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  直接执行
                </button>
              )}
            </div>
            <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-sm">
              {task.plan ?? "正在生成计划..."}
            </pre>
          </section>

          {(task.errorMessage || task.legacyLogs) && (
            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold">错误信息</h2>
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-sm text-red-600">
                {task.errorMessage ?? task.legacyLogs}
              </pre>
            </section>
          )}

          {task.agentLogs.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold">执行日志</h2>
              <div className="max-h-96 overflow-auto space-y-2 rounded-md bg-muted p-4 text-sm">
                {task.agentLogs.map(
                  (log: {
                    id: string;
                    role: string;
                    content: string;
                    legacyStep: string | null;
                    legacyMessage: string | null;
                    createdAt: Date;
                  }) => (
                    <div key={log.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                      <span className="text-xs font-medium text-primary">[{log.legacyStep ?? log.role}]</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                      <p className="mt-0.5 whitespace-pre-wrap">{log.content || log.legacyMessage}</p>
                    </div>
                  )
                )}
              </div>
            </section>
          )}

          {task.prSummary && (
            <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold">PR 摘要</h2>
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-sm whitespace-pre-wrap">
                {task.prSummary}
              </pre>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
