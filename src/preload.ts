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

// Type definitions for minimal Electron API needed in preload
interface IpcRendererEvent {
    sender: unknown;
}

interface IpcRenderer {
    send(channel: string, ...args: unknown[]): void;
    on(channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void): void;
}

interface ContextBridge {
    exposeInMainWorld(apiKey: string, api: Record<string, unknown>): void;
}

// Dynamic import of Electron modules to avoid TypeScript errors
// This is the recommended approach for Obsidian plugins that use Electron APIs
const getElectron = (): { contextBridge: ContextBridge; ipcRenderer: IpcRenderer } => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('electron');
};

const { contextBridge, ipcRenderer } = getElectron();

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Send messages to main process
    openFile: (filePath: string) => ipcRenderer.send('open-file', filePath),
    searchContent: (query: string) => ipcRenderer.send('search-content', query),
    getRecentFiles: () => ipcRenderer.send('get-recent-files'),
    getFilePreview: (filePath: string) => ipcRenderer.send('get-file-preview', filePath),
    resizeWindow: (width: number, height: number) => ipcRenderer.send('resize-window', width, height),
    closeWindow: () => ipcRenderer.send('close-window'),

    // Listen for messages from main process
    onSearchResults: (callback: (results: SearchResult[]) => void) => {
        ipcRenderer.on('search-results', (_event: IpcRendererEvent, results: SearchResult[]) => callback(results));
    },
    onRecentFiles: (callback: (results: SearchResult[]) => void) => {
        ipcRenderer.on('recent-files', (_event: IpcRendererEvent, results: SearchResult[]) => callback(results));
    },
    onFilePreview: (callback: (data: FilePreviewData) => void) => {
        ipcRenderer.on('file-preview', (_event: IpcRendererEvent, data: FilePreviewData) => callback(data));
    },
    onResetSearch: (callback: () => void) => {
        ipcRenderer.on('reset-search', () => callback());
    }
});
