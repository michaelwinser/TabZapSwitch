// TabZap Switch - Alt-Tab style tab switcher with MRU ordering

importScripts('config.js');

// Global state
let globalConfig = null;
let mruList = [];           // Array of tab IDs, index 0 = most recent
let mruIndex = 0;           // Current position when cycling
let isCycling = false;      // True while user is cycling through tabs
let cycleTimeoutId = null;  // Timeout to reset cycle
let originalTabId = null;   // Tab we started cycling from
let overlayTabId = null;    // Tab where overlay is injected
let overlayInjected = false;
let faviconCache = new Map(); // Cache of tabId -> favicon data URL

const MRU_STORAGE_KEY = 'mruList';

// Initialize on startup
async function initialize() {
    console.log('TabZapSwitch: Initializing...');

    // Load config
    configLoad(function(loadedConfig) {
        globalConfig = loadedConfig;
        console.log('TabZapSwitch: Config loaded', globalConfig);
    });

    // Try to restore MRU list from session storage
    try {
        const stored = await chrome.storage.session.get(MRU_STORAGE_KEY);
        if (stored[MRU_STORAGE_KEY] && Array.isArray(stored[MRU_STORAGE_KEY])) {
            mruList = stored[MRU_STORAGE_KEY];
            console.log('TabZapSwitch: Restored MRU list from session', mruList);
        }
    } catch (e) {
        console.log('TabZapSwitch: Could not restore MRU from session storage');
    }

    // If no stored list, build from current tabs
    if (mruList.length === 0) {
        await rebuildMruList();
    } else {
        // Validate stored list against actual tabs
        await validateMruList();
    }

    // Preload all favicons
    await preloadAllFavicons();
}

// Rebuild MRU list from scratch (on first run or if corrupted)
async function rebuildMruList() {
    console.log('TabZapSwitch: Rebuilding MRU list...');
    const tabs = await chrome.tabs.query({});

    // Sort by lastAccessed if available, otherwise by index
    tabs.sort((a, b) => {
        if (a.lastAccessed && b.lastAccessed) {
            return b.lastAccessed - a.lastAccessed;
        }
        return a.index - b.index;
    });

    mruList = tabs.map(t => t.id);
    await persistMruList();
    console.log('TabZapSwitch: MRU list rebuilt', mruList);
}

// Validate MRU list - remove tabs that no longer exist, add new ones
async function validateMruList() {
    const tabs = await chrome.tabs.query({});
    const existingIds = new Set(tabs.map(t => t.id));

    // Remove tabs that no longer exist
    mruList = mruList.filter(id => existingIds.has(id));

    // Add any new tabs that aren't in the list
    const inList = new Set(mruList);
    for (const tab of tabs) {
        if (!inList.has(tab.id)) {
            mruList.push(tab.id);
        }
    }

    await persistMruList();
}

// Save MRU list to session storage
async function persistMruList() {
    try {
        await chrome.storage.session.set({ [MRU_STORAGE_KEY]: mruList });
    } catch (e) {
        console.log('TabZapSwitch: Could not persist MRU list', e);
    }
}

// Move a tab to the front of the MRU list
function moveToFront(tabId) {
    const index = mruList.indexOf(tabId);
    if (index > 0) {
        mruList.splice(index, 1);
        mruList.unshift(tabId);
    } else if (index === -1) {
        mruList.unshift(tabId);
    }
    persistMruList();
}

// Remove a tab from the MRU list
function removeFromList(tabId) {
    const index = mruList.indexOf(tabId);
    if (index !== -1) {
        mruList.splice(index, 1);
        persistMruList();
    }
}

// Get filtered MRU list based on scope
async function getFilteredMruList() {
    if (!globalConfig || globalConfig.scope === 'all') {
        return mruList;
    }

    // Current window only
    const currentWindow = await chrome.windows.getCurrent();
    const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
    const windowTabIds = new Set(tabs.map(t => t.id));

    return mruList.filter(id => windowTabIds.has(id));
}

// Convert favicon URL to data URL
async function fetchFaviconAsDataUrl(faviconUrl) {
    if (!faviconUrl) return null;

    try {
        const response = await fetch(faviconUrl);
        if (!response.ok) return null;

        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        return null;
    }
}

// Cache favicon for a tab
async function cacheFavicon(tabId, faviconUrl) {
    if (!faviconUrl) {
        faviconCache.delete(tabId);
        return;
    }

    const dataUrl = await fetchFaviconAsDataUrl(faviconUrl);
    if (dataUrl) {
        faviconCache.set(tabId, dataUrl);
        console.log('TabZapSwitch: Cached favicon for tab', tabId);
    }
}

// Preload favicons for all tabs
async function preloadAllFavicons() {
    console.log('TabZapSwitch: Preloading favicons...');
    const tabs = await chrome.tabs.query({});

    // Fetch all favicons in parallel
    await Promise.all(tabs.map(tab => cacheFavicon(tab.id, tab.favIconUrl)));

    console.log('TabZapSwitch: Preloaded', faviconCache.size, 'favicons');
}

