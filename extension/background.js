// ============================================================
// RealPost AI Bridge — Background Service Worker (Manifest V3)
// ============================================================

const POLL_ALARM_NAME = 'realpost-poll'
const POLL_INTERVAL_MINUTES = 1

// Active processing tracker to prevent duplicate concurrent runs
const activeSchedules = new Set()

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
      if (activeSchedules.has(schedule.id)) {
        console.log('[RealPost] Schedule already processing, skipping duplicate:', schedule.id)
        continue
      }

      activeSchedules.add(schedule.id)
      try {
        await processSchedule(schedule, config)
      } finally {
        activeSchedules.delete(schedule.id)
      }

      // Human-like delay between posts: 30-60 seconds
      await sleep(randomBetween(30_000, 60_000))
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
    // Thêm biên độ an toàn 60 giây để bắt kịp mọi lịch vừa bấm Đăng ngay hoặc lệch đồng hồ
    const safeNow = new Date(Date.now() + 60_000).toISOString()
    const url = `${cfg.supabaseUrl}/rest/v1/schedules?status=eq.pending&scheduled_at=lte.${encodeURIComponent(safeNow)}&select=*,generated_posts(id,title,content,selected_images),properties(id,title,images)&limit=5`
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
// IMAGE FETCHER & BASE64 CONVERTER (Bypasses Facebook CSP)
// ============================================================
function arrayBufferToBase64(buffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, chunk)
  }
  return btoa(binary)
}

async function fetchImagesAsBase64(imageUrls, supabaseUrl = '') {
  if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) return []

  const targetUrls = imageUrls.slice(0, 10)
  console.log(`[RealPost] Đang tải song song ${targetUrls.length} ảnh...`)

  const tasks = targetUrls.map(async (rawUrl, i) => {
    let url = (rawUrl || '').trim()
    if (!url || typeof url !== 'string') return null

    // 1. Nếu đã là Base64 Data URL: dùng trực tiếp
    if (url.startsWith('data:')) {
      const mime = (url.match(/:(.*?);/) || [])[1] || 'image/jpeg'
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
      return {
        name: `bds_photo_${Date.now()}_${i + 1}.${ext}`,
        type: mime,
        dataUrl: url,
      }
    }

    // 2. Nếu là đường dẫn tương đối (Supabase Storage path)
    if (url.startsWith('/') && supabaseUrl) {
      const base = supabaseUrl.replace(/\/+$/, '')
      url = `${base}${url}`
    }

    // 3. Tải từ HTTP/HTTPS
    try {
      const res = await fetch(url)
      if (!res.ok) {
        console.warn(`[RealPost] Tải ảnh thất bại HTTP ${res.status}:`, url)
        return null
      }
      const contentType = res.headers.get('content-type') || 'image/jpeg'
      const buffer = await res.arrayBuffer()
      const base64Data = arrayBufferToBase64(buffer)
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'

      return {
        name: `bds_photo_${Date.now()}_${i + 1}.${ext}`,
        type: contentType,
        dataUrl: `data:${contentType};base64,${base64Data}`,
      }
    } catch (err) {
      console.warn(`[RealPost] Lỗi tải ảnh ${url}:`, err)
      return null
    }
  })

  const results = await Promise.all(tasks)
  const list = results.filter(Boolean)
  console.log(`[RealPost] Đã tải hoàn tất ${list.length}/${targetUrls.length} ảnh thành công!`)
  return list
}

