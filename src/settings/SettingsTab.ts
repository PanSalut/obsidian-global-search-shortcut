import { App, Notice, Platform, PluginSettingTab, Setting } from 'obsidian';
import type GlobalSearchPlugin from '../main';

export class GlobalSearchSettingTab extends PluginSettingTab {
    plugin: GlobalSearchPlugin;
    private isRecording: boolean = false;

    constructor(app: App, plugin: GlobalSearchPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName(this.plugin.t('settingsTitle'))
            .setHeading();

        new Setting(containerEl)
            .setName(this.plugin.t('settingLanguageName'))
            .setDesc(this.plugin.t('settingLanguageDesc'))
            .addDropdown(dropdown => dropdown
                .addOption('auto', 'Auto (Obsidian language)')
                .addOption('ar', 'العربية')
                .addOption('cs', 'Čeština')
                .addOption('de', 'Deutsch')
                .addOption('en', 'English')
                .addOption('es', 'Español')
                .addOption('fr', 'Français')
                .addOption('it', 'Italiano')
                .addOption('ja', '日本語')
                .addOption('ko', '한국어')
                .addOption('nl', 'Nederlands')
                .addOption('pl', 'Polski')
                .addOption('pt', 'Português')
                .addOption('pt-BR', 'Português do Brasil')
                .addOption('ru', 'Русский')
                .addOption('tr', 'Türkçe')
                .addOption('uk', 'Українська')
                .addOption('zh', '简体中文')
                .addOption('zh-TW', '繁體中文')
                .setValue(this.plugin.settings.language)
                .onChange(async (value) => {
                    this.plugin.settings.language = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        const hotkeySetting = new Setting(containerEl)
            .setName(this.plugin.t('settingHotkeyName'))
            .setDesc(this.plugin.t('settingHotkeyDesc'));

        let textInput: HTMLInputElement;
        let recordButton: HTMLButtonElement;

        hotkeySetting.addText(text => {
            textInput = text.inputEl;
            text.setPlaceholder('CommandOrControl+Shift+O')
                .setValue(this.plugin.settings.globalHotkey)
                .onChange(async (value) => {
                    this.plugin.settings.globalHotkey = value;
                    await this.plugin.saveSettings();
                    this.plugin.registerGlobalHotkey();
                });
        });

        hotkeySetting.addButton(button => {
            recordButton = button.buttonEl;
            button
                .setButtonText(this.plugin.t('recordHotkey'))
                .setClass('mod-cta')
                .onClick(() => {
                    this.startRecording(textInput, recordButton);
                });
        });

        containerEl.createEl('p', {
            text: this.plugin.t('settingHotkeyExamples'),
            cls: 'setting-item-description'
        });

        containerEl.createEl('p', {
            text: this.plugin.t('settingHotkeyNote'),
            cls: 'setting-item-description'
        });

        new Setting(containerEl)
            .setName(this.plugin.t('settingMaxResultsName'))
            .setDesc(this.plugin.t('settingMaxResultsDesc'))
            .addText(text => text
                .setPlaceholder('50')
                .setValue(String(this.plugin.settings.maxSearchResults))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num >= 1 && num <= 200) {
                        this.plugin.settings.maxSearchResults = num;
                        await this.plugin.saveSettings();
                    }
                }));
    }

    startRecording(inputEl: HTMLInputElement, buttonEl: HTMLButtonElement) {
        if (this.isRecording) return;

        this.isRecording = true;
        buttonEl.textContent = this.plugin.t('recordingHotkey');
        buttonEl.addClass('is-recording');
        inputEl.value = this.plugin.t('pressKeyCombination');
        inputEl.focus();

        const handler = async (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const modifiers: string[] = [];
            const isMac = Platform.isMacOS;

            if (e.ctrlKey) modifiers.push(isMac ? 'Control' : 'Ctrl');
            if (e.altKey) modifiers.push('Alt');
            if (e.shiftKey) modifiers.push('Shift');
            if (e.metaKey) modifiers.push(isMac ? 'Cmd' : 'Meta');

            let key = e.key;
            if (key === ' ') key = 'Space';
            else if (key.length === 1) key = key.toUpperCase();
            else if (key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') {
                return;
            }

            if (modifiers.length > 0) {
                modifiers.push(key);
                const hotkey = modifiers.join('+');
                const normalizedHotkey = this.normalizeHotkey(hotkey, isMac);

                inputEl.value = normalizedHotkey;
                this.plugin.settings.globalHotkey = normalizedHotkey;
                await this.plugin.saveSettings();
                this.plugin.registerGlobalHotkey();

                new Notice(this.plugin.t('hotkeyRecorded', normalizedHotkey));
            }

            this.stopRecording(inputEl, buttonEl, handler);
        };

        inputEl.addEventListener('keydown', handler);

        setTimeout(() => {
            if (this.isRecording) {
                this.stopRecording(inputEl, buttonEl, handler);
            }
        }, 10000);
    }

    stopRecording(inputEl: HTMLInputElement, buttonEl: HTMLButtonElement, handler: (e: KeyboardEvent) => void) {
        this.isRecording = false;
        buttonEl.textContent = this.plugin.t('recordHotkey');
        buttonEl.removeClass('is-recording');
        inputEl.value = this.plugin.settings.globalHotkey;
        inputEl.removeEventListener('keydown', handler);
    }

    normalizeHotkey(hotkey: string, isMac: boolean): string {
        if (isMac) {
            hotkey = hotkey.replace(/Ctrl/g, 'CommandOrControl');
            hotkey = hotkey.replace(/Cmd/g, 'CommandOrControl');
        } else {
            hotkey = hotkey.replace(/Ctrl/g, 'CommandOrControl');
        }
        return hotkey;
    }
}
