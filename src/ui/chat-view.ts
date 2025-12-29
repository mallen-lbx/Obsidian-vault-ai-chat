import { ItemView, WorkspaceLeaf, MarkdownRenderer, setIcon, Notice, TFile, TFolder } from 'obsidian';
import type VaultAIPlugin from '../../main';
import { ChatMessage } from '../core/provider';

export const CHAT_VIEW_TYPE = 'vault-ai-chat';

export class ChatView extends ItemView {
  plugin: VaultAIPlugin;
  
  private messagesContainer: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private conversationHistory: ChatMessage[] = [];
  private isStreaming = false;
  
  constructor(leaf: WorkspaceLeaf, plugin: VaultAIPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  
  getViewType(): string { return CHAT_VIEW_TYPE; }
  getDisplayText(): string { return 'Vault AI Chat'; }
  getIcon(): string { return 'message-square'; }
  
  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('vault-ai-chat-container');
    
    // Header
    const header = container.createDiv({ cls: 'chat-header' });
    header.createEl('h4', { text: 'Vault AI Chat' });
    
    const actionsDiv = header.createDiv({ cls: 'chat-actions' });
    
    // New chat button
    const newChatBtn = actionsDiv.createEl('button', { 
      cls: 'chat-action-btn',
      attr: { 'aria-label': 'New chat' }
    });
    setIcon(newChatBtn, 'file-plus');
    newChatBtn.addEventListener('click', () => this.clearChat());
    
    // Save button
    const saveBtn = actionsDiv.createEl('button', { 
      cls: 'chat-action-btn',
      attr: { 'aria-label': 'Save chat' }
    });
    setIcon(saveBtn, 'save');
    saveBtn.addEventListener('click', () => this.saveChat());
    
    // Messages area
    this.messagesContainer = container.createDiv({ cls: 'chat-messages' });
    this.showWelcome();
    
    // Input area
    const inputContainer = container.createDiv({ cls: 'chat-input-container' });
    
    this.inputEl = inputContainer.createEl('textarea', {
      cls: 'chat-input',
      attr: { 
        placeholder: 'Ask anything... (Enter to send, /help for commands)',
        rows: '2'
      }
    });
    
    const sendBtn = inputContainer.createEl('button', { cls: 'chat-send-btn' });
    setIcon(sendBtn, 'send');
    sendBtn.addEventListener('click', () => this.sendMessage());
    
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  }
  
  private showWelcome(): void {
    const welcome = this.messagesContainer.createDiv({ cls: 'chat-welcome' });
    const provider = this.plugin.settings.provider;
    const model = this.plugin.settings.selectedModel || 'Not configured';
    welcome.innerHTML = `
      <h3>👋 Vault AI Chat</h3>
      <p>I can answer questions, create notes, and work with your vault.</p>
      <p><strong>Provider:</strong> ${provider} | <strong>Model:</strong> ${model}</p>
      <p style="color: var(--text-muted); font-size: 11px; margin-top: 8px;">
        Type <strong>/help</strong> for commands • Settings → Vault AI Chat to configure
      </p>
    `;
  }
  
  private clearChat(): void {
    this.conversationHistory = [];
    this.messagesContainer.empty();
    this.showWelcome();
    new Notice('Chat cleared');
  }
  
  private async saveChat(): Promise<void> {
    if (this.conversationHistory.length === 0) {
      new Notice('No messages to save');
      return;
    }
    
    try {
      const file = await this.plugin.chatPersistence.saveChat({
        messages: this.conversationHistory,
        sources: [],
        provider: this.plugin.settings.provider,
        model: this.plugin.settings.selectedModel
      });
      new Notice(`Saved to ${file.path}`);
    } catch (e) {
      new Notice('Failed to save chat');
      console.error(e);
    }
  }
  
  private stripThinkingBlocks(text: string): string {
    if (!text) return '';
    
    let cleaned = text;
    
    // Remove XML-style thinking blocks
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
    cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
    cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
    
    // Detect inline reasoning (GLM pattern)
    if (cleaned.match(/^The user\s/i)) {
      const responseMarkers = [
        'Hi there!', 'Hi!', 'Hello!', 'Hey!', 'Sure,', 'Sure!', 
        'Yes,', 'I\'m ready', 'I\'d be happy', 'I can help',
        'Here\'s', 'Here is', 'Let me', '##', '**'
      ];
      
      let bestIndex = -1;
      for (const marker of responseMarkers) {
        const idx = cleaned.indexOf(marker);
        if (idx > 20 && (bestIndex === -1 || idx < bestIndex)) {
          bestIndex = idx;
        }
      }
      
      if (bestIndex > 0) {
        cleaned = cleaned.substring(bestIndex);
      }
    }
    
    return cleaned.trim();
  }
  
