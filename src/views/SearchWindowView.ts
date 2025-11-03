import type { Translation } from '../i18n/translations';

export class SearchWindowView {
    generateSearchHTML(isDark: boolean = true, t: Translation): string {
        const colors = isDark ? {
            bg: '#202020',
            bgSecondary: '#161616',
            bgHover: '#2a2a2a',
            border: '#2d2d2d',
            borderFocus: '#483699',
            text: '#dcddde',
            textMuted: '#7a7a7a',
            scrollbar: '#3a3a3a',
            scrollbarHover: '#4a4a4a',
            inputBg: '#1e1e1e',
            shadow: 'rgba(0, 0, 0, 0.5)'
        } : {
            bg: '#ffffff',
            bgSecondary: '#f5f5f5',
            bgHover: '#e8e8e8',
            border: '#ddd',
            borderFocus: '#6c31e3',
            text: '#2e3338',
            textMuted: '#888888',
            scrollbar: '#d0d0d0',
            scrollbarHover: '#b0b0b0',
            inputBg: '#fafafa',
            shadow: 'rgba(0, 0, 0, 0.15)'
        };

        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
            background: ${colors.bg};
            color: ${colors.text};
            padding: 0;
            margin: 0;
            overflow: hidden;
            height: 100vh;
        }
        .search-container {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: ${colors.bg};
        }
        .content-wrapper {
            display: flex;
            gap: 20px;
            align-items: flex-start;
        }
        .results-panel {
            width: 500px;
            min-width: 500px;
            max-width: 500px;
            height: 560px;
            min-height: 560px;
            max-height: 560px;
            display: flex;
            flex-direction: column;
            background: ${colors.bg};
            border-radius: 10px;
            box-shadow: 0 8px 24px ${colors.shadow};
            overflow: hidden;
        }
        .search-header {
            padding: 20px;
            flex-shrink: 0;
            background: ${colors.bg};
        }
        input {
            width: 100%;
            padding: 12px 16px;
            font-size: 14px;
            font-family: inherit;
            border: 1.5px solid ${colors.border};
            border-radius: 8px;
            background: ${colors.bg};
            color: ${colors.text};
            outline: none;
            transition: all 0.2s ease;
        }
        input:focus {
            border-color: ${colors.borderFocus};
            box-shadow: 0 0 0 3px ${colors.borderFocus}22;
        }
        input::placeholder {
            color: ${colors.textMuted};
            font-size: 14px;
        }
        .results {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            background: ${colors.bg};
            display: flex;
            flex-direction: column;
        }
        .results-empty {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            color: ${colors.textMuted};
            font-size: 14px;
            text-align: center;
            padding: 40px;
        }
        .result-item {
            padding: 14px 20px;
            cursor: pointer;
            border-bottom: 1px solid ${colors.border};
            transition: all 0.15s ease;
            color: ${colors.text};
        }
        .result-title {
            font-size: 14px;
            font-weight: 600;
            line-height: 1.4;
        }
        .result-snippet {
            font-size: 12px;
            color: ${colors.textMuted};
            line-height: 1.4;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
        }
        .result-snippet .match {
            color: ${colors.borderFocus};
            font-weight: 600;
        }
        .result-item.selected {
            background: ${colors.borderFocus};
        }
        .result-item.selected .result-title,
        .result-item.selected .result-snippet,
        .result-item.selected .result-snippet .match {
            color: #ffffff;
        }
        .result-item:last-child {
            border-bottom: none;
        }
        .no-results {
            padding: 32px 20px;
            text-align: center;
            color: ${colors.textMuted};
            font-size: 14px;
        }
        ::-webkit-scrollbar {
            width: 10px;
        }
        ::-webkit-scrollbar-track {
            background: ${colors.bgSecondary};
            border-radius: 0 6px 6px 0;
        }
        ::-webkit-scrollbar-thumb {
            background: ${colors.scrollbar};
            border-radius: 5px;
            border: 2px solid ${colors.bgSecondary};
        }
        ::-webkit-scrollbar-thumb:hover {
            background: ${colors.scrollbarHover};
        }
        .preview-panel {
            width: 560px;
            min-width: 560px;
            max-width: 560px;
            height: 560px;
            min-height: 560px;
            max-height: 560px;
            display: flex;
            flex-direction: column;
            background: ${colors.bgSecondary};
            border-radius: 10px;
            box-shadow: 0 8px 24px ${colors.shadow};
            overflow: hidden;
        }
        .preview-window {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
        }
        .preview-window.hidden {
            display: none;
        }
        .preview-empty {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            color: ${colors.textMuted};
            font-size: 14px;
            text-align: center;
            padding: 32px;
        }
        .preview-title {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 16px;
            color: ${colors.text};
            border-bottom: 2px solid ${colors.border};
            padding-bottom: 12px;
        }
        .preview-content {
            font-size: 14px;
            line-height: 1.7;
            color: ${colors.text};
            word-wrap: break-word;
        }
        .preview-content h1,
        .preview-content h2,
        .preview-content h3,
        .preview-content h4,
        .preview-content h5,
        .preview-content h6 {
            color: ${colors.text};
            font-weight: 600;
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            line-height: 1.3;
        }
        .preview-content h1 { font-size: 2em; }
        .preview-content h2 { font-size: 1.6em; }
        .preview-content h3 { font-size: 1.4em; }
        .preview-content h4 { font-size: 1.2em; }
        .preview-content h5 { font-size: 1.1em; }
        .preview-content h6 { font-size: 1em; }
        .preview-content p {
            margin-bottom: 1em;
        }
        .preview-content ul,
        .preview-content ol {
            margin-left: 1.5em;
            margin-bottom: 1em;
        }
        .preview-content li {
            margin-bottom: 0.3em;
        }
        .preview-content code {
            background: ${colors.bgSecondary};
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 0.9em;
            color: ${colors.text};
        }
        .preview-content pre {
            background: ${colors.bgSecondary};
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
            margin-bottom: 1em;
        }
        .preview-content pre code {
            background: transparent;
            padding: 0;
        }
        .preview-content a {
            color: ${colors.borderFocus};
            text-decoration: none;
        }
        .preview-content a:hover {
            text-decoration: underline;
        }
        .preview-content strong {
            font-weight: 600;
            color: ${colors.text};
        }
        .preview-content em {
            font-style: italic;
        }
        .preview-content blockquote {
            border-left: 3px solid ${colors.border};
            padding-left: 1em;
            margin-left: 0;
            margin-bottom: 1em;
            color: ${colors.textMuted};
            font-style: italic;
        }
        .preview-content hr {
            border: none;
            border-top: 2px solid ${colors.border};
            margin: 2em 0;
        }
        .preview-content table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 1em;
        }
        .preview-content table th,
        .preview-content table td {
            border: 1px solid ${colors.border};
            padding: 8px 12px;
            text-align: left;
        }
        .preview-content table th {
            background: ${colors.bgSecondary};
            font-weight: 600;
        }
        .preview-content img {
            max-width: 100%;
            height: auto;
            border-radius: 4px;
            margin: 1em 0;
        }
        .preview-content .task-list-item {
            list-style: none;
            margin-left: -1.5em;
        }
        .preview-content .task-list-item input[type="checkbox"] {
            margin-right: 0.5em;
        }
        .preview-loading {
            color: ${colors.textMuted};
            font-style: italic;
            text-align: center;
            padding: 40px 20px;
        }
    </style>
