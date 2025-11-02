import { App, MarkdownRenderer, TFile } from 'obsidian';
import type GlobalSearchPlugin from '../main';
import { SearchService } from './SearchService';

export class ElectronService {
    private electron: any = null;
    private globalShortcut: any = null;
    private searchWindow: any = null;
    private registeredHotkey: string | null = null;
    private searchService: SearchService;

    constructor(private app: App, private plugin: GlobalSearchPlugin) {
        this.searchService = new SearchService(app);
    }

    initialize() {
        setTimeout(() => {
            try {
                // @ts-ignore
                const electron = (window as any).require?.('electron');
                if (electron) {
                    this.electron = electron;
                    this.globalShortcut = electron.remote?.globalShortcut ||
                                        (electron.globalShortcut);
                    this.registerGlobalHotkey();
                    this.setupIpcHandler();
                }
            } catch (e) {
                // Electron API not available - fallback to Command Palette
            }
        }, 1000);
    }

    cleanup() {
        this.unregisterGlobalHotkey();

        // Remove IPC handlers
        if (this.electron) {
            const { ipcMain } = this.electron.remote || this.electron;
            if (ipcMain) {
                // Remove all handlers
                ipcMain.removeHandler('open-file');
                ipcMain.removeHandler('search-content');
                ipcMain.removeHandler('get-recent-files');
                ipcMain.removeHandler('get-file-preview');
                ipcMain.removeHandler('resize-window');
                ipcMain.removeHandler('get-theme');
                ipcMain.removeAllListeners('close-window');
            }
        }

        if (this.searchWindow && !this.searchWindow.isDestroyed()) {
            this.searchWindow.close();
        }
    }

    registerGlobalHotkey() {
        if (!this.globalShortcut) {
            return;
        }

        try {
            if (this.registeredHotkey) {
                try {
                    this.globalShortcut.unregister(this.registeredHotkey);
                } catch (e) {
                    console.error('Error unregistering old hotkey:', e);
                }
            }

            const success = this.globalShortcut.register(this.plugin.settings.globalHotkey, () => {
                this.plugin.openSearchModal();
            });

            if (success) {
                this.registeredHotkey = this.plugin.settings.globalHotkey;
            } else {
                this.registeredHotkey = null;
            }
        } catch (e) {
            console.error('Error registering global hotkey:', e);
            this.registeredHotkey = null;
        }
    }

    unregisterGlobalHotkey() {
        if (this.globalShortcut && this.registeredHotkey) {
            try {
                this.globalShortcut.unregister(this.registeredHotkey);
                this.registeredHotkey = null;
            } catch (e) {
                console.error('Error unregistering global hotkey:', e);
            }
        }
    }

    focusObsidianWindow() {
        if (this.electron?.remote) {
            const currentWindow = this.electron.remote.getCurrentWindow();
            if (currentWindow) {
                currentWindow.show();
                currentWindow.focus();
            }
        }
    }

    closeSearchWindow() {
        if (this.searchWindow && !this.searchWindow.isDestroyed()) {
            this.searchWindow.close();
            this.searchWindow = null;
        }
    }

    createSearchWindow(html: string) {
        if (!this.electron) {
            return false;
        }

        const BrowserWindow = this.electron.remote?.BrowserWindow || this.electron.BrowserWindow;

        if (!BrowserWindow) {
            return false;
        }

        this.searchWindow = new BrowserWindow({
            width: 1100,
            height: 600,
            frame: false,
            transparent: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: false,
            center: true,
            webPreferences: {
                // NOTE: These settings are required for Obsidian's Electron environment
                // to enable IPC communication and local content rendering.
                // The window only loads trusted local content (HTML we generate).
                nodeIntegration: true,        // Required for IPC in Obsidian
                contextIsolation: false,      // Required for direct IPC access
                webSecurity: false,           // Required for data: URIs and image loading
            }
        });

        this.searchWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

        this.searchWindow.on('blur', () => {
            if (this.searchWindow && !this.searchWindow.isDestroyed()) {
                this.searchWindow.close();
            }
        });

        this.searchWindow.on('closed', () => {
            this.searchWindow = null;
        });

        return true;
    }

    hasElectron(): boolean {
        return this.electron !== null;
    }

    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    setupIpcHandler() {
        if (!this.electron) {
            return;
        }

        const { ipcMain } = this.electron.remote || this.electron;
        if (!ipcMain) {
            return;
        }

        // IPC Handlers - using .on() for compatibility with ipcRenderer.send()

        // Handler: Open file in Obsidian
        ipcMain.on('open-file', async (_event: any, filePath: string) => {
            // Validate file path to prevent path traversal
            if (!filePath || typeof filePath !== 'string' || filePath.includes('..')) {
                console.error('Invalid file path');
                return;
            }

            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                await this.plugin.openFileInNewWindow(file);
            }
            if (this.searchWindow && !this.searchWindow.isDestroyed()) {
                this.searchWindow.close();
            }
        });

