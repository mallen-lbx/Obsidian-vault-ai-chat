import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type VaultAIPlugin from '../../main';
import { PROVIDER_NAMES, ProviderType, RegionType } from '../storage/settings';
import { OpenRouterProvider } from '../core/providers/openrouter';
import { GoogleAIProvider } from '../core/providers/google-ai';
import { OllamaProvider } from '../core/providers/ollama';
import { MinimaxProvider } from '../core/providers/minimax';
import { OpenAICompatibleProvider } from '../core/providers/openai-compatible';

export class VaultAISettingTab extends PluginSettingTab {
  plugin: VaultAIPlugin;
  
  constructor(app: App, plugin: VaultAIPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    
    containerEl.createEl('h1', { text: 'Vault AI Chat Settings' });
    
    // Provider Selection
    containerEl.createEl('h2', { text: 'AI Provider' });
    
    new Setting(containerEl)
      .setName('Provider')
      .setDesc('Select your AI provider')
      .addDropdown(dropdown => {
        for (const [key, name] of Object.entries(PROVIDER_NAMES)) {
          dropdown.addOption(key, name);
        }
        dropdown
          .setValue(this.plugin.settings.provider)
          .onChange(async (value: ProviderType) => {
            this.plugin.settings.provider = value;
            // Set a default model for the provider
            this.plugin.settings.selectedModel = this.getDefaultModel(value);
            await this.plugin.saveSettings();
            this.display(); // Refresh to show relevant settings
          });
      });
    
    // Provider-specific settings
    const provider = this.plugin.settings.provider;
    
    if (provider === 'openrouter') {
      this.addOpenRouterSettings(containerEl);
    } else if (provider === 'google-ai') {
      this.addGoogleAISettings(containerEl);
    } else if (provider === 'ollama') {
      this.addOllamaSettings(containerEl);
    } else if (provider === 'minimax') {
      this.addMinimaxSettings(containerEl);
    } else if (provider === 'openai-compatible') {
      this.addOpenAICompatibleSettings(containerEl);
    }
    
    // Common settings
    containerEl.createEl('h2', { text: 'Chat Settings' });
    
    new Setting(containerEl)
      .setName('Chat folder')
      .setDesc('Folder to save chat conversations')
      .addText(text => text
        .setPlaceholder('AI Chats')
        .setValue(this.plugin.settings.chatFolder)
        .onChange(async (value) => {
          this.plugin.settings.chatFolder = value || 'AI Chats';
          await this.plugin.saveSettings();
        }));
    
    new Setting(containerEl)
      .setName('Enhanced notes folder')
      .setDesc('Folder to save generated enhanced notes')
      .addText(text => text
        .setPlaceholder('Enhanced Notes')
        .setValue(this.plugin.settings.enhancedNotesFolder)
        .onChange(async (value) => {
          this.plugin.settings.enhancedNotesFolder = value || 'Enhanced Notes';
          await this.plugin.saveSettings();
        }));
    
    new Setting(containerEl)
      .setName('Max context files')
      .setDesc('Maximum number of vault files to include as context (1-20)')
      .addSlider(slider => slider
        .setLimits(1, 20, 1)
        .setValue(this.plugin.settings.maxContextFiles)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.maxContextFiles = value;
          await this.plugin.saveSettings();
        }));
    
    new Setting(containerEl)
      .setName('Max tokens')
      .setDesc('Maximum tokens in AI response (500-8000)')
      .addSlider(slider => slider
        .setLimits(500, 8000, 100)
        .setValue(this.plugin.settings.maxTokens)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.maxTokens = value;
          await this.plugin.saveSettings();
        }));
    
    new Setting(containerEl)
      .setName('Temperature')
      .setDesc('Creativity of responses (0 = focused, 1 = creative)')
      .addSlider(slider => slider
        .setLimits(0, 1, 0.1)
        .setValue(this.plugin.settings.temperature)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.temperature = value;
          await this.plugin.saveSettings();
        }));
    
    // Security warning
    containerEl.createEl('h2', { text: 'Security Note' });
    const warningEl = containerEl.createEl('div', { cls: 'setting-item-description' });
    warningEl.innerHTML = `
      <p style="color: var(--text-warning);">
        ⚠️ <strong>Important:</strong> API keys are stored in your plugin settings. 
        If you use Obsidian Sync, these settings may be synced across devices. 
        Consider using environment variables for sensitive keys on desktop.
      </p>
    `;
  }
  
  private getDefaultModel(provider: ProviderType): string {
    switch (provider) {
      case 'openrouter': return 'anthropic/claude-3.5-sonnet';
      case 'google-ai': return 'gemini-2.0-flash';
      case 'ollama': return 'llama3.2';
      case 'minimax': return 'MiniMax-M2.1';
      case 'openai-compatible': return this.plugin.settings.customModel || '';
      default: return '';
    }
  }
  
  private addOpenRouterSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('OpenRouter API Key')
      .setDesc('Get your key from openrouter.ai/keys')
      .addText(text => text
        .setPlaceholder('sk-or-...')
        .setValue(this.plugin.settings.openrouterApiKey)
        .onChange(async (value) => {
          this.plugin.settings.openrouterApiKey = value;
          await this.plugin.saveSettings();
        }))
      .addButton(btn => btn
        .setButtonText('Test')
        .onClick(async () => {
          if (!this.plugin.settings.openrouterApiKey) {
            new Notice('Please enter an API key first');
            return;
          }
          const provider = new OpenRouterProvider(this.plugin.settings.openrouterApiKey);
          const result = await provider.validate();
          new Notice(result.valid ? '✓ Connection successful!' : `✗ Error: ${result.error}`);
        }));
    
    new Setting(containerEl)
      .setName('Model')
      .setDesc('OpenRouter model ID (e.g., anthropic/claude-3.5-sonnet)')
      .addText(text => text
        .setPlaceholder('anthropic/claude-3.5-sonnet')
        .setValue(this.plugin.settings.selectedModel)
        .onChange(async (value) => {
          this.plugin.settings.selectedModel = value;
          await this.plugin.saveSettings();
        }));
  }
  
  private addGoogleAISettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Google AI API Key')
      .setDesc('Get from aistudio.google.com')
      .addText(text => text
        .setPlaceholder('Your API key')
        .setValue(this.plugin.settings.googleApiKey)
        .onChange(async (value) => {
          this.plugin.settings.googleApiKey = value;
          await this.plugin.saveSettings();
        }))
      .addButton(btn => btn
        .setButtonText('Test')
        .onClick(async () => {
          if (!this.plugin.settings.googleApiKey) {
            new Notice('Please enter an API key first');
            return;
          }
          const provider = new GoogleAIProvider(this.plugin.settings.googleApiKey);
          const result = await provider.validate();
          new Notice(result.valid ? '✓ Connection successful!' : `✗ Error: ${result.error}`);
        }));
    
    new Setting(containerEl)
      .setName('Model')
      .setDesc('Select a Gemini model')
      .addDropdown(dropdown => {
        dropdown
          .addOption('gemini-2.0-flash', 'Gemini 2.0 Flash (Recommended)')
          .addOption('gemini-2.5-flash', 'Gemini 2.5 Flash')
          .addOption('gemini-2.5-pro', 'Gemini 2.5 Pro')
          .setValue(this.plugin.settings.selectedModel || 'gemini-2.0-flash')
          .onChange(async (value) => {
            this.plugin.settings.selectedModel = value;
            await this.plugin.saveSettings();
          });
      });
  }
  
  private addOllamaSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Ollama URL')
      .setDesc('Usually http://localhost:11434')
      .addText(text => text
        .setPlaceholder('http://localhost:11434')
        .setValue(this.plugin.settings.ollamaUrl)
        .onChange(async (value) => {
          this.plugin.settings.ollamaUrl = value || 'http://localhost:11434';
          await this.plugin.saveSettings();
        }))
      .addButton(btn => btn
        .setButtonText('Test')
        .onClick(async () => {
          const provider = new OllamaProvider(this.plugin.settings.ollamaUrl);
          const result = await provider.validate();
          new Notice(result.valid ? '✓ Connection successful!' : `✗ Error: ${result.error}`);
        }));
    
    new Setting(containerEl)
      .setName('Model')
      .setDesc('Model name as shown in `ollama list`')
      .addText(text => text
        .setPlaceholder('llama3.2')
        .setValue(this.plugin.settings.selectedModel)
        .onChange(async (value) => {
          this.plugin.settings.selectedModel = value;
          await this.plugin.saveSettings();
        }));
  }
  
  private addMinimaxSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('MiniMax API Key')
      .setDesc('Get from platform.minimax.io')
      .addText(text => text
        .setPlaceholder('Your API key')
        .setValue(this.plugin.settings.minimaxApiKey)
        .onChange(async (value) => {
          this.plugin.settings.minimaxApiKey = value;
          await this.plugin.saveSettings();
        }))
      .addButton(btn => btn
        .setButtonText('Test')
        .onClick(async () => {
          if (!this.plugin.settings.minimaxApiKey) {
            new Notice('Please enter an API key first');
            return;
          }
          const provider = new MinimaxProvider(
            this.plugin.settings.minimaxApiKey,
            this.plugin.settings.minimaxRegion
          );
          const result = await provider.validate();
          new Notice(result.valid ? '✓ Connection successful!' : `✗ Error: ${result.error}`);
        }));
    
    new Setting(containerEl)
      .setName('Region')
      .setDesc('Select based on your location')
      .addDropdown(dropdown => {
        dropdown
          .addOption('international', 'International (api.minimax.io)')
          .addOption('china', 'China (api.minimaxi.com)')
          .setValue(this.plugin.settings.minimaxRegion)
          .onChange(async (value: RegionType) => {
            this.plugin.settings.minimaxRegion = value;
            await this.plugin.saveSettings();
          });
      });
    
    new Setting(containerEl)
      .setName('Model')
      .addDropdown(dropdown => {
        dropdown
          .addOption('MiniMax-M2.1', 'MiniMax M2.1 (Latest)')
          .addOption('MiniMax-M2', 'MiniMax M2')
          .setValue(this.plugin.settings.selectedModel || 'MiniMax-M2.1')
          .onChange(async (value) => {
            this.plugin.settings.selectedModel = value;
            await this.plugin.saveSettings();
          });
      });
    
    new Setting(containerEl)
      .setName('Show thinking process')
      .setDesc('Display the model\'s <think> blocks in responses')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.minimaxShowThinking)
        .onChange(async (value) => {
          this.plugin.settings.minimaxShowThinking = value;
          await this.plugin.saveSettings();
        }));
  }
  
  private addOpenAICompatibleSettings(containerEl: HTMLElement): void {
    const descEl = containerEl.createEl('p', { 
      text: 'Use any OpenAI-compatible API (Z.AI GLM Coding, DeepSeek, Groq, Together AI, local LLMs, etc.)',
      cls: 'setting-item-description'
    });
    descEl.style.marginBottom = '16px';
    
    new Setting(containerEl)
      .setName('API Base URL')
      .setDesc('Full URL to the chat completions endpoint')
      .addText(text => text
        .setPlaceholder('https://api.example.com/v1/chat/completions')
        .setValue(this.plugin.settings.customApiUrl)
        .onChange(async (value) => {
          this.plugin.settings.customApiUrl = value;
          await this.plugin.saveSettings();
        }));
    
    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Leave empty if not required (e.g., local LLMs)')
      .addText(text => text
        .setPlaceholder('Your API key')
        .setValue(this.plugin.settings.customApiKey)
        .onChange(async (value) => {
          this.plugin.settings.customApiKey = value;
          await this.plugin.saveSettings();
        }));
    
    new Setting(containerEl)
      .setName('Model ID')
      .setDesc('Exact model identifier')
      .addText(text => text
        .setPlaceholder('gpt-4, glm-4-flash, deepseek-chat, etc.')
        .setValue(this.plugin.settings.customModel)
        .onChange(async (value) => {
          this.plugin.settings.customModel = value;
          this.plugin.settings.selectedModel = value;
          await this.plugin.saveSettings();
        }))
      .addButton(btn => btn
        .setButtonText('Test')
        .onClick(async () => {
          if (!this.plugin.settings.customApiUrl) {
            new Notice('Please enter an API URL first');
            return;
          }
          if (!this.plugin.settings.customModel) {
            new Notice('Please enter a model ID first');
            return;
          }
          const provider = new OpenAICompatibleProvider(
            this.plugin.settings.customApiUrl,
            this.plugin.settings.customApiKey,
            this.plugin.settings.customModel
          );
          const result = await provider.validate();
          new Notice(result.valid ? '✓ Connection successful!' : `✗ Error: ${result.error}`);
        }));
    
    // Examples
    const examplesEl = containerEl.createEl('div', { cls: 'setting-item-description' });
    examplesEl.innerHTML = `
      <p style="margin-top: 16px;"><strong>Example configurations:</strong></p>
      <ul style="font-size: 12px; color: var(--text-muted);">
        <li><strong>Z.AI GLM Coding:</strong> https://api.z.ai/api/coding/paas/v4/chat/completions + glm-4-flash</li>
        <li><strong>Z.AI GLM Standard:</strong> https://api.z.ai/api/paas/v4/chat/completions + glm-4.7</li>
        <li><strong>DeepSeek:</strong> https://api.deepseek.com/v1/chat/completions + deepseek-chat</li>
        <li><strong>Groq:</strong> https://api.groq.com/openai/v1/chat/completions + llama-3.3-70b-versatile</li>
        <li><strong>Local (LM Studio):</strong> http://localhost:1234/v1/chat/completions + local-model</li>
      </ul>
    `;
  }
}