  private async buildSystemPrompt(userQuery: string): Promise<{ prompt: string }> {
    let basePrompt = `You are an expert AI assistant integrated with the user's Obsidian knowledge base.

## Core Principles
- Be substantive and detailed, not vague
- Be accurate - if uncertain, say so
- Be direct - answer first, then explain
- No preamble like "Great question!" or "The user is asking..."

## File Creation
When asked to create a note/file, include a code block like this at the end:
\`\`\`create-file:suggested-filename.md
[Your generated content here]
\`\`\`

## Formatting
- Use markdown: headers, lists, code blocks, bold, italic
- Reference notes with [[Note Title]] wiki-links
- For code, include language tags`;

    // Search vault for relevant context
    try {
      const searchResults = await this.plugin.vaultSearch.search(userQuery, {
        limit: this.plugin.settings.maxContextFiles || 5
      });
      
      if (searchResults.length > 0) {
        basePrompt += '\n\n## Relevant Notes from Vault\n\n';
        
        for (const result of searchResults) {
          let content = result.content;
          if (content.length > 2500) {
            content = content.substring(0, 2500) + '\n...[truncated]';
          }
          basePrompt += `### [[${result.file.basename}]]\n${content}\n\n---\n\n`;
        }
      }
    } catch (e) {
      console.warn('Vault search failed:', e);
    }
    
    return { prompt: basePrompt };
  }
  
  private async sendMessage(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.isStreaming) return;
    
    // Handle slash commands
    if (text.startsWith('/')) {
      await this.handleSlashCommand(text);
      return;
    }
    
    const provider = this.plugin.getActiveProvider();
    if (!provider) {
      new Notice('Please configure an AI provider in Settings');
      return;
    }
    
    if (!this.plugin.settings.selectedModel) {
      new Notice('Please select a model in Settings');
      return;
    }
    
    this.inputEl.value = '';
    this.isStreaming = true;
    
    const welcome = this.messagesContainer.querySelector('.chat-welcome');
    if (welcome) welcome.remove();
    
    this.addMessage('user', text);
    this.conversationHistory.push({ role: 'user', content: text });
    
    const assistantDiv = this.addMessage('assistant', '');
    const contentEl = assistantDiv.querySelector('.message-content') as HTMLElement;
    contentEl.innerHTML = '<span class="typing-indicator">●●●</span>';
    
    try {
      const { prompt: systemPrompt } = await this.buildSystemPrompt(text);
      
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...this.conversationHistory
      ];
      
      let fullResponse = '';
      let gotResponse = false;
      
      try {
        const streamResult = await provider.chatStream({
          model: this.plugin.settings.selectedModel,
          messages,
          maxTokens: this.plugin.settings.maxTokens,
          temperature: this.plugin.settings.temperature
        });
        
        for await (const delta of streamResult.stream) {
          if (delta.done) break;
          gotResponse = true;
          fullResponse += delta.content;
          
          const displayText = this.stripThinkingBlocks(fullResponse);
          if (displayText) {
            contentEl.empty();
            await MarkdownRenderer.render(this.app, displayText, contentEl, '', this.plugin);
          }
          this.scrollToBottom();
        }
      } catch (streamErr: any) {
        console.log('Streaming failed, trying non-streaming:', streamErr.message);
        
        const response = await provider.chat({
          model: this.plugin.settings.selectedModel,
          messages,
          maxTokens: this.plugin.settings.maxTokens,
          temperature: this.plugin.settings.temperature
        });
        
        fullResponse = response.text;
        gotResponse = true;
        
        const displayText = this.stripThinkingBlocks(fullResponse);
        contentEl.empty();
        await MarkdownRenderer.render(this.app, displayText, contentEl, '', this.plugin);
      }
      
