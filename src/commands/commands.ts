import { Notice, Modal, App, Setting, TFile, TextAreaComponent } from 'obsidian';
import type VaultAIPlugin from '../../main';
import { NoteType, buildEnhancePrompt } from '../core/templates/note-templates';

// Modal for selecting note type
class EnhanceNoteModal extends Modal {
  private onSelect: (noteType: NoteType) => void;
  private selectedType: NoteType = 'summary';
  
  constructor(app: App, onSelect: (noteType: NoteType) => void) {
    super(app);
    this.onSelect = onSelect;
  }
  
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    
    contentEl.createEl('h2', { text: 'Generate Enhanced Note' });
    contentEl.createEl('p', { text: 'Select the type of note to generate:' });
    
    new Setting(contentEl)
      .setName('Note type')
      .addDropdown(dropdown => {
        dropdown
          .addOption('summary', 'Summary - Key points and main ideas')
          .addOption('analysis', 'Analysis - Critical examination')
          .addOption('outline', 'Outline - Structured hierarchy')
          .addOption('study-guide', 'Study Guide - Review and questions')
          .addOption('action-items', 'Action Items - Tasks and to-dos')
          .setValue(this.selectedType)
          .onChange((value: NoteType) => {
            this.selectedType = value;
          });
      });
    
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('Generate')
        .setCta()
        .onClick(() => {
          this.onSelect(this.selectedType);
          this.close();
        }))
      .addButton(btn => btn
        .setButtonText('Cancel')
        .onClick(() => this.close()));
  }
  
  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// Modal for topic input
class TopicInputModal extends Modal {
  private onSubmit: (topic: string, noteType: NoteType) => void;
  private topic: string = '';
  private selectedType: NoteType = 'summary';
  
  constructor(app: App, onSubmit: (topic: string, noteType: NoteType) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }
  
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    
    contentEl.createEl('h2', { text: 'Generate Note from Vault' });
    
    new Setting(contentEl)
      .setName('Topic')
      .setDesc('What topic should the note cover?')
      .addText(text => text
        .setPlaceholder('Enter topic...')
        .onChange(value => {
          this.topic = value;
        }));
    
    new Setting(contentEl)
      .setName('Note type')
      .addDropdown(dropdown => {
        dropdown
          .addOption('summary', 'Summary')
          .addOption('analysis', 'Analysis')
          .addOption('outline', 'Outline')
          .addOption('study-guide', 'Study Guide')
          .addOption('action-items', 'Action Items')
          .setValue(this.selectedType)
          .onChange((value: NoteType) => {
            this.selectedType = value;
          });
      });
    
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('Generate')
        .setCta()
        .onClick(() => {
          if (this.topic.trim()) {
            this.onSubmit(this.topic, this.selectedType);
            this.close();
          } else {
            new Notice('Please enter a topic');
          }
        }))
      .addButton(btn => btn
        .setButtonText('Cancel')
        .onClick(() => this.close()));
  }
  
  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// Modal for AI Writer - generate note from custom prompt
class AIWriterModal extends Modal {
  private plugin: VaultAIPlugin;
  private prompt: string = '';
  private filename: string = '';
  private useVaultContext: boolean = true;
  
  constructor(app: App, plugin: VaultAIPlugin) {
    super(app);
    this.plugin = plugin;
  }
  
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ai-writer-modal');
    
    contentEl.createEl('h2', { text: '✨ AI Writer' });
    contentEl.createEl('p', { 
      text: 'Describe what you want to write. The AI will generate a note and save it to your vault.',
      cls: 'ai-writer-description'
    });
    
    // Prompt input
    const promptSetting = new Setting(contentEl)
      .setName('What should I write?')
      .setClass('ai-writer-prompt-setting');
    
    const promptArea = contentEl.createEl('textarea', {
      cls: 'ai-writer-prompt',
      attr: { 
        placeholder: 'Examples:\n• Write a project plan for building a mobile app\n• Create a weekly meal plan with recipes\n• Draft a blog post about productivity tips\n• Summarize my notes about machine learning',
        rows: '6'
      }
    });
    promptArea.addEventListener('input', (e) => {
      this.prompt = (e.target as HTMLTextAreaElement).value;
    });
    
    // Filename
    new Setting(contentEl)
      .setName('Note title (optional)')
      .setDesc('Leave empty to auto-generate from content')
      .addText(text => text
        .setPlaceholder('My New Note')
        .onChange(value => {
          this.filename = value;
        }));
    
    // Use vault context
    new Setting(contentEl)
      .setName('Use vault context')
      .setDesc('Search your notes for relevant context')
      .addToggle(toggle => toggle
        .setValue(this.useVaultContext)
        .onChange(value => {
          this.useVaultContext = value;
        }));
    
