import { App, TFile, moment } from 'obsidian';
import { ChatMessage } from '../core/provider';

interface ChatData {
  messages: ChatMessage[];
  sources: string[];
  provider: string;
  model: string;
}

export class ChatPersistence {
  constructor(
    private app: App,
    private chatFolder: string = 'AI Chats'
  ) {}
  
  /**
   * Update the chat folder path
   */
  setFolder(folder: string): void {
    this.chatFolder = folder;
  }
  
  /**
   * Save a chat conversation to a Markdown file
   */
  async saveChat(data: ChatData): Promise<TFile> {
    await this.ensureFolder();
    
    const timestamp = moment().format('YYYY-MM-DD_HHmmss');
    const title = this.generateTitle(data.messages);
    const safeTitle = this.sanitizeFilename(title);
    const filename = `${this.chatFolder}/${timestamp} ${safeTitle}.md`;
    
    const content = this.formatChatAsMarkdown(data, timestamp);
    
    return await this.app.vault.create(filename, content);
  }
  
  /**
   * Append a message to an existing chat file
   */
  async appendToChat(file: TFile, role: 'user' | 'assistant', content: string): Promise<void> {
    const existing = await this.app.vault.read(file);
    const roleLabel = role === 'user' ? '**You:**' : '**Assistant:**';
    const newContent = `${existing}\n\n---\n\n${roleLabel}\n\n${content}`;
    await this.app.vault.modify(file, newContent);
  }
  
  /**
   * Load chat messages from a file
   */
  async loadChat(file: TFile): Promise<ChatMessage[]> {
    const content = await this.app.vault.read(file);
    return this.parseChatMarkdown(content);
  }
  
  private async ensureFolder(): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(this.chatFolder);
    if (!folder) {
      await this.app.vault.createFolder(this.chatFolder);
    }
  }
  
  private generateTitle(messages: ChatMessage[]): string {
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (!firstUserMsg) return 'Chat';
    
    // Take first 40 chars
    return firstUserMsg.content.substring(0, 40).trim() || 'Chat';
  }
  
  private sanitizeFilename(name: string): string {
    return name.replace(/[\\/:*?"<>|#^[\]]/g, '').trim();
  }
  
  private formatChatAsMarkdown(data: ChatData, timestamp: string): string {
    // Format sources for frontmatter
    const sourcesYaml = data.sources.length > 0
      ? data.sources.map(s => `  - "[[${s}]]"`).join('\n')
      : '  - none';
    
    const frontmatter = `---
created: ${timestamp}
provider: ${data.provider}
model: ${data.model}
sources:
${sourcesYaml}
tags:
  - ai-chat
---

`;

    const messages = data.messages.map(msg => {
      const roleLabel = msg.role === 'user' ? '**You:**' : 
                       msg.role === 'assistant' ? '**Assistant:**' : 
                       '**System:**';
      return `${roleLabel}\n\n${msg.content}`;
    }).join('\n\n---\n\n');
    
    return frontmatter + messages;
  }
  
  private parseChatMarkdown(content: string): ChatMessage[] {
    const messages: ChatMessage[] = [];
    
    // Remove frontmatter
    const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
    const bodyContent = frontmatterMatch 
      ? content.slice(frontmatterMatch[0].length)
      : content;
    
    // Split by message dividers
    const parts = bodyContent.split(/\n---\n/);
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      
      if (trimmed.startsWith('**You:**')) {
        messages.push({
          role: 'user',
          content: trimmed.replace('**You:**', '').trim()
        });
      } else if (trimmed.startsWith('**Assistant:**')) {
        messages.push({
          role: 'assistant',
          content: trimmed.replace('**Assistant:**', '').trim()
        });
      } else if (trimmed.startsWith('**System:**')) {
        messages.push({
          role: 'system',
          content: trimmed.replace('**System:**', '').trim()
        });
      }
    }
    
    return messages;
  }
}
