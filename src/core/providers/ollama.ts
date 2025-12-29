import { requestUrl } from 'obsidian';
import { 
  LLMProvider, ChatRequest, ChatResponse, 
  StreamingChatResponse, ModelInfo, TokenDelta 
} from '../provider';

/**
 * Ollama Provider (Local)
 * 
 * Docs: https://github.com/ollama/ollama/blob/main/docs/api.md
 * Default endpoint: http://localhost:11434
 */
export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama (Local)';
  
  constructor(private baseUrl: string = 'http://localhost:11434') {}
  
  async validate(): Promise<{ valid: boolean; error?: string }> {
    try {
      const resp = await requestUrl({ url: `${this.baseUrl}/api/tags` });
      return { valid: resp.status === 200 };
    } catch (e: any) {
      return { valid: false, error: `Cannot connect to Ollama at ${this.baseUrl}` };
    }
  }
  
  async listModels(): Promise<ModelInfo[]> {
    try {
      const resp = await requestUrl({ url: `${this.baseUrl}/api/tags` });
      return resp.json.models.map((m: any) => ({
        id: m.name,
        name: m.name,
        contextLength: undefined,
        supportsStreaming: true
      }));
    } catch {
      return [];
    }
  }
  
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const resp = await requestUrl({
      url: `${this.baseUrl}/api/chat`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: false,
        options: {
          num_predict: request.maxTokens,
          temperature: request.temperature
        }
      })
    });
    
    return {
      text: resp.json.message.content,
      usage: resp.json.eval_count ? {
        promptTokens: resp.json.prompt_eval_count || 0,
        completionTokens: resp.json.eval_count
      } : undefined
    };
  }
  
  async chatStream(request: ChatRequest): Promise<StreamingChatResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: true,
        options: {
          num_predict: request.maxTokens,
          temperature: request.temperature
        }
      })
    });
    
    if (!response.body) throw new Error('No response body');
    
    return { stream: this.parseOllamaStream(response.body) };
  }
  
  private async *parseOllamaStream(body: ReadableStream<Uint8Array>): AsyncIterable<TokenDelta> {
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
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.done) {
              yield { content: '', done: true };
              return;
            }
            yield { content: parsed.message?.content || '', done: false };
          } catch { /* skip */ }
        }
      }
    } finally {
      reader.releaseLock();
    }
    yield { content: '', done: true };
  }
}
