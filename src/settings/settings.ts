export interface GlobalSearchSettings {
    globalHotkey: string;
    language: string;
}

export const DEFAULT_SETTINGS: GlobalSearchSettings = {
    globalHotkey: 'CommandOrControl+Shift+O',
    language: 'auto'
};
