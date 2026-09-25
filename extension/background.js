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
  const randomDelay = (min = 600, max = 1200) => sleep(Math.floor(Math.random() * (max - min) + min))

  // Convert base64 Data URL to File (avoids any network request inside Facebook page)
  function dataUrlToFile(dataUrl, filename, mimeType) {
    try {
      const arr = dataUrl.split(',')
      const mime = mimeType || (arr[0].match(/:(.*?);/) || [])[1] || 'image/jpeg'
      const bstr = atob(arr[1])
      const u8arr = new Uint8Array(bstr.length)
      for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i)
      return new File([u8arr], filename, { type: mime })
    } catch (e) {
      console.warn('[RealPost-Inject] dataUrlToFile error:', e)
      return null
    }
  }

  // Poll until el appears or timeout
  function waitEl(selector, rootEl, timeoutMs) {
    const root = rootEl || document
    return new Promise((resolve) => {
      const el = root.querySelector(selector)
      if (el) { resolve(el); return }
      const start = Date.now()
      const timer = setInterval(() => {
        const found = root.querySelector(selector)
        if (found || Date.now() - start > timeoutMs) {
          clearInterval(timer)
          resolve(found || null)
        }
      }, 250)
    })
  }

  // Wait for any selector to appear in document
  function waitAny(selectors, rootEl, timeoutMs) {
    const root = rootEl || document
    return new Promise((resolve) => {
      for (const sel of selectors) {
        const el = root.querySelector(sel)
        if (el) { resolve(el); return }
      }
      const start = Date.now()
      const timer = setInterval(() => {
        for (const sel of selectors) {
          const el = root.querySelector(sel)
          if (el) { clearInterval(timer); resolve(el); return }
        }
        if (Date.now() - start > timeoutMs) { clearInterval(timer); resolve(null) }
      }, 250)
    })
  }

  // Check whether dialog is the "Create Post" (Tạo bài viết) dialog, not chat/notifications
  function isCreatePostDialog(d) {
    if (!d) return false
    // Must NOT be inside a chat sidebar
    if (d.closest('[data-pagelet="MercuryFixedBottomContainer"]')) return false
    if (d.closest('[aria-label*="Chat" i]')) return false
    const ariaLabel = (d.getAttribute('aria-label') || '').toLowerCase()
    // Positive signals
    if (
      ariaLabel.includes('tạo bài viết') ||
      ariaLabel.includes('create post') ||
      ariaLabel.includes('create a post')
    ) return true
    // Has a contenteditable inside AND the dialog's text/aria mentions đăng
    const hasEditor = !!d.querySelector('[contenteditable="true"]')
    const innerText = (d.innerText || d.textContent || '').toLowerCase()
    if (hasEditor && (
      innerText.includes('tạo bài viết') ||
      innerText.includes('create post') ||
      innerText.includes('đăng bài') ||
      innerText.includes('bạn viết gì đi') ||
      innerText.includes("what's on your mind") ||
      innerText.includes('write something')
    )) return true
    return false
  }

  function findOpenCreatePostDialog() {
    const allDialogs = Array.from(document.querySelectorAll('[role="dialog"]'))
    return allDialogs.find(isCreatePostDialog) || null
  }

  // Find the "Bạn viết gì đi..." composer trigger bar (NOT cover photo/header/article/comment)
  function findComposerBar() {
    // Words that should NEVER be the composer bar - explicitly block these
    const blockedButtonTexts = [
      'chỉnh sửa', 'edit', 'share', 'chia sẻ', 'like', 'thích',
      'comment', 'bình luận', 'follow', 'theo dõi', 'join', 'tham gia',
      'invite', 'mời', 'more', 'xem thêm', 'see more', 'close', 'đóng',
    ]

    // Blocks that ALWAYS indicate a cover/profile header area - never touch these
    function isInCoverOrHeader(el) {
      if (!el) return false
      // Facebook cover photo pagelots
      const coverPagelets = [
        '[data-pagelet*="Cover"]',
        '[data-pagelet*="cover"]',
        '[data-pagelet*="ProfilePhoto"]',
        '[data-pagelet*="CoverPhoto"]',
        '[data-pagelet*="ProfileHero"]',
        '[data-pagelet*="GroupHeader"]',
        '[data-pagelet*="PageHeader"]',
      ]
      for (const sel of coverPagelets) {
        if (el.closest(sel)) return true
      }
      // If within the first 300px from top of page, it's likely the header/cover area
      const rect = el.getBoundingClientRect()
      if (rect.top < 0 || rect.bottom < 0) return false // Off screen - might be scrolled
      // If element is very near the top of the viewport it's likely in the cover/header
      // (only apply this check if page is scrolled to top, i.e. scrollY < 100)
      if (window.scrollY < 100 && rect.top < 200 && rect.bottom < 280) return true
      return false
    }

    // Strategy A: Specific inline-composer pagelet names ONLY (not generic "*Composer*")
    const safePagelots = [
      'div[data-pagelet="GroupInlineComposer"]',
      'div[data-pagelet="FeedInlineComposer"]',
      'div[data-pagelet="GroupDiscussionInlineComposer"]',
    ]
    for (const sel of safePagelots) {
      const pagelet = document.querySelector(sel)
      if (pagelet && !isInCoverOrHeader(pagelet)) {
        console.log('[RealPost-Inject] Found safe pagelet:', sel)
        const trigger =
          pagelet.querySelector('div[role="button"][tabindex="0"]') ||
          pagelet.querySelector('[role="button"]')
        if (trigger && !isInCoverOrHeader(trigger)) return trigger
      }
    }

    // Strategy B: Scan ALL spans in [role="main"], match exact composer phrases,
    // with strict exclusions including cover/header area
    const mainEl = document.querySelector('[role="main"]') || document.body
    const composerPhrases = [
      'bạn viết gì đi',
      'viết gì đó',
      'bạn đang nghĩ gì',
      "what's on your mind",
      'write something to the group',
      'write something...',
      'create a public post',
    ]

    // Get all spans NOT in excluded zones, in DOM order (composer appears before feed)
    const allSpans = Array.from(mainEl.querySelectorAll('span'))
    for (const span of allSpans) {
      // NEVER match if inside articles, forms, navigation, comments, or cover areas
      if (
        span.closest('[role="article"]') ||
        span.closest('form') ||
        span.closest('[role="navigation"]') ||
        span.closest('header') ||
        span.closest('[aria-label*="Bình luận" i]') ||
        span.closest('[aria-label*="Comment" i]') ||
        span.closest('[data-pagelet="GroupFeed"]') ||
        span.closest('[data-pagelet^="FeedUnit"]') ||
        isInCoverOrHeader(span)
      ) continue

      const txt = (span.textContent || '').trim().toLowerCase()
      if (!composerPhrases.some((p) => txt === p)) continue

      // Found a matching span - now find the nearest clickable container
      let el = span
      for (let depth = 0; depth < 8; depth++) {
        if (!el) break
        if (el.getAttribute('role') === 'button' || el.getAttribute('tabindex') === '0') {
          // Double-check it's not blocked
          const elText = (el.textContent || el.innerText || '').trim().toLowerCase()
          if (blockedButtonTexts.some((b) => elText === b)) break
          return el
        }
        el = el.parentElement
      }
      const closest = span.closest('[role="button"]')
      if (closest && !isInCoverOrHeader(closest)) return closest
    }

    // Strategy C: Find by scanning all [role="button"] elements visible in DOM,
    // picking those that directly contain the composer text, after strict filtering
    const allButtons = Array.from(document.querySelectorAll('[role="button"]'))
    for (const btn of allButtons) {
      if (
        btn.closest('[role="article"]') ||
        btn.closest('[data-pagelet="GroupFeed"]') ||
        btn.closest('[aria-label*="Bình luận" i]') ||
        btn.closest('[aria-label*="Comment" i]') ||
        isInCoverOrHeader(btn)
      ) continue

      const btnText = (btn.textContent || btn.innerText || '').trim().toLowerCase()
      // Must be blocked text check first
      if (blockedButtonTexts.some((b) => btnText === b || btnText.startsWith(b + ' '))) continue

      if (composerPhrases.some((p) => btnText === p || btnText.startsWith(p))) {
        return btn
      }
    }

    return null
  }

  // Send text reliably into a Lexical/DraftJS contenteditable
  async function injectText(editor, text) {
    editor.focus()
    await sleep(300)

    // Step 1: Clear any pre-existing text or placeholder in editor
    try {
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(editor)
      sel.removeAllRanges()
      sel.addRange(range)
      document.execCommand('delete', false, null)
      await sleep(150)
    } catch { /* ignore */ }

    // Step 2: Use Clipboard paste FIRST (preserves paragraphs and linebreaks in Lexical)
    try {
      const dt = new DataTransfer()
      dt.setData('text/plain', text)
      editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
      await sleep(500)

      // If paste succeeded, exit immediately! Do NOT run any fallback methods!
      if (editor.textContent && editor.textContent.trim().length > 10) {
        editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
        return true
      }
    } catch (e) {
      console.warn('[RealPost-Inject] Paste event warning:', e)
    }

    // Step 3: ONLY if editor is STILL empty, try beforeinput with dataTransfer
    if (!editor.textContent || editor.textContent.trim().length < 10) {
      try {
        const dt = new DataTransfer()
        dt.setData('text/plain', text)
        editor.dispatchEvent(new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertFromPaste',
          dataTransfer: dt,
        }))
        await sleep(500)
        if (editor.textContent && editor.textContent.trim().length > 10) {
          editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
          return true
        }
      } catch { /* ignore */ }
    }

    // Step 4: ONLY as absolute last resort if editor is STILL completely empty
    if (!editor.textContent || editor.textContent.trim().length < 10) {
      try {
        const lines = text.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].length > 0) {
            document.execCommand('insertText', false, lines[i])
          }
          if (i < lines.length - 1) {
            document.execCommand('insertParagraph', false, null)
          }
        }
        await sleep(300)
      } catch { /* ignore */ }
    }

    editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
    return (editor.textContent || '').trim().length > 10
  }

  // Wait for the Đăng/Post button to be enabled inside dialog
  async function waitForEnabledPostButton(dlg, timeoutMs = 25000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const btns = Array.from(dlg.querySelectorAll('div[role="button"], button'))
      for (const b of btns.reverse()) {
        const aria = (b.getAttribute('aria-label') || '').trim()
        const txt = (b.textContent || b.innerText || '').trim()
        const isPostBtn = (
          aria === 'Đăng' || aria === 'Post' || aria === 'Share' || aria === 'Chia sẻ' ||
          txt === 'Đăng' || txt === 'Post' || txt === 'Share' || txt === 'Chia sẻ'
        )
        if (!isPostBtn) continue
        const disabled = b.getAttribute('aria-disabled') === 'true' ||
          b.hasAttribute('disabled') || b.getAttribute('disabled') !== null
        if (!disabled) return b
      }
      // Nudge editor every 2s to ensure React state is updated
      if ((Date.now() - start) % 2000 < 300) {
        const ed = dlg.querySelector('[contenteditable="true"]')
        if (ed) {
          ed.focus()
          ed.dispatchEvent(new InputEvent('input', { bubbles: true }))
        }
      }
      await sleep(400)
    }
    return null
  }

  // ─── MAIN FLOW ────────────────────────────────────────────────────────────

  try {
    console.log('[RealPost-Inject] Start on:', window.location.href)

    // Scroll to TOP so composer bar is at the top of the viewport
    window.scrollTo(0, 0)
    await sleep(2000) // Let Facebook finish rendering after page load

    // Check if Create Post dialog is already open
    let dialog = findOpenCreatePostDialog()
    console.log('[RealPost-Inject] Pre-existing dialog:', !!dialog)

    if (!dialog) {
      // Find the composer bar ("Bạn viết gì đi...")
      const composerBar = findComposerBar()
      if (!composerBar) {
        const err = 'Không tìm thấy ô soạn bài viết "Bạn viết gì đi..." trên trang nhóm Facebook. Đảm bảo tài khoản đã tham gia nhóm và tab đang mở đúng trang nhóm.'
        chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: { success: false, error: err } }).catch(() => {})
        return { success: false, error: err }
      }

      console.log('[RealPost-Inject] Composer bar found:', composerBar.tagName, composerBar.getAttribute('data-pagelet'))

      // Scroll composer bar into view and click it
      composerBar.scrollIntoView({ block: 'center' })
      await sleep(500)
      composerBar.click()

      // Wait up to 8s for dialog to appear
      const t1 = Date.now()
      while (Date.now() - t1 < 8000 && !dialog) {
        await sleep(300)
        const candidate = findOpenCreatePostDialog()
        if (candidate) dialog = candidate
      }

      if (!dialog) {
        // One more attempt with MouseEvent
        composerBar.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        const t2 = Date.now()
        while (Date.now() - t2 < 5000 && !dialog) {
          await sleep(300)
          const candidate = findOpenCreatePostDialog()
          if (candidate) dialog = candidate
        }
      }
    }

    if (!dialog) {
      const err = 'Modal "Tạo bài viết" không mở được sau khi click. Vui lòng kiểm tra quyền đăng bài trong nhóm hoặc thử thao tác thủ công.'
      chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: { success: false, error: err } }).catch(() => {})
      return { success: false, error: err }
    }

    console.log('[RealPost-Inject] Create Post dialog confirmed open!')

    // ── STEP 2: Find editor inside dialog ──
    const editor = await waitEl('[contenteditable="true"]', dialog, 8000)

    if (!editor) {
      const err = 'Không tìm thấy khung soạn thảo bên trong hộp thoại Tạo bài viết.'
      chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: { success: false, error: err } }).catch(() => {})
      return { success: false, error: err }
    }

    console.log('[RealPost-Inject] Editor found. Injecting text...')
    const fullText = title ? `${title}\n\n${content}` : content
    await injectText(editor, fullText)
    await randomDelay(500, 900)

    // ── STEP 3: Attach images ──
    const imageFiles = (preloadedImages || []).map((img) => dataUrlToFile(img.dataUrl, img.name, img.type)).filter(Boolean)
    if (imageFiles.length > 0) {
      console.log(`[RealPost-Inject] Attaching ${imageFiles.length} image(s)...`)

      // Try to find file input already in dialog
      let fileInput = dialog.querySelector('input[type="file"]')

      if (!fileInput) {
        // Click Photo/Video button inside dialog
        const photoBtn = await waitAny([
          'div[aria-label="Ảnh/video"]',
          'div[aria-label="Photo/video"]',
          'div[aria-label="Photo or video"]',
          '[aria-label*="Photo"]',
          '[aria-label*="Ảnh"]',
        ], dialog, 3000)

        if (!photoBtn) {
          // Try by text
          const dlgBtns = Array.from(dialog.querySelectorAll('div[role="button"]'))
          const pb = dlgBtns.find((b) => {
            const t = (b.textContent || b.innerText || '').toLowerCase()
            return t.includes('ảnh') || t.includes('photo') || t.includes('hình')
          })
          if (pb) { pb.click(); await sleep(1500) }
        } else {
          photoBtn.click()
          await sleep(1500)
        }

        fileInput = await waitEl('input[type="file"]', dialog, 5000) ||
          await waitEl('input[type="file"]', document, 3000)
      }

      if (fileInput) {
        const dt = new DataTransfer()
        imageFiles.forEach((f) => dt.items.add(f))
        try { fileInput.files = dt.files } catch {
          Object.defineProperty(fileInput, 'files', { value: dt.files, configurable: true })
        }
        fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
        fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
        console.log('[RealPost-Inject] Images assigned, waiting for upload...')
        await sleep(4000)
      } else {
        console.warn('[RealPost-Inject] file input not found, posting without images')
      }
    }

    // ── STEP 4: Click enabled Post/Đăng button ──
    console.log('[RealPost-Inject] Waiting for Post button to be enabled...')
    const postBtn = await waitForEnabledPostButton(dialog, 25000)

    if (!postBtn) {
      const err = 'Nút "Đăng" không sáng lên sau 25 giây. Có thể bài viết trống hoặc nhóm yêu cầu trả lời câu hỏi trước khi đăng.'
      chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: { success: false, error: err } }).catch(() => {})
      return { success: false, error: err }
    }

    console.log('[RealPost-Inject] Clicking Post button...')
    postBtn.click()

    // Wait up to 12s for dialog to close (confirm post submitted)
    let confirmed = false
    const t3 = Date.now()
    while (Date.now() - t3 < 12000) {
      if (!document.contains(dialog) || dialog.offsetParent === null) {
        confirmed = true
        break
      }
      await sleep(500)
    }

    const result = { success: true, message: confirmed ? 'Đã đăng bài thành công' : 'Đã bấm nút Đăng (chờ xác nhận)' }
    console.log('[RealPost-Inject] Done!', result.message)
    chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result }).catch(() => {})
    return result
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[RealPost-Inject] Fatal error:', errorMsg)
    const failResult = { success: false, error: errorMsg }
    chrome.runtime.sendMessage({ type: 'REALPOST_POST_RESULT', result: failResult }).catch(() => {})
    return failResult
  }
}


