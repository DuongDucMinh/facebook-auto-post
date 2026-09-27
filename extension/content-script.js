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

    // 1. Kiểm tra hộp thoại đã mở sẵn chưa
    let dialog = findOpenCreatePostDialog()
    if (!dialog) {
      updateBanner('progress', title, '1/4. Đang mở hộp thoại Tạo bài viết...', plainText)
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
    updateBanner('progress', title, '2/4. Đang điền nội dung (Header, In đậm, In nghiêng, Gạch đầu dòng)...', plainText)
    const editor = await waitEditor(dialog, 10000)
    if (!editor) {
      updateBanner('warning', title, 'Không tìm thấy khung soạn thảo văn bản.', plainText)
      throw new Error('Không tìm thấy khung soạn thảo văn bản bên trong hộp thoại.')
    }

    await injectTextIntoEditor(editor, plainText, richHtml)
    await sleep(1000)

    // 3. Đính kèm ảnh nếu có
    const hasImages = (images && images.length > 0) || (rawImageUrls && rawImageUrls.length > 0)
    if (hasImages) {
      const count = images.length || rawImageUrls.length
      updateBanner('progress', title, `3/4. Đang tải đính kèm ${count} ảnh BĐS...`, cleanContent)
      const uploaded = await uploadImagesToFacebook(dialog, images, rawImageUrls)
      if (uploaded) {
        console.log('[RealPost] Đính kèm ảnh thành công!')
      } else {
        console.warn('[RealPost] Đính kèm ảnh không thành công, tiếp tục đăng văn bản.')
      }
      await sleep(2500)
    } else {
      updateBanner('progress', title, '3/4. Không có ảnh đính kèm, chuyển sang bước Đăng...', cleanContent)
      await sleep(800)
    }

    // 4. Tìm và bấm nút Đăng (Post)
    updateBanner('progress', title, '4/4. Đang bấm nút Đăng bài...', cleanContent)
    const postBtn = await waitForPostButton(dialog, 25000)

    if (!postBtn) {
      updateBanner('warning', title, 'Nút Đăng không kích hoạt sau 25s. Vui lòng kiểm tra lại.', cleanContent)
      throw new Error('Nút Đăng không sáng lên sau 25 giây.')
    }

    console.log('[RealPost] Đang bấm nút Đăng...')
    postBtn.click()

    // Chờ hộp thoại đóng lại để xác nhận hoàn tất
    let confirmed = false
    const tStart = Date.now()
    while (Date.now() - tStart < 14000) {
      if (!document.contains(dialog) || dialog.offsetParent === null) {
        confirmed = true
        break
      }
      await sleep(500)
    }

    updateBanner('success', title, '🎉 ĐÃ ĐĂNG BÀI THÀNH CÔNG! Tab sẽ tự đóng sau 4 giây...', cleanContent)
    await sleep(4000)
    return { success: true, message: confirmed ? 'Đã đăng bài thành công' : 'Đã bấm nút Đăng' }
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
  })

  // 3. Thông báo ngay cho Web App khi vừa load vào trang
  try {
    if (chrome.runtime?.id) {
      window.postMessage({ type: 'REALPOST_PONG', token: chrome.runtime.id }, '*')
    }
  } catch {}
}
