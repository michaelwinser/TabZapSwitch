// TabZap Switch - Overlay content script
(function() {
    const OVERLAY_ID = 'tabzap-switch-overlay';

    // Prevent multiple injections
    if (document.getElementById(OVERLAY_ID)) {
        return;
    }

    let overlay = null;
    let tabList = null;
    let searchInput = null;
    let thumbnailPanel = null;
    let tabs = [];
    let filteredTabs = [];
    let selectedIndex = 0;
    let searchQuery = '';

    // Create the overlay
    function createOverlay() {
        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.innerHTML = `
            <style>
                #${OVERLAY_ID} {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    z-index: 2147483647;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                }
                #${OVERLAY_ID} .tabzap-wrapper {
                    display: flex;
                    align-items: flex-start;
                    gap: 16px;
                }
                #${OVERLAY_ID} .tabzap-container {
                    background: rgba(30, 30, 30, 0.95);
                    border-radius: 16px;
                    padding: 16px;
                    min-width: 400px;
                    max-width: 500px;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                #${OVERLAY_ID} .tabzap-header {
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 12px;
                    padding: 0 8px;
                }
                #${OVERLAY_ID} .tabzap-list {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                #${OVERLAY_ID} .tabzap-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    border-radius: 10px;
                    cursor: pointer;
                    transition: background 0.15s ease;
                }
                #${OVERLAY_ID} .tabzap-item:hover {
                    background: rgba(255, 255, 255, 0.05);
                }
                #${OVERLAY_ID} .tabzap-item.selected {
                    background: rgba(59, 130, 246, 0.5);
                }
                #${OVERLAY_ID} .tabzap-favicon {
                    width: 32px;
                    height: 32px;
                    border-radius: 6px;
                    background: rgba(255, 255, 255, 0.15);
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    font-weight: 600;
                    color: rgba(255, 255, 255, 0.8);
                    text-transform: uppercase;
                    overflow: hidden;
                }
                #${OVERLAY_ID} .tabzap-favicon img {
                    width: 20px;
                    height: 20px;
                    object-fit: contain;
                }
                #${OVERLAY_ID} .tabzap-info {
                    flex: 1;
                    min-width: 0;
                }
                #${OVERLAY_ID} .tabzap-title {
                    color: white;
                    font-size: 14px;
                    font-weight: 500;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    margin-bottom: 2px;
                }
                #${OVERLAY_ID} .tabzap-url {
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 12px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                #${OVERLAY_ID} .tabzap-index {
                    color: rgba(255, 255, 255, 0.3);
                    font-size: 11px;
                    font-weight: 600;
                    width: 24px;
                    text-align: center;
                    flex-shrink: 0;
                }
                /* Thumbnail panel - sits in flex flow, vertical position adjusted via JS */
                #${OVERLAY_ID} .tabzap-thumbnail-panel {
                    width: 320px;
                    background: rgba(30, 30, 30, 0.95);
                    border-radius: 12px;
                    padding: 12px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    transition: margin-top 0.15s ease;
                    align-self: flex-start;
                }
                #${OVERLAY_ID} .tabzap-thumbnail-img {
                    width: 100%;
                    aspect-ratio: 16 / 10;
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 8px;
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                #${OVERLAY_ID} .tabzap-thumbnail-img img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                #${OVERLAY_ID} .tabzap-thumbnail-placeholder {
                    color: rgba(255, 255, 255, 0.3);
                    font-size: 12px;
                }
                #${OVERLAY_ID} .tabzap-hint {
                    color: rgba(255, 255, 255, 0.4);
                    font-size: 11px;
                    text-align: center;
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }
                #${OVERLAY_ID} .tabzap-hint kbd {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-family: inherit;
                    margin: 0 2px;
                }
                #${OVERLAY_ID} .tabzap-search {
                    display: none;
                    margin-bottom: 12px;
                    padding: 10px 14px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    color: white;
                    font-size: 14px;
                }
                #${OVERLAY_ID} .tabzap-search.active {
                    display: block;
                }
                #${OVERLAY_ID} .tabzap-search-label {
                    color: rgba(255, 255, 255, 0.5);
                    margin-right: 8px;
                }
                #${OVERLAY_ID} .tabzap-search-query {
                    color: white;
                }
                #${OVERLAY_ID} .tabzap-no-results {
                    color: rgba(255, 255, 255, 0.5);
                    text-align: center;
                    padding: 20px;
                    font-size: 14px;
                }
            </style>
            <div class="tabzap-wrapper">
                <div class="tabzap-container">
                    <div class="tabzap-header">Switch Tabs</div>
                    <div class="tabzap-search"><span class="tabzap-search-label">Search:</span><span class="tabzap-search-query"></span></div>
                    <div class="tabzap-list"></div>
                    <div class="tabzap-hint">
                        Type to search &nbsp;&bull;&nbsp; <kbd>↑</kbd><kbd>↓</kbd> to navigate &nbsp;&bull;&nbsp; <kbd>Enter</kbd> to select &nbsp;&bull;&nbsp; <kbd>Esc</kbd> to cancel
                    </div>
                </div>
                <div class="tabzap-thumbnail-panel">
                    <div class="tabzap-thumbnail-img">
                        <span class="tabzap-thumbnail-placeholder">Preview available after visiting tab</span>
                    </div>
                </div>
            </div>
        `;

        tabList = overlay.querySelector('.tabzap-list');
        searchInput = overlay.querySelector('.tabzap-search');
        thumbnailPanel = overlay.querySelector('.tabzap-thumbnail-panel');
        document.body.appendChild(overlay);

        // Listen for keyboard events
        document.addEventListener('keydown', handleKeyDown);

        // Listen for mouse activity to defer dismissal
        overlay.addEventListener('mousemove', deferDismissal);
        overlay.addEventListener('wheel', deferDismissal);

        // Cancel if window loses focus (user switches to another app)
        window.addEventListener('blur', handleWindowBlur);

        // Click outside to cancel
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                cancel();
            }
        });
    }

    function handleWindowBlur() {
        cancel();
    }

    function deferDismissal() {
        chrome.runtime.sendMessage({ action: 'overlay-activity' });
    }

    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancel();
            return;
        }

        // Enter to accept current selection
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            if (filteredTabs.length > 0) {
                const selectedTab = filteredTabs[selectedIndex];
                const originalIndex = tabs.findIndex(t => t.id === selectedTab.id);
                chrome.runtime.sendMessage({ action: 'overlay-select', index: originalIndex });
            }
            removeOverlay();
            return;
        }

        // Backspace to remove search characters
        if (e.key === 'Backspace') {
            e.preventDefault();
            e.stopPropagation();
            if (searchQuery.length > 0) {
                searchQuery = searchQuery.slice(0, -1);
                updateSearch();
            }
            return;
        }

        // Arrow keys to navigate - disables auto-dismiss
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            if (filteredTabs.length > 0) {
                selectedIndex = (selectedIndex + 1) % filteredTabs.length;
                renderTabs();
            }
            chrome.runtime.sendMessage({ action: 'overlay-manual-mode' });
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            if (filteredTabs.length > 0) {
                selectedIndex = (selectedIndex - 1 + filteredTabs.length) % filteredTabs.length;
                renderTabs();
            }
            chrome.runtime.sendMessage({ action: 'overlay-manual-mode' });
            return;
        }

        // Number keys 0-9 jump to that tab index (only when not searching)
        if (!searchQuery && e.key >= '0' && e.key <= '9') {
            e.preventDefault();
            e.stopPropagation();
            const index = parseInt(e.key, 10);
            if (index < tabs.length) {
                chrome.runtime.sendMessage({ action: 'overlay-select', index: index });
                removeOverlay();
            }
            return;
        }

        // Typing adds to search query - disables auto-dismiss
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            searchQuery += e.key;
            updateSearch();
            chrome.runtime.sendMessage({ action: 'overlay-manual-mode' });
            return;
        }

        // Any other key defers dismissal
        deferDismissal();
    }

    function updateSearch() {
        // Update search display
        if (searchInput) {
            const querySpan = searchInput.querySelector('.tabzap-search-query');
            if (querySpan) {
                querySpan.textContent = searchQuery;
            }
            searchInput.classList.toggle('active', searchQuery.length > 0);
        }

        // Filter tabs
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filteredTabs = tabs.filter(tab => {
                const title = (tab.title || '').toLowerCase();
                const url = (tab.url || '').toLowerCase();
                return title.includes(query) || url.includes(query);
            });
        } else {
            filteredTabs = [...tabs];
        }

        // Reset selection to first match
        selectedIndex = 0;
        renderTabs();
    }

    function cancel() {
        chrome.runtime.sendMessage({ action: 'overlay-cancel' });
        removeOverlay();
    }

    function removeOverlay() {
        document.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('blur', handleWindowBlur);
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        overlay = null;
        tabList = null;
        searchInput = null;
        searchQuery = '';
        filteredTabs = [];
    }

    function renderTabs() {
        if (!tabList) return;

        if (filteredTabs.length === 0) {
            tabList.innerHTML = '<div class="tabzap-no-results">No matching tabs</div>';
            return;
        }

        tabList.innerHTML = filteredTabs.map((tab, index) => {
            const isSelected = index === selectedIndex;
            const originalIndex = tabs.findIndex(t => t.id === tab.id);
            let displayUrl = '';
            let initial = '?';
            try {
                if (tab.url) {
                    const url = new URL(tab.url);
                    displayUrl = url.hostname;
                    // Get first letter of domain (skip www.)
                    const domain = displayUrl.replace(/^www\./, '');
                    initial = domain.charAt(0) || '?';
                }
            } catch (e) {
                displayUrl = tab.url || '';
            }

            // Use favicon image if available, otherwise show letter
            const faviconContent = tab.favIconUrl
                ? `<img src="${escapeHtml(tab.favIconUrl)}" alt="">`
                : escapeHtml(initial);

            // Show numbers 0-9 only when not searching, nothing beyond that
            const indexDisplay = (!searchQuery && originalIndex <= 9) ? originalIndex.toString() : '';

            return `
                <div class="tabzap-item ${isSelected ? 'selected' : ''}" data-tab-id="${tab.id}">
                    <span class="tabzap-index">${indexDisplay}</span>
                    <div class="tabzap-favicon">${faviconContent}</div>
                    <div class="tabzap-info">
                        <div class="tabzap-title">${escapeHtml(tab.title || 'Untitled')}</div>
                        <div class="tabzap-url">${escapeHtml(displayUrl)}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers
        tabList.querySelectorAll('.tabzap-item').forEach(item => {
            item.addEventListener('click', () => {
                const tabId = parseInt(item.dataset.tabId, 10);
                const originalIndex = tabs.findIndex(t => t.id === tabId);
                chrome.runtime.sendMessage({ action: 'overlay-select', index: originalIndex });
                removeOverlay();
            });
        });

        // Scroll selected item into view (centered)
        const selectedItem = tabList.querySelector('.tabzap-item.selected');
        if (selectedItem) {
            selectedItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }

        // Update thumbnail panel
        updateThumbnailPanel();
    }

    function updateThumbnailPanel() {
        if (!thumbnailPanel) return;

        const selectedTab = filteredTabs[selectedIndex];
        const selectedItem = tabList?.querySelector('.tabzap-item.selected');
        const imgContainer = thumbnailPanel.querySelector('.tabzap-thumbnail-img');

        // Update thumbnail content
        if (selectedTab?.thumbnail) {
            imgContainer.innerHTML = `<img src="${selectedTab.thumbnail}" alt="Preview">`;
        } else {
            imgContainer.innerHTML = '<span class="tabzap-thumbnail-placeholder">Preview available after visiting tab</span>';
        }

        // Position thumbnail panel to align with selected item using margin-top
        if (selectedItem && thumbnailPanel) {
            const container = overlay.querySelector('.tabzap-container');
            const containerRect = container.getBoundingClientRect();
            const itemRect = selectedItem.getBoundingClientRect();
            const panelHeight = thumbnailPanel.offsetHeight;

            // Calculate margin-top to center panel on the selected item
            // Item position relative to container top
            const itemCenterY = itemRect.top + itemRect.height / 2 - containerRect.top;
            let marginTop = itemCenterY - panelHeight / 2;

            // Clamp to stay within container bounds
            const maxMargin = container.offsetHeight - panelHeight;
            marginTop = Math.max(0, Math.min(marginTop, maxMargin));

            thumbnailPanel.style.marginTop = `${marginTop}px`;
        }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'overlay-show') {
            tabs = message.tabs;
            filteredTabs = [...tabs];
            searchQuery = '';
            selectedIndex = message.selectedIndex;
            if (!overlay) {
                createOverlay();
            }
            renderTabs();
            sendResponse({ success: true });
        } else if (message.action === 'overlay-update') {
            selectedIndex = message.selectedIndex;
            renderTabs();
            sendResponse({ success: true });
        } else if (message.action === 'overlay-hide') {
            removeOverlay();
            sendResponse({ success: true });
        }
        return true;
    });

    // Signal that the content script is ready
    chrome.runtime.sendMessage({ action: 'overlay-ready' });
})();
