// ============================================================
// RealPost AI — Content Script
// Chạy trong context của trang Facebook
// ============================================================

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'REALPOST_PING') {
    sendResponse({ type: 'REALPOST_PONG' })
  }
})

// Bridge: relay window.postMessage to background
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (event.data?.type === 'REALPOST_PING') {
    chrome.runtime.sendMessage({ type: 'REALPOST_PING' }, (response) => {
      window.postMessage(response, '*')
    })
  }
})

// Notify web app that extension is active (on Facebook pages)
window.postMessage({ type: 'REALPOST_PONG', token: chrome.runtime.id }, '*')

console.log('[RealPost] Content script loaded on', window.location.hostname)
