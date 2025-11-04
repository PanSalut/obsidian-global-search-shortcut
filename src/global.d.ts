// Global type definitions for the Electron API exposed in preload

// Type definitions for IPC data structures
interface SearchResult {
    path: string;
    name: string;
    score: number;
    snippet: string;
}

interface FilePreviewData {
    path: string;
    content: string;
    html: string;
    imageData: Record<string, string>;
}

declare global {
    interface Window {
        electronAPI: {
            openFile: (filePath: string) => void;
            searchContent: (query: string) => void;
            getRecentFiles: () => void;
            getFilePreview: (filePath: string) => void;
            resizeWindow: (width: number, height: number) => void;
            closeWindow: () => void;
            onSearchResults: (callback: (results: SearchResult[]) => void) => void;
            onRecentFiles: (callback: (results: SearchResult[]) => void) => void;
            onFilePreview: (callback: (data: FilePreviewData) => void) => void;
            onResetSearch: (callback: () => void) => void;
        };
    }
}

export {};
