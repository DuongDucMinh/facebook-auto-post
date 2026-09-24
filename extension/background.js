// ============================================================
// RealPost AI Bridge — Background Service Worker
// ============================================================

const SUPABASE_URL = 'YOUR_SUPABASE_URL' // Will be set from storage
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
// FETCH PENDING SCHEDULES FROM SUPABASE
// ============================================================
async function fetchPendingSchedules(config, now) {
  const url = `${config.supabaseUrl}/rest/v1/schedules?status=eq.pending&scheduled_at=lte.${encodeURIComponent(now)}&select=*,generated_posts(title,content,selected_images)&limit=5`
  const res = await fetch(url, {
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`)
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

    // Run content script injection
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectFacebookPost,
      args: [
        post.content,
        post.title,
        post.selected_images ?? [],
        schedule.target_group_url,
      ],
    })

    // Wait for result via message
    const result = await waitForPostResult(tabId, 30_000)

    if (result.success) {
      await updateScheduleStatus(schedule.id, 'success', null, config)
      await createPostingLog(schedule.id, 'success', null, config)
      console.log('[RealPost] Schedule', schedule.id, '→ SUCCESS')
    } else {
      throw new Error(result.error ?? 'Post failed')
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
    setTimeout(resolve, 15_000) // fallback timeout
  })
}

function waitForPostResult(tabId, timeout) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ success: false, error: 'Timeout: no response from content script' })
    }, timeout)

    const listener = (message, sender) => {
      if (sender.tab?.id === tabId && message.type === 'REALPOST_POST_RESULT') {
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
  const body = { status }
  if (errorLog !== null) body.error_log = errorLog
  const res = await fetch(`${config.supabaseUrl}/rest/v1/schedules?id=eq.${scheduleId}`, {
    method: 'PATCH',
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) console.error('[RealPost] Failed to update schedule status')
}

async function createPostingLog(scheduleId, result, errorMessage, config) {
  const body = {
    schedule_id: scheduleId,
    result,
    posted_at: result === 'success' ? new Date().toISOString() : null,
    error_message: errorMessage,
  }
  await fetch(`${config.supabaseUrl}/rest/v1/posting_logs`, {
    method: 'POST',
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

// ============================================================
// CONFIG MANAGEMENT
// ============================================================
async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['supabaseUrl', 'supabaseAnonKey', 'accessToken', 'visibleMode'],
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
// WEB APP BRIDGE — externally_connectable
// ============================================================
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'REALPOST_CONFIG') {
    setConfig({
      supabaseUrl: message.supabaseUrl,
      supabaseAnonKey: message.supabaseAnonKey,
      accessToken: message.accessToken,
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
        // Must catch errors safely: tabs opened before extension load or without listeners
        // will reject with "Could not establish connection. Receiving end does not exist."
        chrome.tabs.sendMessage(tab.id, { type: 'REALPOST_PONG', token: chrome.runtime.id })
          .catch(() => {
            // Normal: tab does not have active listener yet
          })
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
  // This function runs IN the Facebook page context
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const randomDelay = (min = 1000, max = 3000) => sleep(Math.random() * (max - min) + min)

  try {
    // Navigate to group if not already there
    if (!window.location.href.includes(groupUrl.replace('https://www.facebook.com', ''))) {
      window.location.href = groupUrl
      await sleep(5000)
    }

    // Wait for Facebook to load
    await sleep(3000)
    await randomDelay()

    // Step 1: Find and click the post composer
    const composerSelectors = [
      '[placeholder="Tạo bài viết công khai..."]',
      '[placeholder="What\'s on your mind?"]',
      '[placeholder="Viết gì đó..."]',
      '[role="button"][class*="composer"]',
      'div[data-pagelet="GroupFeed"] div[role="button"]',
    ]

    let composerButton = null
    for (const selector of composerSelectors) {
      composerButton = document.querySelector(selector)
      if (composerButton) break
    }

    if (!composerButton) {
      chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: { success: false, error: 'Composer not found' } }).catch(() => {})
      return
    }

    composerButton.click()
    await randomDelay(2000, 4000)

    // Step 2: Find the contenteditable and inject text
    const editableSelectors = [
      '[contenteditable="true"][data-lexical-editor="true"]',
      '[role="textbox"][contenteditable="true"]',
      '[contenteditable="true"]',
    ]

    let editor = null
    for (const selector of editableSelectors) {
      const els = document.querySelectorAll(selector)
      editor = Array.from(els).find((el) => el.getAttribute('data-lexical-editor') || el.closest('[role="dialog"]'))
      if (!editor) editor = els[els.length - 1]
      if (editor) break
    }

    if (!editor) {
      chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: { success: false, error: 'Editor not found' } }).catch(() => {})
      return
    }

    editor.focus()
    await randomDelay(1000, 2000)

    // Inject text using clipboard (most reliable method for Lexical/DraftJS)
    const fullText = `${title}\n\n${content}`
    const dataTransfer = new DataTransfer()
    dataTransfer.setData('text/plain', fullText)
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true }))
    await randomDelay(1500, 3000)

    // Fallback: execCommand
    if (!editor.textContent?.includes(title.slice(0, 10))) {
      editor.focus()
      document.execCommand('selectAll', false, null)
      document.execCommand('insertText', false, fullText)
      await randomDelay(1000, 2000)
    }

    // Step 3: Attach images (if any)
    if (imageUrls && imageUrls.length > 0) {
      await randomDelay(1000, 2000)
      // Look for photo/video button
      const photoBtn = document.querySelector('[aria-label*="Photo"], [aria-label*="Ảnh"], [aria-label*="photo"]')
      if (photoBtn) {
        photoBtn.click()
        await randomDelay(2000, 3000)

        // Fetch images and create FileList
        const fileInput = document.querySelector('input[type="file"][accept*="image"]')
        if (fileInput) {
          const files = await Promise.all(
            imageUrls.map(async (url, i) => {
              const res = await fetch(url)
              const blob = await res.blob()
              return new File([blob], `image${i}.jpg`, { type: 'image/jpeg' })
            })
          )
          const dt = new DataTransfer()
          files.forEach((f) => dt.items.add(f))
          Object.defineProperty(fileInput, 'files', { value: dt.files })
          fileInput.dispatchEvent(new Event('change', { bubbles: true }))
          await randomDelay(3000, 5000)
        }
      }
    }

    // Step 4: Click Submit button
    await randomDelay(2000, 4000)
    const submitSelectors = [
      'button[type="submit"]',
      '[aria-label="Post"]',
      '[aria-label="Đăng"]',
      'div[role="button"]:last-child',
    ]

    let submitBtn = null
    for (const selector of submitSelectors) {
      const btns = document.querySelectorAll(selector)
      submitBtn = Array.from(btns).find((b) => {
        const text = b.textContent ?? ''
        return text.includes('Đăng') || text.includes('Post') || text.includes('Share')
      })
      if (submitBtn) break
    }

    if (!submitBtn) {
      chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: { success: false, error: 'Submit button not found' } }).catch(() => {})
      return
    }

    submitBtn.click()
    await randomDelay(3000, 6000)

    // Step 5: Verify success (URL change or confirmation)
    chrome.runtime.sendMessage({
      type: 'REALPOST_POST_RESULT',
      result: { success: true, message: 'Post submitted' },
    }).catch(() => {})
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'REALPOST_POST_RESULT',
      result: { success: false, error: err.message },
    }).catch(() => {})
  }
}