// ============================================================
// PROCESS A SINGLE SCHEDULE
// ============================================================
async function processSchedule(schedule, config) {
  console.log('[RealPost] Processing schedule:', schedule.id)

  // Mark status as 'posting'
  await updateScheduleStatus(schedule.id, 'posting', null, config)

  let fbTabId = null

  try {
    const post = Array.isArray(schedule.generated_posts)
      ? schedule.generated_posts[0]
      : schedule.generated_posts
    if (!post) throw new Error('Dữ liệu bài viết bị thiếu (Post data missing)')

    const prop = Array.isArray(schedule.properties)
      ? schedule.properties[0]
      : schedule.properties

    const rawImages = (post.selected_images && post.selected_images.length > 0)
      ? post.selected_images
      : (prop?.images ?? [])

    console.log('[RealPost] Bắt đầu mở tab Facebook và tải ảnh song song...')

    // TỐI ƯU TỐC ĐỘ: Mở tab Facebook NGAY LẬP TỨC và tải ảnh nền song song (Parallel)
    // Người dùng bấm "Đăng ngay" là tab Facebook bật lên ngay, không bị delay!
    const [fbTabIdResult, preloadedImages] = await Promise.all([
      getOrCreateFacebookTab(schedule.target_group_url, config),
      fetchImagesAsBase64(rawImages, config.supabaseUrl),
    ])
    fbTabId = fbTabIdResult

    // Đợi 1.2 giây để trang Facebook render hoàn tất các phần tử ban đầu
    await sleep(1200)

    // Xác định danh sách cộng sự cần gắn thẻ (Ưu tiên từ schedule, fallback từ config)
    let collaborators = []
    if (Array.isArray(schedule.tagged_collaborators) && schedule.tagged_collaborators.length > 0) {
      collaborators = schedule.tagged_collaborators.filter((c) => c && c.active !== false && c.fb_uid)
    } else if (Array.isArray(config.taggedCollaborators) && config.taggedCollaborators.length > 0) {
      collaborators = config.taggedCollaborators.filter((c) => c && c.active !== false && c.fb_uid)
    }
    if (collaborators.length > 0) {
      console.log('[RealPost] Danh sách cộng sự gắn thẻ:', collaborators.map((c) => `${c.name} (${c.fb_uid})`).join(', '))
    }

    // Chuẩn bị payload gửi cho content script
    const postPayload = {
      action: 'REALPOST_INJECT_POST',
      scheduleId: schedule.id,
      content: post.content,
      title: post.title || prop?.title || '',
      property: prop || {},
      images: preloadedImages,
      rawImageUrls: rawImages,
      groupUrl: schedule.target_group_url,
      taggedCollaborators: collaborators,
    }

    // Gửi lệnh đăng tới Content Script với cơ chế retry và inject lại script nếu tab mở từ trước
    let postResult = null
    let lastSendError = null

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[RealPost] Gửi lệnh INJECT_POST tới tab Facebook ${fbTabId} (lần ${attempt}/3)...`)
        postResult = await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(fbTabId, postPayload, (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError)
            } else {
              resolve(response)
            }
          })
        })
        if (postResult) break
      } catch (err) {
        lastSendError = err.message
        console.warn(`[RealPost] Gửi lệnh lần ${attempt} không thành công: ${err.message}`)

        // Tiêm lại content script vào tab phòng trường hợp tab đã load trước khi extension cập nhật
        try {
          await chrome.scripting.executeScript({
            target: { tabId: fbTabId },
            files: ['content-script.js'],
          })
        } catch (injectErr) {
          console.warn('[RealPost] Lỗi tiêm content-script.js:', injectErr.message)
        }
        await sleep(1500)
      }
    }

    // Nếu chưa nhận được kết quả ngay, đợi kết quả qua tin nhắn REALPOST_POST_RESULT (timeout 90s)
    if (!postResult || postResult.success === undefined) {
      console.log('[RealPost] Đang chờ kết quả phản hồi từ Facebook content script (tối đa 90s)...')
      postResult = await waitForPostResult(fbTabId, 90_000)
    }

    if (postResult && (postResult.success || postResult.detail?.success)) {
      await updateScheduleStatus(schedule.id, 'success', null, config)
      await createPostingLog(schedule.id, 'success', null, config)
      console.log('[RealPost] Schedule', schedule.id, '→ SUCCESS')

      if (chrome.notifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'RealPost AI Bridge',
          message: `Đã tự động đăng bài thành công lên Facebook: "${post.title || prop?.title || 'Bài viết BĐS'}"`,
        })
      }

      // Đợi 4 giây cho người dùng quan sát rồi tự động đóng tab Facebook
      await sleep(4000)
      try {
        if (fbTabId) await chrome.tabs.remove(fbTabId)
      } catch {}
    } else {
      const errDetail = postResult?.error || lastSendError || 'Không thể hoàn tất đăng bài trên Facebook'
      throw new Error(errDetail)
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
    // Nếu tab đã ở đúng URL nhóm Facebook và đã tải xong, chỉ cần kích hoạt focus mà không cần reload
    if (existingFbTab.url === groupUrl && existingFbTab.status === 'complete') {
      await chrome.tabs.update(existingFbTab.id, { active: visibleMode })
      await sleep(300)
      return existingFbTab.id
    }
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
        setTimeout(done, 500)
      }
    }).catch(() => {})

    setTimeout(done, 15_000) // fallback timeout
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
      ['supabaseUrl', 'supabaseAnonKey', 'accessToken', 'refreshToken', 'visibleMode', 'taggedCollaborators'],
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
// FACEBOOK PROFILE VERIFICATION MODULE (Kiểm tra UID & Profile)
// ============================================================
async function verifyFacebookProfile(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Vui lòng nhập link Facebook hoặc UID')
  }
  const raw = input.trim()

  // 1. Phân tích định danh (UID hoặc Username từ Link)
  let targetIdOrSlug = ''
  const idMatch = raw.match(/[?&]id=(\d+)/i)
  if (idMatch && idMatch[1]) {
    targetIdOrSlug = idMatch[1]
  } else {
    const urlMatch = raw.match(/(?:https?:\/\/)?(?:www\.|m\.|web\.)?facebook\.com\/(?:profile\.php\?id=\d+|people\/[^\/]+\/(\d+)|([a-zA-Z0-9\._]+))/i)
    if (urlMatch) {
      targetIdOrSlug = urlMatch[1] || urlMatch[2] || ''
    } else {
      targetIdOrSlug = raw.replace(/^@/, '')
    }
  }

  targetIdOrSlug = targetIdOrSlug.split('?')[0].split('/')[0].trim()

  if (!targetIdOrSlug) {
    throw new Error('Không nhận diện được link hoặc UID Facebook')
  }

  console.log('[RealPost] Đang kiểm tra tài khoản Facebook:', targetIdOrSlug)
  const targetUrl = `https://www.facebook.com/${targetIdOrSlug}`

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    })

    if (!res.ok && res.status === 404) {
      throw new Error('Tài khoản Facebook không tồn tại hoặc link bị sai (HTTP 404)')
    }

    const html = await res.text()

    // 2. Trích xuất UID từ HTML của Facebook
    let extractedUid = ''
    const uidMatch1 = html.match(/fb:\/\/profile\/(\d+)/i)
    const uidMatch2 = html.match(/"userID":"(\d+)"/i)
    const uidMatch3 = html.match(/"identifier":(\d+)/i)
    const uidMatch4 = html.match(/"entity_id":"(\d+)"/i)
    const uidMatch5 = html.match(/content="fb:\/\/page\/(\d+)"/i)
    const uidMatch6 = html.match(/facebook\.com\/profile\.php\?id=(\d+)/i)
    const uidMatch7 = html.match(/"owning_profile_id":"(\d+)"/i)
    const uidMatch8 = html.match(/"delegate_page_id":"(\d+)"/i)

    extractedUid = uidMatch1?.[1] || uidMatch2?.[1] || uidMatch3?.[1] || uidMatch4?.[1] ||
                   uidMatch5?.[1] || uidMatch6?.[1] || uidMatch7?.[1] || uidMatch8?.[1] || ''

    if (!extractedUid && /^\d{6,}$/.test(targetIdOrSlug)) {
      extractedUid = targetIdOrSlug
    }

    // 3. Trích xuất Tên hiển thị thật của tài khoản
    let extractedName = ''
    const titleMatch = html.match(/<title id="pageTitle">([^<]+)<\/title>/i) || html.match(/<title>([^<]+)<\/title>/i)
    if (titleMatch && titleMatch[1]) {
      let t = titleMatch[1].trim()
      t = t.replace(/\s*\|\s*Facebook$/i, '').replace(/\s*-\s*Facebook$/i, '').trim()
      if (t && !t.toLowerCase().includes('đăng nhập') && !t.toLowerCase().includes('log in') && !t.toLowerCase().includes('facebook')) {
        extractedName = t
      }
    }

    if (!extractedName) {
      const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || html.match(/content="([^"]+)"\s+property="og:title"/i)
      if (ogTitle && ogTitle[1]) {
        extractedName = ogTitle[1].replace(/\s*\|\s*Facebook$/i, '').trim()
      }
    }

    // 4. Trích xuất Avatar
    let avatarUrl = ''
    const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || html.match(/content="([^"]+)"\s+property="og:image"/i)
    if (ogImage && ogImage[1]) {
      avatarUrl = ogImage[1].replace(/&amp;/g, '&')
    }

    if (!extractedUid && !extractedName) {
      throw new Error('Không thể đọc thông tin tài khoản Facebook. Hãy kiểm tra lại link hoặc đảm bảo tài khoản đang mở công khai.')
    }

    return {
      success: true,
      verified: true,
      uid: extractedUid || targetIdOrSlug,
      name: extractedName || 'Tài khoản Facebook',
      username: /^\d+$/.test(targetIdOrSlug) ? '' : targetIdOrSlug,
      avatarUrl: avatarUrl || '',
    }
  } catch (err) {
    console.warn('[RealPost] Lỗi kiểm tra profile:', err)
    throw new Error(err.message || 'Không thể kiểm tra tài khoản Facebook')
  }
}

