// Agent 核心逻辑：负责计划生成、代码变更、测试验证、失败修复与 PR 摘要
// 所有与 LLM 的交互均通过 model-provider 抽象层完成，与具体模型解耦
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/db";
import { chat } from "@/server/model-provider";
import {
  IGNORED_REPOSITORY_DIRS,
  assertProjectInsideWorkspace,
  assertReadableProjectFile,
  assertSafeValidationCommand,
  assertWritableProjectFile,
  isSensitivePath,
  truncateForLog,
} from "@/server/safety";

/** execFile 的 Promise 包装 */
const execFileAsync = promisify(execFile);

/** 带项目信息的任务类型 */
interface AgentTaskWithProject {
  id: string;
  projectId: string;
  title: string;
  prompt: string;
  status: string;
  plan: string | null;
  resultSummary: string | null;
  errorMessage: string | null;
  prSummary: string | null;
  project: { id: string; localPath: string };
}

/** AI 返回的文件变更描述 */
interface FileChange {
  filePath: string;
  action: "create" | "modify";
  content: string;
}

/** package.json 结构 */
interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** 用于验证的命令结构 */
interface ValidationCommand {
  label: string;
  command: string;
  args: string[];
}

/** Agent 执行日志条目（与 Prisma AgentRunLog 的 role / content 字段对齐） */
interface AgentLogEntry {
  role: string;
  content: string;
}

/** 执行结果 */
export interface ExecutionResult {
  summary: string;
  validationOutput: string;
}

/** 将运行日志持久化写入数据库 */
async function log(
  taskId: string,
  step: string,
  content: string,
  role: "system" | "user" | "assistant" | "tool" = "tool"
) {
  const safeContent = truncateForLog(content);
  await prisma.agentRunLog.create({
    data: {
      taskId,
      role,
      content: safeContent,
      legacyStep: step,
      legacyMessage: safeContent,
    },
  });
}

/** 判断文件或目录是否存在 */
async function pathExists(filePath: string) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** 安全读取 JSON 文件，失败时返回 null */
async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** 从子进程异常中提取 stdout、stderr 和 message */
function getProcessErrorOutput(error: unknown) {
  if (!error || typeof error !== "object") {
    return String(error);
  }

  const maybeProcessError = error as {
    stdout?: unknown;
    stderr?: unknown;
    message?: unknown;
  };

  return [
    typeof maybeProcessError.stdout === "string" ? maybeProcessError.stdout : "",
    typeof maybeProcessError.stderr === "string" ? maybeProcessError.stderr : "",
    typeof maybeProcessError.message === "string" ? maybeProcessError.message : "",
  ].join("");
}

/** 递归读取项目目录结构，生成缩进文本树，排除敏感/忽略目录 */
async function readFileTree(
  projectPath: string,
  dir: string,
  maxDepth = 3,
  currentDepth = 0
): Promise<string> {
  if (currentDepth > maxDepth) return "";

  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  let result = "";

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && IGNORED_REPOSITORY_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(projectPath, fullPath);
    if (isSensitivePath(relativePath)) continue;

    const indent = "  ".repeat(currentDepth);
    if (entry.isDirectory()) {
      result += `${indent}${entry.name}/\n`;
      result += await readFileTree(projectPath, fullPath, maxDepth, currentDepth + 1);
    } else {
      result += `${indent}${entry.name}\n`;
    }
  }

  return result;
}

/** 根据 lock 文件检测项目使用的包管理器 */
function detectPackageManager(projectPath: string) {
  if (fs.existsSync(path.join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(projectPath, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(projectPath, "bun.lockb"))) return "bun";
  return "npm";
}

/** Windows 下为包管理器追加 .cmd 后缀 */
function executableFor(packageManager: string) {
  return process.platform === "win32" ? `${packageManager}.cmd` : packageManager;
}

/** 根据包管理器和脚本名生成可执行的命令对象 */
function commandForScript(packageManager: string, scriptName: string): ValidationCommand {
  const command = executableFor(packageManager);

  if (packageManager === "npm") {
    const args = scriptName === "test" ? ["test"] : ["run", scriptName];
    return { label: `npm ${args.join(" ")}`, command, args };
  }

  if (packageManager === "bun") {
    const args = ["run", scriptName];
    return { label: `bun ${args.join(" ")}`, command, args };
  }

  const args = scriptName === "test" ? ["test"] : ["run", scriptName];
  return { label: `${packageManager} ${args.join(" ")}`, command, args };
}

/** 收集项目中可用于验证的命令（test / typecheck / lint） */
function collectValidationCommands(projectPath: string, packageJson: PackageJson | null) {
  const scripts = packageJson?.scripts ?? {};
  const packageManager = detectPackageManager(projectPath);
  const commands: ValidationCommand[] = [];

  for (const scriptName of ["test", "typecheck", "lint"]) {
    if (scripts[scriptName]) {
      commands.push(commandForScript(packageManager, scriptName));
    }
  }

  return commands;
}

/** 从依赖列表中检测项目使用的框架 */
function detectFrameworks(packageJson: PackageJson | null) {
  const deps = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
  };

  return Object.keys(deps).filter((name) =>
    ["next", "react", "vue", "svelte", "vite", "express", "fastify", "prisma", "vitest", "jest"].includes(
      name
    )
  );
}

