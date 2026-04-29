// Prisma 客户端单例：开发环境通过 globalThis 缓存避免热重载时重复实例化
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** 全局唯一的 Prisma 客户端实例 */
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// 非生产环境下将实例挂载到 globalThis，防止 Next.js 热重载创建多个连接
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
