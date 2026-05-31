/** Folder autocomplete suggestion component for text inputs */

import { App, AbstractInputSuggest, TFolder } from 'obsidian';

export class FolderSuggest extends AbstractInputSuggest<string> {
    private folders: string[];
    protected inputEl: HTMLInputElement;

    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
        this.inputEl = inputEl;

        // Get all folders from the vault using a compatible method
        const allFolders: string[] = [];
        for (const file of this.app.vault.getAllLoadedFiles()) {
            if (file instanceof TFolder) {
                allFolders.push(file.path);
            }
        }
        this.folders = allFolders.sort();

        // Add root folder option
        if (!this.folders.includes('/')) {
            this.folders.unshift('/');
        }
    }

    getSuggestions(inputStr: string): string[] {
        const inputLower = inputStr.toLowerCase();

        // If input is empty, show all folders
        if (!inputStr) {
            return this.folders;
        }

        // Filter folders that include the input string
        return this.folders.filter(folder =>
            folder.toLowerCase().includes(inputLower)
        );
    }

    renderSuggestion(folder: string, el: HTMLElement): void {
        el.createEl('div', { text: folder });
    }

    selectSuggestion(folder: string): void {
        this.inputEl.value = folder;
        // Trigger input event to notify the onChange handler
        const event = new Event('input', { bubbles: true });
        this.inputEl.dispatchEvent(event);
        this.close();
    }
}
