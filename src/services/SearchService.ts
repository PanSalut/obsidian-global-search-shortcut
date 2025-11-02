import { App, TFile } from 'obsidian';

export interface SearchResult {
    path: string;
    name: string;
    score: number;
    snippet: string;
}

export class SearchService {
    constructor(private app: App) {}

    async searchInFiles(query: string): Promise<SearchResult[]> {
        if (!query || query.length < 1) {
            return [];
        }

        const files = this.app.vault.getMarkdownFiles();
        const results: SearchResult[] = [];
        const queryLower = query.toLowerCase();

        for (const file of files) {
            try {
                const nameScore = this.advancedFuzzyMatch(queryLower, file.basename.toLowerCase());

                if (nameScore > 0) {
                    results.push({
                        path: file.path,
                        name: file.basename,
                        score: nameScore * 1000,
                        snippet: ''
                    });
                    continue;
                }

                const content = await this.app.vault.cachedRead(file);
                const contentLower = content.toLowerCase();

                const index = contentLower.indexOf(queryLower);
                if (index !== -1) {
                    const snippet = this.getContextSnippet(content, index, query);
                    results.push({
                        path: file.path,
                        name: file.basename,
                        score: 100,
                        snippet: snippet
                    });
                }
            } catch (e) {
                // Skip files with errors
            }
        }

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, 50);
    }

    advancedFuzzyMatch(query: string, text: string): number {
        if (text === query) return 1000;
        if (text.startsWith(query)) return 900;
        if (text.includes(query)) return 800;

        let score = 0;
        let queryIdx = 0;
        let lastMatchIdx = -1;

        for (let i = 0; i < text.length && queryIdx < query.length; i++) {
            if (text[i] === query[queryIdx]) {
                const gap = i - lastMatchIdx;
                score += gap === 1 ? 10 : 5;
                lastMatchIdx = i;
                queryIdx++;
            }
        }

        return queryIdx === query.length ? score : 0;
    }

    getContextSnippet(content: string, matchIndex: number, query: string): string {
        let lineStart = matchIndex;
        while (lineStart > 0 && content[lineStart - 1] !== '\n') {
            lineStart--;
        }

        let lineEnd = matchIndex + query.length;
        while (lineEnd < content.length && content[lineEnd] !== '\n') {
            lineEnd++;
        }

        const start = Math.max(0, lineStart - 40);
        const end = Math.min(content.length, lineEnd + 40);
        let snippet = content.substring(start, end);

        snippet = snippet.replace(/\n+/g, ' ').trim();

        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet = snippet + '...';

        return snippet;
    }

    fuzzyMatch(pattern: string, str: string): number {
        let patternIdx = 0;
        let strIdx = 0;
        let score = 0;

        while (patternIdx < pattern.length && strIdx < str.length) {
            if (pattern[patternIdx] === str[strIdx]) {
                score += 1;
                patternIdx++;
            }
            strIdx++;
        }

        return patternIdx === pattern.length ? score : 0;
    }

    getSnippet(content: string, query: string): string {
        const lowerContent = content.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const index = lowerContent.indexOf(lowerQuery);

        if (index === -1) return '';

        const start = Math.max(0, index - 40);
        const end = Math.min(content.length, index + query.length + 40);
        let snippet = content.substring(start, end);

        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet = snippet + '...';

        return snippet;
    }
}
