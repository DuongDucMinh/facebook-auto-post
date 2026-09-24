// ============================================================
// RealPost AI — Content Script
// Chạy trong context của Facebook & Web App (localhost, vercel)
// ============================================================

// 1. Lắng nghe tin nhắn từ Service Worker (background.js)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'REALPOST_PING') {
    sendResponse({ type: 'REALPOST_PONG', token: chrome.runtime?.id || '' })
    return true
  }
  if (message.type === 'REALPOST_PONG') {
    // Chuyển tiếp tin nhắn PONG vào window để Web App nhận biết extension đã cài
    try {
      window.postMessage({ type: 'REALPOST_PONG', token: message.token || chrome.runtime?.id || '' }, '*')
      sendResponse({ received: true })
    } catch { /* ignore */ }
    return true
  }
})

// 2. Cầu nối (Bridge): Nhận window.postMessage từ Web App và chuyển tiếp sang Service Worker
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data?.type) return

  if (event.data.type === 'REALPOST_PING') {
    try {
      chrome.runtime?.sendMessage?.({ type: 'REALPOST_PING' })
        ?.then((response) => {
          if (response) window.postMessage(response, '*')
        })
        ?.catch(() => {
          // Bỏ qua nếu service worker đang ngủ hoặc khởi động
        })
    } catch { /* extension context invalidated */ }
  }

  if (event.data.type === 'REALPOST_CONFIG') {
    try {
      chrome.runtime?.sendMessage?.(event.data)
        ?.then((response) => {
          if (response) window.postMessage({ type: 'REALPOST_CONFIG_SAVED', ...response }, '*')
        })
        ?.catch(() => {
          // Bỏ qua lỗi
        })
    } catch { /* extension context invalidated */ }
  }
})

// 3. Thông báo ngay cho Web App khi Content Script vừa được load vào trang
try {
  if (chrome.runtime?.id) {
    window.postMessage({ type: 'REALPOST_PONG', token: chrome.runtime.id }, '*')
  }
} catch { /* ignore */ }

console.log('[RealPost] Content script bridge active on:', window.location.origin)
