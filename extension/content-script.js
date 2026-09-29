// ============================================================
// RealPost AI — Content Script
// Chạy trong context của Facebook & Web App (localhost, vercel...)
// ============================================================

const isFacebook = window.location.hostname.includes('facebook.com')

if (isFacebook) {
  // ────────────────────────────────────────────────────────────
  // 1. FACEBOOK COPILOT MODULE
  // ────────────────────────────────────────────────────────────
  console.log('[RealPost] Facebook Copilot script active on:', window.location.href)

  // Lắng nghe lệnh đăng bài từ Service Worker (background.js)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'REALPOST_INJECT_POST' || request.action === 'INJECT_POST') {
      console.log('[RealPost] Received posting command:', request.title || request.scheduleId)
      executeFacebookPost(request)
        .then((res) => {
          sendResponse({ success: true, detail: res })
          chrome.runtime.sendMessage({
            type: 'REALPOST_POST_RESULT',
            result: { success: true, detail: res },
          }).catch(() => {})
        })
        .catch((err) => {
          const errorMsg = err instanceof Error ? err.message : String(err)
          console.error('[RealPost] Post execution error:', errorMsg)
          sendResponse({ success: false, error: errorMsg })
          chrome.runtime.sendMessage({
            type: 'REALPOST_POST_RESULT',
            result: { success: false, error: errorMsg },
          }).catch(() => {})
        })
      return true // async
    }
  })

  // Tiện ích sleep
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
  }

  // Escape HTML utility
  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  // Định dạng inline: In đậm [B] (**...**), In nghiêng [I] (*...*)
  function formatInline(str) {
    let s = escapeHtml(str)
    // Bold: **text** hoặc __text__
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    s = s.replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic: *text* hoặc _text_
    s = s.replace(/(?<!\*)\*(?!\*)([^\*]+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    s = s.replace(/(?<!_)_(?!_)([^_]+?)(?<!_)_(?!_)/g, '<em>$1</em>')
    return s
  }

  // Chuyển Markdown sang HTML tương thích 100% với thanh công cụ Facebook Groups (H1 Header, Bold, Italic, Bullets)
  function markdownToFacebookHtml(markdownText, title) {
    let text = (markdownText || '').trim()
    const postTitle = (title || '').trim()

    let headerHtml = ''
    if (postTitle) {
      const cleanTitle = postTitle.replace(/^\s*(?:tiêu\s*đề|title)\s*[\:\-]\s*/i, '').trim()
      const lines = text.split('\n')
      const firstLine = lines[0]?.trim() || ''
      const cleanFirstLine = firstLine
        .replace(/^\s*#{1,6}\s*/, '')
        .replace(/^\s*(?:tiêu\s*đề|title)\s*[\:\-]\s*/i, '')
        .trim()
      if (cleanFirstLine.toLowerCase() === cleanTitle.toLowerCase()) {
        text = lines.slice(1).join('\n').trim()
      }
      headerHtml = `<h1>${escapeHtml(cleanTitle)}</h1>`
    }

    const rawBlocks = text.split(/\n\s*\n+/)
    const htmlBlocks = []
    if (headerHtml) {
      htmlBlocks.push(headerHtml)
    }

    for (const block of rawBlocks) {
      const trimmed = block.trim()
      if (!trimmed) continue

      const lines = trimmed.split('\n').map((l) => l.trim())

      // Heading Markdown (# hoặc ##) -> H1 hoặc H2
      if (lines.length === 1 && /^#{1,6}\s+/.test(lines[0])) {
        const level = lines[0].match(/^(#{1,6})\s+/)?.[1]?.length || 1
        const headingContent = lines[0].replace(/^#{1,6}\s+/, '').trim()
        const tag = level === 1 ? 'h1' : 'h2'
        htmlBlocks.push(`<${tag}>${formatInline(headingContent)}</${tag}>`)
        continue
      }

      // Bullet list thuần túy (- hoặc *)
      const isBulletList = lines.every((l) => /^[\-\*\•]\s+/.test(l))
      if (isBulletList) {
        const itemsHtml = lines
          .map((l) => `<li>${formatInline(l.replace(/^[\-\*\•]\s+/, '').trim())}</li>`)
          .join('')
        htmlBlocks.push(`<ul>${itemsHtml}</ul>`)
        continue
      }

      // Numbered list thuần túy (1., 2.)
      const isNumberedList = lines.every((l) => /^\d+[\.\)]\s+/.test(l))
      if (isNumberedList) {
        const itemsHtml = lines
          .map((l) => `<li>${formatInline(l.replace(/^\d+[\.\)]\s+/, '').trim())}</li>`)
          .join('')
        htmlBlocks.push(`<ol>${itemsHtml}</ol>`)
        continue
      }

      // Blockquote (> hoặc ->)
      if (lines.every((l) => /^(?:>|\->|–>)\s*/.test(l))) {
        const quoteText = lines
          .map((l) => l.replace(/^(?:>|\->|–>)\s*/, '').trim())
          .join(' ')
        htmlBlocks.push(`<blockquote><p>${formatInline(quoteText)}</p></blockquote>`)
        continue
      }

      // Hỗn hợp tiêu đề đề mục + bullet list trong cùng 1 khối
      const hasListItems = lines.some((l) => /^[\-\*\•]\s+/.test(l))
      if (hasListItems) {
        let currentList = []
        for (const line of lines) {
          if (/^[\-\*\•]\s+/.test(line)) {
            currentList.push(`<li>${formatInline(line.replace(/^[\-\*\•]\s+/, '').trim())}</li>`)
          } else {
            if (currentList.length > 0) {
              htmlBlocks.push(`<ul>${currentList.join('')}</ul>`)
              currentList = []
            }
            if (line) {
              htmlBlocks.push(`<p>${formatInline(line)}</p>`)
            }
          }
        }
        if (currentList.length > 0) {
          htmlBlocks.push(`<ul>${currentList.join('')}</ul>`)
        }
        continue
      }

      // Đoạn văn thông thường (giữ ngắt dòng con bằng <br>)
      const paragraphContent = lines.map((l) => formatInline(l)).join('<br>')
      htmlBlocks.push(`<p>${paragraphContent}</p>`)
    }

    return htmlBlocks.join('')
  }

  // Chuyển đổi sang Plain Text sạch (không lộ thẻ HTML)
  function markdownToPlainText(markdownText, title) {
    let text = (markdownText || '').trim()
    const postTitle = (title || '').trim()

    if (postTitle) {
      const cleanTitle = postTitle.replace(/^\s*(?:tiêu\s*đề|title)\s*[\:\-]\s*/i, '').trim()
      const lines = text.split('\n')
      const firstLine = lines[0]?.trim() || ''
      const cleanFirstLine = firstLine
        .replace(/^\s*#{1,6}\s*/, '')
        .replace(/^\s*(?:tiêu\s*đề|title)\s*[\:\-]\s*/i, '')
        .trim()
      if (cleanFirstLine.toLowerCase() === cleanTitle.toLowerCase()) {
        text = lines.slice(1).join('\n').trim()
      }
      text = `${cleanTitle}\n\n${text}`
    }

    return text
  }

  // Tiện ích chuyển Base64 Data URL sang File object
  function dataUrlToFile(dataUrl, filename, mimeType) {
    try {
      const parts = dataUrl.split(',')
      const mime = mimeType || (parts[0].match(/:(.*?);/) ? parts[0].match(/:(.*?);/)[1] : 'image/jpeg')
      const bstr = atob(parts[1])
      let n = bstr.length
      const u8arr = new Uint8Array(n)
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n)
      }
      return new File([u8arr], filename, { type: mime })
    } catch (e) {
      console.warn('[RealPost] dataUrlToFile error:', e)
      return null
    }
  }

  // Hiển thị Floating Banner tiến trình trên giao diện Facebook
  function updateBanner(type, title, statusText, content) {
    let banner = document.getElementById('realpost-copilot-banner')
    if (!banner) {
      banner = document.createElement('div')
      banner.id = 'realpost-copilot-banner'
      banner.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 9999999;
        width: 380px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 10px 35px rgba(0,0,0,0.35);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        padding: 16px;
        color: #1f2937;
        border: 2px solid #2563eb;
      `
      document.body.appendChild(banner)
    }

    const badgeColor = type === 'success' ? '#22c55e' : type === 'warning' ? '#f59e0b' : '#2563eb'
    const badgeText = type === 'success' ? 'THÀNH CÔNG' : type === 'warning' ? 'CẦN LƯU Ý' : 'ĐANG XỬ LÝ'

    banner.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
        <div style="font-weight: 700; color: #2563eb; font-size: 13px; display: flex; align-items: center; gap: 6px;">
          🤖 RealPost AI Bridge
        </div>
        <span style="font-size: 10px; background: ${badgeColor}; color: white; padding: 2px 8px; border-radius: 99px; font-weight: 700;">
          ${badgeText}
        </span>
      </div>
      <div style="font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 4px;">
        ${title || 'Đăng bài BĐS'}
      </div>
      <div style="font-size: 12px; font-weight: 600; color: ${badgeColor}; margin-bottom: 8px;">
        ${statusText}
      </div>
      <div style="font-size: 11px; color: #6b7280; max-height: 80px; overflow-y: auto; background: #f3f4f6; padding: 6px; border-radius: 6px; white-space: pre-line;">
        ${content ? content.slice(0, 160) + '...' : ''}
      </div>
    `

    if (type === 'success') {
      setTimeout(() => {
        if (banner) banner.remove()
      }, 4500)
    }
  }

  // Kiểm tra xem hộp thoại có phải là modal Tạo bài viết (Create Post)
  // LƯU Ý: Sau khi gắn thẻ, innerText của dialog thay đổi (hiển thị tên người tag)
  // nên cần kiểm tra thêm: có editor + nút Đăng/Post = đây là compose dialog
  function isCreatePostDialog(d) {
    if (!d) return false
    if (d.closest('[data-pagelet="MercuryFixedBottomContainer"]')) return false
    if (d.closest('[aria-label*="Chat" i]')) return false
    const ariaLabel = (d.getAttribute('aria-label') || '').toLowerCase()
    if (
      ariaLabel.includes('tạo bài viết') ||
      ariaLabel.includes('create post') ||
      ariaLabel.includes('create a post')
    ) return true

    const hasEditor = !!d.querySelector('[contenteditable="true"]')
    const innerText = (d.innerText || d.textContent || '').toLowerCase()

    // Trường hợp thông thường: có editor + có từ khóa soạn bài
    if (hasEditor && (
      innerText.includes('tạo bài viết') ||
      innerText.includes('create post') ||
      innerText.includes('đăng bài') ||
      innerText.includes('bạn viết gì đi') ||
      innerText.includes("what's on your mind") ||
      innerText.includes('write something')
    )) return true

    // Trường hợp sau khi gắn thẻ: innerText KHÔNG còn chứa "Tạo bài viết" nữa
    // nhưng dialog vẫn là compose dialog vì có editor + nút Đăng/Post
    if (hasEditor) {
      const hasPostBtn = !!Array.from(d.querySelectorAll('div[role="button"], button')).find((el) => {
        const label = (el.getAttribute('aria-label') || el.innerText || el.textContent || '').trim().toLowerCase()
        return label === 'đăng' || label === 'post' || label === 'chia sẻ' || label === 'share'
      })
      if (hasPostBtn) return true
    }

    return false
  }

  // Tìm hộp thoại Tạo bài viết đang mở
  function findOpenCreatePostDialog() {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'))
    return dialogs.find(isCreatePostDialog) || null
  }

  // Chờ modal dialog của Facebook xuất hiện
  function waitForDialog(timeoutMs = 8000) {
    return new Promise((resolve) => {
      const existing = findOpenCreatePostDialog()
      if (existing) { resolve(existing); return }

      const start = Date.now()
      const timer = setInterval(() => {
        const found = findOpenCreatePostDialog()
        if (found || Date.now() - start > timeoutMs) {
          clearInterval(timer)
          resolve(found || null)
        }
      }, 300)
    })
  }

  // Tìm nút kích hoạt mở khung tạo bài viết ("Bạn viết gì đi...")
  async function findPostTrigger() {
    // 1. Kiểm tra trực tiếp các pagelet chuẩn của Facebook Groups
    const safePagelots = [
      'div[data-pagelet="GroupInlineComposer"]',
      'div[data-pagelet="FeedInlineComposer"]',
      'div[data-pagelet="GroupDiscussionInlineComposer"]',
    ]
    for (const sel of safePagelots) {
      const pagelet = document.querySelector(sel)
      if (pagelet) {
        const btn = pagelet.querySelector('div[role="button"][tabindex="0"]') ||
                    pagelet.querySelector('[role="button"]')
        if (btn) return btn
      }
    }

    // 2. Tìm theo text / aria-label phổ biến
    for (let i = 0; i < 15; i++) {
      const buttons = Array.from(document.querySelectorAll('div[role="button"], span, a[role="tab"]'))
      for (const el of buttons) {
        if (el.closest('[role="article"]') || el.closest('[aria-label*="Bình luận" i]') || el.closest('[aria-label*="Comment" i]')) {
          continue
        }
        const txt = (el.innerText || el.textContent || '').toLowerCase()
        const aria = (el.getAttribute('aria-label') || '').toLowerCase()
        const combined = `${txt} ${aria}`

        if (
          combined.includes('bạn viết gì đi') ||
          combined.includes('tạo bài viết công khai') ||
          combined.includes('tạo bài viết') ||
          combined.includes('viết gì đó') ||
          combined.includes('write something') ||
          combined.includes('create a public post') ||
          combined.includes('create a post')
        ) {
          return el.closest('div[role="button"]') || el
        }
      }
      await sleep(400)
    }

    return null
  }

  // Tìm contenteditable editor trong dialog hoặc document
  async function waitEditor(dialog, timeoutMs = 10000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const editor = (
        (dialog && dialog.querySelector('div[role="textbox"][contenteditable="true"]')) ||
        (dialog && dialog.querySelector('div[data-lexical-editor="true"]')) ||
        (dialog && dialog.querySelector('div[contenteditable="true"]')) ||
        document.querySelector('div[role="dialog"] div[contenteditable="true"]')
      )
      if (editor) return editor
      await sleep(300)
    }
    return null
  }

  // Điền văn bản vào Lexical editor với Header, Bold, Italic, Bullet lists
  async function injectTextIntoEditor(editor, plainText, richHtml) {
    editor.focus()
    await sleep(250)

    // Xóa nội dung mẫu nếu có
    try {
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(editor)
      sel.removeAllRanges()
      sel.addRange(range)
      document.execCommand('delete', false, null)
      await sleep(100)
    } catch {}

    // Bước 1: Thử ClipboardEvent paste với text/html và text/plain
    // Facebook Lexical parser tự động chuyển:
    // <h1> / <h2> -> Header (cỡ chữ lớn hơn, in đậm)
    // <strong> -> In đậm [B]
    // <em> -> In nghiêng [I]
    // <ul><li> -> Danh sách gạch đầu dòng
    // <blockquote> -> Trích dẫn Quote
    let success = false
    try {
      const dt = new DataTransfer()
      dt.setData('text/plain', plainText)
      dt.setData('text/html', richHtml)
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      })
      editor.dispatchEvent(pasteEvent)
      await sleep(500)

      if (editor.textContent && editor.textContent.trim().length > 10) {
        editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
        success = true
      }
    } catch (e) {
      console.warn('[RealPost] Paste event error:', e)
    }

    // Bước 2: Thử insertHTML qua execCommand nếu PasteEvent chưa được nhận
    if (!success || !editor.textContent || editor.textContent.trim().length < 10) {
      try {
        const ok = document.execCommand('insertHTML', false, richHtml)
        await sleep(300)
        if (ok && editor.textContent && editor.textContent.trim().length > 10) {
          editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
          success = true
        }
      } catch (err) {
        console.warn('[RealPost] insertHTML error:', err)
      }
    }

    // Bước 3: Fallback gõ từng dòng với insertParagraph
    if (!success || !editor.textContent || editor.textContent.trim().length < 10) {
      try {
        const lines = plainText.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (line) {
            document.execCommand('insertText', false, line)
          }
          if (i < lines.length - 1) {
            const ok = document.execCommand('insertParagraph', false, null)
            if (!ok) document.execCommand('insertLineBreak', false, null)
          }
        }
        await sleep(300)
      } catch (err) {
        console.warn('[RealPost] Fallback execCommand error:', err)
      }
    }

    editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
    return true
  }

  // Tải ảnh vào Facebook Composer
  async function uploadImagesToFacebook(dialog, images, rawImageUrls) {
    try {
      // 1. Chuẩn bị danh sách ảnh Base64
      let imageItems = Array.isArray(images) && images.length > 0 ? images : []

      // Nếu mảng images rỗng nhưng có rawImageUrls, yêu cầu Background Service Worker tải về
      if (imageItems.length === 0 && Array.isArray(rawImageUrls) && rawImageUrls.length > 0) {
        const urlsToFetch = rawImageUrls.slice(0, 8)
        console.log(`[RealPost] Yêu cầu Background tải ${urlsToFetch.length} ảnh BĐS qua Base64...`)
        try {
          const fetchResp = await chrome.runtime.sendMessage({
            action: 'FETCH_IMAGES_BASE64',
            urls: urlsToFetch,
          })
          if (fetchResp && fetchResp.success && Array.isArray(fetchResp.images)) {
            imageItems = fetchResp.images
          }
        } catch (fetchErr) {
          console.warn('[RealPost] FETCH_IMAGES_BASE64 failed:', fetchErr)
        }
      }

      if (imageItems.length === 0) {
        console.warn('[RealPost] Không có dữ liệu ảnh để đính kèm.')
        return false
      }

      // 2. Chuyển đổi dữ liệu ảnh thành các File objects
      const dt = new DataTransfer()
      for (let i = 0; i < imageItems.length; i++) {
        const item = imageItems[i]
        const dataUrl = item.dataUrl || (typeof item === 'string' ? item : null)
        if (!dataUrl) continue

        const ext = (item.type || '').includes('png') ? 'png' : 'jpg'
        const filename = item.name || `bds_photo_${Date.now()}_${i + 1}.${ext}`
        const file = dataUrlToFile(dataUrl, filename, item.type || 'image/jpeg')
        if (file) {
          dt.items.add(file)
        }
      }

      if (dt.files.length === 0) {
        console.warn('[RealPost] Không thể khởi tạo đối tượng File nào từ danh sách ảnh.')
        return false
      }

      console.log(`[RealPost] Đã chuẩn bị ${dt.files.length} file ảnh. Đang mở dropzone Facebook...`)

      // 3. Kích hoạt nút Ảnh/video để Facebook mở dropzone và render input[type="file"]
      // Tìm tất cả các candidate nút liên quan đến Ảnh/Video trong dialog
      const container = dialog || document
      const candidates = Array.from(container.querySelectorAll('div[role="button"], div[aria-label], button, span'))
      let photoBtn = null

      for (const btn of candidates) {
        const label = (btn.getAttribute('aria-label') || btn.innerText || btn.textContent || '').trim().toLowerCase()
        if (
          label.includes('ảnh/video') ||
          label.includes('photo/video') ||
          label.includes('photo or video') ||
          label.includes('thêm ảnh/video') ||
          label.includes('thêm ảnh') ||
          label.includes('add photo/video') ||
          label.includes('add photo')
        ) {
          photoBtn = btn.closest('div[role="button"]') || btn
          break
        }
      }

      if (photoBtn) {
        console.log('[RealPost] Nhấp nút Ảnh/Video trên giao diện Facebook...')
        photoBtn.click()
        await sleep(1500)
      } else {
        console.log('[RealPost] Không tìm thấy nút Ảnh/Video riêng biệt, kiểm tra trực tiếp input file...')
      }

      // 4. Tìm input file của Facebook
      let fileInput = container.querySelector('input[type="file"]') ||
                      document.querySelector('div[role="dialog"] input[type="file"]') ||
                      document.querySelector('input[type="file"][accept*="image"]') ||
                      document.querySelector('input[type="file"]')

      if (!fileInput) {
        // Chờ thêm 3 giây phòng trường hợp Facebook lazy-mount dropzone
        for (let t = 0; t < 6; t++) {
          await sleep(500)
          fileInput = container.querySelector('input[type="file"]') ||
                      document.querySelector('div[role="dialog"] input[type="file"]') ||
                      document.querySelector('input[type="file"]')
          if (fileInput) break
        }
      }

      if (!fileInput) {
        console.warn('[RealPost] Không tìm thấy input[type="file"] của Facebook.')
        return false
      }

      // 5. Gán file vào input và kích hoạt sự kiện
      try {
        fileInput.files = dt.files
      } catch {
        Object.defineProperty(fileInput, 'files', { value: dt.files, configurable: true })
      }

      fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
      console.log(`[RealPost] Đã truyền ${dt.files.length} file vào input của Facebook. Chờ tải preview...`)

      // Chờ Facebook render preview ảnh (3-6s tùy số lượng ảnh)
      const waitTime = Math.min(8000, 3000 + dt.files.length * 800)
      await sleep(waitTime)
      return true
    } catch (err) {
      console.error('[RealPost] Lỗi tải ảnh lên Facebook:', err)
      return false
    }
  }

  // ============================================================
  // TAGGING COLLABORATORS MODULE (So khớp UID chuẩn xác 100%)
  // ============================================================

  // Kiểm tra xem một DOM element (hoặc thẻ con bên trong nó) có chứa Facebook UID không
  function elementMatchesUid(el, uid, name) {
    if (!el || !uid) return false
    const uidStr = String(uid).trim()
    if (!uidStr) return false

    // 1. Kiểm tra qua HTML string / attributes trực tiếp của element
    const outer = el.outerHTML || ''
    if (outer.includes(uidStr)) return true

    // 2. Kiểm tra href và data-hovercard của tất cả thẻ <a> bên trong row
    const links = el.querySelectorAll ? Array.from(el.querySelectorAll('a')) : []
    for (const a of links) {
      const href = a.getAttribute('href') || ''
      const hovercard = a.getAttribute('data-hovercard') || ''
      if (href.includes(uidStr) || hovercard.includes(uidStr)) return true
    }

    // 3. Kiểm tra Base64 Relay ID (Facebook GraphQL thường mã hóa User:<uid>)
    try {
      const b64User = btoa(`User:${uidStr}`)
      const b64Raw = btoa(uidStr)
      if (outer.includes(b64User) || outer.includes(b64Raw)) return true
    } catch {}

    // 4. Kiểm tra qua React Fiber / Props của Facebook Comet
    try {
      const propKey = Object.keys(el).find((k) => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$'))
      if (propKey && el[propKey]) {
        const jsonStr = JSON.stringify(el[propKey], (k, v) => {
          if (k === 'children' && typeof v === 'object') return undefined
          return v
        })
        if (jsonStr && jsonStr.includes(uidStr)) return true
      }
    } catch {}

    // 5. Nếu không thấy UID nhưng tên hiển thị khớp chính xác và là kết quả duy nhất
    if (name) {
      const cleanName = name.trim().toLowerCase()
      const text = (el.innerText || el.textContent || '').trim().toLowerCase()
      if (text.includes(cleanName)) {
        return true
      }
    }

    return false
  }

  // Tìm nút "Gắn thẻ người khác" (Tag People) trong Composer Facebook
  async function findTagPeopleButton(dialog) {
    const root = dialog || document
    const candidates = Array.from(root.querySelectorAll('div[role="button"], button, div[aria-label]'))

    for (const el of candidates) {
      if (el.closest('[role="article"]') || el.closest('[aria-label*="Bình luận" i]')) continue
      const label = (el.getAttribute('aria-label') || el.innerText || el.textContent || '').trim().toLowerCase()

      if (
        label.includes('gắn thẻ người khác') ||
        label.includes('gắn thẻ bạn bè') ||
        label.includes('gắn thẻ người') ||
        label.includes('tag people') ||
        label.includes('tag friends') ||
        label === 'gắn thẻ' ||
        label === 'tag'
      ) {
        return el.closest('div[role="button"]') || el
      }
    }

    // Nếu không thấy, kiểm tra nút "Xem thêm" (3 dấu chấm) trong thanh công cụ composer
    const moreBtn = candidates.find((el) => {
      const label = (el.getAttribute('aria-label') || el.innerText || '').toLowerCase()
      return label.includes('xem thêm') || label.includes('more')
    })
    if (moreBtn) {
      moreBtn.click()
      await sleep(600)
      return findTagPeopleButton(dialog)
    }

    return null
  }

  // Mô phỏng tương tác nhấp chuột hoàn chỉnh cho Facebook Comet (React 18 / CometPressable)
  async function clickElementComet(element) {
    if (!element) return false

    try {
      element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
    } catch {}
    await sleep(150)

    const rect = element.getBoundingClientRect()
    const x = Math.max(1, rect.left + rect.width / 2)
    const y = Math.max(1, rect.top + rect.height / 2)

    // Xác định phần tử bề mặt tại đúng tọa độ (x, y) - nơi con trỏ chuột thực tế sẽ chạm vào
    // QUAN TRỌNG: Nếu hitTarget nằm ngoài dialog (tức là rơi vào backdrop/overlay),
    // phải fallback về element gốc để tránh click nhầm vào vùng dismiss
    let hitTarget = element
    if (x > 0 && y > 0 && x < window.innerWidth && y < window.innerHeight) {
      const pointTarget = document.elementFromPoint(x, y)
      if (pointTarget) {
        // Kiểm tra hitTarget nằm trong cùng dialog hoặc là con cháu của element
        const elementDialog = element.closest('div[role="dialog"]')
        const hitDialog = pointTarget.closest('div[role="dialog"]')
        if (element.contains(pointTarget) || pointTarget.contains(element) ||
            (elementDialog && hitDialog && elementDialog === hitDialog)) {
          hitTarget = pointTarget
        } else {
          // hitTarget nằm ngoài dialog → không an toàn, dùng element gốc
          console.log('[RealPost] elementFromPoint trả về phần tử ngoài dialog, fallback về element gốc')
        }
      }
    }

    try {
      element.focus()
    } catch {}

    const mouseInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x + window.screenX,
      screenY: y + window.screenY,
      buttons: 1,
      button: 0,
    }

    const pointerInit = {
      ...mouseInit,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      width: 1,
      height: 1,
      pressure: 0.5,
    }

    // Chuỗi sự kiện Pointer & Mouse đầy đủ để kích hoạt máy trạng thái CometPressable:
    // pointerover -> pointerenter -> mouseover -> pointerdown -> mousedown -> pointerup -> mouseup -> click
    try {
      hitTarget.dispatchEvent(new PointerEvent('pointerover', pointerInit))
      hitTarget.dispatchEvent(new MouseEvent('mouseover', mouseInit))
      hitTarget.dispatchEvent(new PointerEvent('pointerdown', pointerInit))
      hitTarget.dispatchEvent(new MouseEvent('mousedown', mouseInit))
      await sleep(60)
      hitTarget.dispatchEvent(new PointerEvent('pointerup', pointerInit))
      hitTarget.dispatchEvent(new MouseEvent('mouseup', mouseInit))
      hitTarget.dispatchEvent(new MouseEvent('click', mouseInit))
    } catch (e) {
      console.warn('[RealPost] Pointer/mouse event dispatch warning:', e)
    }

    // Gọi thêm .click() trực tiếp
    try {
      hitTarget.click()
    } catch {}

    if (hitTarget !== element) {
      try {
        element.click()
      } catch {}
    }

    return true
  }

  // Điền từ khóa tìm kiếm bạn bè an toàn, ngăn chặn hoàn toàn lỗi double text
  async function fillSearchInput(searchInput, text) {
    if (!searchInput || !text) return
    searchInput.focus()
    await sleep(150)

    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set

    // 1. Xóa sạch mọi giá trị cũ
    try {
      if (nativeSetter) {
        nativeSetter.call(searchInput, '')
      } else {
        searchInput.value = ''
      }
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      searchInput.select()
      document.execCommand('selectAll', false, null)
      document.execCommand('delete', false, null)
    } catch {}

    await sleep(100)

    // 2. Thử nhập bằng execCommand (mô phỏng gõ phím của người dùng thực)
    let typedOk = false
    try {
      typedOk = document.execCommand('insertText', false, text)
    } catch {
      typedOk = false
    }

    // 3. Nếu execCommand không thành công hoặc giá trị trong ô không bằng chính xác text
    if (!typedOk || searchInput.value !== text) {
      if (nativeSetter) {
        nativeSetter.call(searchInput, text)
      } else {
        searchInput.value = text
      }
    }

    // 4. Kích hoạt các sự kiện input chuẩn để React 18 nhận diện và gửi truy vấn tìm kiếm bạn bè
    searchInput.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: text, inputType: 'insertText' }))
    searchInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    searchInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }))

    // 5. Kiểm tra phòng thủ tuyệt đối: Đảm bảo không bị lặp từ khóa (vd: "TênTên")
    if (searchInput.value !== text) {
      console.warn(`[RealPost] Phát hiện text không khớp ("${searchInput.value}" !== "${text}"). Đang chuẩn hóa lại...`)
      if (nativeSetter) {
        nativeSetter.call(searchInput, text)
      } else {
        searchInput.value = text
      }
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  // ============================================================
  // CHỐNG ĐÓNG DIALOG: Chặn click vào overlay/backdrop trong quá trình gắn thẻ
  // ============================================================

  // Tạo lớp bảo vệ vô hình chặn mọi click vào vùng backdrop/overlay của Facebook
  // để ngăn chặn việc dialog bị đóng ngoài ý muốn khi đang gắn thẻ
  function installDialogProtectionShield() {
    // Xóa shield cũ nếu đã tồn tại
    removeDialogProtectionShield()

    const shield = document.createElement('div')
    shield.id = 'realpost-dialog-shield'
    shield.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 99999;
      background: transparent;
      pointer-events: none;
    `
    document.body.appendChild(shield)

    // Chặn click vào vùng backdrop bằng cách bắt event ở pha capture
    // Chỉ chặn click NẰM NGOÀI mọi dialog (= click vào overlay/backdrop)
    const captureHandler = (e) => {
      const clickedInDialog = e.target?.closest?.('div[role="dialog"]')
      if (!clickedInDialog) {
        console.log('[RealPost] 🛡️ Đã chặn click vào backdrop/overlay trong quá trình gắn thẻ')
        e.stopPropagation()
        e.stopImmediatePropagation()
        e.preventDefault()
      }
    }

    // Chặn Escape key để ngăn đóng dialog bằng phím tắt
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        console.log('[RealPost] 🛡️ Đã chặn phím Escape trong quá trình gắn thẻ')
        e.stopPropagation()
        e.stopImmediatePropagation()
        e.preventDefault()
      }
    }

    document.addEventListener('click', captureHandler, true)
    document.addEventListener('mousedown', captureHandler, true)
    document.addEventListener('pointerdown', captureHandler, true)
    document.addEventListener('keydown', escapeHandler, true)

    // Lưu reference để gỡ bỏ sau
    shield._captureHandler = captureHandler
    shield._escapeHandler = escapeHandler

    console.log('[RealPost] 🛡️ Đã cài đặt lớp bảo vệ chống đóng dialog')
    return shield
  }

  function removeDialogProtectionShield() {
    const shield = document.getElementById('realpost-dialog-shield')
    if (shield) {
      if (shield._captureHandler) {
        document.removeEventListener('click', shield._captureHandler, true)
        document.removeEventListener('mousedown', shield._captureHandler, true)
        document.removeEventListener('pointerdown', shield._captureHandler, true)
      }
      if (shield._escapeHandler) {
        document.removeEventListener('keydown', shield._escapeHandler, true)
      }
      shield.remove()
      console.log('[RealPost] 🛡️ Đã gỡ bỏ lớp bảo vệ chống đóng dialog')
    }
  }


  // Gắn thẻ các cộng sự vào bài viết
  async function tagCollaboratorsInFacebook(dialog, collaborators) {
    if (!Array.isArray(collaborators) || collaborators.length === 0) return false

    console.log('[RealPost] Bắt đầu gắn thẻ', collaborators.length, 'cộng sự...')

    // CÀI ĐẶT LỚP BẢO VỆ: Chặn click overlay/backdrop + Escape trong suốt quá trình gắn thẻ
    const shield = installDialogProtectionShield()

    try {
      // 1. Tìm và click nút Gắn thẻ người khác
      const tagBtn = await findTagPeopleButton(dialog)
      if (!tagBtn) {
        console.warn('[RealPost] Không tìm thấy nút "Gắn thẻ người khác". Có thể nhóm này đã tắt tính năng gắn thẻ.')
        return false
      }

      console.log('[RealPost] Nhấp nút "Gắn thẻ người khác"...')
      await clickElementComet(tagBtn)
      await sleep(1500)

      let taggedCount = 0
      let searchInput = null

      for (const collab of collaborators) {
        const uid = String(collab.fb_uid || '').trim()
        const name = (collab.name || '').trim()
        const username = (collab.username || '').trim()

        if (!uid && !name) continue

        console.log(`[RealPost] Đang tìm kiếm cộng sự: "${name}" (UID: ${uid})...`)

        // 2. Tìm ô input tìm kiếm bạn bè
        searchInput = null
        for (let t = 0; t < 12; t++) {
          // Thu thập các container theo thứ tự ưu tiên: dialog chính, các dialog đang mở, toàn document
          const candidateContainers = [
            dialog,
            findOpenCreatePostDialog(),
            ...Array.from(document.querySelectorAll('div[role="dialog"]')),
            document,
          ].filter(Boolean)

          for (const root of candidateContainers) {
            const inputs = Array.from(root.querySelectorAll('input')).filter(
              (i) => i.offsetParent !== null && !i.closest('[role="article"]') && !i.closest('[aria-label*="Chat" i]')
            )

            for (const inp of inputs) {
              const ph = (inp.getAttribute('placeholder') || '').toLowerCase()
              const aria = (inp.getAttribute('aria-label') || '').toLowerCase()
              if (
                ph.includes('tìm kiếm') || ph.includes('search') || ph.includes('bạn bè') || ph.includes('ai cùng bạn') ||
                aria.includes('tìm kiếm') || aria.includes('search') || aria.includes('gắn thẻ') || aria.includes('tag') ||
                ph.includes('tag') || aria.includes('bạn bè') || ph.includes('who are you with')
              ) {
                searchInput = inp
                break
              }
            }
            if (searchInput) break

            // Fallback: nếu trong modal gắn thẻ chỉ có 1 ô input text hiển thị
            if (root !== document) {
              const visibleTextInputs = inputs.filter((i) => i.type === 'text' || i.type === 'search' || !i.type)
              if (visibleTextInputs.length === 1) {
                const rootText = (root.innerText || '').toLowerCase()
                if (rootText.includes('gắn thẻ') || rootText.includes('tag') || rootText.includes('ai cùng bạn')) {
                  searchInput = visibleTextInputs[0]
                  break
                }
              }
            }
          }

          // Fallback 2: Tìm input nằm gần tiêu đề "Gắn thẻ người khác"
          if (!searchInput) {
            const tagHeader = Array.from(document.querySelectorAll('span, h2, h3, div')).find((el) => {
              const t = (el.innerText || '').trim().toLowerCase()
              return t === 'gắn thẻ người khác' || t === 'tag people' || t === 'tag friends'
            })
            if (tagHeader) {
              const parentModal = tagHeader.closest('div[role="dialog"]') || tagHeader.closest('div[data-pagelet]') || tagHeader.parentElement?.parentElement
              if (parentModal) {
                searchInput = Array.from(parentModal.querySelectorAll('input')).find((i) => i.offsetParent !== null && !i.closest('[aria-label*="Chat" i]'))
              }
            }
          }

          if (searchInput) break
          await sleep(350)
        }

        if (!searchInput) {
          console.warn('[RealPost] Không tìm thấy ô tìm kiếm bạn bè trong modal gắn thẻ.')
          break
        }

        // Neo chặt modal container vào chính phần tử cha của searchInput để không bao giờ bị lệch sang Messenger hay tab khác
        const tagModal = searchInput.closest('div[role="dialog"]') || dialog || document

        // 3. Nhập từ khóa tìm kiếm (ưu tiên Tên hiển thị thật hoặc Username)
        const query = name || username || uid
        console.log(`[RealPost] Gõ từ khóa tìm kiếm: "${query}"...`)

        await fillSearchInput(searchInput, query)

        // Chờ Facebook render danh sách kết quả bạn bè (polling tối đa 4.5 giây)
        let matchedRow = null
        let matchedNameNode = null
        const targetNameClean = name.toLowerCase().replace(/\s+/g, ' ').trim()
        const targetUidClean = uid.trim()

        for (let attempt = 0; attempt < 12; attempt++) {
          await sleep(350)
          const rootsToScan = [tagModal, document]

          for (const root of rootsToScan) {
            // Quét danh sách các ứng viên kết quả bạn bè
            const candidateRows = Array.from(root.querySelectorAll(
              'div[role="checkbox"], [aria-checked="true"], [aria-checked="false"], div[role="button"][tabindex="0"], div[tabindex="0"], div[role="listitem"], li'
            )).filter((el) => {
              if (el === searchInput || el.contains(searchInput)) return false
              const aria = (el.getAttribute('aria-label') || '').toLowerCase()
              const txt = (el.innerText || '').trim().toLowerCase()
              return !aria.includes('quay lại') && !aria.includes('back') && !aria.includes('đóng') && !aria.includes('xong') && !aria.includes('tìm kiếm') &&
                     txt !== 'xong' && txt !== 'done' && txt !== 'quay lại'
            })

            // Cách 1: Khớp UID nếu có trong outerHTML
            if (targetUidClean) {
              matchedRow = candidateRows.find((row) => (row.outerHTML || '').includes(targetUidClean))
            }

            // Cách 2: Tìm text node chứa tên người được tag
            const textNodes = Array.from(root.querySelectorAll('span, div, p')).filter((node) => {
              if (node === searchInput || node.contains(searchInput) || searchInput.contains(node)) return false
              const txt = (node.innerText || '').trim().toLowerCase().replace(/\s+/g, ' ')
              return txt === targetNameClean || txt.startsWith(targetNameClean + '\n')
            })

            if (textNodes.length > 0) {
              matchedNameNode = textNodes[0]
              if (!matchedRow) {
                matchedRow = matchedNameNode.closest('div[role="checkbox"]') ||
                             matchedNameNode.closest('[aria-checked]') ||
                             matchedNameNode.closest('div[role="button"]') ||
                             matchedNameNode.closest('div[tabindex="0"]') ||
                             matchedNameNode.closest('div[role="listitem"]') ||
                             matchedNameNode.closest('li') ||
                             matchedNameNode.parentElement
              }
            }

            // Cách 3: So khớp tên trong innerText của candidateRows
            if (!matchedRow && targetNameClean) {
              matchedRow = candidateRows.find((row) => {
                const txt = (row.innerText || row.textContent || '').toLowerCase().replace(/\s+/g, ' ')
                return txt.includes(targetNameClean)
              })
            }

            // Cách 4: Khớp Username
            if (!matchedRow && username) {
              const uClean = username.toLowerCase().replace(/^@/, '')
              matchedRow = candidateRows.find((row) => {
                const txt = (row.innerText || row.textContent || '').toLowerCase()
                return txt.includes(uClean)
              })
            }

            // Cách 5: Kết quả đơn lẻ nếu có duy nhất 1 mục bạn bè
            if (!matchedRow && candidateRows.length === 1) {
              const singleText = (candidateRows[0].innerText || '').toLowerCase()
              if (!singleText.includes('không có kết quả') && !singleText.includes('no results')) {
                matchedRow = candidateRows[0]
              }
            }

            if (matchedRow || matchedNameNode) break
          }

          if (matchedRow || matchedNameNode) {
            console.log(`[RealPost] Đã tìm thấy bạn bè "${name}" sau ${attempt + 1} lần quét.`)
            break
          }
        }

        // Helper: Kiểm tra trạng thái đã được chọn của bạn bè
        const isSelected = (row) => {
          if (!row) return false
          if (row.getAttribute('aria-checked') === 'true') return true
          if (row.querySelector?.('[aria-checked="true"]')) return true
          if (row.getAttribute('aria-selected') === 'true') return true
          const svgs = Array.from(row.querySelectorAll?.('svg') || [])
          for (const svg of svgs) {
            const h = (svg.outerHTML || '').toLowerCase()
            if (h.includes('check') || h.includes('tick') || h.includes('24-check')) return true
          }
          return false
        }

        const targetRow = matchedRow || matchedNameNode?.parentElement

        if (targetRow) {
          let checked = isSelected(targetRow)
          if (!checked) {
            console.log(`[RealPost] Tiến hành click chọn cộng sự: "${name}"...`)

            // Thao tác 1: Click bằng Comet Press vào phần tử tên bạn bè
            if (matchedNameNode) {
              await clickElementComet(matchedNameNode)
              await sleep(400)
              checked = isSelected(targetRow)
            }

            // Thao tác 2: Nếu chưa chọn, click vào toàn bộ hàng container
            if (!checked && matchedRow) {
              await clickElementComet(matchedRow)
              await sleep(400)
              checked = isSelected(targetRow)
            }

            // Thao tác 3: Thử click vào icon checkbox / radio bên trong hàng
            if (!checked && targetRow.querySelector) {
              const innerBox = targetRow.querySelector('div[role="checkbox"], [aria-checked], svg, div[class*="checkbox" i]')
              if (innerBox) {
                await clickElementComet(innerBox)
                await sleep(400)
                checked = isSelected(targetRow)
              }
            }

            // Thao tác 4: Focus và nhấn phím Space (tiêu chuẩn Accessibility của Facebook)
            if (!checked && targetRow) {
              try {
                targetRow.focus()
                targetRow.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, which: 32, bubbles: true }))
                targetRow.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', keyCode: 32, which: 32, bubbles: true }))
                await sleep(400)
                checked = isSelected(targetRow)
              } catch {}
            }

            taggedCount++
            console.log(`[RealPost] Hoàn tất thao tác chọn cộng sự "${name}" (Trạng thái checked: ${checked})`)
          } else {
            console.log(`[RealPost] Cộng sự "${name}" đã được chọn từ trước.`)
            taggedCount++
          }
        } else {
          console.warn(`[RealPost] Không tìm thấy kết quả khớp với "${name}" (UID: ${uid}).`)
        }
      }

      // 5. Tìm và bấm nút Xong để lưu các thẻ đã chọn
      await sleep(500)
      const tagModal = searchInput?.closest('div[role="dialog"]') || dialog || document
      const allButtons = Array.from(tagModal.querySelectorAll('div[role="button"], button, span[role="button"], div[tabindex="0"], span, div'))
      let confirmBtn = null

      // Ưu tiên tìm chính xác nút chữ "Xong" hoặc "Done" (màu xanh bên phải ô tìm kiếm)
      for (const el of allButtons) {
        if (el === searchInput || el.contains(searchInput)) continue
        const text = (el.innerText || el.textContent || '').trim().toLowerCase()
        const aria = (el.getAttribute('aria-label') || '').toLowerCase()
        if (text === 'xong' || text === 'done' || text === 'lưu' || text === 'save' || aria === 'xong' || aria === 'done') {
          confirmBtn = el.closest('div[role="button"]') || el.closest('div[tabindex="0"]') || el
          break
        }
      }

      if (confirmBtn) {
        console.log('[RealPost] Bấm nút xác nhận "Xong" để hoàn tất gắn thẻ...')
        // Dùng clickElementComet để Facebook React nhận đúng sự kiện click
        // Shield đã bảo vệ backdrop/overlay nên không lo dialog cha bị đóng
        await clickElementComet(confirmBtn)
        await sleep(1000)

        // Retry: Nếu nút "Xong" chưa phản hồi (modal gắn thẻ vẫn mở), thử thêm .click() trực tiếp
        const isTagSearchGone = () => !searchInput || !document.contains(searchInput) || searchInput.offsetParent === null
        if (!isTagSearchGone()) {
          console.log('[RealPost] Modal gắn thẻ chưa đóng sau clickElementComet, thử .click() trực tiếp...')
          try { confirmBtn.click() } catch {}
          await sleep(1500)
        }

        // Retry 2: Tìm lại nút Xong trong DOM (có thể đã re-render) và click lại
        if (!isTagSearchGone()) {
          console.log('[RealPost] Modal gắn thẻ vẫn chưa đóng, tìm lại nút Xong trong DOM...')
          const freshTagModal = searchInput?.closest('div[role="dialog"]') || tagModal
          const freshButtons = Array.from(freshTagModal.querySelectorAll('div[role="button"], button, span[role="button"], div[tabindex="0"], span, div'))
          for (const el of freshButtons) {
            if (el === searchInput || el.contains(searchInput)) continue
            const text = (el.innerText || el.textContent || '').trim().toLowerCase()
            const aria = (el.getAttribute('aria-label') || '').toLowerCase()
            if (text === 'xong' || text === 'done' || text === 'lưu' || text === 'save' || aria === 'xong' || aria === 'done') {
              const freshConfirmBtn = el.closest('div[role="button"]') || el.closest('div[tabindex="0"]') || el
              console.log('[RealPost] Tìm thấy nút Xong mới, click bằng clickElementComet...')
              await clickElementComet(freshConfirmBtn)
              await sleep(1500)
              break
            }
          }
        }

        // Chờ đủ lâu để Facebook animate đóng modal con gắn thẻ và restore modal cha
        await sleep(1500)
      }

      // 6. Kiểm tra xem ô searchInput đã biến mất chưa (chứng tỏ đã quay về màn hình soạn thảo chính)
      await sleep(800)
      const isTagSearchGoneFinal = () => !searchInput || !document.contains(searchInput) || searchInput.offsetParent === null

      // Chỉ khi ô tìm kiếm VẪN CÒN trên màn hình VÀ tagModal khác document mới thử bấm nút quay lại
      if (!isTagSearchGoneFinal() && tagModal && tagModal !== document) {
        console.log('[RealPost] Ô tìm kiếm bạn bè vẫn còn, thử bấm Mũi tên quay lại của modal con gắn thẻ...')
        const subBackBtn = Array.from(tagModal.querySelectorAll('div[role="button"], button')).find((el) => {
          const aria = (el.getAttribute('aria-label') || '').toLowerCase()
          return aria.includes('quay lại') || aria.includes('back') || aria.includes('trở lại')
        })
        if (subBackBtn) {
          const targetBack = subBackBtn.closest('div[role="button"]') || subBackBtn
          // Shield vẫn đang bảo vệ, dùng clickElementComet an toàn
          await clickElementComet(targetBack)
          await sleep(1000)
        }
      }

      // 7. Kiểm tra xác nhận cuối cùng trong composer
      await sleep(600)
      const composerRoot = dialog || findOpenCreatePostDialog() || document
      const composerText = (composerRoot.innerText || '').toLowerCase()
      const anyTagged = collaborators.some((c) => composerText.includes((c.name || '').toLowerCase()))

      if (anyTagged) {
        console.log('[RealPost] 🎉 XÁC NHẬN: Facebook đã ghi nhận gắn thẻ cộng sự vào bài viết!')
      } else {
        console.log('[RealPost] Đã hoàn tất các thao tác gắn thẻ, quay lại màn hình tạo bài viết.')
      }

      return taggedCount > 0
    } finally {
      // LUÔN gỡ bỏ lớp bảo vệ dù thành công hay thất bại
      removeDialogProtectionShield()
    }
  }

  // Chờ và tìm nút Đăng (Post) khi đã sẵn sàng
  function waitForPostButton(container, timeoutMs = 25000) {
    return new Promise((resolve) => {
      const start = Date.now()
      const interval = setInterval(() => {
        const root = container || document
        const candidates = Array.from(root.querySelectorAll('div[role="button"], button, span'))

        // Hỗ trợ nhóm Mua bán / Bán hàng (Facebook Buy/Sell group có nút "Tiếp" / "Next" trước)
        for (const el of candidates) {
          const label = (el.getAttribute('aria-label') || el.innerText || el.textContent || '').trim().toLowerCase()
          if (label === 'tiếp' || label === 'next') {
            const btn = el.closest('div[role="button"]') || el
            if (btn.getAttribute('aria-disabled') !== 'true' && !btn.hasAttribute('disabled')) {
              console.log('[RealPost] Phát hiện nút Tiếp trong nhóm Bán hàng, nhấp Tiếp...')
              btn.click()
              break
            }
          }
        }

        // Tìm nút Đăng / Post / Share
        for (const el of candidates) {
          const label = (el.getAttribute('aria-label') || el.innerText || el.textContent || '').trim().toLowerCase()
          if (label === 'đăng' || label === 'post' || label === 'chia sẻ' || label === 'share') {
            const btn = el.closest('div[role="button"]') || el
            if (!document.contains(btn) || btn.offsetParent === null) continue

            const isDisabled = btn.getAttribute('aria-disabled') === 'true' ||
                               btn.hasAttribute('disabled') ||
                               btn.getAttribute('disabled') !== null
            if (!isDisabled) {
              clearInterval(interval)
              resolve(btn)
              return
            }
          }
        }

        // Kích hoạt nhẹ editor mỗi 2.5s để React state cập nhật
        if ((Date.now() - start) % 2500 < 350) {
          const ed = root.querySelector('[contenteditable="true"]')
          if (ed) {
            ed.dispatchEvent(new InputEvent('input', { bubbles: true }))
          }
        }

        if (Date.now() - start > timeoutMs) {
          clearInterval(interval)
          // Fallback: trả về nút Đăng đầu tiên tìm được
          for (const el of candidates) {
            const label = (el.getAttribute('aria-label') || el.innerText || el.textContent || '').trim().toLowerCase()
            if (label === 'đăng' || label === 'post' || label === 'chia sẻ' || label === 'share') {
              resolve(el.closest('div[role="button"]') || el)
              return
            }
          }
          resolve(null)
        }
      }, 400)
    })
  }

  // Toàn bộ quy trình đăng bài
  async function executeFacebookPost(request) {
    const rawContent = request.content || ''
    const title = request.title || request.property?.title || 'Bất động sản'
    const images = request.images || []
    const rawImageUrls = request.rawImageUrls || request.property?.images || []

    const richHtml = markdownToFacebookHtml(rawContent, title)
    const plainText = markdownToPlainText(rawContent, title)
    const cleanContent = plainText // Alias bảo vệ tuyệt đối phòng trường hợp gọi cleanContent

    // Khởi tạo Banner thông báo
    updateBanner('progress', title, 'Đang chuẩn bị đăng bài (Header, In đậm, In nghiêng)...', plainText)

    // Sao chép sẵn cả HTML rich text và Plain text vào clipboard của hệ thống
    try {
      if (navigator.clipboard && navigator.clipboard.write) {
        const textBlob = new Blob([plainText], { type: 'text/plain' })
        const htmlBlob = new Blob([richHtml], { type: 'text/html' })
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': textBlob,
            'text/html': htmlBlob,
          }),
        ])
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(plainText)
      }
    } catch (e) {
      console.warn('[RealPost] Clipboard write warning:', e)
    }

    // Cuộn lên đầu trang Facebook để thanh soạn bài hiển thị
    window.scrollTo(0, 0)
    await sleep(800)

    // Xác định số bước động: nếu có gắn thẻ thì 5 bước, nếu không thì 4 bước
    const taggedCollaborators = request.taggedCollaborators || []
    const hasTagging = Array.isArray(taggedCollaborators) && taggedCollaborators.length > 0
    const totalSteps = hasTagging ? 5 : 4
    let currentStep = 1

    // 1. Kiểm tra hộp thoại đã mở sẵn chưa
    let dialog = findOpenCreatePostDialog()
    if (!dialog) {
      updateBanner('progress', title, `${currentStep}/${totalSteps}. Đang mở hộp thoại Tạo bài viết...`, plainText)
      const trigger = await findPostTrigger()
      if (!trigger) {
        updateBanner('warning', title, 'Không tìm thấy ô tạo bài viết. Đảm bảo tài khoản đã tham gia nhóm này.', plainText)
        throw new Error('Không tìm thấy ô tạo bài viết "Bạn viết gì đi...". Vui lòng kiểm tra quyền thành viên nhóm.')
      }

      trigger.scrollIntoView({ block: 'center' })
      await sleep(400)
      trigger.click()
      await sleep(1500)

      dialog = await waitForDialog(8000)
      if (!dialog) {
        // Thử click lại bằng MouseEvent
        trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        dialog = await waitForDialog(5000)
      }
    }

    if (!dialog) {
      updateBanner('warning', title, 'Không mở được hộp thoại Tạo bài viết.', plainText)
      throw new Error('Không thể mở hộp thoại Tạo bài viết Facebook.')
    }

    console.log('[RealPost] Hộp thoại Tạo bài viết đã mở!')

    // 2. Điền nội dung bài viết với Header, In đậm, In nghiêng
    currentStep = 2
    updateBanner('progress', title, `${currentStep}/${totalSteps}. Đang điền nội dung (Header, In đậm, In nghiêng, Gạch đầu dòng)...`, plainText)
    const editor = await waitEditor(dialog, 10000)
    if (!editor) {
      updateBanner('warning', title, 'Không tìm thấy khung soạn thảo văn bản.', plainText)
      throw new Error('Không tìm thấy khung soạn thảo văn bản bên trong hộp thoại.')
    }

    await injectTextIntoEditor(editor, plainText, richHtml)
    await sleep(1000)

    // 3. Gắn thẻ cộng sự (Tag People) nếu có yêu cầu
    if (hasTagging) {
      currentStep++
      updateBanner('progress', title, `${currentStep}/${totalSteps}. Đang gắn thẻ ${taggedCollaborators.length} cộng sự vào bài viết...`, plainText)

      // LƯU REFERENCE GỐC TRƯỚC KHI GẮN THẺ — đây là điểm mấu chốt:
      // Sau khi gắn thẻ, isCreatePostDialog() không nhận ra dialog nữa vì
      // nội dung innerText đã thay đổi (hiển thị tên người được tag thay vì "Tạo bài viết").
      // Ta phải dùng chính reference gốc này, không tìm lại bằng findOpenCreatePostDialog().
      const dialogBeforeTag = dialog

      try {
        const taggedOk = await tagCollaboratorsInFacebook(dialog, taggedCollaborators)
        if (taggedOk) {
          console.log('[RealPost] Đã gắn thẻ cộng sự thành công!')
        } else {
          console.log('[RealPost] Không gắn thẻ được cộng sự nào (có thể do quyền nhóm hoặc không khớp UID), tiếp tục quy trình.')
        }
      } catch (tagErr) {
        console.warn('[RealPost] Lỗi trong quá trình gắn thẻ cộng sự:', tagErr)
      }

      // Chờ đủ để Facebook hoàn tất mọi animation/transition sau khi đóng panel gắn thẻ
      await sleep(2000)

      // ----------------------------------------------------------------
      // CHIẾN LƯỢC PHỤC HỒI DIALOG SAU GẮN THẺ (theo thứ tự ưu tiên):
      //
      // Lý do KHÔNG dùng findOpenCreatePostDialog() ở đây:
      //   → Sau khi gắn thẻ, dialog soạn bài vẫn còn trong DOM nhưng
      //     isCreatePostDialog() trả về false vì innerText chứa tên người
      //     được tag thay vì "Tạo bài viết"/"bạn viết gì đi".
      //
      // Chiến lược:
      //   1. Ưu tiên: dialog gốc vẫn còn trong DOM → dùng trực tiếp
      //   2. Fallback: chờ tối đa 5s để dialog gốc tái hiện trong DOM
      //   3. Last resort: tìm bất kỳ [role="dialog"] nào có contenteditable
      //   4. Chỉ throw khi THỰC SỰ không có dialog nào với editor
      // ----------------------------------------------------------------
      let recoveredDialog = null

      // Ưu tiên 1: dialog gốc vẫn còn trong DOM
      if (document.contains(dialogBeforeTag)) {
        recoveredDialog = dialogBeforeTag
        console.log('[RealPost] Dialog gốc vẫn còn trong DOM sau gắn thẻ. Tiếp tục dùng dialog gốc.')
      }

      // Ưu tiên 2: Chờ tối đa 5s (10 lần × 500ms) để dialog gốc restore
      if (!recoveredDialog) {
        console.log('[RealPost] Dialog gốc không còn trong DOM, chờ tối đa 5s để tái hiện...')
        for (let i = 0; i < 10; i++) {
          await sleep(500)
          if (document.contains(dialogBeforeTag)) {
            recoveredDialog = dialogBeforeTag
            console.log(`[RealPost] Dialog gốc tái hiện sau ${(i + 1) * 500}ms.`)
            break
          }
          // Đồng thời kiểm tra findOpenCreatePostDialog() mỗi lần lặp
          const found = findOpenCreatePostDialog()
          if (found) {
            recoveredDialog = found
            console.log(`[RealPost] findOpenCreatePostDialog tìm được dialog mới sau ${(i + 1) * 500}ms.`)
            break
          }
        }
      }

      // Ưu tiên 3 (last resort): tìm bất kỳ dialog nào có contenteditable
      if (!recoveredDialog) {
        console.warn('[RealPost] Thử tìm dialog có contenteditable bất kỳ...')
        const allDialogs = Array.from(document.querySelectorAll('div[role="dialog"]'))
        recoveredDialog = allDialogs.find((d) => !!d.querySelector('[contenteditable="true"]')) || null
        if (recoveredDialog) {
          console.log('[RealPost] Tìm thấy dialog có editor làm fallback.')
        }
      }

      if (recoveredDialog) {
        dialog = recoveredDialog
      } else {
        // ────────────────────────────────────────────────────────────
        // PHỤC HỒI CUỐI CÙNG: Mở lại hộp thoại tạo bài viết
        // Nếu dialog thực sự bị đóng (do click overlay hoặc phím Escape lọt qua),
        // ta sẽ thử mở lại và điền lại nội dung thay vì bỏ cuộc.
        // ────────────────────────────────────────────────────────────
        console.warn('[RealPost] ⚠️ Dialog đã bị đóng sau gắn thẻ! Đang thử mở lại...')
        updateBanner('progress', title, '⚠️ Hộp thoại bị đóng, đang mở lại và điền lại nội dung...', plainText)

        // Cuộn lên đầu trang và tìm nút tạo bài
        window.scrollTo(0, 0)
        await sleep(800)

        const retryTrigger = await findPostTrigger()
        if (retryTrigger) {
          retryTrigger.scrollIntoView({ block: 'center' })
          await sleep(400)
          retryTrigger.click()
          await sleep(1500)

          const reopenedDialog = await waitForDialog(8000)
          if (reopenedDialog) {
            console.log('[RealPost] ✅ Đã mở lại hộp thoại tạo bài viết thành công!')
            dialog = reopenedDialog

            // Điền lại nội dung
            const retryEditor = await waitEditor(dialog, 10000)
            if (retryEditor) {
              await injectTextIntoEditor(retryEditor, plainText, richHtml)
              await sleep(1000)
              console.log('[RealPost] ✅ Đã điền lại nội dung bài viết thành công!')
              // Lưu ý: Không gắn thẻ lại lần nữa để tránh vòng lặp vô hạn
              updateBanner('progress', title, '✅ Đã phục hồi hộp thoại, tiếp tục đăng bài (không gắn thẻ lại)...', plainText)
            } else {
              console.warn('[RealPost] Không tìm thấy editor trong dialog mở lại.')
            }
          } else {
            updateBanner('warning', title, 'Không thể mở lại hộp thoại tạo bài viết.', plainText)
            throw new Error('Hộp thoại tạo bài viết đã bị đóng bất ngờ sau khi gắn thẻ và không thể phục hồi.')
          }
        } else {
          updateBanner('warning', title, 'Không tìm thấy ô tạo bài viết để mở lại.', plainText)
          throw new Error('Hộp thoại tạo bài viết đã bị đóng bất ngờ sau khi gắn thẻ và không thể phục hồi.')
        }
      }
    }

    // 4. Đính kèm ảnh nếu có (hoặc bước 3 nếu không gắn thẻ)
    currentStep++
    const hasImages = (images && images.length > 0) || (rawImageUrls && rawImageUrls.length > 0)
    if (hasImages) {
      const count = images.length || rawImageUrls.length
      updateBanner('progress', title, `${currentStep}/${totalSteps}. Đang tải đính kèm ${count} ảnh BĐS...`, plainText)
      const uploaded = await uploadImagesToFacebook(dialog, images, rawImageUrls)
      if (uploaded) {
        console.log('[RealPost] Đính kèm ảnh thành công!')
      } else {
        console.warn('[RealPost] Đính kèm ảnh không thành công, tiếp tục đăng văn bản.')
      }
      await sleep(2500)
    } else {
      updateBanner('progress', title, `${currentStep}/${totalSteps}. Không có ảnh đính kèm, chuyển sang bước Đăng...`, plainText)
      await sleep(800)
    }

    // 5. Tìm và bấm nút Đăng (Post) (hoặc bước 4 nếu không gắn thẻ)
    currentStep++
    updateBanner('progress', title, `${currentStep}/${totalSteps}. Đang bấm nút Đăng bài...`, plainText)

    // Đảm bảo dialog hợp lệ trước khi tìm nút Đăng
    // Lưu ý: chỉ throw khi dialog HOÀN TOÀN bị xóa khỏi DOM (document.contains = false)
    // Không throw khi offsetParent === null vì dialog có thể đang trong transition sau tag
    const finalDialog = findOpenCreatePostDialog() || dialog
    if (!document.contains(finalDialog)) {
      updateBanner('warning', title, 'Hộp thoại tạo bài viết không còn hiển thị trên màn hình.', plainText)
      throw new Error('Hộp thoại tạo bài viết đã bị đóng trước khi bấm nút Đăng.')
    }

    const postBtn = await waitForPostButton(finalDialog, 25000)

    if (!postBtn) {
      updateBanner('warning', title, 'Nút Đăng không kích hoạt sau 25s. Vui lòng kiểm tra lại.', plainText)
      throw new Error('Nút Đăng không sáng lên sau 25 giây.')
    }

    console.log('[RealPost] Đang bấm nút Đăng...')
    postBtn.click()

    // Chờ hộp thoại đóng lại để xác nhận hoàn tất
    let confirmed = false
    const tStart = Date.now()
    while (Date.now() - tStart < 14000) {
      if (!document.contains(finalDialog) || finalDialog.offsetParent === null) {
        confirmed = true
        break
      }
      await sleep(500)
    }

    if (!confirmed) {
      updateBanner('warning', title, 'Hộp thoại chưa đóng sau khi bấm Đăng. Vui lòng kiểm tra lại trên Facebook.', plainText)
      return { success: false, error: 'Hộp thoại không đóng sau khi bấm Đăng' }
    }

    updateBanner('success', title, '🎉 ĐÃ ĐĂNG BÀI THÀNH CÔNG! Tab sẽ tự đóng sau 4 giây...', plainText)
    await sleep(4000)
    return { success: true, message: 'Đã đăng bài thành công' }
  }

} else {
  // ────────────────────────────────────────────────────────────
  // 2. WEB APP BRIDGE MODULE (localhost, 127.0.0.1, vercel...)
  // ────────────────────────────────────────────────────────────
  console.log('[RealPost] Content script bridge active on:', window.location.origin)

  // 1. Lắng nghe tin nhắn từ Service Worker (background.js)
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'REALPOST_PING') {
      sendResponse({ type: 'REALPOST_PONG', token: chrome.runtime?.id || '' })
      return true
    }
    if (message.type === 'REALPOST_PONG') {
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
          ?.catch(() => {})
      } catch {}
    }

    if (event.data.type === 'REALPOST_CONFIG') {
      try {
        chrome.runtime?.sendMessage?.(event.data)
          ?.then((response) => {
            if (response) window.postMessage({ type: 'REALPOST_CONFIG_SAVED', ...response }, '*')
          })
          ?.catch(() => {})
      } catch {}
    }

    if (event.data.type === 'REALPOST_FORCE_POLL') {
      try {
        chrome.runtime?.sendMessage?.({ type: 'REALPOST_FORCE_POLL' })
          ?.then((response) => {
            if (response) window.postMessage({ type: 'REALPOST_FORCE_POLL_ACK', ...response }, '*')
          })
          ?.catch(() => {})
      } catch {}
    }

    if (event.data.type === 'REALPOST_VERIFY_FB_PROFILE') {
      try {
        chrome.runtime?.sendMessage?.(event.data)
          ?.then((response) => {
            if (response) window.postMessage({ type: 'REALPOST_VERIFY_FB_PROFILE_RES', requestId: event.data.requestId, ...response }, '*')
          })
          ?.catch((err) => {
            window.postMessage({ type: 'REALPOST_VERIFY_FB_PROFILE_RES', requestId: event.data.requestId, success: false, error: err.message }, '*')
          })
      } catch {}
    }
  })

  // 3. Thông báo ngay cho Web App khi vừa load vào trang
  try {
    if (chrome.runtime?.id) {
      window.postMessage({ type: 'REALPOST_PONG', token: chrome.runtime.id }, '*')
    }
  } catch {}
}
