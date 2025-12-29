import { requestUrl } from 'obsidian';
import { 
  LLMProvider, ChatRequest, ChatResponse, 
  StreamingChatResponse, ModelInfo, TokenDelta, ChatMessage 
} from '../provider';

/**
 * Google AI (Gemini) Provider
 * 
 * Docs: https://ai.google.dev/gemini-api/docs
 * - Endpoint: generativelanguage.googleapis.com
 * - Auth: API key as query param
 * - Streaming uses ?alt=sse
 */
export class GoogleAIProvider implements LLMProvider {
  readonly id = 'google-ai';
  readonly name = 'Google AI (Gemini)';
  
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  
  constructor(private apiKey: string) {}
  
  async validate(): Promise<{ valid: boolean; error?: string }> {
    try {
      console.log('Google AI: Validating API key');
      const resp = await requestUrl({
        url: `${this.baseUrl}/models?key=${this.apiKey}`,
        throw: false
      });
      
      console.log('Google AI: Validation response', resp.status);
      
      if (resp.status === 200) {
        return { valid: true };
      }
      
      if (resp.status === 400) {
        return { valid: false, error: 'Invalid API key format' };
      }
      
      if (resp.status === 403) {
        return { valid: false, error: 'API key not authorized. Make sure the Gemini API is enabled.' };
      }
      
      const errorData = resp.json || {};
      return { valid: false, error: errorData.error?.message || `HTTP ${resp.status}` };
    } catch (e: any) {
      console.error('Google AI validation error:', e);
      return { valid: false, error: String(e.message || e) };
    }
  }
  
  async listModels(): Promise<ModelInfo[]> {
    try {
      const resp = await requestUrl({
        url: `${this.baseUrl}/models?key=${this.apiKey}`
      });
      
      return resp.json.models
        .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => ({
          id: m.name.replace('models/', ''),
          name: m.displayName || m.name,
          contextLength: m.inputTokenLimit,
          supportsStreaming: true
        }));
    } catch {
      // Return known models as fallback (as of Dec 2024)
      return [
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextLength: 1000000, supportsStreaming: true },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextLength: 1000000, supportsStreaming: true },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextLength: 1000000, supportsStreaming: true }
      ];
    }
  }
  
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const contents = this.convertMessages(request.messages);
    
    console.log('Google AI: Sending to model', request.model);
    console.log('Google AI: Contents', JSON.stringify(contents).substring(0, 500));
    
    try {
      const resp = await requestUrl({
        url: `${this.baseUrl}/models/${request.model}:generateContent?key=${this.apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            maxOutputTokens: request.maxTokens || 2000,
            temperature: request.temperature ?? 0.7
          }
        }),
        throw: false
      });
      
      console.log('Google AI: Response status', resp.status);
      
      if (resp.status !== 200) {
        const errorData = resp.json || {};
        const errorMsg = errorData.error?.message || resp.text || `HTTP ${resp.status}`;
        console.error('Google AI error:', errorMsg);
        throw new Error(`Google AI: ${errorMsg}`);
      }
      
      const data = resp.json;
      
      // Check for blocked content
      if (data.promptFeedback?.blockReason) {
        throw new Error(`Content blocked: ${data.promptFeedback.blockReason}`);
      }
      
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      if (!text && data.candidates?.[0]?.finishReason) {
        throw new Error(`No response. Reason: ${data.candidates[0].finishReason}`);
      }
      
      return {
        text,
        usage: data.usageMetadata ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          completionTokens: data.usageMetadata.candidatesTokenCount
        } : undefined
      };
    } catch (e: any) {
      console.error('Google AI chat error:', e);
      throw e;
    }
  }
  
  async chatStream(request: ChatRequest): Promise<StreamingChatResponse> {
    const contents = this.convertMessages(request.messages);
    
    console.log('Google AI: Starting stream for model', request.model);
    
    const response = await fetch(
      `${this.baseUrl}/models/${request.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            maxOutputTokens: request.maxTokens || 2000,
            temperature: request.temperature ?? 0.7
          }
        })
      }
    );
    
    if (!response.ok) {
      const text = await response.text();
      console.error('Google AI stream error:', response.status, text);
      let errorMsg = `HTTP ${response.status}`;
      try {
        const json = JSON.parse(text);
        errorMsg = json.error?.message || errorMsg;
      } catch {}
      throw new Error(`Google AI: ${errorMsg}`);
    }
    
    if (!response.body) throw new Error('No response body');
    
    return { stream: this.parseGeminiStream(response.body) };
  }
  
  private convertMessages(messages: ChatMessage[]): any[] {
    // Gemini uses { role: 'user'|'model', parts: [{ text }] }
    // Gemini doesn't support system role, so we prepend to first user message
    const contents: any[] = [];
    let systemContent = '';
    
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemContent += msg.content + '\n\n';
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }
    
    // Gemini requires alternating user/model roles
    // If we have system content, prepend to first user message
    if (systemContent && contents.length > 0) {
      // Find first user message
      for (let i = 0; i < contents.length; i++) {
        if (contents[i].role === 'user') {
          contents[i].parts[0].text = systemContent + contents[i].parts[0].text;
          break;
        }
      }
    }
    
    // If no contents, create a minimal user message
    if (contents.length === 0) {
      contents.push({
        role: 'user',
        parts: [{ text: systemContent || 'Hello' }]
      });
    }
    
    console.log('Google AI: Converted messages:', JSON.stringify(contents).substring(0, 300));
    
    return contents;
  }
  
  private async *parseGeminiStream(body: ReadableStream<Uint8Array>): AsyncIterable<TokenDelta> {
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
            try {
              const parsed = JSON.parse(line.slice(6));
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (text) {
                yield { content: text, done: false };
              }
            } catch { /* skip */ }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    yield { content: '', done: true };
  }
}