        // Handler: Resize window
        ipcMain.on('resize-window', (_event: any, width: number, height: number) => {
            if (this.searchWindow && !this.searchWindow.isDestroyed()) {
                this.searchWindow.setSize(width, height);
            }
        });

        // Handler: Search content
        ipcMain.on('search-content', async (event: any, query: string) => {
            try {
                const results = await this.searchService.searchInFiles(query);
                event.reply('search-results', results);
            } catch (e) {
                console.error('Search error:', e);
                event.reply('search-results', []);
            }
        });

        // Handler: Get recent files
        ipcMain.on('get-recent-files', async (event: any) => {
            try {
                const recentPaths = this.app.workspace.getLastOpenFiles();
                const recentFiles = [];

                for (const path of recentPaths) {
                    const file = this.app.vault.getAbstractFileByPath(path);
                    if (file instanceof TFile) {
                        recentFiles.push({
                            path: file.path,
                            name: file.basename,
                            score: 10000,
                            snippet: this.plugin.t('recentlyViewed')
                        });
                    }
                }

                event.reply('recent-files', recentFiles);
            } catch (e) {
                console.error('Error getting recent files:', e);
                event.reply('recent-files', []);
            }
        });

        // Handler: Get file preview with images
        ipcMain.on('get-file-preview', async (event: any, filePath: string) => {
            // Validate file path
            if (!filePath || typeof filePath !== 'string' || filePath.includes('..')) {
                console.error('Invalid file path');
                event.reply('file-preview', { path: filePath, content: '', html: '', imageData: {} });
                return;
            }
            try {
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (!(file instanceof TFile)) {
                    event.reply('file-preview', { path: filePath, content: '', html: '', imageData: {} });
                    return;
                }

                const content = await this.app.vault.cachedRead(file);
                const el = document.createElement('div');
                await MarkdownRenderer.render(this.app, content, el, filePath, this.plugin);

                const images = el.querySelectorAll('img');
                const imageData: Record<string, string> = {};

                // Convert images to base64 data URLs (works with webSecurity: false)
                for (const img of Array.from(images)) {
                    const src = img.getAttribute('src');

                    if (!src) continue;

                    // Skip already processed images
                    if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
                        continue;
                    }

                    try {
                        let imagePath = src;

                        // Handle app:// protocol
                        if (imagePath.startsWith('app://')) {
                            const match = imagePath.match(/app:\/\/[^/]+\/(.+?)(\?.*)?$/);
                            if (match) {
                                imagePath = match[1];
                            }
                        }

                        imagePath = decodeURIComponent(imagePath);

                        // Try to find the image file
                        let imageFile = this.app.vault.getAbstractFileByPath(imagePath);

                        // Try relative to note directory
                        if (!imageFile) {
                            const noteDir = filePath.substring(0, filePath.lastIndexOf('/'));
                            if (noteDir && !imagePath.startsWith('/')) {
                                const relativePath = noteDir + '/' + imagePath;
                                imageFile = this.app.vault.getAbstractFileByPath(relativePath);
                            }
                        }

                        // Try to find by filename
                        if (!imageFile) {
                            const fileName = imagePath.split('/').pop();
                            if (fileName) {
                                const allFiles = this.app.vault.getFiles();
                                const foundByName = allFiles.find(f => f.name === fileName);
                                if (foundByName) {
                                    imageFile = foundByName;
                                }
                            }
                        }

                        // Convert to base64 data URL
                        if (imageFile instanceof TFile) {
                            const arrayBuffer = await this.app.vault.readBinary(imageFile);
                            const base64 = this.arrayBufferToBase64(arrayBuffer);

                            const extension = imageFile.extension.toLowerCase();
                            let mimeType = 'image/png';
                            if (extension === 'jpg' || extension === 'jpeg') {
                                mimeType = 'image/jpeg';
                            } else if (extension === 'gif') {
                                mimeType = 'image/gif';
                            } else if (extension === 'svg') {
                                mimeType = 'image/svg+xml';
                            } else if (extension === 'webp') {
                                mimeType = 'image/webp';
                            } else if (extension === 'bmp') {
                                mimeType = 'image/bmp';
                            }

                            const dataUrl = `data:${mimeType};base64,${base64}`;
                            imageData[src] = dataUrl;
                        }
                    } catch (e) {
                        console.error('Error processing image:', src, e);
                    }
                }

                // Reply with rendered HTML content and image data
                const html = el.innerHTML;
                event.reply('file-preview', {
                    path: filePath,
                    content: content,
                    html: html,
                    imageData: imageData
                });
            } catch (e) {
                console.error('Error reading file for preview:', e);
                event.reply('file-preview', { path: filePath, content: '', html: '', imageData: {} });
            }
        });

        // Simple listener for closing window
        ipcMain.on('close-window', () => {
            if (this.searchWindow && !this.searchWindow.isDestroyed()) {
                this.searchWindow.close();
            }
        });
    }
}