// ============================================================
// WEB APP BRIDGE & CONTENT SCRIPT MESSAGES
// ============================================================
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'REALPOST_VERIFY_FB_PROFILE') {
    verifyFacebookProfile(message.target)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }))
    return true
  }
  if (message.type === 'REALPOST_CONFIG') {
    const newCfg = {
      supabaseUrl: message.supabaseUrl,
      supabaseAnonKey: message.supabaseAnonKey,
      accessToken: message.accessToken,
      refreshToken: message.refreshToken,
      visibleMode: message.visibleMode ?? true,
    }
    if (message.taggedCollaborators !== undefined) {
      newCfg.taggedCollaborators = message.taggedCollaborators
    }
    setConfig(newCfg).then(() => {
      console.log('[RealPost] Config updated from web app (including collaborators)')
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'REALPOST_VERIFY_FB_PROFILE') {
    verifyFacebookProfile(message.target)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }))
    return true
  }
  if (message.type === 'REALPOST_PING') {
    sendResponse({ type: 'REALPOST_PONG', token: chrome.runtime.id })
    return true
  }
  if (message.type === 'REALPOST_CONFIG') {
    const newCfg = {
      supabaseUrl: message.supabaseUrl,
      supabaseAnonKey: message.supabaseAnonKey,
      accessToken: message.accessToken,
      refreshToken: message.refreshToken,
      visibleMode: message.visibleMode ?? true,
    }
    if (message.taggedCollaborators !== undefined) {
      newCfg.taggedCollaborators = message.taggedCollaborators
    }
    setConfig(newCfg).then(() => {
      console.log('[RealPost] Config updated via content script (including collaborators)')
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

  // Hỗ trợ Content script yêu cầu Background tải ảnh Base64
  if (message.action === 'FETCH_IMAGES_BASE64' || message.type === 'FETCH_IMAGES_BASE64') {
    getConfig().then((cfg) => {
      fetchImagesAsBase64(message.urls || message.imageUrls, cfg.supabaseUrl)
        .then((images) => sendResponse({ success: true, images }))
        .catch((err) => sendResponse({ success: false, error: err.message }))
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
        'https://*.netlify.app/*',
      ],
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
