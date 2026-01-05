# TUI Navigator

TUI Navigator is a chrome extension that transforms the browsing experience on data-heavy websites into a **Text-based User Interface (TUI)**. Navigate search results and lists using your keyboard with high-contrast visibility.

## Installation Instructions

1.  **Download the Source Code**:
    Ensure you have the `tui-navigator` folder with all the extension files (`manifest.json`, `background.js`, `popup/`, etc.).

2.  **Open Chrome Extensions Page**:
    -   Open Google Chrome.
    -   Navigate to `chrome://extensions/` in the address bar.

3.  **Enable Developer Mode**:
    -   Look for the toggle switch named **"Developer mode"** in the top right corner.
    -   Turn it **ON**.

4.  **Load Unpacked Extension**:
    -   Click the **"Load unpacked"** button that appears in the top left.
    -   Select the `c:\Users\USER\source\repos\tui` folder (or wherever you saved the project).

5.  **Verify Installation**:
    -   You should see "TUI Navigator" in your list of extensions.
    -   The icon (terminal arrow) should appear in your browser toolbar.

## Usage Guide

### Supported Sites
-   **Google Search**: Navigates search results.
-   **YouTube**: Navigates search results and recommendations.
-   **Wikipedia**: Navigates article links.

### Controls
| Key | Action |
| :--- | :--- |
| **Arrrow Down / J** | Move focus to next item |
| **Arrow Up / K** | Move focus to previous item |
| **Enter** | Click/Open the selected item |
| **Esc** | Reset focus / Deactivate |

### Management
Click the extension icon to:
-   See if the current site is supported.
-   View usage statistics (Total Actions).
-   Enable/Disable TUI for the current session.

## Troubleshooting
-   **"Extension invalidated"**: If you see errors in the console, refresh the extension on the `chrome://extensions` page.
-   **No Focus Ring**: Ensure you are on a supported site. Try refreshing the page.
