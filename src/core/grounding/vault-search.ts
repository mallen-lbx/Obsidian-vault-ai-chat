import { App, TFile, CachedMetadata } from 'obsidian';

export interface SearchResult {
  file: TFile;
  content: string;
  headings: string[];
  score: number;
}

export interface SearchOptions {
  folders?: string[];
  tags?: string[];
  limit?: number;
}

export class VaultSearch {
  constructor(private app: App) {}
  
  /**
   * Search vault for files matching query
   * Uses simple keyword matching + metadata
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const limit = options?.limit ?? 10;
    const results: SearchResult[] = [];
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    
    if (queryTerms.length === 0) {
      return [];
    }
    
    const files = this.app.vault.getMarkdownFiles();
    
    for (const file of files) {
      // Filter by folder
      if (options?.folders?.length) {
        const inFolder = options.folders.some(f => file.path.startsWith(f));
        if (!inFolder) continue;
      }
      
      // Filter by tags
      if (options?.tags?.length) {
        const cache = this.app.metadataCache.getFileCache(file);
        const fileTags = this.extractTags(cache);
        const hasTag = options.tags.some(t => fileTags.includes(t.replace('#', '')));
        if (!hasTag) continue;
      }
      
      // Read content and score
      try {
        const content = await this.app.vault.cachedRead(file);
        const score = this.scoreContent(content, file.basename, queryTerms);
        
        if (score > 0) {
          const cache = this.app.metadataCache.getFileCache(file);
          results.push({
            file,
            content,
            headings: cache?.headings?.map(h => h.heading) || [],
            score
          });
        }
      } catch {
        // Skip files that can't be read
      }
    }
    
    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
  
  /**
   * Get all files in the vault (for browsing)
   */
  async getAllFiles(): Promise<TFile[]> {
    return this.app.vault.getMarkdownFiles();
  }
  
  /**
   * Get file content by path
   */
  async getFileContent(path: string): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      return await this.app.vault.cachedRead(file);
    }
    return null;
  }
  
  private scoreContent(content: string, title: string, queryTerms: string[]): number {
    const lowerContent = content.toLowerCase();
    const lowerTitle = title.toLowerCase();
    let score = 0;
    
    for (const term of queryTerms) {
      // Title match is weighted higher
      if (lowerTitle.includes(term)) score += 10;
      
      // Count occurrences in content
      const regex = new RegExp(term, 'gi');
      const matches = lowerContent.match(regex);
      if (matches) score += matches.length;
    }
    
    return score;
  }
  
  private extractTags(cache: CachedMetadata | null): string[] {
    if (!cache) return [];
    const tags: string[] = [];
    
    // Frontmatter tags
    if (cache.frontmatter?.tags) {
      const fmTags = cache.frontmatter.tags;
      if (Array.isArray(fmTags)) tags.push(...fmTags);
      else if (typeof fmTags === 'string') tags.push(fmTags);
    }
    
    // Inline tags
    if (cache.tags) {
      tags.push(...cache.tags.map(t => t.tag.replace('#', '')));
    }
    
    return tags;
  }
}
