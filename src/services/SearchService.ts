import { App, TFile } from 'obsidian';
import Fuse from 'fuse.js';

export interface SearchResult {
    path: string;
    name: string;
    score: number;
    snippet: string;
}

interface FileIndex {
    path: string;
    name: string;
    basename: string;
}

interface CachedSearchResult {
    results: SearchResult[];
    timestamp: number;
}

export class SearchService {
    private fileIndex: Fuse<FileIndex> | null = null;
    private lastIndexUpdate: number = 0;
    private searchCache: Map<string, CachedSearchResult> = new Map();

    // Constants for performance and memory management
    private readonly INDEX_UPDATE_INTERVAL = 5000; // 5 seconds
    private readonly MAX_INDEX_SIZE = 5000; // Maximum files in index to prevent memory issues
    private readonly SNIPPET_CONTEXT_LENGTH = 40; // Characters before/after match in snippet
    private readonly CACHE_TTL = 30000; // Cache results for 30 seconds
    private readonly MAX_CACHE_SIZE = 50; // Maximum cached queries
    private readonly CONTENT_SEARCH_BATCH_SIZE = 20; // Process files in batches

    constructor(private app: App) {}

    private updateFileIndex(): void {
        const now = Date.now();
        if (this.fileIndex && (now - this.lastIndexUpdate) < this.INDEX_UPDATE_INTERVAL) {
            return; // Use cached index
        }

        // Get all markdown files and sort by modification time (most recent first)
        const files = this.app.vault.getMarkdownFiles()
            .sort((a, b) => b.stat.mtime - a.stat.mtime)
            .slice(0, this.MAX_INDEX_SIZE); // Limit index size for performance

        const fileData: FileIndex[] = files.map(file => ({
            path: file.path,
            name: file.name,
            basename: file.basename
        }));

        this.fileIndex = new Fuse(fileData, {
            keys: [
                { name: 'basename', weight: 2 },
                { name: 'path', weight: 1 }
            ],
            threshold: 0.4,
            includeScore: true,
            minMatchCharLength: 1,
            ignoreLocation: true
        });

        this.lastIndexUpdate = now;
    }

    async searchInFiles(query: string, limit = 50): Promise<SearchResult[]> {
        if (!query || query.length < 1) {
            return [];
        }

        // Check cache first - include limit in cache key
        const cacheKey = `${query}:${limit}`;
        const cached = this.searchCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
            return cached.results;
        }

        this.updateFileIndex();

        const results: SearchResult[] = [];
        const queryLower = query.toLowerCase();
        const foundPaths = new Set<string>();

        // Search by filename using Fuse.js (fast)
        if (this.fileIndex) {
            const filenameResults = this.fileIndex.search(query);

            for (const result of filenameResults.slice(0, limit)) {
                const file = this.app.vault.getAbstractFileByPath(result.item.path);
                if (file instanceof TFile) {
                    const score = (1 - (result.score || 0)) * 1000;
                    results.push({
                        path: file.path,
                        name: file.basename,
                        score: score,
                        snippet: ''
                    });
                    foundPaths.add(file.path);
                }
            }
        }

        // Content search with early termination and batch processing
        // Sort by modification time (prioritize recent files) but search all files
        const allFiles = this.app.vault.getMarkdownFiles()
            .sort((a, b) => b.stat.mtime - a.stat.mtime);

        // Process files in batches and stop when we have enough results
        for (let i = 0; i < allFiles.length && results.length < limit; i += this.CONTENT_SEARCH_BATCH_SIZE) {
            const batch = allFiles.slice(i, i + this.CONTENT_SEARCH_BATCH_SIZE);

            const batchPromises = batch.map(async (file) => {
                try {
                    const content = await this.app.vault.cachedRead(file);
                    // Strip markdown for searching
                    const strippedContent = this.stripMarkdown(content);
                    const strippedLower = strippedContent.toLowerCase();
                    const index = strippedLower.indexOf(queryLower);

                    if (index !== -1) {
                        const snippet = this.getContextSnippet(strippedContent, index, query);
                        const contentScore = 800; // High score so exact phrase matches in content rank highly

                        // Check if file was already found by filename search
                        if (foundPaths.has(file.path)) {
                            // Update existing result if content score is better
                            const existingIndex = results.findIndex(r => r.path === file.path);
                            if (existingIndex !== -1) {
                                if (contentScore > results[existingIndex].score) {
                                    results[existingIndex].score = contentScore;
                                }
                                // Always add snippet if it was empty
                                if (!results[existingIndex].snippet) {
                                    results[existingIndex].snippet = snippet;
                                }
                            }
                            return null;
                        }

                        return {
                            path: file.path,
                            name: file.basename,
                            score: contentScore,
                            snippet: snippet
                        };
                    }
                    return null;
                } catch (e) {
                    console.error(`Error searching in file ${file.path}:`, e);
                    return null;
                }
            });

            const batchResults = await Promise.all(batchPromises);
            const validResults = batchResults.filter((r): r is SearchResult => r !== null);

            for (const result of validResults) {
                results.push(result);
                foundPaths.add(result.path);

                // Early exit if we have enough results
                if (results.length >= limit) {
                    break;
                }
            }
        }

        // Sort and limit results
        const finalResults = results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        // Store in cache with limit in key
        this.searchCache.set(cacheKey, {
            results: finalResults,
            timestamp: Date.now()
        });

        // Limit cache size
        if (this.searchCache.size > this.MAX_CACHE_SIZE) {
            const firstKey = this.searchCache.keys().next().value;
            if (firstKey !== undefined) {
                this.searchCache.delete(firstKey);
            }
        }

        return finalResults;
    }

    private stripMarkdown(text: string): string {
        return text
            // Wikilinks: [[link|alias]] → alias, [[link]] → link
            .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
            .replace(/\[\[([^\]]+)\]\]/g, '$1')
            // Bold: **text** or __text__
            .replace(/(\*\*|__)(.*?)\1/g, '$2')
            // Italic: *text* or _text_
            .replace(/(\*|_)(.*?)\1/g, '$2')
            // Strikethrough: ~~text~~
            .replace(/~~(.*?)~~/g, '$1')
            // Inline code: `text`
            .replace(/`([^`]+)`/g, '$1')
            // Images: ![alt](url) - MUST be before Links!
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
            // Links: [text](url)
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // Headings: ## text
            .replace(/^#{1,6}\s+/gm, '')
            // List markers: - or * or 1.
            .replace(/^[\s]*[-*+]\s+/gm, '')
            .replace(/^[\s]*\d+\.\s+/gm, '');
    }

    private getContextSnippet(content: string, matchIndex: number, query: string): string {
        let lineStart = matchIndex;
        while (lineStart > 0 && content[lineStart - 1] !== '\n') {
            lineStart--;
        }

        let lineEnd = matchIndex + query.length;
        while (lineEnd < content.length && content[lineEnd] !== '\n') {
            lineEnd++;
        }

        const start = Math.max(0, lineStart - this.SNIPPET_CONTEXT_LENGTH);
        const end = Math.min(content.length, lineEnd + this.SNIPPET_CONTEXT_LENGTH);
        let snippet = content.substring(start, end);

        snippet = snippet.replace(/\n+/g, ' ').trim();

        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet = snippet + '...';

        return snippet;
    }
}
