// ============================================================
// RealPost AI Bridge — Background Service Worker
// ============================================================

const POLL_ALARM_NAME = 'realpost-poll'
const POLL_INTERVAL_MINUTES = 1

// ============================================================
// INITIALIZATION
// ============================================================
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[RealPost] Extension installed/updated')
  await setupAlarm()
  await notifyWebApp()
})

chrome.runtime.onStartup.addListener(async () => {
  await setupAlarm()
})

async function setupAlarm() {
  await chrome.alarms.clear(POLL_ALARM_NAME)
  chrome.alarms.create(POLL_ALARM_NAME, {
    delayInMinutes: 0.1,
    periodInMinutes: POLL_INTERVAL_MINUTES,
  })
  console.log('[RealPost] Alarm set — polling every', POLL_INTERVAL_MINUTES, 'minute(s)')
}

// ============================================================
// ALARM LISTENER — Main polling loop
// ============================================================
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === POLL_ALARM_NAME || alarm.name === 'realpost-force') {
    await pollAndPost()
  }
})

async function pollAndPost() {
  const config = await getConfig()
  if (!config.supabaseUrl || !config.accessToken) {
    console.log('[RealPost] Not configured — skipping poll')
    return
  }

  try {
    const now = new Date().toISOString()
    const pendingSchedules = await fetchPendingSchedules(config, now)
    console.log('[RealPost] Found', pendingSchedules.length, 'pending schedules')

    for (const schedule of pendingSchedules) {
      await processSchedule(schedule, config)
      // Human-like delay between posts: 30-90 seconds
      await sleep(randomBetween(30_000, 90_000))
    }
  } catch (err) {
    console.error('[RealPost] Poll error:', err)
  }
}

// ============================================================
// TOKEN REFRESH LOGIC (Fix 401 Unauthorized)
// ============================================================
async function refreshSupabaseToken(config) {
  if (!config.refreshToken || !config.supabaseUrl || !config.supabaseAnonKey) {
    console.warn('[RealPost] Cannot refresh token: missing refreshToken or supabaseUrl')
    return null
  }

  try {
    console.log('[RealPost] Attempting to refresh Supabase access token...')
    const res = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: config.supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: config.refreshToken }),
    })

    if (res.ok) {
      const data = await res.json()
      console.log('[RealPost] Token refreshed successfully!')
      const updatedConfig = {
        ...config,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      }
      await setConfig(updatedConfig)
      return updatedConfig
    } else {
      console.warn('[RealPost] Token refresh response error:', res.status)
    }
  } catch (err) {
    console.error('[RealPost] Token refresh failed with network error:', err)
  }
  return null
}

// ============================================================
// FETCH PENDING SCHEDULES FROM SUPABASE
// ============================================================
async function fetchPendingSchedules(config, now) {
  let activeConfig = config

  const executeFetch = async (cfg) => {
    const url = `${cfg.supabaseUrl}/rest/v1/schedules?status=eq.pending&scheduled_at=lte.${encodeURIComponent(now)}&select=*,generated_posts(id,title,content,selected_images)&limit=5`
    return await fetch(url, {
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
    })
  }

  let res = await executeFetch(activeConfig)

  // Auto-refresh token if 401 occurred
  if (res.status === 401 && activeConfig.refreshToken) {
    console.log('[RealPost] Received 401, refreshing token...')
    const refreshed = await refreshSupabaseToken(activeConfig)
    if (refreshed) {
      activeConfig = refreshed
      res = await executeFetch(activeConfig)
    }
  }

  if (!res.ok) {
    throw new Error(`Supabase error: ${res.status}`)
  }

  return await res.json()
}

// ============================================================
// PROCESS A SINGLE SCHEDULE
// ============================================================
async function processSchedule(schedule, config) {
  console.log('[RealPost] Processing schedule:', schedule.id)

  // Mark as 'posting'
  await updateScheduleStatus(schedule.id, 'posting', null, config)

  try {
    const post = schedule.generated_posts
    if (!post) throw new Error('Post data missing')

    // Get or create Facebook tab
    const tabId = await getOrCreateFacebookTab(schedule.target_group_url, config)

    // Wait 3 seconds for Facebook DOM to stabilize
    await sleep(3000)

    // Run content script injection
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectFacebookPost,
      args: [
        post.content,
        post.title,
        post.selected_images ?? [],
        schedule.target_group_url,
      ],
    })

    // Look for direct execution result first
    let postResult = injectionResults?.[0]?.result

    // If not immediately returned, wait for message with generous timeout (90s)
    if (!postResult) {
      postResult = await waitForPostResult(tabId, 90_000)
    }

    if (postResult && postResult.success) {
      await updateScheduleStatus(schedule.id, 'success', null, config)
      await createPostingLog(schedule.id, 'success', null, config)
      console.log('[RealPost] Schedule', schedule.id, '→ SUCCESS')
    } else {
      throw new Error(postResult?.error ?? 'Facebook post could not be completed')
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await updateScheduleStatus(schedule.id, 'failed', errMsg, config)
    await createPostingLog(schedule.id, 'failed', errMsg, config)
    console.error('[RealPost] Schedule', schedule.id, '→ FAILED:', errMsg)
  }
}

