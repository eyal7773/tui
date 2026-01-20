/**
 * VersionManager
 * Handles extraction of the extension version from the manifest.
 */
const VersionManager = {
    /**
     * getVersion
     * Returns the version string defined in manifest.json
     * @returns {string} The version string (e.g., "1.0")
     */
    getVersion: function () {
        const manifest = chrome.runtime.getManifest();
        return manifest.version;
    },

    /**
     * displayVersion
     * Sets the text content of the specified element ID to the current version.
     * @param {string} elementId - The ID of the HTML element to display the version in.
     */
    displayVersion: function (elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = this.getVersion();
        }
    }
};
