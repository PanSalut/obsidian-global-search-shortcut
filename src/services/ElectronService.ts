import { App, MarkdownRenderer, TFile } from 'obsidian';
import type GlobalSearchPlugin from '../main';
import { SearchService } from './SearchService';

// Type definitions for internal Obsidian APIs
interface WindowWithRequire extends Window {
    require?: (module: string) => unknown;
}

interface PluginManifestWithDir {
    dir?: string;
    id: string;
}

interface VaultAdapterWithBasePath {
    getBasePath?: () => string;
}

// Type definitions for Electron API (since we can't import directly in Obsidian plugin)
interface ElectronBrowserWindow {
    loadURL(url: string): Promise<void>;
    on(event: string, callback: (...args: any[]) => void): void;
    close(): void;
    isDestroyed(): boolean;
    setSize(width: number, height: number): void;
    show(): void;
    focus(): void;
}

interface ElectronGlobalShortcut {
    register(accelerator: string, callback: () => void): boolean;
    unregister(accelerator: string): void;
}

interface ElectronIpcMainEvent {
    reply(channel: string, ...args: any[]): void;
}

interface ElectronIpcMain {
    on(channel: string, listener: (event: ElectronIpcMainEvent, ...args: any[]) => void): void;
    removeHandler(channel: string): void;
    removeAllListeners(channel: string): void;
}

interface ElectronWithRemote {
    remote?: {
        BrowserWindow: new (options: any) => ElectronBrowserWindow;
        globalShortcut: ElectronGlobalShortcut;
        getCurrentWindow: () => ElectronBrowserWindow;
        ipcMain?: ElectronIpcMain;
    };
    BrowserWindow?: new (options: any) => ElectronBrowserWindow;
    globalShortcut?: ElectronGlobalShortcut;
    ipcMain?: ElectronIpcMain;
}

export class ElectronService {
    private electron: ElectronWithRemote | null = null;
    private globalShortcut: ElectronGlobalShortcut | null = null;
    private searchWindow: ElectronBrowserWindow | null = null;
    private registeredHotkey: string | null = null;
    private searchService: SearchService;

    constructor(private app: App, private plugin: GlobalSearchPlugin) {
        this.searchService = new SearchService(app);
    }

    initialize() {
        setTimeout(() => {
            try {
                const windowWithRequire = window as WindowWithRequire;
                const electron = windowWithRequire.require?.('electron') as ElectronWithRemote | undefined;
                if (electron) {
                    this.electron = electron;
                    this.globalShortcut = electron.remote?.globalShortcut ||
                                        electron.globalShortcut ||
                                        null;
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

        // Get the plugin directory path for preload script
        // In Obsidian, we need to use the app's vault adapter to get the plugin path
        const manifest = this.plugin.manifest as unknown as PluginManifestWithDir;
        const adapter = this.app.vault.adapter as unknown as VaultAdapterWithBasePath;
        const basePath = adapter.getBasePath ? adapter.getBasePath() : '';
        const pluginDir = manifest.dir || `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`;
        const preloadPath = basePath ? `${basePath}/${pluginDir}/preload.js` : '';

        console.log('Preload path:', preloadPath); // Debug log

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
                // Security: Use contextIsolation and preload script for secure IPC
                // This prevents direct access to Node.js and exposes only required APIs
                preload: preloadPath,
                contextIsolation: true,       // Isolate context for security
                nodeIntegration: false,       // Disabled in renderer for security
                webSecurity: false,           // Required for data: URIs and local image loading
                sandbox: false,               // Required for preload script to work
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
        // Use native Buffer.from for better performance (non-blocking)
        // This is more efficient than manual string concatenation
        const bytes = new Uint8Array(buffer);

        // Use Buffer API which is optimized in Node.js/Electron
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(bytes).toString('base64');
        }

        // Fallback to btoa for browser environments (shouldn't happen in Electron)
        let binary = '';
        const len = bytes.byteLength;
        const chunkSize = 8192; // Process in chunks to avoid blocking

        for (let i = 0; i < len; i += chunkSize) {
            const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
            binary += String.fromCharCode(...chunk);
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
        ipcMain.on('open-file', async (_event, filePath: string) => {
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
        ipcMain.on('resize-window', (_event, width: number, height: number) => {
            if (this.searchWindow && !this.searchWindow.isDestroyed()) {
                this.searchWindow.setSize(width, height);
            }
        });

        // Handler: Search content
        ipcMain.on('search-content', async (event, query: string) => {
            try {
                const maxResults = this.plugin.settings.maxSearchResults || 50;
                const results = await this.searchService.searchInFiles(query, maxResults);
                event.reply('search-results', results);
            } catch (e) {
                console.error('Search error:', e);
                event.reply('search-results', []);
            }
        });

        // Handler: Get recent files
        ipcMain.on('get-recent-files', async (event) => {
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
        ipcMain.on('get-file-preview', async (event, filePath: string) => {
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
                // Use XMLSerializer for safe HTML extraction
                const serializer = new XMLSerializer();
                let html = '';
                Array.from(el.childNodes).forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        html += serializer.serializeToString(node);
                    } else if (node.nodeType === Node.TEXT_NODE) {
                        html += node.textContent || '';
                    }
                });
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