// ============================================================
// FACEBOOK TAB MANAGEMENT
// ============================================================
async function getOrCreateFacebookTab(groupUrl, config) {
  const existingTabs = await chrome.tabs.query({ url: '*://*.facebook.com/*' })
  const existingFbTab = existingTabs.find((t) => !t.url?.includes('realpost-working'))

  const visibleMode = config.visibleMode ?? true

  if (existingFbTab?.id) {
    await chrome.tabs.update(existingFbTab.id, { url: groupUrl, active: visibleMode })
    await waitForTabLoad(existingFbTab.id)
    return existingFbTab.id
  }

  const newTab = await chrome.tabs.create({ url: groupUrl, active: visibleMode })
  await waitForTabLoad(newTab.id)
  return newTab.id
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
    setTimeout(resolve, 20_000) // fallback timeout
  })
}

function waitForPostResult(tabId, timeout) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ success: false, error: 'Timeout: Không nhận được phản hồi sau khi đăng' })
    }, timeout)

    const listener = (message, sender) => {
      if ((sender.tab?.id === tabId || !sender.tab) && message.type === 'REALPOST_POST_RESULT') {
        clearTimeout(timer)
        chrome.runtime.onMessage.removeListener(listener)
        resolve(message.result)
      }
    }
    chrome.runtime.onMessage.addListener(listener)
  })
}

// ============================================================
// SUPABASE HELPERS
// ============================================================
async function updateScheduleStatus(scheduleId, status, errorLog, config) {
  try {
    let activeConfig = config
    const body = { status }
    if (errorLog !== null) body.error_log = errorLog

    const sendPatch = async (cfg) => {
      return await fetch(`${cfg.supabaseUrl}/rest/v1/schedules?id=eq.${scheduleId}`, {
        method: 'PATCH',
        headers: {
          apikey: cfg.supabaseAnonKey,
          Authorization: `Bearer ${cfg.accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(body),
      })
    }

    let res = await sendPatch(activeConfig)
    if (res.status === 401 && activeConfig.refreshToken) {
      const refreshed = await refreshSupabaseToken(activeConfig)
      if (refreshed) {
        await sendPatch(refreshed)
      }
    }
  } catch (err) {
    console.error('[RealPost] Failed to update schedule status:', err)
  }
}

async function createPostingLog(scheduleId, result, errorMessage, config) {
  try {
    let activeConfig = config
    const body = {
      schedule_id: scheduleId,
      result,
      posted_at: result === 'success' ? new Date().toISOString() : null,
      error_message: errorMessage,
    }

    const sendPost = async (cfg) => {
      return await fetch(`${cfg.supabaseUrl}/rest/v1/posting_logs`, {
        method: 'POST',
        headers: {
          apikey: cfg.supabaseAnonKey,
          Authorization: `Bearer ${cfg.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    }

    let res = await sendPost(activeConfig)
    if (res.status === 401 && activeConfig.refreshToken) {
      const refreshed = await refreshSupabaseToken(activeConfig)
      if (refreshed) {
        await sendPost(refreshed)
      }
    }
  } catch (err) {
    console.error('[RealPost] Failed to create posting log:', err)
  }
}

// ============================================================
// CONFIG MANAGEMENT
// ============================================================
async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['supabaseUrl', 'supabaseAnonKey', 'accessToken', 'refreshToken', 'visibleMode'],
      (result) => resolve(result)
    )
  })
}

async function setConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.local.set(config, resolve)
  })
}

