// tRPC 根路由聚合：将项目路由和任务路由合并为统一的 App Router
import { createTRPCRouter } from "@/server/trpc";
import { projectRouter } from "@/server/routers/project";
import { taskRouter } from "@/server/routers/task";

/** 统一的 tRPC App Router，前端通过此类型获得类型安全 */
export const appRouter = createTRPCRouter({
  project: projectRouter,
  task: taskRouter,
});

/** AppRouter 类型导出，供前端客户端使用 */
export type AppRouter = typeof appRouter;
