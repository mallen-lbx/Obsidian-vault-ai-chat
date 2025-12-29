import { requestUrl } from 'obsidian';
import { 
  LLMProvider, ChatRequest, ChatResponse, 
  StreamingChatResponse, ModelInfo, TokenDelta 
} from '../provider';

/**
 * OpenAI-Compatible Provider
 * 
 * Works with any OpenAI-compatible API:
 * - Z.AI GLM (standard or coding endpoint)
 * - DeepSeek
 * - Together AI
 * - Groq
 * - Local LLMs (LM Studio, text-generation-webui)
 * - Any other OpenAI-compatible service
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly id = 'openai-compatible';
  readonly name = 'OpenAI Compatible';
  
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private modelId: string
  ) {
    // Ensure baseUrl doesn't end with /
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    
    // Ensure it has the chat/completions path
    if (!this.baseUrl.includes('/chat/completions')) {
      // If it ends with /v1, add /chat/completions
      if (this.baseUrl.endsWith('/v1')) {
        this.baseUrl += '/chat/completions';
      } else if (!this.baseUrl.endsWith('/completions')) {
        // Add the full path
        this.baseUrl += '/v1/chat/completions';
      }
    }
  }
  
  async validate(): Promise<{ valid: boolean; error?: string }> {
    if (!this.baseUrl) {
      return { valid: false, error: 'Base URL is required' };
    }
    if (!this.modelId) {
      return { valid: false, error: 'Model ID is required' };
    }
    
    try {
      console.log('OpenAI-Compatible: Testing', this.baseUrl, 'with model', this.modelId);
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      // Only add auth header if API key is provided
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      
      const resp = await requestUrl({
        url: this.baseUrl,
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.modelId,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5,
          stream: false
        }),
        throw: false
      });
      
      console.log('OpenAI-Compatible: Response', resp.status);
      
      if (resp.status === 200) {
        return { valid: true };
      }
      
      // Parse error
      let errorMsg = `HTTP ${resp.status}`;
      try {
        const json = JSON.parse(resp.text);
        errorMsg = json.error?.message || json.message || errorMsg;
      } catch {}
      
      return { valid: false, error: errorMsg };
      
    } catch (e: any) {
      console.error('OpenAI-Compatible validation error:', e);
      return { valid: false, error: e.message || String(e) };
    }
  }
  
  async listModels(): Promise<ModelInfo[]> {
    // Return the configured model
    return [
      { 
        id: this.modelId, 
        name: this.modelId, 
        contextLength: 128000, 
        supportsStreaming: true 
      }
    ];
  }
  
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    
    const resp = await requestUrl({
      url: this.baseUrl,
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: request.model || this.modelId,
        messages: request.messages,
        max_tokens: request.maxTokens || 2000,
        temperature: request.temperature ?? 0.7,
        stream: false
      })
    });
    
    const data = resp.json;
    
    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }
    
    // Extract content, ignoring reasoning_content
    let text = data.choices?.[0]?.message?.content || '';
    
    return {
      text,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens
      } : undefined
    };
  }
  
  async chatStream(request: ChatRequest): Promise<StreamingChatResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: request.model || this.modelId,
        messages: request.messages,
        max_tokens: request.maxTokens || 2000,
        temperature: request.temperature ?? 0.7,
        stream: true
      })
    });
    
    if (!response.ok) {
      const text = await response.text();
      let errorMsg = `HTTP ${response.status}`;
      try {
        const json = JSON.parse(text);
        errorMsg = json.error?.message || errorMsg;
      } catch {}
      throw new Error(errorMsg);
    }
    
    if (!response.body) {
      throw new Error('No response body');
    }
    
    return { stream: this.parseStream(response.body) };
  }
  
  private async *parseStream(body: ReadableStream<Uint8Array>): AsyncIterable<TokenDelta> {
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
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              yield { content: '', done: true };
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              
              // ONLY use content, IGNORE reasoning_content
              // This prevents thinking blocks from appearing
              const content = delta?.content || '';
              
              if (content) {
                yield { content, done: false };
              }
            } catch {}
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    yield { content: '', done: true };
  }
}
