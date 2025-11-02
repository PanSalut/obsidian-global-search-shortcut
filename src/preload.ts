// Use require for Electron modules to avoid TypeScript errors in Obsidian plugin build
const { contextBridge, ipcRenderer } = require('electron');

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
    onSearchResults: (callback: (results: any[]) => void) => {
        ipcRenderer.on('search-results', (_event: any, results: any) => callback(results));
    },
    onRecentFiles: (callback: (results: any[]) => void) => {
        ipcRenderer.on('recent-files', (_event: any, results: any) => callback(results));
    },
    onFilePreview: (callback: (data: any) => void) => {
        ipcRenderer.on('file-preview', (_event: any, data: any) => callback(data));
    },
    onResetSearch: (callback: () => void) => {
        ipcRenderer.on('reset-search', () => callback());
    }
});
