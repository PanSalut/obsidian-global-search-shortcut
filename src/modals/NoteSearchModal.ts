import { App, FuzzySuggestModal, Notice, TFile } from 'obsidian';
import type GlobalSearchPlugin from '../main';

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
            // @ts-ignore
            if (this.app.workspace.openPopoutLeaf) {
                // @ts-ignore
                const leaf = this.app.workspace.openPopoutLeaf();
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
