import { SearchResult } from './vault-search';

export interface GroundedContext {
  systemPrompt: string;
  sources: { path: string; title: string }[];
}

export class ContextBuilder {
  private maxContextChars: number;
  
  constructor(maxContextChars: number = 16000) {
    this.maxContextChars = maxContextChars;
  }
  
  /**
   * Build a system prompt that makes the AI a full research assistant
   * Vault content is provided as CONTEXT, not as a restriction
   */
  buildContext(query: string, searchResults: SearchResult[]): GroundedContext {
    const sources: { path: string; title: string }[] = [];
    const contextChunks: string[] = [];
    let totalChars = 0;
    
    for (const result of searchResults) {
      const chunk = this.formatSource(result);
      if (totalChars + chunk.length > this.maxContextChars) break;
      
      contextChunks.push(chunk);
      totalChars += chunk.length;
      sources.push({
        path: result.file.path,
        title: result.file.basename
      });
    }
    
    const systemPrompt = this.buildSystemPrompt(contextChunks, sources.length > 0);

    return { systemPrompt, sources };
  }
  
  /**
   * Build a minimal system prompt (no vault context)
   * For when user just wants to chat without vault grounding
   */
  buildMinimalContext(): GroundedContext {
    return {
      systemPrompt: this.buildSystemPrompt([], false),
      sources: []
    };
  }
  
  /**
   * Build context from specific files (for enhanced note generation)
   */
  buildContextFromContent(contents: { title: string; content: string }[]): string {
    let contextChunks: string[] = [];
    let totalChars = 0;
    
    for (const { title, content } of contents) {
      let truncatedContent = content;
      if (truncatedContent.length > 4000) {
        truncatedContent = truncatedContent.substring(0, 4000) + '\n...[truncated]';
      }
      
      const chunk = `### [[${title}]]\n\n${truncatedContent}`;
      
      if (totalChars + chunk.length > this.maxContextChars) break;
      
      contextChunks.push(chunk);
      totalChars += chunk.length;
    }
    
    return contextChunks.join('\n\n---\n\n');
  }
  
  private buildSystemPrompt(contextChunks: string[], hasVaultContext: boolean): string {
    // Base system prompt - makes AI a full-featured research assistant
    let prompt = `You are a highly capable AI research assistant integrated into Obsidian, a knowledge management application. You have access to the user's personal notes vault and can help with ANY task they need.

## Your Capabilities
- Answer ANY question using your full knowledge and reasoning abilities
- Help with coding, writing, analysis, brainstorming, research, and creative tasks
- Provide detailed explanations, tutorials, and step-by-step guides
- Assist with planning, problem-solving, and decision-making
- Generate content, summaries, outlines, and documents
- Have natural, contextual conversations with memory of the current chat

## Guidelines
- Be helpful, thorough, and accurate
- Use markdown formatting for clarity (headers, lists, code blocks, etc.)
- When you use information from the user's notes, cite them with [[Note Title]] wiki-links
- If you're unsure about something, say so honestly
- Provide your own knowledge and insights freely - you're not limited to just the vault content
- Be conversational and engaging while remaining informative`;

    // Add vault context if available
    if (hasVaultContext && contextChunks.length > 0) {
      prompt += `

## User's Vault Context
The following excerpts from the user's notes may be relevant to this conversation. Use this information when helpful, and cite sources with [[wiki-links]] when referencing specific notes:

${contextChunks.join('\n\n---\n\n')}

---
Remember: This vault context is supplementary. You should use your full capabilities to help the user, combining vault information with your broader knowledge when appropriate.`;
    }
    
    return prompt;
  }
  
  private formatSource(result: SearchResult): string {
    // Truncate individual files if needed
    let content = result.content;
    if (content.length > 4000) {
      content = content.substring(0, 4000) + '\n...[truncated]';
    }
    
    // Include headings if available
    let headingsInfo = '';
    if (result.headings.length > 0) {
      headingsInfo = `\nHeadings: ${result.headings.slice(0, 5).join(', ')}`;
    }
    
    return `### [[${result.file.basename}]]
Path: ${result.file.path}${headingsInfo}

${content}`;
  }
}
