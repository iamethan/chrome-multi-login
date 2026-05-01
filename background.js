// background.js — Service Worker for Multi-Login Session Isolator

// Global lock to prevent race conditions during cookie swapping
let swapLock = Promise.resolve();

function withLock(fn) {
  const run = swapLock.then(() => fn());
  swapLock = run.catch(() => {});
  return run;
}

// Current active tab tracking per window
const activeTabs = {}; // { [windowId]: tabId }

// Generate unique session ID
function newSessionId() {
  return 'sess_' + crypto.randomUUID().slice(0, 8);
}

// Get domain from URL
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// Get all data from storage
async function getData() {
  const result = await chrome.storage.local.get(['tabSessions', 'sessionCookies', 'sessionStorage']);
  return {
    tabSessions: result.tabSessions || {},
    sessionCookies: result.sessionCookies || {},
    sessionStorage: result.sessionStorage || {},
  };
}

// Save data to storage
async function saveData(data) {
  await chrome.storage.local.set({
    tabSessions: data.tabSessions,
    sessionCookies: data.sessionCookies,
    sessionStorage: data.sessionStorage,
  });
}

// Ensure a tab has a session assigned
async function ensureSession(tabId) {
  const data = await getData();
  if (!data.tabSessions[tabId]) {
    data.tabSessions[tabId] = {
      sessionId: newSessionId(),
      profileName: `Session ${Object.keys(data.tabSessions).length + 1}`,
    };
    await saveData(data);
  }
  return data.tabSessions[tabId];
}

// Save cookies for a tab's current domain into its session container
async function saveTabCookies(tabId) {
  const data = await getData();
  const session = data.tabSessions[tabId];
  if (!session) return;

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !tab.url) return;

  const domain = getDomain(tab.url);
  if (!domain) return;

  const cookies = await chrome.cookies.getAll({ domain });
  if (!data.sessionCookies[session.sessionId]) {
    data.sessionCookies[session.sessionId] = {};
  }
  data.sessionCookies[session.sessionId][domain] = cookies;
  await saveData(data);
}

// Restore cookies for a tab from its session container
async function restoreTabCookies(tabId) {
  const data = await getData();
  const session = data.tabSessions[tabId];
  if (!session) return;

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !tab.url) return;

  const domain = getDomain(tab.url);
  if (!domain) return;

  // Remove current cookies for this domain
  const currentCookies = await chrome.cookies.getAll({ domain });
  for (const c of currentCookies) {
    const cookieUrl = (c.secure ? 'https://' : 'http://') + c.domain.replace(/^\./, '') + c.path;
    await chrome.cookies.remove({ url: cookieUrl, name: c.name });
  }

  // Restore saved cookies
  const saved = data.sessionCookies[session.sessionId]?.[domain] || [];
  for (const c of saved) {
    try {
      await chrome.cookies.set({
        url: (c.secure ? 'https://' : 'http://') + c.domain.replace(/^\./, '') + c.path,
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
        expirationDate: c.expirationDate,
      });
    } catch (e) {
      // Some cookies may fail to set (e.g. SameSite restrictions), skip them
    }
  }
}

// Handle tab activation — swap cookies
chrome.tabs.onActivated.addListener((activeInfo) => {
  const { tabId, windowId } = activeInfo;

  withLock(async () => {
    const prevTabId = activeTabs[windowId];

    if (prevTabId != null && prevTabId !== tabId) {
      await saveTabCookies(prevTabId);
    }

    await ensureSession(tabId);
    await restoreTabCookies(tabId);

    activeTabs[windowId] = tabId;

    // Notify content script about session change
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'SESSION_CHANGED',
        tabId,
      });
    } catch {
      // Tab may not have content script yet
    }
  });
});

// Assign session to new tabs
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id == null) return;
  withLock(async () => {
    await ensureSession(tab.id);
  });
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  withLock(async () => {
    const data = await getData();
    if (data.tabSessions[tabId]) {
      delete data.tabSessions[tabId];
      await saveData(data);
    }
    // Remove from activeTabs tracking
    for (const wid in activeTabs) {
      if (activeTabs[wid] === tabId) {
        delete activeTabs[wid];
      }
    }
  });
});

// Handle URL changes — save cookies for old domain, restore for new
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    withLock(async () => {
      await ensureSession(tabId);
      await restoreTabCookies(tabId);
    });
  }
});

// Initialize on startup
chrome.runtime.onStartup.addListener(() => {
  withLock(async () => {
    const data = await getData();
    // Clear stale tab sessions (tab IDs are invalid after restart)
    data.tabSessions = {};
    await saveData(data);
  });
});

// Message handler for popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handle = async () => {
    switch (message.type) {
      case 'GET_MY_SESSION': {
        // Content script uses this — identify tab via sender
        const tabId = sender.tab?.id;
        if (!tabId) return { session: null };
        const data = await getData();
        const session = data.tabSessions[tabId];
        return { session: session || null };
      }

      case 'GET_TAB_SESSION': {
        const tabId = message.tabId;
        const data = await getData();
        const session = data.tabSessions[tabId];
        return { session: session || null };
      }

      case 'GET_ALL_SESSIONS': {
        const data = await getData();
        return { sessions: data.tabSessions, cookies: data.sessionCookies };
      }

      case 'RENAME_SESSION': {
        const data = await getData();
        if (data.tabSessions[message.tabId]) {
          data.tabSessions[message.tabId].profileName = message.name;
          await saveData(data);
        }
        return { success: true };
      }

      case 'RESET_SESSION': {
        const tabId = message.tabId;
        const data = await getData();
        const session = data.tabSessions[tabId];
        if (session) {
          data.sessionCookies[session.sessionId] = {};
          data.sessionStorage[session.sessionId] = {};
          await saveData(data);
        }
        // Also clear actual cookies for the current domain
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (tab?.url) {
          const domain = getDomain(tab.url);
          if (domain) {
            const cookies = await chrome.cookies.getAll({ domain });
            for (const c of cookies) {
              const cookieUrl = (c.secure ? 'https://' : 'http://') + c.domain.replace(/^\./, '') + c.path;
              await chrome.cookies.remove({ url: cookieUrl, name: c.name });
            }
          }
        }
        return { success: true };
      }

      case 'NEW_ISOLATED_TAB': {
        const newTab = await chrome.tabs.create({ url: 'about:blank' });
        // ensureSession is called by onCreated listener, but we set a custom name
        const data = await getData();
        if (data.tabSessions[newTab.id]) {
          data.tabSessions[newTab.id].profileName = message.name || `Session ${Object.keys(data.tabSessions).length}`;
          await saveData(data);
        }
        return { tabId: newTab.id };
      }

      case 'SAVE_STORAGE': {
        const { sessionId, domain, storageData } = message;
        const data = await getData();
        if (!data.sessionStorage[sessionId]) {
          data.sessionStorage[sessionId] = {};
        }
        data.sessionStorage[sessionId][domain] = storageData;
        await saveData(data);
        return { success: true };
      }

      case 'GET_STORAGE': {
        const { sessionId, domain } = message;
        const data = await getData();
        return { storageData: data.sessionStorage[sessionId]?.[domain] || {} };
      }

      default:
        return { error: 'Unknown message type' };
    }
  };

  handle().then(sendResponse);
  return true; // keep channel open for async response
});

// Initialize active tabs on service worker startup
chrome.tabs.query({ active: true }, (tabs) => {
  for (const tab of tabs) {
    if (tab.id != null && tab.windowId != null) {
      activeTabs[tab.windowId] = tab.id;
      ensureSession(tab.id);
    }
  }
});
