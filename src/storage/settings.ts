export type ProviderType = 'openrouter' | 'google-ai' | 'ollama' | 'minimax' | 'openai-compatible';
export type RegionType = 'international' | 'china';

export interface VaultAISettings {
  // Provider selection
  provider: ProviderType;
  selectedModel: string;
  
  // OpenRouter
  openrouterApiKey: string;
  
  // Google AI
  googleApiKey: string;
  
  // Ollama
  ollamaUrl: string;
  
  // MiniMax
  minimaxApiKey: string;
  minimaxRegion: RegionType;
  minimaxShowThinking: boolean;
  
  // OpenAI-Compatible (free-fill)
  customApiUrl: string;
  customApiKey: string;
  customModel: string;
  
  // Chat settings
  chatFolder: string;
  maxContextFiles: number;
  maxTokens: number;
  temperature: number;
  
  // Enhanced notes settings
  enhancedNotesFolder: string;
}

export const DEFAULT_SETTINGS: VaultAISettings = {
  provider: 'openrouter',
  selectedModel: '',
  
  openrouterApiKey: '',
  googleApiKey: '',
  ollamaUrl: 'http://localhost:11434',
  
  minimaxApiKey: '',
  minimaxRegion: 'international',
  minimaxShowThinking: false,
  
  // OpenAI-Compatible defaults
  customApiUrl: '',
  customApiKey: '',
  customModel: '',
  
  chatFolder: 'AI Chats',
  maxContextFiles: 5,
  maxTokens: 2000,
  temperature: 0.7,
  
  enhancedNotesFolder: 'Enhanced Notes'
};

export const PROVIDER_NAMES: Record<ProviderType, string> = {
  'openrouter': 'OpenRouter',
  'google-ai': 'Google AI (Gemini)',
  'ollama': 'Ollama (Local)',
  'minimax': 'MiniMax',
  'openai-compatible': 'OpenAI Compatible (Custom)'
};
