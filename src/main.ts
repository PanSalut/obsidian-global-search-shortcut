import { Notice, Plugin, TFile, moment } from 'obsidian';
import { translations, Translation } from './i18n/translations';
import { GlobalSearchSettings, DEFAULT_SETTINGS } from './settings/settings';
import { GlobalSearchSettingTab } from './settings/SettingsTab';
import { NoteSearchModal } from './modals/NoteSearchModal';
import { SearchWindowView } from './views/SearchWindowView';
import { ElectronService } from './services/ElectronService';

export default class GlobalSearchPlugin extends Plugin {
    settings: GlobalSearchSettings;
    private electronService: ElectronService;
    private searchWindowView: SearchWindowView;

    getLanguage(): string {
        if (this.settings.language === 'auto') {
            const obsidianLang = moment.locale();
            const langCode = obsidianLang.split('-')[0];
            return translations[langCode] ? langCode : 'en';
        }
        return this.settings.language;
    }

    t(key: keyof Translation, ...args: string[]): string {
        const lang = this.getLanguage();
        let text = translations[lang]?.[key] || translations['en'][key];

        args.forEach((arg, index) => {
            text = text.replace(`{${index}}`, arg);
        });

        return text;
    }

    async onload() {
        try {
            await this.loadSettings();

            this.electronService = new ElectronService(this.app, this);
            this.searchWindowView = new SearchWindowView();

            this.addCommand({
                id: 'open-global-search',
                name: this.t('commandName'),
                callback: () => {
                    this.openSearchModal();
                }
            });

            this.addSettingTab(new GlobalSearchSettingTab(this.app, this));

            this.electronService.initialize();
        } catch (e) {
            console.error('Error loading Global Search Plugin:', e);
            new Notice(this.t('errorLoadingPlugin'));
        }
    }

    onunload() {
        this.electronService.cleanup();
    }

    registerGlobalHotkey() {
        this.electronService.registerGlobalHotkey();
    }

    openSearchModal() {
        this.electronService.closeSearchWindow();
        this.createSearchWindow();
    }

    createSearchWindow() {
        if (!this.electronService.hasElectron()) {
            new NoteSearchModal(this.app, this).open();
            return;
        }

        const isDark = document.body.classList.contains('theme-dark');
        const lang = this.getLanguage();
        const html = this.searchWindowView.generateSearchHTML(isDark, translations[lang]);

        const created = this.electronService.createSearchWindow(html);
        if (!created) {
            new NoteSearchModal(this.app, this).open();
        }
    }

    async openFileInNewWindow(file: TFile) {
        try {
            const leaf = this.app.workspace.getLeaf('tab');
            await leaf.openFile(file);
        } catch (e) {
            console.error('Error opening file:', e);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