      if (gotResponse && fullResponse) {
        this.conversationHistory.push({ role: 'assistant', content: fullResponse });
        
        // Check for file creation blocks
        await this.processFileBlocks(assistantDiv, fullResponse);
      } else {
        contentEl.empty();
        contentEl.setText('No response received. Check your settings.');
      }
      
    } catch (error: any) {
      console.error('Chat error:', error);
      contentEl.empty();
      
      const errorDiv = contentEl.createDiv({ cls: 'chat-error-message' });
      let errorTitle = 'Error';
      let errorDetail = error.message || String(error);
      
      if (errorDetail.includes('401')) {
        errorTitle = 'Authentication Error';
        errorDetail = 'Please check your API key';
      } else if (errorDetail.includes('429')) {
        errorTitle = 'Rate Limited';
        errorDetail = 'Please wait a moment and try again';
      }
      
      errorDiv.createEl('strong', { text: `⚠️ ${errorTitle}` });
      errorDiv.createEl('p', { text: errorDetail, cls: 'error-detail' });
      
    } finally {
      this.isStreaming = false;
      this.scrollToBottom();
    }
  }
  
  // ===== SLASH COMMANDS =====
  
  private async handleSlashCommand(text: string): Promise<void> {
    const parts = text.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');
    
    this.inputEl.value = '';
    
    const welcome = this.messagesContainer.querySelector('.chat-welcome');
    if (welcome) welcome.remove();
    
    switch (command) {
      case '/help':
        this.showCommandHelp();
        break;
      case '/create':
      case '/new':
      case '/touch':
        await this.cmdCreate(args);
        break;
      case '/generate':
      case '/gen':
      case '/ai':
        await this.cmdGenerate(args);
        break;
      case '/delete':
      case '/rm':
        await this.cmdDelete(args);
        break;
      case '/rmdir':
      case '/deletefolder':
        await this.cmdRmdir(args);
        break;
      case '/append':
      case '/add':
        await this.cmdAppend(args);
        break;
      case '/save':
        await this.cmdSaveLast();
        break;
      case '/list':
      case '/ls':
        await this.cmdList(args);
        break;
      case '/read':
      case '/cat':
        await this.cmdRead(args);
        break;
      case '/mkdir':
      case '/folder':
        await this.cmdMkdir(args);
        break;
      case '/clear':
        this.clearChat();
        break;
      default:
        this.addSystemMessage(`Unknown command: **${command}**\n\nType **/help** for available commands.`);
    }
  }
  
  private showCommandHelp(): void {
    this.addSystemMessage(`## 📋 All Commands

### File Operations
| Command | Aliases | Description |
|---------|---------|-------------|
| \`/create <path>\` | \`/new\`, \`/touch\` | Create an empty file |
| \`/generate <title>\` | \`/gen\`, \`/ai\` | Create note with AI content |
| \`/delete <filename>\` | \`/rm\` | Delete a file |
| \`/append <file> <text>\` | \`/add\` | Add text to end of file |
| \`/read <filename>\` | \`/cat\` | Display file contents |
| \`/list [folder]\` | \`/ls\` | List files |
| \`/save\` | | Save last AI response as note |

### Folder Operations
| Command | Aliases | Description |
|---------|---------|-------------|
| \`/mkdir <path>\` | \`/folder\` | Create a folder |
| \`/rmdir <path>\` | \`/deletefolder\` | Delete a folder (and contents) |

### Chat
| Command | Description |
|---------|-------------|
| \`/clear\` | Clear chat history |
| \`/help\` | Show this help |

### Examples
\`\`\`
/create Projects/ideas         # Empty file at Projects/ideas.md
/create quick-note             # Empty file at root: quick-note.md
/generate Weekly Planning      # AI writes content for you
/mkdir Projects/2024
/rmdir Old Stuff
/delete old-draft
/append Journal.md Great day!
/read README
/list Projects
\`\`\`

### Natural Language
You can also ask naturally:
- *"Write a note about productivity"* → AI generates + save button`);
  }
  
  private async cmdCreate(args: string): Promise<void> {
    if (!args.trim()) {
      this.addSystemMessage('**Usage:** `/create <path>`\n\nExamples:\n- `/create sample/test` → Creates sample/test.md\n- `/create quick-note` → Creates quick-note.md in root');
      return;
    }
    
    this.addMessage('user', `/create ${args}`);
    
    let filepath = args.trim();
    if (!filepath.endsWith('.md')) filepath += '.md';
    
    // Check if file already exists
    if (this.app.vault.getAbstractFileByPath(filepath)) {
      this.addSystemMessage(`File already exists: **${filepath}**`);
      return;
    }
    
    try {
      // Ensure parent folder exists
      const parts = filepath.split('/');
      if (parts.length > 1) {
        const folderPath = parts.slice(0, -1).join('/');
        if (!this.app.vault.getAbstractFileByPath(folderPath)) {
          await this.app.vault.createFolder(folderPath);
        }
      }
      
      // Get just the filename for the title
      const filename = parts[parts.length - 1].replace('.md', '');
      
      // Create empty file with just a title
      const content = `# ${filename}\n\n`;
      const file = await this.app.vault.create(filepath, content);
      
      this.addSystemMessage(`✓ Created: **${filepath}**`);
      new Notice(`Created: ${filepath}`);
      
      // Open the file
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
      
    } catch (e: any) {
      this.addSystemMessage(`Error creating file: ${e.message}`);
    }
  }
  
  private async cmdGenerate(args: string): Promise<void> {
    if (!args.trim()) {
      this.addSystemMessage('**Usage:** `/generate <title>`\n\nExample: `/generate Weekly Planning`\n\nThe AI will write content for a note with this title.');
      return;
    }
    
    this.addMessage('user', `/generate ${args}`);
    
    const provider = this.plugin.getActiveProvider();
    if (!provider) {
      this.addSystemMessage('No AI provider configured. Go to Settings → Vault AI Chat to set one up.');
      return;
    }
    
    this.isStreaming = true;
    const assistantDiv = this.addMessage('assistant', '');
    const contentEl = assistantDiv.querySelector('.message-content') as HTMLElement;
    contentEl.innerHTML = '<span class="typing-indicator">●●●</span>';
    
    try {
      const response = await provider.chat({
        model: this.plugin.settings.selectedModel,
        messages: [
          { role: 'system', content: 'Generate well-structured Markdown content. Be detailed and substantive. Do not include a title heading - the user will provide that.' },
          { role: 'user', content: `Write comprehensive content for a note titled "${args}". Be detailed, organized, and helpful.` }
        ],
        maxTokens: this.plugin.settings.maxTokens,
        temperature: this.plugin.settings.temperature
      });
      
      const generatedContent = this.stripThinkingBlocks(response.text);
      const fullContent = `# ${args}\n\n${generatedContent}`;
      
      contentEl.empty();
      await MarkdownRenderer.render(this.app, fullContent, contentEl, '', this.plugin);
      
      this.addFileButton(assistantDiv, args + '.md', fullContent);
      
    } catch (e: any) {
      contentEl.empty();
      contentEl.setText(`Error: ${e.message}`);
    } finally {
      this.isStreaming = false;
    }
  }
  
  private async cmdDelete(args: string): Promise<void> {
    if (!args.trim()) {
      this.addSystemMessage('**Usage:** `/delete <filename>`');
      return;
    }
    
    this.addMessage('user', `/delete ${args}`);
    
    let filename = args.trim();
    if (!filename.endsWith('.md')) filename += '.md';
    
    // Find file
    let file = this.app.vault.getAbstractFileByPath(filename);
    if (!file) {
      const files = this.app.vault.getMarkdownFiles();
      const match = files.find(f => f.basename.toLowerCase() === args.toLowerCase().replace('.md', ''));
      if (match) file = match;
    }
    
    if (!file) {
      this.addSystemMessage(`File not found: **${filename}**`);
      return;
    }
    
    const msgDiv = this.addSystemMessage(`⚠️ **Delete "${file.path}"?**\n\nThis will move it to trash.`);
    const btnContainer = msgDiv.createDiv({ cls: 'file-action-buttons' });
    
    const deleteBtn = btnContainer.createEl('button', { text: '🗑️ Move to Trash', cls: 'file-action-btn delete-btn' });
    const cancelBtn = btnContainer.createEl('button', { text: 'Cancel', cls: 'file-action-btn' });
    
    const filePath = file.path;
    deleteBtn.addEventListener('click', async () => {
      try {
        const f = this.app.vault.getAbstractFileByPath(filePath);
        if (f) {
          // Use trash() - works better with OneDrive/cloud sync
          await this.app.vault.trash(f, false); // false = system trash
          this.addSystemMessage(`✓ Moved to trash: **${filePath}**`);
          new Notice(`Moved to trash: ${filePath}`);
        }
      } catch (e: any) {
        // Fallback to .trash folder in vault
        try {
          const f = this.app.vault.getAbstractFileByPath(filePath);
          if (f) {
            await this.app.vault.trash(f, true); // true = .trash folder
            this.addSystemMessage(`✓ Moved to .trash: **${filePath}**`);
          }
        } catch (e2: any) {
          this.addSystemMessage(`Error: ${e2.message}`);
        }
      }
      btnContainer.remove();
    });
    
    cancelBtn.addEventListener('click', () => {
      this.addSystemMessage('Cancelled.');
      btnContainer.remove();
    });
  }
  
  private async cmdAppend(args: string): Promise<void> {
    const match = args.match(/^(.+?\.md|\S+)\s+(.+)$/i);
    if (!match) {
      this.addSystemMessage('**Usage:** `/append <filename> <text>`\n\nExample: `/append Journal.md Had a great day!`');
      return;
    }
    
    let [, filename, content] = match;
    if (!filename.endsWith('.md')) filename += '.md';
    
    this.addMessage('user', `/append ${args}`);
    
    const file = this.app.vault.getAbstractFileByPath(filename);
    if (!file || !(file instanceof TFile)) {
      this.addSystemMessage(`File not found: **${filename}**`);
      return;
    }
    
    try {
      const existing = await this.app.vault.read(file);
      const timestamp = new Date().toLocaleString();
      await this.app.vault.modify(file, `${existing}\n\n---\n*${timestamp}*\n\n${content}`);
      this.addSystemMessage(`✓ Appended to **${filename}**`);
    } catch (e: any) {
      this.addSystemMessage(`Error: ${e.message}`);
    }
  }
  
  private async cmdSaveLast(): Promise<void> {
    const msgs = this.messagesContainer.querySelectorAll('.chat-message-assistant');
    if (msgs.length === 0) {
      this.addSystemMessage('No response to save.');
      return;
    }
    await this.saveResponseAsNote(msgs[msgs.length - 1] as HTMLElement);
  }
  
  private async cmdList(args: string): Promise<void> {
    const folder = args.trim() || '';
    this.addMessage('user', `/list ${folder || '(all)'}`);
    
    const files = this.app.vault.getMarkdownFiles()
      .filter(f => !folder || f.path.startsWith(folder))
      .slice(0, 25);
    
    if (files.length === 0) {
      this.addSystemMessage(`No files found${folder ? ` in ${folder}` : ''}`);
      return;
    }
    
    const list = files.map(f => `- [[${f.basename}]] *(${f.path})*`).join('\n');
    this.addSystemMessage(`## Files${folder ? ` in ${folder}` : ''}\n\n${list}`);
  }
  
  private async cmdRead(args: string): Promise<void> {
    if (!args.trim()) {
      this.addSystemMessage('**Usage:** `/read <filename>`');
      return;
    }
    
    let filename = args.trim();
    if (!filename.endsWith('.md')) filename += '.md';
    
    this.addMessage('user', `/read ${args}`);
    
    let file = this.app.vault.getAbstractFileByPath(filename);
    if (!file) {
      const files = this.app.vault.getMarkdownFiles();
      const match = files.find(f => f.basename.toLowerCase() === args.toLowerCase().replace('.md', ''));
      if (match) file = match;
    }
    
    if (!file || !(file instanceof TFile)) {
      this.addSystemMessage(`File not found: **${filename}**`);
      return;
    }
    
    try {
      const content = await this.app.vault.read(file);
      const preview = content.length > 3000 ? content.substring(0, 3000) + '\n\n...*[truncated]*' : content;
      this.addSystemMessage(`## 📄 ${file.basename}\n\n${preview}`);
    } catch (e: any) {
      this.addSystemMessage(`Error: ${e.message}`);
    }
  }
  
  private async cmdMkdir(args: string): Promise<void> {
    if (!args.trim()) {
      this.addSystemMessage('**Usage:** `/mkdir <folder-path>`\n\nExamples:\n- `/mkdir Projects`\n- `/mkdir Projects/2024/Q1`');
      return;
    }
    
    const folderPath = args.trim().replace(/^\/+|\/+$/g, ''); // Remove leading/trailing slashes
    
    this.addMessage('user', `/mkdir ${args}`);
    
    // Check if folder already exists
    const existing = this.app.vault.getAbstractFileByPath(folderPath);
    if (existing) {
      this.addSystemMessage(`Folder already exists: **${folderPath}**`);
      return;
    }
    
    try {
      await this.app.vault.createFolder(folderPath);
      this.addSystemMessage(`✓ Created folder: **${folderPath}**`);
      new Notice(`Created folder: ${folderPath}`);
    } catch (e: any) {
      this.addSystemMessage(`Error creating folder: ${e.message}`);
    }
  }
  
  private async cmdRmdir(args: string): Promise<void> {
    if (!args.trim()) {
      this.addSystemMessage('**Usage:** `/rmdir <folder-path>`\n\nExample: `/rmdir Old Projects`\n\n⚠️ This will move the folder and ALL its contents to trash!');
      return;
    }
    
    const folderPath = args.trim().replace(/^\/+|\/+$/g, '');
    
    this.addMessage('user', `/rmdir ${args}`);
    
    // Find the folder
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      this.addSystemMessage(`Folder not found: **${folderPath}**`);
      return;
    }
    
    // Count contents
    let fileCount = 0;
    let folderCount = 0;
    const countContents = (f: any) => {
      if (f.children) {
        folderCount++;
        for (const child of f.children) {
          countContents(child);
        }
      } else {
        fileCount++;
      }
    };
    
    if ((folder as any).children) {
      for (const child of (folder as any).children) {
        countContents(child);
      }
    }
    
    const contentsMsg = fileCount > 0 || folderCount > 0 
      ? `\n\nContains: **${fileCount} files** and **${folderCount} subfolders**` 
      : '\n\n*(Folder is empty)*';
    
    const msgDiv = this.addSystemMessage(`⚠️ **Delete folder "${folderPath}"?**${contentsMsg}\n\nThis will move it to trash.`);
    const btnContainer = msgDiv.createDiv({ cls: 'file-action-buttons' });
    
    const deleteBtn = btnContainer.createEl('button', { text: '🗑️ Move to Trash', cls: 'file-action-btn delete-btn' });
    const cancelBtn = btnContainer.createEl('button', { text: 'Cancel', cls: 'file-action-btn' });
    
    deleteBtn.addEventListener('click', async () => {
      try {
        const f = this.app.vault.getAbstractFileByPath(folderPath);
        if (f) {
          // Use trash() instead of delete() - works better with OneDrive/cloud sync
          await this.app.vault.trash(f, false); // false = use system trash
          this.addSystemMessage(`✓ Moved to trash: **${folderPath}**`);
          new Notice(`Moved to trash: ${folderPath}`);
        }
      } catch (e: any) {
        // If system trash fails, try Obsidian's .trash folder
        try {
          const f = this.app.vault.getAbstractFileByPath(folderPath);
          if (f) {
            await this.app.vault.trash(f, true); // true = use .trash folder in vault
            this.addSystemMessage(`✓ Moved to .trash: **${folderPath}**`);
            new Notice(`Moved to .trash: ${folderPath}`);
          }
        } catch (e2: any) {
          this.addSystemMessage(`Error: ${e2.message}\n\n*Tip: Try closing any files in this folder first, or delete manually in your file explorer.*`);
        }
      }
      btnContainer.remove();
    });
    
    cancelBtn.addEventListener('click', () => {
      this.addSystemMessage('Cancelled.');
      btnContainer.remove();
    });
  }
  
  // ===== FILE OPERATIONS =====
  
  private async processFileBlocks(msgDiv: HTMLElement, response: string): Promise<void> {
    const regex = /```create-file:([^\n]+)\n([\s\S]*?)```/g;
    let match;
    
    while ((match = regex.exec(response)) !== null) {
      const filename = match[1].trim();
      const content = match[2].trim();
      this.addFileButton(msgDiv, filename, content);
    }
  }
  
  private addFileButton(msgDiv: HTMLElement, filename: string, content: string): void {
    const btnContainer = msgDiv.createDiv({ cls: 'file-action-buttons' });
    const createBtn = btnContainer.createEl('button', { 
      text: `📄 Save as "${filename}"`,
      cls: 'file-action-btn create-btn'
    });
    
    createBtn.addEventListener('click', async () => {
      await this.createFileInVault(filename, content);
      createBtn.setText('✓ Saved!');
      createBtn.disabled = true;
    });
  }
  
  private async createFileInVault(filename: string, content: string): Promise<void> {
    try {
      if (!filename.endsWith('.md')) filename += '.md';
      
      const folder = this.plugin.settings.enhancedNotesFolder || 'AI Notes';
      let finalPath = filename.includes('/') ? filename : `${folder}/${filename}`;
      
      // Ensure folder exists
      const parentPath = finalPath.split('/').slice(0, -1).join('/');
      if (parentPath && !this.app.vault.getAbstractFileByPath(parentPath)) {
        await this.app.vault.createFolder(parentPath);
      }
      
      // Unique name
      let counter = 1;
      let checkPath = finalPath;
      while (this.app.vault.getAbstractFileByPath(checkPath)) {
        checkPath = finalPath.replace('.md', ` ${counter}.md`);
        counter++;
      }
      finalPath = checkPath;
      
      // Frontmatter
      const fm = `---\ncreated: ${new Date().toISOString()}\nsource: vault-ai-chat\n---\n\n`;
      
      const file = await this.app.vault.create(finalPath, fm + content);
      new Notice(`Created: ${file.path}`);
      
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
      
    } catch (e: any) {
      new Notice(`Failed: ${e.message}`);
    }
  }
  
  private async saveResponseAsNote(msgDiv: HTMLElement): Promise<void> {
    // Find content in history
    const msgIndex = Array.from(this.messagesContainer.querySelectorAll('.chat-message-assistant')).indexOf(msgDiv);
    let content = '';
    let assistantCount = 0;
    
    for (const msg of this.conversationHistory) {
      if (msg.role === 'assistant') {
        if (assistantCount === msgIndex) {
          content = this.stripThinkingBlocks(msg.content);
          break;
        }
        assistantCount++;
      }
    }
    
    if (!content) {
      const el = msgDiv.querySelector('.message-content');
      content = el?.textContent || '';
    }
    
    const firstLine = content.split('\n')[0].replace(/[#*`]/g, '').trim();
    const title = (firstLine.substring(0, 50) || `AI Note ${Date.now()}`).replace(/[\\/:*?"<>|]/g, '-');
    
    await this.createFileInVault(title + '.md', content);
  }
  
  // ===== UI HELPERS =====
  
  private addMessage(role: 'user' | 'assistant', content: string): HTMLElement {
    const msgDiv = this.messagesContainer.createDiv({ cls: `chat-message chat-message-${role}` });
    
    const avatar = msgDiv.createDiv({ cls: 'message-avatar' });
    setIcon(avatar, role === 'user' ? 'user' : 'bot');
    
    const wrapper = msgDiv.createDiv({ cls: 'message-wrapper' });
    const headerDiv = wrapper.createDiv({ cls: 'message-header' });
    headerDiv.createDiv({ cls: 'message-role', text: role === 'user' ? 'You' : 'Assistant' });
    
    if (role === 'assistant') {
      const actionsDiv = headerDiv.createDiv({ cls: 'message-actions' });
      
      const copyBtn = actionsDiv.createEl('button', { cls: 'message-action-btn', attr: { 'aria-label': 'Copy' } });
      setIcon(copyBtn, 'copy');
      copyBtn.addEventListener('click', () => {
        const el = msgDiv.querySelector('.message-content');
        navigator.clipboard.writeText(el?.textContent || '');
        new Notice('Copied!');
      });
      
      const saveBtn = actionsDiv.createEl('button', { cls: 'message-action-btn', attr: { 'aria-label': 'Save as note' } });
      setIcon(saveBtn, 'file-plus');
      saveBtn.addEventListener('click', () => this.saveResponseAsNote(msgDiv));
    }
    
    const contentEl = wrapper.createDiv({ cls: 'message-content' });
    if (content) {
      MarkdownRenderer.render(this.app, content, contentEl, '', this.plugin);
    }
    
    this.scrollToBottom();
    return msgDiv;
  }
  
  private addSystemMessage(content: string): HTMLElement {
    const msgDiv = this.messagesContainer.createDiv({ cls: 'chat-message chat-message-system' });
    const wrapper = msgDiv.createDiv({ cls: 'message-wrapper system-message' });
    const contentEl = wrapper.createDiv({ cls: 'message-content' });
    MarkdownRenderer.render(this.app, content, contentEl, '', this.plugin);
    this.scrollToBottom();
    return msgDiv;
  }
  
  private scrollToBottom(): void {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
  
  async onClose(): Promise<void> {}
}
