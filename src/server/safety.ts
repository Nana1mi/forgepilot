// 安全边界与路径校验模块：防止路径穿越、危险命令执行、敏感文件泄露
import path from "path";

/** 所有项目仓库的统一根目录 */
export const WORKSPACE_DIR = path.resolve(process.cwd(), "workspace");

/** 分析仓库文件树时忽略的目录，避免遍历生成的或依赖相关的庞杂目录 */
export const IGNORED_REPOSITORY_DIRS = new Set([
  ".git",
  ".next",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".cache",
]);

/** 不允许 AI 自动修改的包管理器锁定文件 */
const PROTECTED_LOCK_FILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"]);

/** 危险命令的正则表达式黑名单（rm -rf /、sudo、curl | bash 等） */
const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf\s+[\/\\]?($|\s)/i,
  /\bsudo\b/i,
  /\bcurl\b[\s\S]*\|\s*(bash|sh|pwsh|powershell)\b/i,
  /\bchmod\s+777\s+[\/\\]/i,
  /\bInvoke-WebRequest\b[\s\S]*\|\s*iex\b/i,
  /\bformat\s+[a-z]:/i,
  /\bdel\s+\/[sq]\s+[a-z]:\\/i,
];

/** 判断 candidatePath 是否严格位于 parentPath 内部（防止路径穿越） */
export function isPathInside(parentPath: string, candidatePath: string) {
  const parent = path.resolve(parentPath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** 校验路径必须位于 workspace 目录内，否则抛出异常 */
export function assertInsideWorkspace(candidatePath: string, label = "路径") {
  const resolved = path.resolve(candidatePath);
  if (!isPathInside(WORKSPACE_DIR, resolved)) {
    throw new Error(`${label} 必须位于 workspace 目录内：${resolved}`);
  }
  return resolved;
}

/** 校验项目路径必须位于 workspace 内，且不能是 workspace 根目录本身 */
export function assertProjectInsideWorkspace(projectPath: string) {
  const resolved = assertInsideWorkspace(projectPath, "项目路径");
  if (resolved === WORKSPACE_DIR) {
    throw new Error("项目路径不能是 workspace 根目录");
  }
  return resolved;
}

/** 将相对路径解析为项目内的绝对路径，并防止路径穿越 */
export function resolveProjectFile(projectPath: string, relativePath: string) {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`不允许使用绝对路径：${relativePath}`);
  }

  const projectRoot = assertProjectInsideWorkspace(projectPath);
  const fullPath = path.resolve(projectRoot, relativePath);

  if (!isPathInside(projectRoot, fullPath)) {
    throw new Error(`不允许路径穿越：${relativePath}`);
  }

  return fullPath;
}

/** 判断是否为敏感路径（密钥、凭证、环境变量文件等），禁止 AI 读写 */
export function isSensitivePath(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  const parts = normalized.split("/").filter(Boolean);
  const baseName = parts.at(-1) ?? "";

  if (parts.includes(".git") || parts.includes(".ssh")) return true;
  if (baseName === ".env" || baseName.startsWith(".env.")) return true;
  if (baseName.endsWith(".pem") || baseName.endsWith(".p12") || baseName.endsWith(".pfx")) return true;
  if (baseName.endsWith(".key") || baseName === "id_rsa" || baseName === "id_ed25519") return true;

  return /(secret|credential|private[-_]?key|access[-_]?token|api[-_]?key)/i.test(baseName);
}

/** 校验项目内文件可读：禁止读取敏感文件 */
export function assertReadableProjectFile(projectPath: string, relativePath: string) {
  if (isSensitivePath(relativePath)) {
    throw new Error(`拒绝读取敏感文件：${relativePath}`);
  }

  return resolveProjectFile(projectPath, relativePath);
}

/** 校验项目内文件可写：禁止写入敏感文件或修改包管理器锁定文件 */
export function assertWritableProjectFile(projectPath: string, relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  const baseName = path.posix.basename(normalized);

  if (isSensitivePath(relativePath)) {
    throw new Error(`拒绝写入敏感文件：${relativePath}`);
  }

  if (PROTECTED_LOCK_FILES.has(baseName)) {
    throw new Error(`未显式支持的情况下拒绝修改锁定文件：${relativePath}`);
  }

  return resolveProjectFile(projectPath, relativePath);
}

/** 检查命令文本是否包含危险命令 */
export function isDangerousCommand(commandText: string) {
  return DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(commandText));
}

/** 校验验证命令是否安全：仅允许 npm/pnpm/yarn/bun 执行 test/lint/typecheck */
export function assertSafeValidationCommand(command: string, args: string[]) {
  const executable = path
    .basename(command)
    .replace(/\.cmd$/i, "")
    .toLowerCase();
  const commandText = [command, ...args].join(" ");

  if (isDangerousCommand(commandText)) {
    throw new Error(`拒绝执行危险命令：${commandText}`);
  }

  if (!["npm", "pnpm", "yarn", "bun"].includes(executable)) {
    throw new Error(`验证命令不在白名单中：${commandText}`);
  }

  const firstArg = args[0];
  if (!["test", "run", "lint", "typecheck"].includes(firstArg)) {
    throw new Error(`验证命令不在白名单中：${commandText}`);
  }
}

/** 当日志内容过长时截断，防止数据库写入超限 */
export function truncateForLog(value: string, maxLength = 12000) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n\n[已截断 ${value.length - maxLength} 个字符]`;
}
