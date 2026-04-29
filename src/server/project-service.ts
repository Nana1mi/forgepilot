// 项目服务层：负责仓库的克隆、查询、删除等操作
import fs from "fs";
import path from "path";
import simpleGit from "simple-git";
import { prisma } from "@/lib/db";
import { assertInsideWorkspace, assertProjectInsideWorkspace, WORKSPACE_DIR } from "@/server/safety";

/** 创建项目时所需的输入参数 */
export interface CreateProjectInput {
  repoUrl: string;
  name: string;
}

/** 将项目名称中的非安全字符替换为下划线，防止目录名异常 */
function sanitizeProjectName(name: string) {
  const sanitized = name.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  return sanitized || "project";
}

/** 校验仓库 URL 是否为 GitHub 链接（MVP 阶段仅支持 GitHub） */
function assertGitHubRepoUrl(repoUrl: string) {
  const url = new URL(repoUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.hostname !== "github.com") {
    throw new Error("此 MVP 仅支持 https://github.com/... 格式的仓库链接。");
  }
}

/** 查询所有项目列表，按创建时间倒序排列，附带任务信息 */
export async function listProjects() {
  return prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: { tasks: true },
  });
}

/** 根据项目 ID 查询详情，附带按时间倒序排列的任务列表 */
export async function getProjectById(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: { tasks: { orderBy: { createdAt: "desc" } } },
  });
}

/** 克隆 GitHub 仓库并在数据库中创建项目记录（浅克隆，仅保留最近一层提交历史） */
export async function createProject(input: CreateProjectInput) {
  assertGitHubRepoUrl(input.repoUrl);

  await fs.promises.mkdir(WORKSPACE_DIR, { recursive: true });
  const localPath = assertInsideWorkspace(
    path.join(WORKSPACE_DIR, `${sanitizeProjectName(input.name)}_${Date.now()}`),
    "项目克隆路径"
  );

  await fs.promises.mkdir(localPath, { recursive: true });
  const git = simpleGit();
  await git.clone(input.repoUrl, localPath, ["--depth", "1"]);

  return prisma.project.create({
    data: {
      name: input.name,
      repoUrl: input.repoUrl,
      localPath,
    },
    include: { tasks: true },
  });
}

/** 删除项目及其本地仓库目录 */
export async function deleteProject(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
  });

  if (project) {
    const localPath = assertProjectInsideWorkspace(project.localPath);
    await fs.promises.rm(localPath, { recursive: true, force: true });
  }

  return prisma.project.delete({ where: { id } });
}
