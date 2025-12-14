function restoreDefaultConfig() {
    console.log("restoreDefaultConfig");
    configRestoreDefault();
    load();
}

function save() {
    var config = {
        scope: document.getElementById("scope").value,
        cycleTimeoutMs: parseInt(document.getElementById("cycleTimeoutMs").value, 10) || 1500
    };
    configSave(config);
    window.close();
}

function load() {
    configLoad(function(config) {
        document.getElementById("scope").value = config.scope;
        document.getElementById("cycleTimeoutMs").value = config.cycleTimeoutMs;
    });
}

function openShortcuts() {
    // Can't directly open chrome:// URLs, but we can copy to clipboard or show instructions
    const url = 'chrome://extensions/shortcuts';
    navigator.clipboard.writeText(url).then(() => {
        alert('URL copied to clipboard!\n\nPaste "' + url + '" in your address bar to configure shortcuts.');
    }).catch(() => {
        alert('To configure shortcuts, paste this URL in your address bar:\n\n' + url);
    });
}

function setup() {
    console.log("setup");
    document.getElementById("restore_defaults").addEventListener("click", restoreDefaultConfig);
    document.getElementById("save").addEventListener("click", save);
    document.getElementById("load").addEventListener("click", load);
    document.getElementById("shortcuts-link").addEventListener("click", function(e) {
        e.preventDefault();
        openShortcuts();
    });
    load();
}

document.addEventListener('DOMContentLoaded', setup);
