import { Plugin, WorkspaceLeaf } from 'obsidian';
import { VaultAISettingTab } from './src/ui/settings-tab';
import { ChatView, CHAT_VIEW_TYPE } from './src/ui/chat-view';
import { ProviderRegistry, LLMProvider } from './src/core/provider';
import { OpenRouterProvider } from './src/core/providers/openrouter';
import { GoogleAIProvider } from './src/core/providers/google-ai';
import { OllamaProvider } from './src/core/providers/ollama';
import { MinimaxProvider } from './src/core/providers/minimax';
import { OpenAICompatibleProvider } from './src/core/providers/openai-compatible';
import { VaultSearch } from './src/core/grounding/vault-search';
import { ContextBuilder } from './src/core/grounding/context-builder';
import { ChatPersistence } from './src/storage/chat-persistence';
import { VaultAISettings, DEFAULT_SETTINGS } from './src/storage/settings';
import { registerCommands } from './src/commands/commands';

export default class VaultAIPlugin extends Plugin {
  settings: VaultAISettings;
  providerRegistry: ProviderRegistry;
  vaultSearch: VaultSearch;
  contextBuilder: ContextBuilder;
  chatPersistence: ChatPersistence;
  
  async onload(): Promise<void> {
    console.log('Loading Vault AI Chat plugin');
    
    await this.loadSettings();
    
    // Initialize core services
    this.providerRegistry = new ProviderRegistry();
    this.vaultSearch = new VaultSearch(this.app);
    this.contextBuilder = new ContextBuilder();
    this.chatPersistence = new ChatPersistence(this.app, this.settings.chatFolder);
    
    // Register providers based on settings
    this.initializeProviders();
    
    // Register the chat view
    this.registerView(
      CHAT_VIEW_TYPE,
      (leaf) => new ChatView(leaf, this)
    );
    
    // Add ribbon icon
    this.addRibbonIcon('message-square', 'Open Vault AI Chat', () => {
      this.activateChatView();
    });
    
    // Register commands
    registerCommands(this);
    
    // Add settings tab
    this.addSettingTab(new VaultAISettingTab(this.app, this));
    
    console.log('Vault AI Chat plugin loaded');
  }
  
  async onunload(): Promise<void> {
    console.log('Unloading Vault AI Chat plugin');
  }
  
  /**
   * Initialize providers based on current settings
   */
  initializeProviders(): void {
    this.providerRegistry.clear();
    
    // OpenRouter
    if (this.settings.openrouterApiKey) {
      this.providerRegistry.register(
        new OpenRouterProvider(this.settings.openrouterApiKey)
      );
    }
    
    // Google AI
    if (this.settings.googleApiKey) {
      this.providerRegistry.register(
        new GoogleAIProvider(this.settings.googleApiKey)
      );
    }
    
    // Ollama (doesn't need API key)
    this.providerRegistry.register(
      new OllamaProvider(this.settings.ollamaUrl)
    );
    
    // MiniMax
    if (this.settings.minimaxApiKey) {
      this.providerRegistry.register(
        new MinimaxProvider(
          this.settings.minimaxApiKey, 
          this.settings.minimaxRegion,
          this.settings.minimaxShowThinking
        )
      );
    }
    
    // OpenAI-Compatible (custom)
    if (this.settings.customApiUrl && this.settings.customModel) {
      this.providerRegistry.register(
        new OpenAICompatibleProvider(
          this.settings.customApiUrl,
          this.settings.customApiKey,
          this.settings.customModel
        )
      );
    }
  }
  
  /**
   * Get the currently active provider based on settings
   */
  getActiveProvider(): LLMProvider | undefined {
    return this.providerRegistry.get(this.settings.provider);
  }
  
  /**
   * Activate or reveal the chat view
   */
  async activateChatView(): Promise<void> {
    const { workspace } = this.app;
    
    let leaf = workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
    
    if (!leaf) {
      // Create new leaf in right sidebar
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
        leaf = rightLeaf;
      }
    }
    
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
  
  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // Reinitialize providers when settings change
    this.initializeProviders();
    // Update chat persistence folder
    this.chatPersistence.setFolder(this.settings.chatFolder);
  }
}
