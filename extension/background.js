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
    const url = `${cfg.supabaseUrl}/rest/v1/schedules?status=eq.pending&scheduled_at=lte.${encodeURIComponent(now)}&select=*,generated_posts(id,title,content,selected_images),properties(images)&limit=5`
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

// Pre-download images to Base64 in extension service worker (bypasses Facebook CSP)
async function preloadImagesAsBase64(imageUrls) {
  const list = []
  if (!imageUrls || !Array.isArray(imageUrls)) return list

  for (let i = 0; i < Math.min(imageUrls.length, 10); i++) {
    const url = imageUrls[i]
    if (!url || typeof url !== 'string') continue
    try {
      console.log(`[RealPost] Downloading image ${i + 1}/${imageUrls.length}:`, url)
      const res = await fetch(url)
      if (!res.ok) {
        console.warn(`[RealPost] Image fetch failed with status ${res.status}:`, url)
        continue
      }
      const blob = await res.blob()
      const buffer = await blob.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      const chunkSize = 8192
      for (let j = 0; j < bytes.length; j += chunkSize) {
        const chunk = bytes.subarray(j, j + chunkSize)
        binary += String.fromCharCode.apply(null, chunk)
      }
      const base64 = btoa(binary)
      const mime = blob.type || 'image/jpeg'
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'

      list.push({
        name: `realpost_${Date.now()}_${i}.${ext}`,
        type: mime,
        dataUrl: `data:${mime};base64,${base64}`,
      })
      console.log(`[RealPost] Preloaded image ${i + 1}: ${bytes.byteLength} bytes`)
    } catch (err) {
      console.warn(`[RealPost] Failed to preload image ${url}:`, err)
    }
  }

  return list
}

