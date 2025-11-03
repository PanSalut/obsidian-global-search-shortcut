import { App, FuzzySuggestModal, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type GlobalSearchPlugin from '../main';

// Type definition for internal Obsidian Workspace API
interface WorkspaceWithPopout {
    openPopoutLeaf?: () => WorkspaceLeaf;
}

export class NoteSearchModal extends FuzzySuggestModal<TFile> {
    plugin: GlobalSearchPlugin;

    constructor(app: App, plugin: GlobalSearchPlugin) {
        super(app);
        this.plugin = plugin;
        this.setPlaceholder(plugin.t('searchPlaceholder'));
    }

    getItems(): TFile[] {
        return this.app.vault.getMarkdownFiles();
    }

    getItemText(file: TFile): string {
        return file.basename;
    }

    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void {
        this.openInNewWindow(file);
    }

    async openInNewWindow(file: TFile) {
        try {
            const workspace = this.app.workspace as unknown as WorkspaceWithPopout;
            if (workspace.openPopoutLeaf) {
                const leaf = workspace.openPopoutLeaf();
                await leaf.openFile(file);
                new Notice(this.plugin.t('openedInNewWindow', file.basename));
            } else {
                const leaf = this.app.workspace.getLeaf('tab');
                await leaf.openFile(file);
                new Notice(this.plugin.t('opened', file.basename));
            }
        } catch (e) {
            console.error('Error opening file:', e);
            new Notice(this.plugin.t('errorOpeningFile'));
        }
    }
}
