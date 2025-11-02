export interface GlobalSearchSettings {
    globalHotkey: string;
    language: string;
    maxSearchResults: number;
}

export const DEFAULT_SETTINGS: GlobalSearchSettings = {
    globalHotkey: 'CommandOrControl+Shift+O',
    language: 'auto',
    maxSearchResults: 50
};
