// content.js — ISOLATED world: gets session info and sends to MAIN world script

(async () => {
  const domain = location.hostname;
  if (!domain) return;

  let sessionId = null;
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_MY_SESSION' });
    sessionId = resp?.session?.sessionId;
  } catch {
    return;
  }
  if (!sessionId) return;

  // Send sessionId to the MAIN world script via postMessage
  window.postMessage({ type: 'ML_INIT', sessionId }, '*');
})();
