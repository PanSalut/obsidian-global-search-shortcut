// Global type definitions for the Electron API exposed in preload

declare global {
    interface Window {
        electronAPI: {
            openFile: (filePath: string) => void;
            searchContent: (query: string) => void;
            getRecentFiles: () => void;
            getFilePreview: (filePath: string) => void;
            resizeWindow: (width: number, height: number) => void;
            closeWindow: () => void;
            onSearchResults: (callback: (results: any[]) => void) => void;
            onRecentFiles: (callback: (results: any[]) => void) => void;
            onFilePreview: (callback: (data: any) => void) => void;
            onResetSearch: (callback: () => void) => void;
        };
    }
}

export {};