/** 分析仓库结构，返回文件树、包管理器、框架、可用验证命令等信息 */
async function analyzeRepository(projectPath: string) {
  const projectRoot = assertProjectInsideWorkspace(projectPath);
  const packageJsonPath = assertReadableProjectFile(projectRoot, "package.json");
  const packageJson = await readJsonFile<PackageJson>(packageJsonPath);
  const fileTree = await readFileTree(projectRoot, projectRoot, 3);
  const validationCommands = collectValidationCommands(projectRoot, packageJson);

  return {
    fileTree,
    packageManager: detectPackageManager(projectRoot),
    frameworks: detectFrameworks(packageJson),
    scripts: packageJson?.scripts ?? {},
    validationCommands: validationCommands.map((command) => command.label),
    packageJson,
  };
}

/** 运行项目中的验证脚本（test / typecheck / lint），返回是否通过及输出 */
async function runValidation(projectPath: string): Promise<{ passed: boolean; output: string }> {
  const projectRoot = assertProjectInsideWorkspace(projectPath);
  const packageJsonPath = assertReadableProjectFile(projectRoot, "package.json");
  const packageJson = await readJsonFile<PackageJson>(packageJsonPath);
  const commands = collectValidationCommands(projectRoot, packageJson);

  if (commands.length === 0) {
    return {
      passed: true,
      output: "未检测到 test / typecheck / lint 脚本，已跳过验证。",
    };
  }

  let passed = true;
  let output = "";

  for (const validationCommand of commands) {
    assertSafeValidationCommand(validationCommand.command, validationCommand.args);

    try {
      const { stdout, stderr } = await execFileAsync(validationCommand.command, validationCommand.args, {
        cwd: projectRoot,
        timeout: 120000,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      });
      output += `\n[${validationCommand.label}]\n${stdout}${stderr}`;
    } catch (error) {
      passed = false;
      output += `\n[${validationCommand.label} FAILED]\n${getProcessErrorOutput(error)}`;
    }
  }

  return { passed, output: truncateForLog(output, 30000) };
}

/** 从 AI 返回的文本中解析 FILE: / ACTION: / --- / ---END--- 格式的文件变更 */
function parseFileChanges(response: string): FileChange[] {
  const changes: FileChange[] = [];
  const normalized = response.replace(/\r\n/g, "\n");
  const pattern = /(?:^|\n)FILE:\s*([^\n]+)\n(?:ACTION:\s*(create|modify)\s*\n)?---\n([\s\S]*?)\n---END---/g;

  for (const match of normalized.matchAll(pattern)) {
    const filePath = match[1]?.trim();
    const action = (match[2]?.trim() || "modify") as "create" | "modify";
    const content = match[3] ?? "";

    if (!filePath || !["create", "modify"].includes(action)) continue;
    changes.push({ filePath, action, content });
  }

  return changes;
}