// ============================================================
// WEB APP BRIDGE — externally_connectable & onMessage
// ============================================================
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'REALPOST_CONFIG') {
    setConfig({
      supabaseUrl: message.supabaseUrl,
      supabaseAnonKey: message.supabaseAnonKey,
      accessToken: message.accessToken,
      refreshToken: message.refreshToken,
      visibleMode: message.visibleMode ?? true,
    }).then(() => {
      console.log('[RealPost] Config updated from web app')
      sendResponse({ success: true, extensionId: chrome.runtime.id })
    })
    return true
  }
  if (message.type === 'REALPOST_PING') {
    sendResponse({ type: 'REALPOST_PONG', token: chrome.runtime.id })
    return true
  }
  if (message.type === 'REALPOST_FORCE_POLL') {
    pollAndPost().then(() => {
      sendResponse({ success: true })
    }).catch((err) => {
      sendResponse({ success: false, error: err.message })
    })
    return true
  }
})

// Also listen for content script messages (for localhost dev and web app)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'REALPOST_PING') {
    sendResponse({ type: 'REALPOST_PONG', token: chrome.runtime.id })
    return true
  }
  if (message.type === 'REALPOST_CONFIG') {
    setConfig({
      supabaseUrl: message.supabaseUrl,
      supabaseAnonKey: message.supabaseAnonKey,
      accessToken: message.accessToken,
      refreshToken: message.refreshToken,
      visibleMode: message.visibleMode ?? true,
    }).then(() => {
      console.log('[RealPost] Config updated via content script')
      sendResponse({ success: true, extensionId: chrome.runtime.id })
    }).catch((err) => {
      sendResponse({ success: false, error: err.message })
    })
    return true
  }
  if (message.type === 'REALPOST_FORCE_POLL') {
    console.log('[RealPost] Force poll requested via content script')
    pollAndPost().then(() => {
      sendResponse({ success: true })
    }).catch((err) => {
      sendResponse({ success: false, error: err.message })
    })
    return true
  }
})

// ============================================================
// NOTIFY WEB APP ON INSTALL / UPDATE
// ============================================================
async function notifyWebApp() {
  try {
    const tabs = await chrome.tabs.query({
      url: [
        'http://localhost/*',
        'http://127.0.0.1/*',
        'https://*.vercel.app/*',
        'https://*.netlify.app/*'
      ]
    })
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'REALPOST_PONG', token: chrome.runtime.id })
          .catch(() => {})
      }
    }
  } catch (err) {
    console.debug('[RealPost] notifyWebApp query ignored:', err)
  }
}

