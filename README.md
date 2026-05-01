# Multi-Login Session Isolator

Isolate login sessions per tab — log into the same website with multiple accounts simultaneously, without interference. An Chrome browser or Edge browser extension similar to SessionBox.

## Features

- **Cookie Isolation** — Each tab maintains its own cookie session; switching tabs automatically swaps cookies
- **LocalStorage Isolation** — MAIN world injected proxy creates an independent namespace per session
- **One-click Isolated Tab** — Quickly create a new isolated tab from the popup panel
- **Session Management** — Rename sessions, view active list, reset with one click
- **Fully Local** — All data stored in `chrome.storage.local`, nothing is uploaded

## Installation

1. Open Edge and navigate to `edge://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this project directory
4. Pin the extension to the toolbar via the puzzle icon

## Usage

1. Click the extension icon in the toolbar to open the management panel
2. Click "New Isolated Tab" to create an independent session
3. Visit the same website in different tabs and log in with different accounts
4. Switch tabs freely — each account's login state stays isolated

## Project Structure

```
multi-login/
├── manifest.json          # Manifest V3 manifest
├── background.js          # Service Worker — core cookie swapping logic
├── content/
│   ├── content.js         # Content script (ISOLATED world) — fetches session info
│   └── injected.js        # Injected script (MAIN world) — localStorage proxy
├── popup/
│   ├── popup.html         # Management panel UI
│   ├── popup.js           # Panel logic
│   └── popup.css          # Styles
├── icons/                 # Extension icons (16/48/128px)
└── assets/                # Store listing assets
```

## How It Works

### Cookie Isolation

All browser tabs share a single cookie jar. This extension achieves isolation through **cookie swapping**:

1. Each tab is assigned a unique `sessionId` on creation
2. On tab switch, `background.js` saves the current tab's cookies to `chrome.storage.local`
3. It then restores the target tab's cookies from storage to the browser
4. A global Promise lock prevents race conditions during rapid switching

### LocalStorage Isolation

Uses Manifest V3's `world: "MAIN"` injection mechanism:

1. `content.js` (ISOLATED world) fetches the current tab's `sessionId` from the background
2. Passes the `sessionId` to `injected.js` via `window.postMessage`
3. `injected.js` (MAIN world) replaces `window.localStorage` via `Object.defineProperty`
4. The proxy object uses key prefixes (`__ml_{sessionId}_`) to isolate data

## Publishing to the Extension Store

See [assets/store-listing.md](assets/store-listing.md) for store descriptions, categories, and privacy statements.

Promotional images and screenshots are in the `assets/` directory. For best quality, use the HTML versions to take screenshots.

## Permissions

| Permission | Purpose |
|------------|---------|
| `cookies` | Read/write browser cookies for tab-level cookie swapping |
| `storage` | Use `chrome.storage.local` to persist session data |
| `tabs` | Listen to tab create/switch/close events |
| `activeTab` | Access current tab information |
| `<all_urls>` | Inject content scripts and manage cookies on all sites |

## License

MIT
