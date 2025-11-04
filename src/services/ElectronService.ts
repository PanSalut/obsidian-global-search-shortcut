import { App, Component, MarkdownRenderer, TFile } from 'obsidian';
import type GlobalSearchPlugin from '../main';
import { SearchService } from './SearchService';

// Type definitions for internal Obsidian APIs
interface WindowWithRequire extends Window {
    require?: NodeRequire;
}

interface PluginManifestWithDir {
    dir?: string;
    id: string;
}

interface VaultAdapterWithBasePath {
    getBasePath?: () => string;
}

// Type definitions for IPC message payloads
type IpcMessageArgs = string | number | boolean | SearchResult[] | FilePreviewResponse | Record<string, string | number>;

interface SearchResult {
    path: string;
    name: string;
    score: number;
    snippet: string;
}

interface FilePreviewResponse {
    path: string;
    content: string;
    html: string;
    imageData: Record<string, string>;
}

// Type definitions for Electron API (since we can't import directly in Obsidian plugin)
interface HeadersReceivedDetails {
    responseHeaders?: Record<string, string[]>;
}

interface HeadersReceivedCallback {
    (response: { responseHeaders: Record<string, string[]> }): void;
}

interface WebRequest {
    onHeadersReceived(listener: (details: HeadersReceivedDetails, callback: HeadersReceivedCallback) => void): void;
}

interface Session {
    webRequest: WebRequest;
}

interface WebContents {
    session: Session;
}

interface ElectronBrowserWindow {
    loadURL(url: string): Promise<void>;
    on(event: 'blur' | 'closed' | 'close', callback: () => void): void;
    close(): void;
    isDestroyed(): boolean;
    setSize(width: number, height: number): void;
    show(): void;
    focus(): void;
    webContents: WebContents;
}

interface ElectronGlobalShortcut {
    register(accelerator: string, callback: () => void): boolean;
    unregister(accelerator: string): void;
}

interface ElectronIpcMainEvent {
    reply(channel: string, ...args: IpcMessageArgs[]): void;
}

type IpcListener = (event: ElectronIpcMainEvent, ...args: IpcMessageArgs[]) => void;

interface ElectronIpcMain {
    on(channel: string, listener: IpcListener): void;
    removeListener(channel: string, listener: IpcListener): void;
    removeHandler(channel: string): void;
    removeAllListeners(channel: string): void;
}

interface BrowserWindowOptions {
    width: number;
    height: number;
    frame: boolean;
    transparent: boolean;
    alwaysOnTop: boolean;
    skipTaskbar: boolean;
    resizable: boolean;
    center: boolean;
    webPreferences: {
        preload: string;
        contextIsolation: boolean;
        nodeIntegration: boolean;
        webSecurity: boolean;
        sandbox: boolean;
    };
}

interface ElectronWithRemote {
    remote?: {
        BrowserWindow: new (options: BrowserWindowOptions) => ElectronBrowserWindow;
        globalShortcut: ElectronGlobalShortcut;
        getCurrentWindow: () => ElectronBrowserWindow;
        ipcMain?: ElectronIpcMain;
    };
    BrowserWindow?: new (options: BrowserWindowOptions) => ElectronBrowserWindow;
    globalShortcut?: ElectronGlobalShortcut;
    ipcMain?: ElectronIpcMain;
}

export class ElectronService {
    private electron: ElectronWithRemote | null = null;
    private globalShortcut: ElectronGlobalShortcut | null = null;
    private searchWindow: ElectronBrowserWindow | null = null;
    private registeredHotkey: string | null = null;
    private searchService: SearchService;
    private ipcListeners: Map<string, IpcListener> = new Map();
    private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    // Constants for configuration
    private static readonly ELECTRON_INIT_DELAY = 1000; // 1 second delay before initializing Electron
    private static readonly SEARCH_WINDOW_WIDTH = 1100;
    private static readonly SEARCH_WINDOW_HEIGHT = 600;
    private static readonly BASE64_CHUNK_SIZE = 8192; // Chunk size for base64 encoding
    private static readonly SEARCH_DEBOUNCE_MS = 50; // Wait 50ms after user stops typing

    constructor(private app: App, private plugin: GlobalSearchPlugin) {
        this.searchService = new SearchService(app);
    }

    initialize() {
        setTimeout(() => {
            void this.initializeElectron();
        }, ElectronService.ELECTRON_INIT_DELAY);
    }

    private async initializeElectron() {
        try {
            const windowWithRequire = window as WindowWithRequire;
            // Dynamic import for Electron API (required for Obsidian plugin security)
            const electron = await (async () => {
                if (windowWithRequire.require) {
                    return windowWithRequire.require('electron') as ElectronWithRemote;
                }
                return undefined;
            })();

            if (electron) {
                this.electron = electron;
                this.globalShortcut = electron.remote?.globalShortcut ||
                                    electron.globalShortcut ||
                                    null;
                this.registerGlobalHotkey();
                this.setupIpcHandler();
            }
        } catch {
            // Electron API not available - fallback to Command Palette
        }
    }