// ============================================================
// UTILS
// ============================================================
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// ============================================================
// CONTENT SCRIPT INJECTION FUNCTION
// (runs in the context of the Facebook page)
// ============================================================
async function injectFacebookPost(content, title, imageUrls, groupUrl) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const randomDelay = (min = 800, max = 1800) => sleep(Math.random() * (max - min) + min)

  // Polling helper to wait for elements to render
  const waitForAny = async (selectors, timeoutMs = 15000) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el) return el
      }
      await sleep(400)
    }
    return null
  }

  try {
    console.log('[RealPost-Inject] Starting post injection on', window.location.href)
    await sleep(2000)

    // Step 1: Find and click the post composer button
    const composerSelectors = [
      '[placeholder*="Bạn viết gì đi"]',
      '[placeholder*="Tạo bài viết công khai"]',
      '[placeholder*="Viết gì đó"]',
      '[placeholder*="Bạn đang nghĩ gì"]',
      '[placeholder*="What\'s on your mind"]',
      '[placeholder*="Write something"]',
      '[placeholder*="Create a public post"]',
      'div[role="button"][tabindex="0"] [placeholder]',
      'div[data-pagelet="GroupFeed"] div[role="button"]',
      'div[role="main"] div[role="button"]',
      'div[aria-label*="Tạo bài viết"]',
      'div[aria-label*="Create a post"]',
      'div[aria-label*="Write something"]',
    ]

    let composerButton = await waitForAny(composerSelectors, 12000)

    // Fallback: look for button or span by innerText
    if (!composerButton) {
      const allButtons = Array.from(document.querySelectorAll('div[role="button"], span'))
      composerButton = allButtons.find((el) => {
        const txt = (el.innerText || el.textContent || '').trim().toLowerCase()
        return (
          txt.includes('bạn viết gì đi') ||
          txt.includes('viết gì đó') ||
          txt.includes('tạo bài viết') ||
          txt.includes('write something') ||
          txt.includes("what's on your mind")
        )
      })
    }

    if (!composerButton) {
      const err = 'Không tìm thấy nút tạo bài viết trên Facebook Group (Composer not found)'
      chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: { success: false, error: err } }).catch(() => {})
      return { success: false, error: err }
    }

    console.log('[RealPost-Inject] Clicking composer button...')
    composerButton.click()
    await randomDelay(1500, 2500)

    // Step 2: Wait for modal dialog and find contenteditable editor
    const editorSelectors = [
      '[role="dialog"] [contenteditable="true"][data-lexical-editor="true"]',
      '[role="dialog"] [role="textbox"][contenteditable="true"]',
      '[role="dialog"] [contenteditable="true"]',
      '[contenteditable="true"][data-lexical-editor="true"]',
      '[role="textbox"][contenteditable="true"]',
      '[contenteditable="true"]',
    ]

    let editor = await waitForAny(editorSelectors, 10000)

    if (!editor) {
      const err = 'Không tìm thấy khung soạn thảo văn bản (Editor not found)'
      chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: { success: false, error: err } }).catch(() => {})
      return { success: false, error: err }
    }

    console.log('[RealPost-Inject] Injecting post text...')
    editor.focus()
    await randomDelay(500, 1000)

    const fullText = title ? `${title}\n\n${content}` : content

    // Use ClipboardEvent for reliable input in modern DraftJS / Lexical editors
    try {
      const dataTransfer = new DataTransfer()
      dataTransfer.setData('text/plain', fullText)
      editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true }))
    } catch {
      // Fallback: execCommand
      document.execCommand('selectAll', false, null)
      document.execCommand('insertText', false, fullText)
    }

    await randomDelay(1000, 1800)

    // Check if text was injected
    if (!editor.textContent || editor.textContent.length < 5) {
      editor.focus()
      document.execCommand('selectAll', false, null)
      document.execCommand('insertText', false, fullText)
      await randomDelay(800, 1500)
    }

    // Step 3: Attach images (if any)
    if (imageUrls && imageUrls.length > 0) {
      console.log(`[RealPost-Inject] Attaching ${imageUrls.length} image(s)...`)
      try {
        // Look for photo button inside dialog
        const photoBtn = document.querySelector(
          '[role="dialog"] [aria-label*="Photo"], [role="dialog"] [aria-label*="Ảnh"], [role="dialog"] [aria-label*="photo"], [role="dialog"] [aria-label*="video"]'
        )
        if (photoBtn) {
          photoBtn.click()
          await randomDelay(1200, 2000)
        }

        // Wait for file input
        const fileInput = await waitForAny(['input[type="file"][accept*="image"]'], 6000)
        if (fileInput) {
          const files = await Promise.all(
            imageUrls.slice(0, 10).map(async (url, i) => {
              const res = await fetch(url)
              const blob = await res.blob()
              return new File([blob], `realpost_${Date.now()}_${i}.jpg`, { type: blob.type || 'image/jpeg' })
            })
          )
          const dt = new DataTransfer()
          files.forEach((f) => dt.items.add(f))
          Object.defineProperty(fileInput, 'files', { value: dt.files })
          fileInput.dispatchEvent(new Event('change', { bubbles: true }))
          fileInput.dispatchEvent(new Event('input', { bubbles: true }))
          await randomDelay(2500, 4000)
        }
      } catch (imgErr) {
        console.warn('[RealPost-Inject] Image attach warning (proceeding without image):', imgErr)
      }
    }

    // Step 4: Click Submit / Post button
    await randomDelay(1500, 2500)
    const submitSelectors = [
      '[role="dialog"] div[aria-label="Đăng"]',
      '[role="dialog"] div[aria-label="Post"]',
      '[role="dialog"] div[aria-label="Share"]',
      '[role="dialog"] button[type="submit"]',
      '[role="dialog"] div[role="button"][tabindex="0"]:last-child',
    ]

    let submitBtn = await waitForAny(submitSelectors, 6000)

    if (!submitBtn) {
      // Find button by text
      const buttons = Array.from(document.querySelectorAll('[role="dialog"] div[role="button"], [role="dialog"] button'))
      submitBtn = buttons.reverse().find((b) => {
        const text = (b.textContent || b.innerText || '').trim().toLowerCase()
        return (text === 'đăng' || text === 'post' || text === 'chia sẻ') && b.getAttribute('aria-disabled') !== 'true'
      })
    }

    if (!submitBtn) {
      const err = 'Không tìm thấy nút Đăng (Submit button not found)'
      chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: { success: false, error: err } }).catch(() => {})
      return { success: false, error: err }
    }

    console.log('[RealPost-Inject] Clicking Submit button...')
    submitBtn.click()
    await sleep(4000)

    // Send result back
    const successResult = { success: true, message: 'Đã gửi bài đăng thành công lên Facebook' }
    chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: successResult }).catch(() => {})
    return successResult
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[RealPost-Inject] Error:', errorMsg)
    const failResult = { success: false, error: errorMsg }
    chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: failResult }).catch(() => {})
    return failResult
  }
}
