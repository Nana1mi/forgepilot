// 状态映射工具：将数据库中的英文状态码转换为中文展示文本，并提供对应的 Tailwind CSS 样式

/** 将任务状态英文标识映射为中文标签 */
export function getTaskStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "待处理",
    planning: "生成计划中",
    awaiting_approval: "待审批",
    running: "执行中",
    failed: "失败",
    error: "失败",
    completed: "已完成",
  };

  return labels[status] ?? status;
}

/** 将项目状态英文标识映射为中文标签 */
export function getProjectStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "可用",
    archived: "已归档",
    failed: "失败",
  };

  return labels[status] ?? status;
}

/** 根据任务状态返回对应的 Tailwind CSS 颜色样式类名 */
export function getTaskStatusClassName(status: string) {
  if (status === "completed") return "bg-green-100 text-green-800";
  if (status === "failed" || status === "error") return "bg-red-100 text-red-800";
  if (status === "running" || status === "planning") return "bg-blue-100 text-blue-800";
  if (status === "awaiting_approval") return "bg-amber-100 text-amber-800";
  return "bg-secondary text-secondary-foreground";
}
