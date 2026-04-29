// 前端 tRPC 客户端：基于 AppRouter 类型实现前后端类型安全联动
import { createTRPCReact } from "@trpc/react-query";
import { type AppRouter } from "@/server/root";

/** 带完整类型推断的 tRPC React 客户端 */
export const trpc = createTRPCReact<AppRouter>();
