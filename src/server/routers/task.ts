// 任务相关 tRPC 路由：列表、详情、创建、审批执行、直接执行
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/trpc";
import { approveTask, createTask, getTaskById, listTasks, runTask } from "@/server/task-service";

export const taskRouter = createTRPCRouter({
  /** 获取所有任务列表 */
  list: publicProcedure.query(async () => {
    return listTasks();
  }),

  /** 根据 ID 获取任务详情（含日志与项目） */
  getById: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    return getTaskById(input.id);
  }),

  /** 创建新任务并后台生成计划 */
  create: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        title: z.string().min(1),
        prompt: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      return createTask(input);
    }),

  /** 审批通过并开始执行任务 */
  approve: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    return approveTask(input.id);
  }),

  /** 直接执行任务（无需审批） */
  run: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    return runTask(input.id);
  }),
});
