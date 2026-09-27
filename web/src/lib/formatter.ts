export function escapeHtml(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function formatInline(str: string): string {
  let s = escapeHtml(str)
  // Bold: **text** hoặc __text__
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>')
  // Italic: *text* hoặc _text_
  s = s.replace(/(?<!\*)\*(?!\*)([^\*]+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
  s = s.replace(/(?<!_)_(?!_)([^_]+?)(?<!_)_(?!_)/g, '<em>$1</em>')
  return s
}

/**
 * Chuyển đổi Markdown sang định dạng HTML tương thích hoàn hảo với Facebook Lexical Editor:
 * - Tiêu đề (Title) -> <h1> (Header 1 cỡ chữ lớn, nổi bật trên Facebook)
 * - Các đề mục & keyword quan trọng -> <strong> (In đậm [B])
 * - Các câu đúc kết / điểm nhấn -> <em> (In nghiêng [I])
 * - Các dòng bắt đầu bằng "-" hoặc "*" -> <ul><li> (Danh sách gạch đầu dòng)
 * - Các dòng bắt đầu bằng ">" hoặc "->" -> <blockquote> (Trích dẫn)
 */
export function markdownToFacebookHtml(markdownText: string, title?: string): string {
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
  const htmlBlocks: string[] = []
  if (headerHtml) {
    htmlBlocks.push(headerHtml)
  }

  for (const block of rawBlocks) {
    const trimmed = block.trim()
    if (!trimmed) continue

    const lines = trimmed.split('\n').map((l) => l.trim())

    // Heading (# hoặc ##)
    if (lines.length === 1 && /^#{1,6}\s+/.test(lines[0])) {
      const level = lines[0].match(/^(#{1,6})\s+/)?.[1].length || 1
      const headingContent = lines[0].replace(/^#{1,6}\s+/, '').trim()
      const tag = level === 1 ? 'h1' : 'h2'
      htmlBlocks.push(`<${tag}>${formatInline(headingContent)}</${tag}>`)
      continue
    }

    // Bullet list hoàn toàn
    const isBulletList = lines.every((l) => /^[\-\*\•]\s+/.test(l))
    if (isBulletList) {
      const itemsHtml = lines
        .map((l) => `<li>${formatInline(l.replace(/^[\-\*\•]\s+/, '').trim())}</li>`)
        .join('')
      htmlBlocks.push(`<ul>${itemsHtml}</ul>`)
      continue
    }

    // Numbered list hoàn toàn
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

    // Hỗn hợp Text + Bullet trong cùng 1 khối
    const hasListItems = lines.some((l) => /^[\-\*\•]\s+/.test(l))
    if (hasListItems) {
      let currentList: string[] = []
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

    // Đoạn văn thông thường
    const paragraphContent = lines.map((l) => formatInline(l)).join('<br>')
    htmlBlocks.push(`<p>${paragraphContent}</p>`)
  }

  return htmlBlocks.join('')
}

/**
 * Chuyển Markdown thành plain text sạch (fallback an toàn khi copy text đơn giản)
 */
export function markdownToPlainText(markdownText: string, title?: string): string {
  let text = (markdownText || '').trim()
  const postTitle = (title || '').trim()

  if (postTitle) {
    const lines = text.split('\n')
    const firstLine = lines[0]?.trim() || ''
    if (firstLine.toLowerCase() === postTitle.toLowerCase()) {
      text = lines.slice(1).join('\n').trim()
    }
    text = `${postTitle}\n\n${text}`
  }

  return text
}
