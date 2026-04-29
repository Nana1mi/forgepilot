// 项目相关 tRPC 路由：列表、详情、创建（克隆仓库）、删除
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/trpc";
import { createProject, deleteProject, getProjectById, listProjects } from "@/server/project-service";

export const projectRouter = createTRPCRouter({
  /** 获取所有项目列表 */
  list: publicProcedure.query(async () => {
    return listProjects();
  }),

  /** 根据 ID 获取项目详情 */
  getById: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    return getProjectById(input.id);
  }),

  /** 创建新项目（克隆 GitHub 仓库） */
  create: publicProcedure
    .input(
      z.object({
        repoUrl: z.string().url(),
        name: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      return createProject(input);
    }),

  /** 删除项目及其本地仓库 */
  delete: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    return deleteProject(input.id);
  }),
});
