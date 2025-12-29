import { requestUrl } from 'obsidian';
import { 
  LLMProvider, ChatRequest, ChatResponse, 
  StreamingChatResponse, ModelInfo, TokenDelta 
} from '../provider';

/**
 * OpenRouter Provider
 * 
 * Docs: https://openrouter.ai/docs
 * - Endpoint: /api/v1/chat/completions
 * - Auth: Bearer token
 * - Format: OpenAI-compatible
 */
export class OpenRouterProvider implements LLMProvider {
  readonly id = 'openrouter';
  readonly name = 'OpenRouter';
  
  constructor(private apiKey: string, private siteUrl?: string) {}
  
  async validate(): Promise<{ valid: boolean; error?: string }> {
    try {
      const resp = await requestUrl({
        url: 'https://openrouter.ai/api/v1/models',
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      return { valid: resp.status === 200 };
    } catch (e: any) {
      return { valid: false, error: String(e.message || e) };
    }
  }
  
  async listModels(): Promise<ModelInfo[]> {
    try {
      const resp = await requestUrl({
        url: 'https://openrouter.ai/api/v1/models',
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      const data = resp.json;
      return data.data.map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        contextLength: m.context_length,
        supportsStreaming: true
      }));
    } catch {
      // Return some common models as fallback
      return [
        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', contextLength: 200000, supportsStreaming: true },
        { id: 'openai/gpt-4o', name: 'GPT-4o', contextLength: 128000, supportsStreaming: true },
        { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', contextLength: 1000000, supportsStreaming: true },
        { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', contextLength: 131072, supportsStreaming: true }
      ];
    }
  }
  
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const resp = await requestUrl({
      url: 'https://openrouter.ai/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.siteUrl || 'https://obsidian.md',
        'X-Title': 'Obsidian Vault AI'
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        stream: false
      })
    });
    
    const data = resp.json;
    return {
      text: data.choices[0].message.content,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens
      } : undefined
    };
  }
  
  async chatStream(request: ChatRequest): Promise<StreamingChatResponse> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.siteUrl || 'https://obsidian.md',
        'X-Title': 'Obsidian Vault AI'
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        stream: true
      })
    });
    
    if (!response.body) {
      throw new Error('No response body for streaming');
    }
    
    return {
      stream: this.parseSSEStream(response.body)
    };
  }
  
  private async *parseSSEStream(body: ReadableStream<Uint8Array>): AsyncIterable<TokenDelta> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              yield { content: '', done: true };
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content || '';
              if (delta) {
                yield { content: delta, done: false };
              }
            } catch { /* skip malformed */ }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    yield { content: '', done: true };
  }
}
