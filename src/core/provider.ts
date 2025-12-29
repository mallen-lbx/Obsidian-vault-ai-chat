// ===== TYPES =====

export interface ModelInfo {
  id: string;
  name: string;
  contextLength?: number;
  supportsStreaming: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface TokenDelta {
  content: string;
  done: boolean;
}

export interface ChatResponse {
  text: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface StreamingChatResponse {
  stream: AsyncIterable<TokenDelta>;
}

// ===== PROVIDER INTERFACE =====

export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  
  /** Test connection / validate API key */
  validate(): Promise<{ valid: boolean; error?: string }>;
  
  /** List available models (may be static or fetched) */
  listModels(): Promise<ModelInfo[]>;
  
  /** Non-streaming chat completion */
  chat(request: ChatRequest): Promise<ChatResponse>;
  
  /** Streaming chat completion */
  chatStream(request: ChatRequest): Promise<StreamingChatResponse>;
}

// ===== PROVIDER REGISTRY =====

export class ProviderRegistry {
  private providers: Map<string, LLMProvider> = new Map();
  
  register(provider: LLMProvider): void {
    this.providers.set(provider.id, provider);
  }
  
  get(id: string): LLMProvider | undefined {
    return this.providers.get(id);
  }
  
  list(): LLMProvider[] {
    return Array.from(this.providers.values());
  }
  
  clear(): void {
    this.providers.clear();
  }
}