    // Buttons
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('Generate & Save')
        .setCta()
        .onClick(() => this.generate()))
      .addButton(btn => btn
        .setButtonText('Cancel')
        .onClick(() => this.close()));
  }
  
  private async generate(): Promise<void> {
    if (!this.prompt.trim()) {
      new Notice('Please enter a prompt');
      return;
    }
    
    const provider = this.plugin.getActiveProvider();
    if (!provider) {
      new Notice('No AI provider configured');
      return;
    }
    
    this.close();
    new Notice('Generating note...');
    
    try {
      // Build context from vault if enabled
      let vaultContext = '';
      if (this.useVaultContext) {
        const searchResults = await this.plugin.vaultSearch.search(this.prompt, {
          limit: this.plugin.settings.maxContextFiles || 5
        });
        
        if (searchResults.length > 0) {
          vaultContext = '\n\n## Relevant Context from Vault:\n\n';
          for (const result of searchResults) {
            let content = result.content;
            if (content.length > 1500) {
              content = content.substring(0, 1500) + '...[truncated]';
            }
            vaultContext += `### [[${result.file.basename}]]\n${content}\n\n`;
          }
        }
      }
      
      const systemPrompt = `You are an expert writer integrated with an Obsidian knowledge base. Generate well-structured, thoughtful content in Markdown format.

Guidelines:
- Write substantive, detailed content
- Use proper Markdown formatting: headers, lists, code blocks, etc.
- Reference relevant notes with [[Note Title]] wiki-links when appropriate
- Be organized with clear sections
- Be helpful and accurate
${vaultContext}`;

      const response = await provider.chat({
        model: this.plugin.settings.selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: this.prompt }
        ],
        maxTokens: this.plugin.settings.maxTokens,
        temperature: this.plugin.settings.temperature
      });
      
      // Generate filename
      let title = this.filename.trim();
      if (!title) {
        // Extract from first line of response
        const firstLine = response.text.split('\n')[0].replace(/^#*\s*/, '').trim();
        title = firstLine.substring(0, 50) || `AI Note ${Date.now()}`;
      }
      const safeTitle = title.replace(/[\\/:*?"<>|#^[\]]/g, '-');
      
      // Ensure folder exists
      const folder = this.plugin.settings.enhancedNotesFolder || 'AI Notes';
      if (!this.app.vault.getAbstractFileByPath(folder)) {
        await this.app.vault.createFolder(folder);
      }
      
      // Create frontmatter
      const now = new Date();
      const frontmatter = `---
created: ${now.toISOString()}
source: ai-writer
provider: ${this.plugin.settings.provider}
model: ${this.plugin.settings.selectedModel}
prompt: "${this.prompt.substring(0, 100).replace(/"/g, '\\"')}"
---

`;
      
      // Find unique filename
      let finalPath = `${folder}/${safeTitle}.md`;
      let counter = 1;
      while (this.app.vault.getAbstractFileByPath(finalPath)) {
        finalPath = `${folder}/${safeTitle} ${counter}.md`;
        counter++;
      }
      
      // Create and open file
      const file = await this.app.vault.create(finalPath, frontmatter + response.text);
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
      
      new Notice(`Created: ${file.basename}`);
      
    } catch (error: any) {
      console.error('AI Writer error:', error);
      new Notice(`Error: ${error.message || 'Failed to generate'}`);
    }
  }
  
  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export function registerCommands(plugin: VaultAIPlugin): void {
  // Open chat view
  plugin.addCommand({
    id: 'open-chat',
    name: 'Open Vault AI Chat',
    callback: () => {
      plugin.activateChatView();
    }
  });
  
  // AI Writer - generate note from custom prompt
  plugin.addCommand({
    id: 'ai-writer',
    name: 'AI Writer - Generate note from prompt',
    callback: () => {
      new AIWriterModal(plugin.app, plugin).open();
    }
  });
  
  // Generate enhanced note from selection
  plugin.addCommand({
    id: 'enhance-selection',
    name: 'Generate enhanced note from selection',
    editorCallback: async (editor, view) => {
      const selectedText = editor.getSelection();
      if (!selectedText) {
        new Notice('Please select some text first');
        return;
      }
      
      const modal = new EnhanceNoteModal(plugin.app, async (noteType) => {
        await generateEnhancedNote(
          plugin, 
          selectedText, 
          noteType, 
          view.file?.basename || 'Selection',
          [view.file?.path || 'Unknown']
        );
      });
      
      modal.open();
    }
  });
  
  // Generate enhanced note from current file
  plugin.addCommand({
    id: 'enhance-current-file',
    name: 'Generate enhanced note from current file',
    editorCallback: async (editor, view) => {
      if (!view.file) {
        new Notice('No file is open');
        return;
      }
      
      const content = await plugin.app.vault.cachedRead(view.file);
      
      const modal = new EnhanceNoteModal(plugin.app, async (noteType) => {
        await generateEnhancedNote(
          plugin, 
          content, 
          noteType, 
          view.file!.basename,
          [view.file!.path]
        );
      });
      
      modal.open();
    }
  });
  
  // Generate note from vault search
  plugin.addCommand({
    id: 'generate-from-vault',
    name: 'Generate note from vault (topic search)',
    callback: () => {
      const modal = new TopicInputModal(plugin.app, async (topic, noteType) => {
        // Search vault for the topic
        new Notice(`Searching vault for "${topic}"...`);
        
        const searchResults = await plugin.vaultSearch.search(topic, {
          limit: plugin.settings.maxContextFiles
        });
        
        if (searchResults.length === 0) {
          new Notice('No relevant notes found for this topic');
          return;
        }
        
        // Combine content from search results
        const combinedContent = searchResults.map(r => 
          `## From [[${r.file.basename}]]\n\n${r.content}`
        ).join('\n\n---\n\n');
        
        const sourcePaths = searchResults.map(r => r.file.path);
        
        await generateEnhancedNote(
          plugin,
          combinedContent,
          noteType,
          topic,
          sourcePaths
        );
      });
      
      modal.open();
    }
  });
  
  // Summarize topic
  plugin.addCommand({
    id: 'summarize-topic',
    name: 'Summarize topic from vault',
    callback: () => {
      const modal = new TopicInputModal(plugin.app, async (topic, _noteType) => {
        await generateEnhancedNote(
          plugin,
          '', // Will be filled by search
          'summary',
          topic,
          [],
          true // isTopicSearch
        );
      });
      
      modal.open();
    }
  });
}

async function generateEnhancedNote(
  plugin: VaultAIPlugin,
  sourceContent: string,
  noteType: NoteType,
  topic: string,
  sourcePaths: string[],
  isTopicSearch: boolean = false
): Promise<void> {
  const provider = plugin.getActiveProvider();
  if (!provider) {
    new Notice('No AI provider configured. Please check settings.');
    return;
  }
  
  if (!plugin.settings.selectedModel) {
    new Notice('No model selected. Please check settings.');
    return;
  }
  
  new Notice('Generating enhanced note...');
  
  try {
    let contentForPrompt = sourceContent;
    let finalSourcePaths = sourcePaths;
    
    // If topic search, search the vault first
    if (isTopicSearch || !sourceContent) {
      const searchResults = await plugin.vaultSearch.search(topic, {
        limit: plugin.settings.maxContextFiles
      });
      
      if (searchResults.length === 0) {
        new Notice('No relevant notes found for this topic');
        return;
      }
      
      contentForPrompt = searchResults.map(r => 
        `## From [[${r.file.basename}]]\n\n${r.content}`
      ).join('\n\n---\n\n');
      
      finalSourcePaths = searchResults.map(r => r.file.path);
    }
    
    const prompt = buildEnhancePrompt({
      topic,
      sourceFiles: finalSourcePaths,
      noteType
    }, contentForPrompt);
    
    const response = await provider.chat({
      model: plugin.settings.selectedModel,
      messages: [
        { role: 'system', content: 'You are a helpful note-taking assistant. Generate well-structured Markdown notes.' },
        { role: 'user', content: prompt }
      ],
      maxTokens: plugin.settings.maxTokens,
      temperature: plugin.settings.temperature
    });
    
    // Ensure folder exists
    const folder = plugin.settings.enhancedNotesFolder;
    const folderExists = plugin.app.vault.getAbstractFileByPath(folder);
    if (!folderExists) {
      await plugin.app.vault.createFolder(folder);
    }
    
    // Create filename
    const timestamp = new Date().toISOString().slice(0, 10);
    const safeTopic = topic.replace(/[\\/:*?"<>|#^[\]]/g, '').substring(0, 40);
    const filename = `${folder}/${timestamp} - ${safeTopic} (${noteType}).md`;
    
    // Create the file
    const file = await plugin.app.vault.create(filename, response.text);
    
    // Open the new file
    const leaf = plugin.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    
    new Notice(`Enhanced note created: ${file.basename}`);
    
  } catch (error: any) {
    console.error('Failed to generate enhanced note:', error);
    new Notice(`Error: ${error.message || 'Failed to generate note'}`);
  }
}