// ============================================================
// PROCESS A SINGLE SCHEDULE
// ============================================================
async function processSchedule(schedule, config) {
  console.log('[RealPost] Processing schedule:', schedule.id)

  // Mark as 'posting'
  await updateScheduleStatus(schedule.id, 'posting', null, config)

  try {
    const post = Array.isArray(schedule.generated_posts)
      ? schedule.generated_posts[0]
      : schedule.generated_posts
    if (!post) throw new Error('Post data missing')

    const prop = Array.isArray(schedule.properties)
      ? schedule.properties[0]
      : schedule.properties

    const rawImages = (post.selected_images && post.selected_images.length > 0)
      ? post.selected_images
      : (prop?.images ?? [])

    console.log('[RealPost] Images to attach:', rawImages.length)
    const preloadedImages = await preloadImagesAsBase64(rawImages)
    console.log('[RealPost] Successfully preloaded images count:', preloadedImages.length)

    // Get or create Facebook tab
    const tabId = await getOrCreateFacebookTab(schedule.target_group_url, config)

    // Wait 3.5 seconds for Facebook DOM to stabilize
    await sleep(3500)

    // Run content script injection
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectFacebookPost,
      args: [
        post.content,
        post.title,
        preloadedImages,
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
    let resolved = false
    const done = () => {
      if (!resolved) {
        resolved = true
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }

    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') {
        done()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)

    chrome.tabs.get(tabId).then((tab) => {
      if (tab && tab.status === 'complete') {
        setTimeout(done, 1500)
      }
    }).catch(() => {})

    setTimeout(done, 20_000) // fallback timeout
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
async function injectFacebookPost(content, title, preloadedImages, groupUrl) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const randomDelay = (min = 600, max = 1500) => sleep(Math.random() * (max - min) + min)

  // Helper: Convert Data URL to File object (synchronous, local, immune to Facebook CSP)
  function dataUrlToFile(dataUrl, filename, mimeType) {
    try {
      const arr = dataUrl.split(',')
      const mime = mimeType || (arr[0].match(/:(.*?);/) || [])[1] || 'image/jpeg'
      const bstr = atob(arr[1])
      let n = bstr.length
      const u8arr = new Uint8Array(n)
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n)
      }
      return new File([u8arr], filename, { type: mime })
    } catch (e) {
      console.warn('[RealPost-Inject] Error converting Data URL to File:', e)
      return null
    }
  }

  // Helper: Check if Create Post dialog is already open
  function findCreatePostDialog() {
    const dialogs = document.querySelectorAll('div[role="dialog"]')
    for (const d of dialogs) {
      // Must NOT be a chat popup or notification popup
      if (d.closest('[role="region"][aria-label*="Chat" i]')) continue
      const aria = (d.getAttribute('aria-label') || '').toLowerCase()
      const text = (d.innerText || d.textContent || '').toLowerCase()
      if (
        aria.includes('tạo bài viết') ||
        aria.includes('create post') ||
        aria.includes('create a post') ||
        text.includes('tạo bài viết') ||
        text.includes('create post') ||
        (d.querySelector('[contenteditable="true"]') && (text.includes('bạn viết gì đi') || text.includes('write something') || text.includes('đăng') || text.includes('post')))
      ) {
        return d
      }
    }
    return null
  }

  // Helper: Find composer trigger strictly OUTSIDE feed posts, articles, and comment boxes
  function findComposerTrigger() {
    // 1. Check data-pagelet composer containers
    const pageletSelectors = [
      'div[data-pagelet="GroupInlineComposer"]',
      'div[data-pagelet="FeedInlineComposer"]',
      'div[data-pagelet*="InlineComposer"]',
      'div[data-pagelet*="Composer"]',
    ]
    for (const sel of pageletSelectors) {
      const pagelet = document.querySelector(sel)
      if (pagelet) {
        // Find the main prompt button inside composer
        const btn = pagelet.querySelector('div[role="button"][tabindex="0"]') ||
                    pagelet.querySelector('div[role="button"]')
        if (btn) return btn
      }
    }

    // 2. Search by text content across elements strictly OUTSIDE feed posts and comments
    const triggerTexts = [
      'bạn viết gì đi',
      'viết gì đó',
      'tạo bài viết công khai',
      'bạn đang nghĩ gì',
      'write something',
      'create a public post',
      "what's on your mind",
      'tạo bài viết',
      'create post',
    ]

    const candidates = Array.from(document.querySelectorAll('div[role="main"] span, div[role="main"] div[role="button"], span'))
    for (const el of candidates) {
      // CRITICAL FILTER: NEVER match anything inside a feed post, article, or comment box!
      if (
        el.closest('[role="article"]') ||
        el.closest('[data-pagelet="GroupFeed"]') ||
        el.closest('[data-pagelet^="FeedUnit"]') ||
        el.closest('[aria-label*="bình luận" i]') ||
        el.closest('[aria-label*="comment" i]') ||
        el.closest('[role="navigation"]') ||
        el.closest('header') ||
        el.closest('form')
      ) {
        continue
      }

      const txt = (el.textContent || el.innerText || '').trim().toLowerCase()
      for (const phrase of triggerTexts) {
        if (txt === phrase || (txt.startsWith(phrase) && txt.length < 40)) {
          return el.closest('div[role="button"]') || el
        }
      }
    }

    // 3. Fallback: Search for "Tạo bài viết" / "Create post" button inside main header/actions
    const actionButtons = Array.from(document.querySelectorAll('div[role="main"] div[role="button"], div[role="button"]'))
    for (const btn of actionButtons) {
      if (
        btn.closest('[role="article"]') ||
        btn.closest('[data-pagelet="GroupFeed"]') ||
        btn.closest('[aria-label*="bình luận" i]') ||
        btn.closest('[aria-label*="comment" i]')
      ) {
        continue
      }
      const label = (btn.getAttribute('aria-label') || btn.innerText || '').trim().toLowerCase()
      if (label.includes('tạo bài viết') || label.includes('create post') || label.includes('viết gì')) {
        return btn
      }
    }

    return null
  }

  // Helper: Poll for enabled Submit button inside dialog
  async function waitForSubmitButton(dlg, timeoutMs = 30000) {
    const start = Date.now()
    let lastNudgeTime = 0

    while (Date.now() - start < timeoutMs) {
      const buttons = Array.from(dlg.querySelectorAll('div[role="button"], button'))

      const candidate = buttons.reverse().find((b) => {
        const aria = (b.getAttribute('aria-label') || '').trim().toLowerCase()
        const text = (b.textContent || b.innerText || '').trim().toLowerCase()
        return (
          aria === 'đăng' ||
          aria === 'post' ||
          aria === 'chia sẻ' ||
          aria === 'share' ||
          text === 'đăng' ||
          text === 'post' ||
          text === 'chia sẻ' ||
          text === 'share'
        )
      })

      if (candidate) {
        const ariaDisabled = candidate.getAttribute('aria-disabled')
        const isDisabled =
          ariaDisabled === 'true' ||
          candidate.disabled === true ||
          candidate.getAttribute('disabled') !== null

        if (!isDisabled) {
          return candidate
        }

        // Periodically nudge editor so Facebook updates button state
        if (Date.now() - lastNudgeTime > 3500) {
          lastNudgeTime = Date.now()
          console.log('[RealPost-Inject] Submit button currently disabled, nudging editor...')
          const ed = dlg.querySelector('[contenteditable="true"]')
          if (ed) {
            ed.focus()
            ed.dispatchEvent(new InputEvent('input', { bubbles: true }))
          }
        }
      }

      await sleep(600)
    }

    return null
  }

  try {
    console.log('[RealPost-Inject] Starting post injection on', window.location.href)

    // Step 0: Scroll to top of group page to ensure composer is in view
    window.scrollTo({ top: 0, behavior: 'instant' })
    await sleep(1500)

    // Step 1: Check if Create Post dialog is already open
    let dialog = findCreatePostDialog()

    if (!dialog) {
      const trigger = findComposerTrigger()
      if (!trigger) {
        const err = 'Không tìm thấy ô "Bạn viết gì đi..." trên Facebook Group. Hãy đảm bảo tài khoản đã tham gia nhóm và có quyền đăng bài.'
        chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: { success: false, error: err } }).catch(() => {})
        return { success: false, error: err }
      }

      console.log('[RealPost-Inject] Clicking composer trigger:', trigger)
      trigger.scrollIntoView({ behavior: 'smooth', block: 'center' })
      await sleep(600)
      trigger.click()

      // Wait up to 10s for dialog to open
      const openStart = Date.now()
      while (Date.now() - openStart < 10000) {
        dialog = findCreatePostDialog()
        if (dialog) break
        await sleep(400)
      }

      if (!dialog) {
        // Retry with dispatchEvent
        console.log('[RealPost-Inject] Retrying trigger click with dispatchEvent...')
        trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
        const retryStart = Date.now()
        while (Date.now() - retryStart < 6000) {
          dialog = findCreatePostDialog()
          if (dialog) break
          await sleep(400)
        }
      }
    }

    if (!dialog) {
      const err = 'Không mở được hộp thoại "Tạo bài viết" trên Facebook ([role="dialog"] không xuất hiện sau khi click). Vui lòng kiểm tra quyền đăng bài trong nhóm.'
      chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: { success: false, error: err } }).catch(() => {})
      return { success: false, error: err }
    }

    console.log('[RealPost-Inject] Create Post dialog is open and confirmed!')

    // Step 2: Find contenteditable editor INSIDE dialog
    let editor = null
    const edStart = Date.now()
    while (Date.now() - edStart < 8000) {
      editor = dialog.querySelector(
        '[contenteditable="true"][data-lexical-editor="true"], [role="textbox"][contenteditable="true"], [contenteditable="true"]'
      )
      if (editor) break
      await sleep(300)
    }

    if (!editor) {
      const err = 'Không tìm thấy khung soạn thảo văn bản bên trong hộp thoại Tạo bài viết.'
      chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: { success: false, error: err } }).catch(() => {})
      return { success: false, error: err }
    }

    console.log('[RealPost-Inject] Editor found, inputting post content...')
    editor.focus()
    await sleep(400)

    const fullText = title ? `${title}\n\n${content}` : content

    // Set selection inside editor
    try {
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(editor)
      sel.removeAllRanges()
      sel.addRange(range)
    } catch (e) {
      console.warn('[RealPost-Inject] Selection range warning:', e)
    }

    // 1. Try execCommand (standard for Lexical/DraftJS in Chromium)
    let execOk = false
    try {
      execOk = document.execCommand('insertText', false, fullText)
    } catch {
      execOk = false
    }

    // 2. Try Clipboard paste fallback
    if (!execOk || !editor.textContent || editor.textContent.length < 5) {
      try {
        const dt = new DataTransfer()
        dt.setData('text/plain', fullText)
        editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
      } catch { /* ignore */ }
    }

    await sleep(600)

    // 3. Try InputEvent beforeinput fallback
    if (!editor.textContent || editor.textContent.length < 5) {
      try {
        editor.dispatchEvent(new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: fullText,
        }))
      } catch { /* ignore */ }
    }

    // Nudge editor with input event
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ' }))
    await randomDelay(600, 1200)

    // Step 3: Attach images (if any)
    const imageFiles = (preloadedImages || [])
      .map((img) => dataUrlToFile(img.dataUrl, img.name, img.type))
      .filter(Boolean)

    if (imageFiles.length > 0) {
      console.log(`[RealPost-Inject] Attaching ${imageFiles.length} image(s)...`)

      // Check if file input already exists in dialog
      let fileInput = dialog.querySelector('input[type="file"]')

      if (!fileInput) {
        // Find Photo/video button in dialog
        const photoSelectors = [
          'div[aria-label="Ảnh/video"]',
          'div[aria-label="Photo/video"]',
          'div[aria-label*="Ảnh/video"]',
          'div[aria-label*="Photo/video"]',
          'div[aria-label*="Ảnh"]',
          'div[aria-label*="photo" i]',
          'div[aria-label*="video" i]',
          'div[data-pressable-container="true"] [aria-label*="Ảnh"]',
        ]

        let photoBtn = null
        for (const sel of photoSelectors) {
          photoBtn = dialog.querySelector(sel)
          if (photoBtn) break
        }

        // If not found by aria-label, search by text inside dialog
        if (!photoBtn) {
          const dialogButtons = Array.from(dialog.querySelectorAll('div[role="button"]'))
          photoBtn = dialogButtons.find((b) => {
            const t = (b.textContent || b.innerText || '').toLowerCase()
            return t.includes('ảnh/video') || t.includes('photo/video') || t.includes('ảnh') || t.includes('photo')
          })
        }

        if (photoBtn) {
          console.log('[RealPost-Inject] Clicking Photo/Video button in dialog...')
          photoBtn.click()
          await sleep(1500)
        }
      }

      // Wait for file input to appear (up to 8s)
      const fileWait = Date.now()
      while (Date.now() - fileWait < 8000) {
        fileInput = dialog.querySelector('input[type="file"]') || document.querySelector('input[type="file"][accept*="image"]')
        if (fileInput) break
        await sleep(400)
      }

      if (fileInput) {
        console.log('[RealPost-Inject] Found file input, assigning files via DataTransfer...')
        const dt = new DataTransfer()
        for (const f of imageFiles) {
          dt.items.add(f)
        }

        try {
          fileInput.files = dt.files
        } catch {
          Object.defineProperty(fileInput, 'files', {
            value: dt.files,
            configurable: true,
          })
        }

        fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
        fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }))

        // Also try drop event on dropzone
        const dropZone = dialog.querySelector('div[role="button"][tabindex="0"]') || dialog
        if (dropZone) {
          try {
            dropZone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }))
            dropZone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
            dropZone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
          } catch { /* ignore */ }
        }

        console.log('[RealPost-Inject] Waiting for Facebook to upload images (4s)...')
        await sleep(4000)
      } else {
        console.warn('[RealPost-Inject] File input not found in dialog, proceeding with text only')
      }
    }

    // Step 4: Wait for Submit button to become ENABLED and click it
    console.log('[RealPost-Inject] Searching for enabled Submit button in dialog...')
    const submitBtn = await waitForSubmitButton(dialog, 30000)

    if (!submitBtn) {
      const err = 'Không tìm thấy nút "Đăng" hoặc nút "Đăng" vẫn bị mờ (disabled) sau 30 giây. Vui lòng kiểm tra nhóm có bắt buộc trả lời câu hỏi khảo sát hoặc duyệt trước không.'
      chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: { success: false, error: err } }).catch(() => {})
      return { success: false, error: err }
    }

    console.log('[RealPost-Inject] Clicking enabled Submit button:', submitBtn)
    submitBtn.click()

    // Wait up to 15s for dialog to close
    let isClosed = false
    const closeStart = Date.now()
    while (Date.now() - closeStart < 15000) {
      if (!document.contains(dialog) || dialog.getAttribute('aria-hidden') === 'true' || dialog.offsetParent === null) {
        isClosed = true
        break
      }
      await sleep(500)
    }

    console.log('[RealPost-Inject] Post submitted! Dialog closed:', isClosed)
    const result = {
      success: true,
      message: isClosed ? 'Đã đăng bài thành công lên Facebook' : 'Đã bấm nút Đăng bài lên Facebook',
    }
    chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result }).catch(() => {})
    return result
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[RealPost-Inject] Error:', errorMsg)
    const failResult = { success: false, error: errorMsg }
    chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: failResult }).catch(() => {})
    return failResult
  }
}
