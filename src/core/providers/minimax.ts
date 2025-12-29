import { requestUrl } from 'obsidian';
import { 
  LLMProvider, ChatRequest, ChatResponse, 
  StreamingChatResponse, ModelInfo, TokenDelta 
} from '../provider';

/**
 * MiniMax Provider
 * 
 * VERIFIED from docs:
 * - International endpoint: https://api.minimax.io/v1/chat/completions
 * - China endpoint: https://api.minimaxi.com/v1/chat/completions
 * - Auth: Bearer token in Authorization header
 * - Format: OpenAI-compatible
 * - Models: MiniMax-M2.1, MiniMax-M2
 * - Special: Interleaved thinking with <think>...</think> blocks
 * - Recommended sampling: temperature=1.0, top_p=0.95
 */
export class MinimaxProvider implements LLMProvider {
  readonly id = 'minimax';
  readonly name = 'MiniMax';
  
  private baseUrl: string;
  private showThinking: boolean;
  
  constructor(
    private apiKey: string,
    region: 'international' | 'china' = 'international',
    showThinking: boolean = false
  ) {
    this.baseUrl = region === 'china'
      ? 'https://api.minimaxi.com/v1'
      : 'https://api.minimax.io/v1';
    this.showThinking = showThinking;
  }
  
  async validate(): Promise<{ valid: boolean; error?: string }> {
    try {
      const resp = await requestUrl({
        url: `${this.baseUrl}/chat/completions`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'MiniMax-M2.1',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        })
      });
      return { valid: resp.status === 200 };
    } catch (e: any) {
      if (e.status === 401) {
        return { valid: false, error: 'Invalid API key' };
      }
      return { valid: false, error: String(e.message || e) };
    }
  }
  
  async listModels(): Promise<ModelInfo[]> {
    // Return known models - MiniMax doesn't expose a models list endpoint
    return [
      { 
        id: 'MiniMax-M2.1', 
        name: 'MiniMax M2.1 (Latest)', 
        contextLength: 200000,
        supportsStreaming: true 
      },
      { 
        id: 'MiniMax-M2', 
        name: 'MiniMax M2', 
        contextLength: 200000,
        supportsStreaming: true 
      }
    ];
  }
  
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const body: any = {
      model: request.model,
      messages: request.messages,
      stream: false
    };
    
    if (request.maxTokens) body.max_tokens = request.maxTokens;
    // MiniMax recommends temperature=1.0 for best results
    body.temperature = request.temperature ?? 1.0;
    
    const resp = await requestUrl({
      url: `${this.baseUrl}/chat/completions`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    const data = resp.json;
    let content = data.choices[0].message.content;
    
    // MiniMax M2.1 may include <think>...</think> blocks
    if (!this.showThinking) {
      content = this.stripThinkingBlocks(content);
    }
    
    return {
      text: content,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens
      } : undefined
    };
  }
  
  async chatStream(request: ChatRequest): Promise<StreamingChatResponse> {
    const body: any = {
      model: request.model,
      messages: request.messages,
      stream: true
    };
    
    if (request.maxTokens) body.max_tokens = request.maxTokens;
    body.temperature = request.temperature ?? 1.0;
    
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      throw new Error(`MiniMax API error: ${response.status} ${response.statusText}`);
    }
    
    if (!response.body) {
      throw new Error('No response body for streaming');
    }
    
    return {
      stream: this.parseMinimaxStream(response.body)
    };
  }
  
  private async *parseMinimaxStream(body: ReadableStream<Uint8Array>): AsyncIterable<TokenDelta> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let inThinkBlock = false;
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              yield { content: '', done: true };
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              let content = parsed.choices?.[0]?.delta?.content || '';
              
              // Handle <think> blocks if not showing thinking
              if (!this.showThinking) {
                if (content.includes('<think>')) {
                  inThinkBlock = true;
                  content = content.replace(/<think>[\s\S]*$/, '');
                }
                if (inThinkBlock && content.includes('</think>')) {
                  inThinkBlock = false;
                  content = content.replace(/^[\s\S]*<\/think>/, '');
                }
                if (inThinkBlock) {
                  continue;
                }
              }
              
              if (content) {
                yield { content, done: false };
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
  
  /**
   * Strip <think>...</think> blocks from MiniMax responses
   */
  private stripThinkingBlocks(content: string): string {
    return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }
}
