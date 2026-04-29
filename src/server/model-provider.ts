// 模型提供商抽象层：通过 OpenAI 兼容接口统一对接各种 LLM 服务
// 支持 Xiaomi MiMo、OpenAI、DeepSeek、OpenRouter 等
import OpenAI from "openai";

/** LLM 消息角色 */
export type ChatRole = "system" | "user" | "assistant";

/** 单条聊天消息结构 */
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** 模型提供商接口，所有 LLM 服务需实现此接口 */
export interface ModelProvider {
  name: string;
  chat(input: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ content: string }>;
}

/** 提供商配置信息 */
export interface ProviderConfig {
  provider: "mimo" | "openai" | "deepseek" | "anthropic" | string;
  model: string;
  baseUrl?: string | null;
  apiKeyEnvName: string;
}

/** 兼容 OpenAI API 格式的模型提供商实现（MiMo、DeepSeek、OpenRouter 均走此实现） */
export class OpenAICompatibleProvider implements ModelProvider {
  readonly name: string;
  private readonly client: OpenAI;

  constructor(input: { name: string; apiKey: string; baseUrl?: string | null }) {
    this.name = input.name;
    this.client = new OpenAI({
      apiKey: input.apiKey,
      baseURL: input.baseUrl ?? undefined,
    });
  }

  async chat(input: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ content: string }> {
    const completion = await this.client.chat.completions.create({
      model: input.model,
      messages: input.messages,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 4096,
    });

    return { content: completion.choices[0]?.message?.content ?? "" };
  }
}

/** Anthropic Claude 提供商占位符（MVP 中未实现，需接入 @anthropic-ai/sdk 后启用） */
export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic";

  async chat(): Promise<{ content: string }> {
    throw new Error("AnthropicProvider 尚未在此 MVP 中实现。如需启用 Claude，请在此接入 @anthropic-ai/sdk。");
  }
}

/** 根据配置创建对应的模型提供商实例 */
export function createProvider(config: ProviderConfig): ModelProvider {
  const provider = config.provider.toLowerCase();

  if (provider === "anthropic") {
    return new AnthropicProvider();
  }

  const apiKey = process.env[config.apiKeyEnvName];
  if (!apiKey) {
    throw new Error(`缺少环境变量中的 API Key：${config.apiKeyEnvName}`);
  }

  return new OpenAICompatibleProvider({
    name: provider,
    apiKey,
    baseUrl: config.baseUrl,
  });
}

/** 获取默认的模型提供商配置，按优先级自动选择第一个可用的 */
export function getDefaultProviderConfig(): ProviderConfig {
  const providers: ProviderConfig[] = [
    {
      provider: "mimo",
      model: process.env.MIMO_MODEL ?? "",
      baseUrl: process.env.MIMO_BASE_URL,
      apiKeyEnvName: "MIMO_API_KEY",
    },
    {
      provider: "openai",
      model: process.env.OPENAI_MODEL ?? "",
      baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
      apiKeyEnvName: "OPENAI_API_KEY",
    },
    {
      provider: "deepseek",
      model: process.env.DEEPSEEK_MODEL ?? "",
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      apiKeyEnvName: "DEEPSEEK_API_KEY",
    },
    {
      provider: "openrouter",
      model: process.env.OPENROUTER_MODEL ?? "openrouter/auto",
      baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      apiKeyEnvName: "OPENROUTER_API_KEY",
    },
  ];

  const config = providers.find((candidate) => process.env[candidate.apiKeyEnvName] && candidate.model);
  if (!config) {
    throw new Error(
      "未配置任何模型提供商。请在环境变量中设置 MIMO、OPENAI、DEEPSEEK 或 OPENROUTER 的 API Key 和模型名称。"
    );
  }

  return config;
}

/** 调用默认模型提供商进行对话，返回纯文本内容 */
export async function chat(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const config = getDefaultProviderConfig();
  const provider = createProvider(config);
  const response = await provider.chat({
    model: config.model,
    messages,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
  });

  return response.content;
}
