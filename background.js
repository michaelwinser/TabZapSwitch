// TabZap Switch - Alt-Tab style tab switcher with MRU ordering

importScripts('config.js');

// Global state
let globalConfig = null;
let mruList = [];           // Array of tab IDs, index 0 = most recent
let mruIndex = 0;           // Current position when cycling
let isCycling = false;      // True while user is cycling through tabs
let cycleTimeoutId = null;  // Timeout to reset cycle

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

// Reset cycle state
function resetCycle() {
    console.log('TabZapSwitch: Cycle reset');
    isCycling = false;
    mruIndex = 0;
    if (cycleTimeoutId) {
        clearTimeout(cycleTimeoutId);
        cycleTimeoutId = null;
    }
}

// Extend cycle timeout
function extendCycleTimeout() {
    if (cycleTimeoutId) {
        clearTimeout(cycleTimeoutId);
    }
    const timeout = globalConfig?.cycleTimeoutMs || 1500;
    cycleTimeoutId = setTimeout(resetCycle, timeout);
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
        // Tab might have been closed, remove from list and try again
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
        // Start cycling - go to the previous tab (index 1)
        isCycling = true;
        mruIndex = 1;
    } else {
        // Continue cycling - go further back (wrap around)
        mruIndex = (mruIndex + 1) % filteredList.length;
    }

    extendCycleTimeout();

    const targetTabId = filteredList[mruIndex];
    await switchToTab(targetTabId);
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
    } else {
        // Continue cycling forward (wrap around)
        mruIndex = (mruIndex - 1 + filteredList.length) % filteredList.length;
    }

    extendCycleTimeout();

    const targetTabId = filteredList[mruIndex];
    await switchToTab(targetTabId);
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
}

// Tab removed - remove from MRU list
function onTabRemoved(tabId) {
    console.log('TabZapSwitch: Tab removed', tabId);
    removeFromList(tabId);

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

// Set up listeners
chrome.tabs.onActivated.addListener(onTabActivated);
chrome.tabs.onCreated.addListener(onTabCreated);
chrome.tabs.onRemoved.addListener(onTabRemoved);
chrome.storage.onChanged.addListener(onStorageChanged);
chrome.commands.onCommand.addListener(onCommand);

// Initialize
initialize();
