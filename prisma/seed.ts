// 数据库种子脚本：初始化默认模型提供商配置（MIMO / OpenAI / DeepSeek / OpenRouter）
// 运行方式：npx prisma db seed
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  /** 各提供商的默认配置，优先读取环境变量，否则使用预设占位值 */
  const defaults = [
    {
      provider: "mimo",
      model: process.env.MIMO_MODEL || "mimo-model-name",
      baseUrl: process.env.MIMO_BASE_URL || null,
      apiKeyEnvName: "MIMO_API_KEY",
    },
    {
      provider: "openai",
      model: process.env.OPENAI_MODEL || "gpt-4o",
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKeyEnvName: "OPENAI_API_KEY",
    },
    {
      provider: "deepseek",
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      apiKeyEnvName: "DEEPSEEK_API_KEY",
    },
    {
      provider: "openrouter",
      model: process.env.OPENROUTER_MODEL || "openrouter/auto",
      baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      apiKeyEnvName: "OPENROUTER_API_KEY",
    },
  ];

  for (const config of defaults) {
    await prisma.modelConfig.upsert({
      where: {
        provider_model: {
          provider: config.provider,
          model: config.model,
        },
      },
      update: config,
      create: config,
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
