// Configuration for TabZap Switch

var defaultConfig = {
    // Scope: 'current' for current window only, 'all' for all windows
    scope: 'current',
    // Time in ms before cycle resets (user stops cycling)
    cycleTimeoutMs: 1500
}

function configGetEmpty() {
    return {
        scope: 'current',
        cycleTimeoutMs: 1500
    };
}

function configGetDefaults() {
    return JSON.parse(JSON.stringify(defaultConfig));
}

function configRestoreDefault() {
    configSave(defaultConfig);
}

function configLoad(fn) {
    chrome.storage.sync.get(defaultConfig, function(loadedConfig) {
        console.log("config loaded %s", JSON.stringify(loadedConfig));
        fn(loadedConfig);
    });
}

function configSave(source) {
    chrome.storage.sync.set(source);
}