</head>
<body>
    <div class="search-container">
        <div class="content-wrapper">
            <div class="results-panel">
                <div class="search-header">
                    <input type="text" id="searchInput" placeholder="${t.searchPlaceholder}" autofocus />
                </div>
                <div class="results" id="results"></div>
            </div>
            <div class="preview-panel">
                <div class="preview-window" id="previewWindow">
                    <div class="preview-title" id="previewTitle">${t.preview}</div>
                    <div class="preview-content" id="previewContent">
                        <div class="preview-empty">${t.selectNote}</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        try {
            // Use secure API exposed through preload script
            if (!window.electronAPI) {
                throw new Error('Electron API not available. Preload script may not have loaded correctly.');
            }

            const api = window.electronAPI;
            let selectedIndex = 0;
            let currentResults = [];

            const searchInput = document.getElementById('searchInput');
            const resultsDiv = document.getElementById('results');
            const previewWindow = document.getElementById('previewWindow');
            const previewTitle = document.getElementById('previewTitle');
            const previewContent = document.getElementById('previewContent');

        // Escape HTML to prevent XSS attacks
        function escapeHtml(unsafe) {
            if (typeof unsafe !== 'string') return '';
            return unsafe
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        api.onSearchResults((results) => {
            currentResults = results;
            displayResults(results);
        });

        api.onRecentFiles((results) => {
            currentResults = results;
            displayResults(results);
        });

        api.onFilePreview((data) => {
            const html = data.html || '<div class="preview-empty">${t.noContent}</div>';
            const imageData = data.imageData || {};

            // Use DOM API instead of innerHTML
            const range = document.createRange();
            range.selectNodeContents(previewContent);
            range.deleteContents();

            const fragment = range.createContextualFragment(html);
            previewContent.appendChild(fragment);

            const images = previewContent.querySelectorAll('img');

            images.forEach((img) => {
                const src = img.getAttribute('src');

                if (src && imageData[src]) {
                    img.setAttribute('src', imageData[src]);
                }
            });
        });

        function showPreview(filePath, fileName) {
            // Use textContent instead of innerHTML to prevent XSS
            previewTitle.textContent = fileName;

            // Use DOM API instead of innerHTML
            while (previewContent.firstChild) {
                previewContent.removeChild(previewContent.firstChild);
            }
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'preview-loading';
            loadingDiv.textContent = '${t.loading}';
            previewContent.appendChild(loadingDiv);

            api.getFilePreview(filePath);
        }

        function hidePreview() {
            // Use DOM API instead of innerHTML
            while (previewContent.firstChild) {
                previewContent.removeChild(previewContent.firstChild);
            }
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'preview-empty';
            emptyDiv.textContent = '${t.selectNote}';
            previewContent.appendChild(emptyDiv);
        }

        function displayResults(matches) {
            selectedIndex = 0;

            // Clear results using DOM API
            while (resultsDiv.firstChild) {
                resultsDiv.removeChild(resultsDiv.firstChild);
            }

            if (matches.length === 0) {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'results-empty';
                emptyDiv.textContent = '${t.startTyping}';
                resultsDiv.appendChild(emptyDiv);
                hidePreview();
                return;
            }

            // Create result items using DOM API
            const fragment = document.createDocumentFragment();
            matches.forEach((f, idx) => {
                const itemDiv = document.createElement('div');
                itemDiv.className = idx === selectedIndex ? 'result-item selected' : 'result-item';
                itemDiv.setAttribute('data-path', f.path);
                itemDiv.setAttribute('data-index', String(idx));
                itemDiv.setAttribute('data-name', f.name);

                const titleDiv = document.createElement('div');
                titleDiv.className = 'result-title';
                titleDiv.textContent = f.name;

                itemDiv.appendChild(titleDiv);
                fragment.appendChild(itemDiv);
            });
            resultsDiv.appendChild(fragment);

            document.querySelectorAll('.result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const itemIndex = parseInt(item.dataset.index);

                    if (itemIndex === selectedIndex) {
                        api.openFile(item.dataset.path);
                    } else {
                        selectedIndex = itemIndex;
                        updateSelection();
                        showPreview(item.dataset.path, item.dataset.name);
                    }

                    searchInput.focus();
                });
            });

            if (matches.length > 0) {
                showPreview(matches[0].path, matches[0].name);
            }
        }

        let searchTimeout;
        function updateResults() {
            const query = searchInput.value.trim();

            if (!query) {
                api.getRecentFiles();
                return;
            }

            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                api.searchContent(query);
            }, 200);
        }

        function updateSelection() {
            document.querySelectorAll('.result-item').forEach((item, idx) => {
                if (idx === selectedIndex) {
                    item.classList.add('selected');
                    item.scrollIntoView({ block: 'nearest' });
                    if (currentResults[selectedIndex]) {
                        showPreview(currentResults[selectedIndex].path, currentResults[selectedIndex].name);
                    }
                } else {
                    item.classList.remove('selected');
                }
            });
        }

        searchInput.addEventListener('input', updateResults);

        searchInput.addEventListener('keydown', (e) => {
            const items = document.querySelectorAll('.result-item');

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                updateSelection();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, 0);
                updateSelection();
            } else if (e.key === 'Enter' && items.length > 0) {
                e.preventDefault();
                const selectedPath = items[selectedIndex].dataset.path;
                api.openFile(selectedPath);
            } else if (e.key === 'Escape') {
                api.closeWindow();
            }
        });

        api.onResetSearch(() => {
            searchInput.value = '';
            updateResults();
            searchInput.focus();
        });

        api.getRecentFiles();

        document.addEventListener('mousedown', (e) => {
            if (e.target !== searchInput) {
                setTimeout(() => {
                    searchInput.focus();
                }, 0);
            }
        });

        document.addEventListener('wheel', (e) => {
            if (document.activeElement !== searchInput) {
                searchInput.focus();
            }
        });

        } catch (error) {
            console.error('Error in search window:', error);
            // Use DOM API instead of innerHTML
            while (document.body.firstChild) {
                document.body.removeChild(document.body.firstChild);
            }
            const errorDiv = document.createElement('div');
            errorDiv.style.padding = '20px';
            errorDiv.style.color = 'red';
            errorDiv.textContent = 'Error: ' + error.message;
            document.body.appendChild(errorDiv);
        }
    </script>
</body>
</html>
        `;
    }
}
