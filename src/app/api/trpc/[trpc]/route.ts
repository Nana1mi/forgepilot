// tRPC API 路由适配器：将 Next.js App Router 的 fetch 请求转发到 tRPC 处理器
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";
import { appRouter } from "@/server/root";
import { createContext } from "@/server/trpc";

/** 处理所有 GET/POST 请求并路由到 tRPC */
const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
  });

export { handler as GET, handler as POST };
