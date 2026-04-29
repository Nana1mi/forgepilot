// tRPC 服务端初始化：配置 superjson 序列化，导出 router/procedure/context 供业务层使用
import { initTRPC } from "@trpc/server";
import { prisma } from "@/lib/db";
import superjson from "superjson";

const t = initTRPC.create({
  transformer: superjson,
});

/** tRPC 路由构建器 */
export const createTRPCRouter = t.router;
/** 公开过程（无需鉴权） */
export const publicProcedure = t.procedure;
/** 创建请求上下文，注入 Prisma 客户端 */
export const createContext = () => ({ prisma });
/** 上下文类型 */
export type Context = ReturnType<typeof createContext>;