/** 生成简化版 unified diff，用于写入前记录变更日志 */
function createUnifiedReplacementDiff(relativePath: string, oldContent: string | null, newContent: string) {
  const oldLines = oldContent === null ? [] : oldContent.split("\n");
  const newLines = newContent.split("\n");
  const oldHeader = oldContent === null ? "/dev/null" : `a/${relativePath}`;

  return [
    `--- ${oldHeader}`,
    `+++ b/${relativePath}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join("\n");
}

/** 写入文件前记录 diff，确保每次变更都有审计日志 */
async function writeFileWithDiff(taskId: string, projectPath: string, change: FileChange) {
  const fullPath = assertWritableProjectFile(projectPath, change.filePath);
  const exists = await pathExists(fullPath);
  const oldContent = exists ? await fs.promises.readFile(fullPath, "utf-8") : null;
  const diff = createUnifiedReplacementDiff(change.filePath, oldContent, change.content);

  await log(taskId, "diff", `Diff before writing ${change.filePath}:\n${truncateForLog(diff)}`);
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, change.content, "utf-8");
  await log(taskId, "write", `${change.action === "create" && !exists ? "创建" : "更新"} ${change.filePath}`);
}

/** 解析 AI 响应并应用所有文件变更 */
async function applyModelFileChanges(taskId: string, projectPath: string, response: string, step: string) {
  const changes = parseFileChanges(response);

  if (changes.length === 0) {
    await log(taskId, step, "模型未返回任何 FILE/ACTION 格式的文件变更。");
    return 0;
  }

  for (const change of changes) {
    await writeFileWithDiff(taskId, projectPath, change);
  }

  return changes.length;
}

/** 根据任务和仓库上下文生成结构化实施计划 */
export async function generatePlan(task: AgentTaskWithProject): Promise<string> {
  await log(task.id, "analyze", "正在分析仓库...");
  const context = await analyzeRepository(task.project.localPath);

  const prompt = `You are an expert software engineer. Given the task and project context, generate a structured implementation plan.

Task: ${task.title}
Description: ${task.prompt}

Project file tree:
${context.fileTree}

Package manager: ${context.packageManager}
Frameworks: ${context.frameworks.join(", ") || "unknown"}
Available validation commands: ${context.validationCommands.join(", ") || "none"}
Package scripts:
${JSON.stringify(context.scripts, null, 2)}

Generate a markdown plan with:
1. Project understanding
2. Files to modify/create
3. Execution steps
4. Risks
5. Verification approach

Output only the plan.`;

  await log(task.id, "prompt", truncateForLog(prompt), "user");
  const plan = await chat([{ role: "user", content: prompt }], { temperature: 0.3 });
  await log(task.id, "plan", plan, "assistant");
  return plan;
}

/** 执行已批准的任务计划：生成代码变更、运行验证、失败时自动修复（最多 3 次） */
export async function executeTask(task: AgentTaskWithProject): Promise<ExecutionResult> {
  await log(task.id, "execute", "开始执行...");
  if (!task.plan) throw new Error("任务尚未生成计划，无法执行");

  const projectPath = assertProjectInsideWorkspace(task.project.localPath);
  const codePrompt = `You are an AI coding assistant. Apply the approved plan.

Task: ${task.title}
Description: ${task.prompt}

Approved plan:
${task.plan}

Rules:
- Only write files needed for the task.
- Do not write .env, key files, private credentials, or lock files.
- For each file, output exactly:
FILE: <relative path>
ACTION: <create|modify>
---
<complete file content>
---END---

Only output file changes.`;

  const codeResponse = await chat([{ role: "user", content: codePrompt }], {
    temperature: 0.2,
    maxTokens: 8192,
  });
  await log(task.id, "code", "初始代码变更已生成", "assistant");
  await applyModelFileChanges(task.id, projectPath, codeResponse, "code");

  let validation = await runValidation(projectPath);
  await log(
    task.id,
    "validate",
    `初始验证结果：${validation.passed ? "通过" : "失败"}\n${validation.output}`
  );

  for (let attempt = 1; !validation.passed && attempt <= 3; attempt++) {
    const fixPrompt = `Validation failed for this task.

Task: ${task.title}
Description: ${task.prompt}
Plan:
${task.plan}

Validation output:
${validation.output}

Fix the code. Output changes in the same FILE/ACTION format only.`;

    const fixResponse = await chat([{ role: "user", content: fixPrompt }], {
      temperature: 0.2,
      maxTokens: 8192,
    });
    await log(task.id, "fix", `第 ${attempt} 次修复方案已生成`, "assistant");
    await applyModelFileChanges(task.id, projectPath, fixResponse, "fix");

    validation = await runValidation(projectPath);
    await log(
      task.id,
      "validate",
      `第 ${attempt} 次修复验证：${validation.passed ? "通过" : "失败"}\n${validation.output}`
    );
  }

  if (!validation.passed) {
    throw new Error(`经过 3 次修复尝试后验证仍未通过。\n${validation.output}`);
  }

  const summary = `验证通过。\n${validation.output}`;
  await log(task.id, "result", summary);
  return { summary, validationOutput: validation.output };
}

/** 根据任务、计划和执行日志生成 PR 摘要 */
export async function generatePRSummary(task: AgentTaskWithProject): Promise<string> {
  const logs = await prisma.agentRunLog.findMany({
    where: { taskId: task.id },
    orderBy: { createdAt: "asc" },
  });
  const logText = (logs satisfies AgentLogEntry[])
    .map((entry) => `[${entry.role}] ${entry.content}`)
    .join("\n");
  const prompt = `You are a senior engineer writing a PR summary.

Task: ${task.title}
Plan:
${task.plan ?? ""}

Execution logs:
${truncateForLog(logText, 20000)}

Write a concise PR summary including:
1. Overview
2. Main files changed
3. Test results
4. Risks.`;

  const summary = await chat([{ role: "user", content: prompt }], { temperature: 0.3 });
  await log(task.id, "summary", summary, "assistant");
  return summary;
}
