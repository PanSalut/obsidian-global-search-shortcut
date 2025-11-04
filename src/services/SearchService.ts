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

export class SearchService {
    private fileIndex: Fuse<FileIndex> | null = null;
    private lastIndexUpdate: number = 0;

    // Constants for performance and memory management
    private readonly INDEX_UPDATE_INTERVAL = 5000; // 5 seconds
    private readonly MAX_INDEX_SIZE = 5000; // Maximum files in index to prevent memory issues
    private readonly SNIPPET_CONTEXT_LENGTH = 40; // Characters before/after match in snippet

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

        this.updateFileIndex();

        const results: SearchResult[] = [];
        const queryLower = query.toLowerCase();

        // Search by filename using Fuse.js (fast)
        if (this.fileIndex) {
            const filenameResults = this.fileIndex.search(query);

            for (const result of filenameResults.slice(0, limit)) {
                const file = this.app.vault.getAbstractFileByPath(result.item.path);
                if (file instanceof TFile) {
                    results.push({
                        path: file.path,
                        name: file.basename,
                        score: (1 - (result.score || 0)) * 1000, // Convert Fuse score to our format
                        snippet: ''
                    });
                }
            }
        }

        // Search in file content (parallel processing for better performance)
        const files = this.app.vault.getMarkdownFiles();
        const contentSearchPromises = files.map(async (file) => {
            try {
                // Skip if already found by filename search
                if (results.some(r => r.path === file.path)) {
                    return null;
                }

                const content = await this.app.vault.cachedRead(file);
                const contentLower = content.toLowerCase();
                const index = contentLower.indexOf(queryLower);

                if (index !== -1) {
                    const snippet = this.getContextSnippet(content, index, query);
                    return {
                        path: file.path,
                        name: file.basename,
                        score: 100,
                        snippet: snippet
                    };
                }
                return null;
            } catch (e) {
                console.error(`Error searching in file ${file.path}:`, e);
                return null;
            }
        });

        const contentResults = await Promise.all(contentSearchPromises);
        results.push(...contentResults.filter((r): r is SearchResult => r !== null));

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
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
