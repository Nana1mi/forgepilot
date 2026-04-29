// 任务服务层：管理任务的生命周期（创建→计划生成→审批→执行→完成/失败）
import { prisma } from "@/lib/db";
import { executeTask, generatePlan, generatePRSummary } from "@/server/agent";

/** 任务状态常量 */
export const TASK_STATUS = {
  pending: "pending",
  planning: "planning",
  awaitingApproval: "awaiting_approval",
  running: "running",
  failed: "failed",
  completed: "completed",
} as const;

export interface CreateTaskInput {
  projectId: string;
  title: string;
  prompt: string;
}

/** 将任意异常转换为可读的字符串信息 */
function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** 在后台执行异步任务，避免阻塞 API 响应 */
function runInBackground(work: () => Promise<void>) {
  setTimeout(() => {
    work().catch((error) => {
      console.error("后台任务执行失败", error);
    });
  }, 0);
}

/** 查询所有任务列表，附带所属项目信息 */
export async function listTasks() {
  return prisma.agentTask.findMany({
    orderBy: { createdAt: "desc" },
    include: { project: true },
  });
}

/** 根据任务 ID 查询详情，附带项目信息和执行日志 */
export async function getTaskById(id: string) {
  return prisma.agentTask.findUnique({
    where: { id },
    include: {
      project: true,
      agentLogs: { orderBy: { createdAt: "asc" } },
    },
  });
}

/** 根据任务 ID 获取详情（含项目），不存在时抛出异常 */
async function getTaskWithProjectOrThrow(id: string) {
  const task = await prisma.agentTask.findUnique({
    where: { id },
    include: { project: true },
  });

  if (!task) throw new Error("未找到该任务");
  return task;
}

/** 为指定任务调用 AI 生成结构化计划，并更新状态为待审批 */
export async function generatePlanForTask(id: string) {
  const task = await getTaskWithProjectOrThrow(id);
  const plan = await generatePlan(task);

  return prisma.agentTask.update({
    where: { id },
    data: {
      plan,
      status: TASK_STATUS.awaitingApproval,
      errorMessage: null,
    },
    include: { project: true },
  });
}

/** 创建新任务并在后台异步生成计划 */
export async function createTask(input: CreateTaskInput) {
  const task = await prisma.agentTask.create({
    data: {
      projectId: input.projectId,
      title: input.title,
      prompt: input.prompt,
      status: TASK_STATUS.planning,
    },
    include: { project: true },
  });

  runInBackground(async () => {
    try {
      await generatePlanForTask(task.id);
    } catch (error) {
      await prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: TASK_STATUS.failed,
          errorMessage: toErrorMessage(error),
          legacyLogs: toErrorMessage(error),
        },
      });
    }
  });

  return task;
}

/** 执行任务并收尾：如缺计划则先生成，执行代码变更、验证、生成 PR 摘要 */
async function executeAndFinalize(taskId: string, generateMissingPlan: boolean) {
  try {
    let task = await getTaskWithProjectOrThrow(taskId);

    if (!task.plan && generateMissingPlan) {
      const plan = await generatePlan(task);
      task = await prisma.agentTask.update({
        where: { id: taskId },
        data: { plan },
        include: { project: true },
      });
    }

    const execution = await executeTask(task);
    const afterExecution = await getTaskWithProjectOrThrow(taskId);
    const prSummary = await generatePRSummary(afterExecution);

    await prisma.agentTask.update({
      where: { id: taskId },
      data: {
        status: TASK_STATUS.completed,
        resultSummary: execution.summary,
        legacyResult: execution.summary,
        prSummary,
        errorMessage: null,
        legacyLogs: null,
      },
    });
  } catch (error) {
    const message = toErrorMessage(error);
    await prisma.agentTask.update({
      where: { id: taskId },
      data: {
        status: TASK_STATUS.failed,
        errorMessage: message,
        legacyLogs: message,
      },
    });
  }
}

/** 用户审批通过后开始执行任务 */
export async function approveTask(id: string) {
  const task = await prisma.agentTask.update({
    where: { id },
    data: {
      status: TASK_STATUS.running,
      approvedAt: new Date(),
      errorMessage: null,
      legacyLogs: null,
    },
    include: { project: true },
  });

  runInBackground(() => executeAndFinalize(id, false));
  return task;
}

/** 直接执行任务（无需审批，适合调试或 CLI 场景），如缺计划则自动补生成 */
export async function runTask(id: string) {
  const task = await prisma.agentTask.update({
    where: { id },
    data: {
      status: TASK_STATUS.running,
      errorMessage: null,
      legacyLogs: null,
    },
    include: { project: true },
  });

  runInBackground(() => executeAndFinalize(id, true));
  return task;
}