// Get tab details for overlay display
async function getTabDetails(tabIds) {
    const tabs = [];

    for (const id of tabIds) {
        try {
            const tab = await chrome.tabs.get(id);
            tabs.push({
                id: tab.id,
                title: tab.title,
                url: tab.url,
                favIconUrl: faviconCache.get(id) || null
            });
        } catch (e) {
            // Tab may have been closed
        }
    }

    return tabs;
}

// Inject overlay into a tab
async function injectOverlay(tabId) {
    try {
        // Check if we can inject into this tab
        const tab = await chrome.tabs.get(tabId);
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
            console.log('TabZapSwitch: Cannot inject into restricted page');
            return false;
        }

        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['overlay.js']
        });
        overlayTabId = tabId;
        overlayInjected = true;
        console.log('TabZapSwitch: Overlay injected into tab', tabId);
        return true;
    } catch (e) {
        console.log('TabZapSwitch: Failed to inject overlay', e);
        return false;
    }
}

// Send message to overlay
async function sendToOverlay(message) {
    if (!overlayTabId || !overlayInjected) return;

    try {
        await chrome.tabs.sendMessage(overlayTabId, message);
    } catch (e) {
        console.log('TabZapSwitch: Failed to send message to overlay', e);
    }
}

// Show overlay with tab list
async function showOverlay(filteredList, selectedIndex) {
    const tabs = await getTabDetails(filteredList);
    await sendToOverlay({
        action: 'overlay-show',
        tabs: tabs,
        selectedIndex: selectedIndex
    });
}

// Update overlay selection
async function updateOverlay(selectedIndex) {
    await sendToOverlay({
        action: 'overlay-update',
        selectedIndex: selectedIndex
    });
}

// Hide overlay
async function hideOverlay() {
    await sendToOverlay({ action: 'overlay-hide' });
    overlayInjected = false;
    overlayTabId = null;
}

// Reset cycle state and perform the switch
async function finishCycle(shouldSwitch = true) {
    console.log('TabZapSwitch: Finishing cycle, shouldSwitch:', shouldSwitch, 'mruIndex:', mruIndex);

    if (cycleTimeoutId) {
        clearTimeout(cycleTimeoutId);
        cycleTimeoutId = null;
    }

    // Hide overlay
    await hideOverlay();

    if (shouldSwitch && mruIndex > 0) {
        // Get the target tab and switch to it
        const filteredList = await getFilteredMruList();
        const targetTabId = filteredList[mruIndex];

        if (targetTabId) {
            await switchToTab(targetTabId);
            // Update MRU - the switched-to tab becomes most recent
            moveToFront(targetTabId);
        }
    }
    // If cancelled or mruIndex is 0, stay on original tab (already there)

    isCycling = false;
    mruIndex = 0;
    originalTabId = null;
}

// Extend cycle timeout
function extendCycleTimeout() {
    if (cycleTimeoutId) {
        clearTimeout(cycleTimeoutId);
    }
    const timeout = globalConfig?.cycleTimeoutMs || 1500;
    cycleTimeoutId = setTimeout(() => finishCycle(true), timeout);
}

// Switch to a tab by ID
async function switchToTab(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);

        // If tab is in a different window, focus that window first
        const currentWindow = await chrome.windows.getCurrent();
        if (tab.windowId !== currentWindow.id) {
            await chrome.windows.update(tab.windowId, { focused: true });
        }

        // Activate the tab
        await chrome.tabs.update(tabId, { active: true });
        console.log('TabZapSwitch: Switched to tab', tabId);
    } catch (e) {
        console.log('TabZapSwitch: Failed to switch to tab', tabId, e);
        // Tab might have been closed, remove from list
        removeFromList(tabId);
    }
}

// Handle switch-previous command (go back in history)
async function handleSwitchPrevious() {
    const filteredList = await getFilteredMruList();

    if (filteredList.length < 2) {
        console.log('TabZapSwitch: Not enough tabs to switch');
        return;
    }

    if (!isCycling) {
        // Start cycling
        isCycling = true;
        mruIndex = 1;

        // Remember original tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        originalTabId = activeTab?.id;

        // Try to inject overlay into current tab
        let injected = false;
        if (activeTab) {
            injected = await injectOverlay(activeTab.id);
            if (injected) {
                await showOverlay(filteredList, mruIndex);
            }
        }

        // If overlay couldn't be injected (chrome:// page), switch immediately
        if (!injected) {
            const targetTabId = filteredList[mruIndex];
            await switchToTab(targetTabId);
            moveToFront(targetTabId);
            isCycling = false;
            mruIndex = 0;
            return;
        }
    } else {
        // Continue cycling - go further back (wrap around)
        mruIndex = (mruIndex + 1) % filteredList.length;
        await updateOverlay(mruIndex);
    }

    extendCycleTimeout();
}

