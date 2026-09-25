// Extension Popup Script
document.addEventListener('DOMContentLoaded', async () => {
  const webappStatus = document.getElementById('webapp-status')
  const webappDot = document.getElementById('webapp-dot')
  const queueCount = document.getElementById('queue-count')
  const pollStatus = document.getElementById('poll-status')
  const lastPoll = document.getElementById('last-poll')
  const errorMsg = document.getElementById('error-msg')
  const openAppBtn = document.getElementById('open-app')
  const forcePollBtn = document.getElementById('force-poll')

  // Load config
  const config = await new Promise((resolve) => {
    chrome.storage.local.get(['supabaseUrl', 'supabaseAnonKey', 'accessToken', 'lastPollAt', 'appOrigin'], resolve)
  })

  // Check web app connection
  if (config.supabaseUrl && config.accessToken) {
    webappStatus.textContent = 'Đã kết nối'
    webappDot.classList.add('connected')

    // Fetch queue count
    try {
      const now = new Date().toISOString()
      const res = await fetch(
        `${config.supabaseUrl}/rest/v1/schedules?status=eq.pending&scheduled_at=lte.${encodeURIComponent(now)}&select=id`,
        {
          headers: {
            apikey: config.supabaseAnonKey,
            Authorization: `Bearer ${config.accessToken}`,
            Prefer: 'count=exact',
          },
        }
      )
      const count = res.headers.get('content-range')?.split('/')[1] ?? '0'
      queueCount.textContent = `${count} bài`
      pollStatus.textContent = 'Extension đang hoạt động'
    } catch {
      queueCount.textContent = '--'
      errorMsg.textContent = 'Không thể kết nối Supabase'
    }
  } else {
    webappStatus.textContent = 'Chưa cấu hình'
    queueCount.textContent = '--'
    pollStatus.textContent = 'Chưa kết nối với RealPost AI'
  }

  if (config.lastPollAt) {
    lastPoll.textContent = 'Kiểm tra lần cuối: ' + new Date(config.lastPollAt).toLocaleTimeString('vi-VN')
  }

  // Open app button
  openAppBtn.addEventListener('click', () => {
    const origin = config.appOrigin ?? 'http://localhost:5173'
    chrome.tabs.create({ url: origin })
  })

  // Force poll button
  forcePollBtn.addEventListener('click', () => {
    pollStatus.textContent = 'Đang kiểm tra & đăng bài...'
    try {
      chrome.runtime.sendMessage({ type: 'REALPOST_FORCE_POLL' }, () => {
        if (chrome.runtime.lastError) {
          chrome.alarms.create('realpost-force', { when: Date.now() + 1000 })
        }
      })
    } catch {
      chrome.alarms.create('realpost-force', { when: Date.now() + 1000 })
    }
    setTimeout(() => window.close(), 1500)
  })
})
