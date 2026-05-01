// popup.js — Popup logic for Multi-Login Session Isolator

let currentTabId = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Get current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  currentTabId = tab.id;

  // Load current session info
  await loadCurrentSession();
  // Load all sessions list
  await loadSessionList();

  // Bind events
  document.getElementById('renameBtn').addEventListener('click', renameSession);
  document.getElementById('resetBtn').addEventListener('click', resetSession);
  document.getElementById('newTabBtn').addEventListener('click', newIsolatedTab);
  document.getElementById('sessionName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') renameSession();
  });
});

async function loadCurrentSession() {
  const resp = await chrome.runtime.sendMessage({
    type: 'GET_TAB_SESSION',
    tabId: currentTabId,
  });
  const session = resp?.session;
  if (session) {
    document.getElementById('sessionName').value = session.profileName;
    document.getElementById('sessionId').textContent = `ID: ${session.sessionId}`;
  } else {
    document.getElementById('sessionName').value = '未分配 Session';
    document.getElementById('sessionId').textContent = '';
  }
}

async function loadSessionList() {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_ALL_SESSIONS' });
  const sessions = resp?.sessions || {};
  const listEl = document.getElementById('sessionList');
  listEl.innerHTML = '';

  const entries = Object.entries(sessions);
  if (entries.length === 0) {
    listEl.innerHTML = '<div class="empty-msg">暂无活跃 Session</div>';
    return;
  }

  for (const [tabIdStr, session] of entries) {
    const tabId = Number(tabIdStr);
    const div = document.createElement('div');
    div.className = 'list-item' + (tabId === currentTabId ? ' active' : '');

    // Try to get tab info for display
    let tabUrl = '';
    try {
      const tab = await chrome.tabs.get(tabId);
      tabUrl = new URL(tab.url).hostname || tab.url;
    } catch {
      tabUrl = '(已关闭)';
    }

    div.innerHTML = `
      <div>
        <div class="item-name">${escapeHtml(session.profileName)}</div>
        <div class="item-meta">${escapeHtml(tabUrl)}</div>
      </div>
      <div class="item-meta">#${tabId}</div>
    `;
    listEl.appendChild(div);
  }
}

async function renameSession() {
  const name = document.getElementById('sessionName').value.trim();
  if (!name || !currentTabId) return;
  await chrome.runtime.sendMessage({
    type: 'RENAME_SESSION',
    tabId: currentTabId,
    name,
  });
  await loadSessionList();
}

async function resetSession() {
  if (!currentTabId) return;
  if (!confirm('确定要重置当前标签页的登录态吗？这将清除所有 Cookie 和 Storage。')) return;
  await chrome.runtime.sendMessage({
    type: 'RESET_SESSION',
    tabId: currentTabId,
  });
  // Reload the tab to apply changes
  chrome.tabs.reload(currentTabId);
}

async function newIsolatedTab() {
  const name = prompt('新 Session 名称:', `Session ${Date.now().toString(36)}`);
  if (!name) return;
  await chrome.runtime.sendMessage({
    type: 'NEW_ISOLATED_TAB',
    name,
  });
  window.close();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