    cleanup() {
        this.unregisterGlobalHotkey();

        // Remove IPC handlers - proper cleanup to prevent memory leaks
        if (this.electron) {
            const { ipcMain } = this.electron.remote || this.electron;
            if (ipcMain) {
                // Remove only our registered listeners (not all listeners on the channel)
                this.ipcListeners.forEach((listener, channel) => {
                    ipcMain.removeListener(channel, listener);
                });
                this.ipcListeners.clear();
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
                } catch {
                    // Ignore errors when unregistering old hotkey
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

        this.searchWindow = new BrowserWindow({
            width: ElectronService.SEARCH_WINDOW_WIDTH,
            height: ElectronService.SEARCH_WINDOW_HEIGHT,
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
                webSecurity: true,            // Enable web security
                sandbox: false,               // Required for preload script to work
            }
        });

        this.searchWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

        // Set Content Security Policy to allow only data: URIs and inline content
        // This provides security while allowing base64 images
        this.searchWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [
                        "default-src 'none'; " +
                        "script-src 'unsafe-inline'; " +
                        "style-src 'unsafe-inline'; " +
                        "img-src data: 'unsafe-inline'; " +
                        "font-src data:; " +
                        "connect-src 'none'; " +
                        "media-src 'none'; " +
                        "object-src 'none'; " +
                        "frame-src 'none';"
                    ]
                }
            });
        });

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

        for (let i = 0; i < len; i += ElectronService.BASE64_CHUNK_SIZE) {
            const chunk = bytes.subarray(i, Math.min(i + ElectronService.BASE64_CHUNK_SIZE, len));
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
        // Store listener references for proper cleanup

        // Handler: Open file in Obsidian
        const openFileListener: IpcListener = (_event, filePath: string) => {
            // Validate file path to prevent path traversal
            if (!filePath || typeof filePath !== 'string' || filePath.includes('..')) {
                console.error('Invalid file path');
                return;
            }

            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                void this.plugin.openFileInNewWindow(file);
            }
            if (this.searchWindow && !this.searchWindow.isDestroyed()) {
                this.searchWindow.close();
            }
        };
        this.ipcListeners.set('open-file', openFileListener);
        ipcMain.on('open-file', openFileListener);

        // Handler: Resize window
        const resizeWindowListener: IpcListener = (_event, width: number, height: number) => {
            if (this.searchWindow && !this.searchWindow.isDestroyed()) {
                this.searchWindow.setSize(width, height);
            }
        };
        this.ipcListeners.set('resize-window', resizeWindowListener);
        ipcMain.on('resize-window', resizeWindowListener);

        // Handler: Search content with debouncing for better UX
        const searchContentListener: IpcListener = (event, query: string) => {
            // Clear previous timer to debounce rapid keystrokes
            if (this.searchDebounceTimer) {
                clearTimeout(this.searchDebounceTimer);
            }

            // Wait for user to stop typing before executing search
            this.searchDebounceTimer = setTimeout(() => {
                void (async () => {
                    try {
                        const maxResults = this.plugin.settings.maxSearchResults || 50;
                        const results = await this.searchService.searchInFiles(query, maxResults);
                        event.reply('search-results', results);
                    } catch {
                        event.reply('search-results', []);
                    }
                })();
            }, ElectronService.SEARCH_DEBOUNCE_MS);
        };
        this.ipcListeners.set('search-content', searchContentListener);
        ipcMain.on('search-content', searchContentListener);

        // Handler: Get recent files
        const getRecentFilesListener: IpcListener = (event) => {
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
            } catch {
                event.reply('recent-files', []);
            }
        };
        this.ipcListeners.set('get-recent-files', getRecentFilesListener);
        ipcMain.on('get-recent-files', getRecentFilesListener);

        // Handler: Get file preview with images
        const getFilePreviewListener: IpcListener = (event, filePath: string) => {
            void (async () => {
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
                    // Create a component instance for MarkdownRenderer to avoid using main plugin instance
                    const component = new Component();
                    await MarkdownRenderer.render(this.app, content, el, filePath, component);

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
                        } catch {
                            // Ignore errors when processing individual images
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

                    // Clean up component
                    component.unload();
                } catch {
                    event.reply('file-preview', { path: filePath, content: '', html: '', imageData: {} });
                }
            })();
        };
        this.ipcListeners.set('get-file-preview', getFilePreviewListener);
        ipcMain.on('get-file-preview', getFilePreviewListener);

        // Simple listener for closing window
        const closeWindowListener: IpcListener = () => {
            if (this.searchWindow && !this.searchWindow.isDestroyed()) {
                this.searchWindow.close();
            }
        };
        this.ipcListeners.set('close-window', closeWindowListener);
        ipcMain.on('close-window', closeWindowListener);
    }
}