// Handle switch-next command (go forward in history / undo)
async function handleSwitchNext() {
    const filteredList = await getFilteredMruList();

    if (filteredList.length < 2) {
        console.log('TabZapSwitch: Not enough tabs to switch');
        return;
    }

    if (!isCycling) {
        // Start cycling in reverse - go to the last tab (wrap to end)
        isCycling = true;
        mruIndex = filteredList.length - 1;

        // Remember original tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        originalTabId = activeTab?.id;

        // Try to inject overlay into current tab
        let injected = false;
        if (activeTab) {
            injected = await injectOverlay(activeTab.id);
            if (injected) {
                await showOverlay(filteredList, mruIndex);
            }
        }

        // If overlay couldn't be injected (chrome:// page), switch immediately
        if (!injected) {
            const targetTabId = filteredList[mruIndex];
            await switchToTab(targetTabId);
            moveToFront(targetTabId);
            isCycling = false;
            mruIndex = 0;
            return;
        }
    } else {
        // Continue cycling forward (wrap around)
        mruIndex = (mruIndex - 1 + filteredList.length) % filteredList.length;
        await updateOverlay(mruIndex);
    }

    extendCycleTimeout();
}

// Tab activated - update MRU list (unless we're cycling)
function onTabActivated(activeInfo) {
    console.log('TabZapSwitch: Tab activated', activeInfo.tabId, 'cycling:', isCycling);

    if (!isCycling) {
        // Normal activation - move to front
        moveToFront(activeInfo.tabId);
    }
    // If cycling, don't update MRU order - we'll do that when cycle ends
}

// Tab created - add to front of MRU list
function onTabCreated(tab) {
    console.log('TabZapSwitch: Tab created', tab.id);
    moveToFront(tab.id);
    // Cache favicon if available
    if (tab.favIconUrl) {
        cacheFavicon(tab.id, tab.favIconUrl);
    }
}

// Tab updated - cache favicon when it changes
function onTabUpdated(tabId, changeInfo, tab) {
    // Only care about favicon changes
    if (changeInfo.favIconUrl !== undefined) {
        console.log('TabZapSwitch: Tab favicon updated', tabId);
        cacheFavicon(tabId, changeInfo.favIconUrl);
    }
}

// Tab removed - remove from MRU list and favicon cache
function onTabRemoved(tabId) {
    console.log('TabZapSwitch: Tab removed', tabId);
    removeFromList(tabId);
    faviconCache.delete(tabId);

    // If removed tab was the overlay tab, reset cycling
    if (tabId === overlayTabId) {
        finishCycle(false);
    }

    // Adjust mruIndex if needed
    if (isCycling && mruIndex >= mruList.length) {
        mruIndex = Math.max(0, mruList.length - 1);
    }
}

// Config changed
function onStorageChanged(changes, areaName) {
    if (areaName === 'sync') {
        configLoad(function(loadedConfig) {
            globalConfig = loadedConfig;
            console.log('TabZapSwitch: Config updated', globalConfig);
        });
    }
}

// Command handler
function onCommand(command) {
    console.log('TabZapSwitch: Command received', command);

    if (command === 'switch-previous') {
        handleSwitchPrevious();
    } else if (command === 'switch-next') {
        handleSwitchNext();
    }
}

// Handle messages from content script
function onMessage(message, sender, sendResponse) {
    if (message.action === 'overlay-activity') {
        // User activity in overlay - reset the timeout
        if (isCycling) {
            extendCycleTimeout();
        }
    } else if (message.action === 'overlay-manual-mode') {
        // User started using arrow keys - disable auto-dismiss
        if (cycleTimeoutId) {
            clearTimeout(cycleTimeoutId);
            cycleTimeoutId = null;
            console.log('TabZapSwitch: Manual mode - timer disabled');
        }
    } else if (message.action === 'overlay-cancel') {
        // User pressed Escape - cancel and stay on original tab
        finishCycle(false);
    } else if (message.action === 'overlay-select') {
        // User clicked a tab in the overlay
        mruIndex = message.index;
        finishCycle(true);
    } else if (message.action === 'overlay-ready') {
        // Content script is ready
        console.log('TabZapSwitch: Overlay ready in tab', sender.tab?.id);
    }
}

// Set up listeners
chrome.tabs.onActivated.addListener(onTabActivated);
chrome.tabs.onCreated.addListener(onTabCreated);
chrome.tabs.onUpdated.addListener(onTabUpdated);
chrome.tabs.onRemoved.addListener(onTabRemoved);
chrome.storage.onChanged.addListener(onStorageChanged);
chrome.commands.onCommand.addListener(onCommand);
chrome.runtime.onMessage.addListener(onMessage);

// Initialize
initialize();
