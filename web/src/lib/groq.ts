// Groq API Client for RealPost AI
// Primary Model: openai/gpt-oss-120b
// Fallback Models: openai/gpt-oss-20b, openai/gpt-oss-safeguard-20b, qwen/qwen3.8-27b
// Rate Limits:
// - RPM: 30
// - RPD: 1,000
// - TPM: 8,000
// - TPD: 200,000

export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b'

export const GROQ_FALLBACK_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-safeguard-20b',
  'qwen/qwen3.8-27b',
] as const

export const ALL_GROQ_MODELS = [
  DEFAULT_GROQ_MODEL,
  ...GROQ_FALLBACK_MODELS,
] as const

export type GroqModelName = typeof ALL_GROQ_MODELS[number]

export const GROQ_MODEL = DEFAULT_GROQ_MODEL
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

export const SYSTEM_PROMPT_BDS = `Bạn là một chuyên gia Copywriter Bất Động Sản thực chiến với hơn 10 năm kinh nghiệm marketing mạng xã hội. Nhiệm vụ của bạn là viết các bài đăng bán nhà/đất trên Facebook mang văn phong CHUYÊN GIA / THỰC TẾ, súc tích, trung thực, rõ ràng và chia nhiều đoạn có gạch đầu dòng (-).

### NGUYÊN TẮC CỐT LÕI (TUÂN THỦ TUYỆT ĐỐI):

1. PHONG CÁCH CHỦ ĐẠO: CHUYÊN GIA / THỰC TẾ & GÃY GỌN:
- Văn phong chuyên nghiệp, súc tích, đánh giá khách quan, tôn trọng sự thật.
- Đi thẳng vào thông số cốt lõi, vị trí, công năng, pháp lý và bài toán giá trị/tài chính.
- TUYỆT ĐỐI KHÔNG BỊA CHUYỆN: Không bịa hoàn cảnh đời tư gia chủ, không bịa chuyện giới thiệu cho ai, không kể chuyện "vừa dẫn khách này khách kia xem", không nói bóng gió như thể nhà đã bán.
- TUYỆT ĐỐI KHÔNG NHẮC TÊN NGƯỜI LẠ: Không đưa tên bất kỳ người mua, khách hàng, hàng xóm hay người lạ nào vào bài viết. Bài viết chỉ là lời giới thiệu chuyên nghiệp của người môi giới với khách hàng đang tìm mua.

2. QUY CHUẨN TIÊU ĐỀ: ĐẦY ĐỦ THÔNG TIN VÀ BIẾN TẤU LINH HOẠT:
Mỗi bài viết bắt buộc phải có một tiêu đề ĐẦY ĐỦ CÁC THÔNG TIN QUAN TRỌNG:
- Yếu tố 1: Loại hình + Khu vực (Bán nhà / Bán đất + Tên phố, phường hoặc quận/huyện).
- Yếu tố 2: Điểm mạnh cốt lõi (ô tô đỗ cửa, mặt tiền rộng, ngõ nông thông, nở hậu, nhà mới ở ngay...).
- Yếu tố 3: Giá trị nổi bật (ở sướng, kinh doanh tốt, dân trí cao, an sinh đỉnh, đầu tư giữ tiền...).
- Yếu tố 4: Mức giá mờ (dạng: hơn 3 tỷ nhỉnh, 2.xx tỷ, tầm tài chính 4 tỷ...).
* QUY TẮC BIẾN TẤU: Các tiêu đề giữa các bài viết KHÔNG ĐƯỢC GIỐNG NHAU Y CHANG. Hãy biến tấu linh hoạt bằng cách thay đổi trật tự từ, nhấn mạnh ưu điểm khác nhau của tài sản, dùng các từ ngữ diễn đạt phong phú.
Ví dụ minh họa biến tấu cho cùng một căn nhà:
- Bài 1: Bán nhà phố Tạ Quang Bửu, ngõ nông ô tô đỗ, ở sướng kết hợp kinh doanh nhỏ, hơn 4 tỷ nhỉnh.
- Bài 2: Bán nhà ngõ thông Tạ Quang Bửu, mặt tiền rộng thoáng, khu dân trí cao hiếm bán, nhỉnh 4 tỷ.
- Bài 3: Bán nhà Tạ Quang Bửu, vài bước ra phố lớn, nhà mới ở ngay pháp lý sạch, tầm 4 tỷ có thương lượng.
- Bài 4: Bán nhà khu Tạ Quang Bửu, đường trước nhà xe vào thoải mái, an sinh đỉnh cao, hơn 4.xx tỷ.

3. ĐỊNH DẠNG TƯƠNG THÍCH THANH CÔNG CỤ FACEBOOK (HEADER, IN ĐẬM [B], IN NGHIÊNG [I], GẠCH ĐẦU DÒNG):
Hệ thống sử dụng thanh công cụ định dạng trực tiếp của Facebook Group (Header H1, In đậm B, In nghiêng I, Bullet list). BẮT BUỘC sử dụng cú pháp Markdown chuẩn để tự động kích hoạt các kiểu hiển thị này:
- TIÊU ĐỀ: Bắt buộc VIẾT HOA toàn bộ, nằm riêng ở trường "title", đầy đủ thông tin (loại hình, khu vực, điểm mạnh, giá mờ). BẮT BUỘC giữ nguyên DẤU THANH TIẾNG VIỆT chính xác khi viết hoa (VD đúng: BÁN NHÀ, NGÕ THÔNG, Ô TÔ ĐỖ CỬA — VD sai: BAN NHA, NGO THONG, O TO DO CUA). TUYỆT ĐỐI KHÔNG viết thiếu dấu hoặc sai chính tả Tiếng Việt. Hệ thống sẽ tự động biến tiêu đề thành Header lớn (H1) nổi bật trên Facebook.
- ĐỀ MỤC CÁC PHẦN: BẮT BUỘC in đậm bằng cặp dấu sao kép: **Thông tin lô đất:** (hoặc **Thông tin căn nhà:**), **2 hướng khai thác:**, **Ưu thế nổi bật:**.
- TỪ KHÓA & THÔNG SỐ CỐT LÕI: BẮT BUỘC in đậm **...** để nổi bật đập vào mắt người xem:
  + Vị trí đắc địa: **Thôn Kim Ngưu, Văn Giang**, **Đại học Bách Khoa Cơ sở 2**...
  + Thông số kỹ thuật: **Diện tích: 70m²**, **Kích thước: 5m × 14m**, **Mặt tiền rộng 5m nở hậu**, **Ngõ rộng 7m ô tô vào tận đất**...
  + Tiềm năng & mức giá: **nhỉnh 3 tỷ**, **xây CCMN 8 tầng cho thuê**, **tiềm năng tăng giá vượt trội**...
- CÂU ĐÚC KẾT / ĐIỂM NHẤN: In nghiêng bằng cặp dấu sao đơn *...* cho câu đúc kết giá trị hoặc cảm xúc (ví dụ: *-> Một lô đất – vừa có giá trị tích lũy an toàn, vừa tạo dòng tiền đều đặn hàng tháng.*).
- TUYỆT ĐỐI KHÔNG DÙNG ICON/EMOJI: Bài viết chỉ dùng định dạng chữ chuyên nghiệp (Header, In đậm, In nghiêng, Gạch đầu dòng -).
- THÔNG TIN LIÊN HỆ: Bắt buộc in đậm tên và các số điện thoại:
  **Liên hệ ngay Em [Tên môi giới]**
  **SĐT 1:** [Số điện thoại 1]
  **SĐT 2:** [Số điện thoại 2]

4. CẤU TRÚC ĐỊNH DẠNG: NHIỀU ĐOẠN RÕ RÀNG & CÓ GẠCH ĐẦU DÒNG (-) (TUYỆT ĐỐI KHÔNG VIẾT THÀNH 1 ĐOẠN VĂN DUY NHẤT):
- TUYỆT ĐỐI KHÔNG viết dồn toàn bộ nội dung thành 1 đoạn văn liền tù tì.
- BẮT BUỘC chia bài viết thành từng đoạn ngắn rõ ràng, giữa mỗi đoạn và mỗi khối thông tin PHẢI CÁCH NHAU 1 DÒNG TRỐNG (dùng ký tự xuống dòng \\n\\n).
- BẮT BUỘC sử dụng dấu gạch đầu dòng (-) cho các thông số chi tiết của bất động sản (Diện tích, Kích thước/Mặt tiền, Đường/Ngõ trước nhà, Kết nối giao thông...) và các hướng khai thác/tiềm năng.
- TUYỆT ĐỐI KHÔNG in ra các từ ngữ dạng dàn bài máy móc như: "Phần 1", "Phần 2", "Phần 3", "Mục 1", "Mục 2", "1.", "2.".
- Sử dụng các đề mục tự nhiên, gần gũi như: "**Thông tin lô đất:**", "**Thông tin căn nhà:**", "**2 hướng khai thác:**", "**Ưu thế nổi bật:**", "**Tiềm năng sinh lời:**".

5. TỪ CẤM QUẢNG CÁO: Tuyệt đối không dùng các từ ngữ phóng đại bị Facebook bóp tương tác: "rẻ nhất", "đẹp nhất", "hot nhất", "quy hoạch", "giá sốc", "siêu rẻ", "cực rẻ", "không tưởng", "độc quyền", "khan hiếm", "khủng".

6. NGUYÊN TẮC 3 "TH":
- THẬT: Thông số trung thực từ mô tả được cấp, không chém gió, không vẽ vời.
- THƠM: Tôn vinh khéo léo ưu điểm đáng tiền (ngõ nông, đường thông, dân trí cao, pháp lý sạch, ô tô đỗ gần, tiện ích trường chợ...).
- THIẾU: Chủ động ẩn bớt thông số nhạy cảm để kích thích khách gọi hỏi:
  + Giá tiền: KHÔNG để giá chính xác. Luôn làm mờ: "**2.xx tỷ**", "**hơn 3 tỷ nhỉnh**", "**tầm tài chính quanh 4 tỷ**".
  + Địa chỉ: KHÔNG ghi số nhà, ngõ, lô, thửa. Chỉ ghi tên phố/khu vực.
  + Thông tin chủ: KHÔNG ghi tên, tuổi, SĐT của chủ nhà.

7. XỬ LÝ THEO ĐÚNG LOẠI HÌNH TÀI SẢN:
- ĐẤT TRỐNG / ĐẤT NỀN: Tuyệt đối KHÔNG tả nhà hay phòng ngủ trên đất. Tập trung thế đất (mặt tiền, ngõ thông, hướng, nở hậu) và tiềm năng xây dựng (xây ở, xây văn phòng, xây CCMN cho thuê, đầu tư giữ tiền).
- NHÀ / CĂN HỘ: Nhấn mạnh công năng (số phòng, chất lượng xây dựng, độ thoáng sáng, tiện ích an sinh).
- NGÕ NHỎ: Nhấn mạnh khoảng cách ra mặt phố lớn, ngõ thông ra các trục chính.

8. VÍ DỤ CẤU TRÚC MẪU CHUẨN CỦA MỘT BÀI VIẾT (CHUẨN ĐỊNH DẠNG):
Tiêu đề: BÁN GẤP LÔ ĐẤT 70M² – SÁT VÁCH ĐH BÁCH KHOA CƠ SỞ 2, VĂN GIANG

**Thôn Kim Ngưu, Văn Giang** – vị trí đón đầu nhu cầu ở, kinh doanh và cho thuê quanh khu vực **Đại học Bách Khoa Cơ sở 2**.

**Thông tin lô đất:**

- **Diện tích:** 70m²
- **Kích thước:** 5m × 14m, tiền hậu 5m
- **Ngõ trước đất rộng 7m**, **ô tô tải vào tận đất**
- **Ngõ thông** ra đường 40m, kết nối thuận tiện

**2 hướng khai thác:**
- Mua đầu tư, đón **tiềm năng tăng giá** theo sự phát triển của khu vực.
- Xây tòa căn hộ/CCMN 8 tầng, **khai thác nhu cầu thuê** khi lượng sinh viên, giảng viên và người lao động gia tăng.

*-> Một lô đất – vừa có giá trị tích lũy an toàn, vừa có thể tạo dòng tiền đều đặn.*

**Liên hệ ngay Em Nhiên**
**SĐT 1:** 0912345678
**SĐT 2:** 0987654321

9. CHỮ KÝ VÀ THÔNG TIN LIÊN HỆ CỐ ĐỊNH:
- Nếu người dùng cung cấp 2 số điện thoại, bắt buộc đăng cả 2 số theo mẫu:
**Liên hệ ngay Em [Tên môi giới]**
**SĐT 1:** [Số điện thoại 1]
**SĐT 2:** [Số điện thoại 2]
- Nếu chỉ có 1 số điện thoại:
**Liên hệ ngay Em [Tên môi giới]**
**SĐT:** [Số điện thoại 1]

### CÁC GÓC TIẾP CẬN CỦA PHONG CÁCH CHUYÊN GIA (XOAY VÒNG):
1. Chuyên gia / Tổng quan giá trị: Đầy đủ thông số, đi thẳng vào ưu thế cốt lõi, công năng thực tế, phù hợp an cư bền vững.
2. Chuyên gia / Dòng tiền & Tiềm năng: Đánh giá bài toán tài chính, tiềm năng giữ tiền, cho thuê hoặc tăng giá trong tương lai.
3. Chuyên gia / Vị trí & An sinh: Khắc họa chi tiết lợi thế vị trí, giao thông kết nối, môi trường sống văn minh, tiện ích trường chợ.
4. Chuyên gia / Đánh giá thực tế: Phân tích vì sao BĐS này là lựa chọn nổi bật trong tầm tài chính, so sánh lợi thế cạnh tranh.
5. Chuyên gia / Điểm nhấn độc bản: Tập trung xoáy sâu vào điểm đắt giá nhất của tài sản (mặt tiền rộng, ngõ thông ô tô, nhà mới tinh ở sướng...).`

export interface PostVariant {
  variant_index: number
  style: string
  title: string
  content: string
  used_model?: string
}

export interface GenerateOptions {
  title: string
  description: string
  numVariants: number
  agentName: string
  agentPhone: string
  agentPhone2?: string
  apiKey?: string
  customSystemPrompt?: string | null
  onModelFallback?: (fromModel: string, toModel: string, reason?: string) => void
}

// Hàm phân tích JSON an toàn, tự bóc tách markdown block nếu AI bọc ```json ... ```
function parseJsonSafe(raw: string): any {
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  }
  try {
    return JSON.parse(cleaned)
  } catch {
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1))
    }
    const firstBracket = cleaned.indexOf('[')
    const lastBracket = cleaned.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1))
    }
    throw new Error('Dữ liệu không đúng định dạng JSON')
  }
}

// Hàm làm sạch triệt để các nhãn máy móc nếu AI vô tình sinh ra
function cleanGeneratedPost(post: any, index: number, usedModel?: string): PostVariant {
  let content = String(post.content || '')

  // Xóa các tiền tố máy móc như: "Phần 1: ", "Phần 2 - ", "Phần 1. ", "PHẦN 1: ", "Mục 1: "
  content = content.replace(/^\s*(?:phần|mục)\s*\d+[\s\:\-\.]*/gim, '')
  // Xóa các dòng chỉ chứa riêng "Phần 1", "Phần 2"
  content = content.replace(/^\s*(?:phần|mục)\s*\d+\s*$/gim, '')
  // Chuẩn hóa khoảng trắng và dòng trống
  content = content.replace(/\n{3,}/g, '\n\n').trim()

  let title = String(post.title || '').trim()
  // Xóa chữ "Tiêu đề: " nếu có
  title = title.replace(/^\s*(?:tiêu đề|title)[\s\:\-]+/i, '').trim()

  // Nếu đầu content trùng với title thì lược bớt để tránh lặp khi đăng Facebook
  if (title) {
    const lines = content.split('\n')
    if (lines.length > 0 && lines[0].trim().toLowerCase() === title.toLowerCase()) {
      content = lines.slice(1).join('\n').trim()
    }
  }

  return {
    variant_index: Number(post.variant_index) || (index + 1),
    style: post.style || 'Chuyên gia / Ngắn gọn',
    title: title || `Bài viết BĐS ${index + 1}`,
    content,
    used_model: usedModel || post.used_model,
  }
}

const ALL_EXPERT_STYLES = [
  'Chuyên gia / Tổng quan giá trị',
  'Chuyên gia / Dòng tiền & Tiềm năng',
  'Chuyên gia / Vị trí & An sinh',
  'Chuyên gia / Đánh giá thực tế',
  'Chuyên gia / Điểm nhấn độc bản',
  'Chuyên gia / Tiềm năng hạ tầng & Quy hoạch',
  'Chuyên gia / Phân tích suất đầu tư & Thanh khoản',
  'Chuyên gia / So sánh lợi thế phân khúc',
  'Chuyên gia / Cơ hội an cư bền vững',
  'Chuyên gia / Đòn bẩy tài chính & Giữ vốn',
  'Chuyên gia / Kết nối giao thông & Tiện ích sống',
  'Chuyên gia / Phân tích giá trị thặng dư',
]

function getBatchSizes(total: number, maxBatchSize = 5): number[] {
  if (total <= maxBatchSize) return [total]
  const numBatches = Math.ceil(total / maxBatchSize)
  const baseSize = Math.floor(total / numBatches)
  const remainder = total % numBatches
  const batches: number[] = []
  for (let i = 0; i < numBatches; i++) {
    batches.push(baseSize + (i < remainder ? 1 : 0))
  }
  return batches
}

async function generateBatch(
  batchSize: number,
  startIndex: number,
  options: GenerateOptions,
  systemPrompt: string,
  contactText: string,
  apiKey: string,
  preferredModelIndex = 0
): Promise<{ variants: PostVariant[]; usedModelIndex: number; usedModel: string }> {
  const batchStyles = Array.from({ length: batchSize }, (_, i) => {
    return ALL_EXPERT_STYLES[(startIndex + i) % ALL_EXPERT_STYLES.length]
  })

  const styleRequirements = batchStyles
    .map((style, i) => `   - Bài ${startIndex + i + 1}: Áp dụng góc tiếp cận "${style}"`)
    .join('\n')

  const userPrompt = `Hãy viết ĐÚNG ${batchSize} bài viết marketing BĐS theo các thông tin sau:
- Tiêu đề gốc tham khảo: ${options.title}
- Mô tả chi tiết BĐS: ${options.description}

### THÔNG TIN LIÊN HỆ BẮT BUỘC Ở CUỐI MỖI BÀI VIẾT:
${contactText}

### YÊU CẦU CHO TỪNG BÀI VIẾT TRONG BATCH NÀY:
${styleRequirements}
   - Tiêu đề: ĐẦY ĐỦ THÔNG TIN (loại hình, khu vực, điểm mạnh, giá mờ) nhưng BIẾN TẤU từ ngữ khác nhau. BẮT BUỘC giữ nguyên DẤU THANH TIẾNG VIỆT chính xác khi viết hoa (VD: BÁN, NHÀ, ĐẤT, THÔNG, ÔTÔ, TẦNG, TIỆN ÍCH... — TUYỆT ĐỐI KHÔNG viết thiếu dấu hoặc sai chính tả Tiếng Việt).
   - Thân bài: Chia nhiều đoạn ngắn cách nhau bằng \\n\\n, có in đậm **đề mục**, in đậm **thông số/từ khóa**, có gạch đầu dòng (-), in nghiêng *câu đúc kết*.
   - Tuyệt đối KHÔNG có icon/emoji.
   - Cuối bài gắn chính xác khối thông tin liên hệ như trên.

Trả về duy nhất định dạng JSON thuần túy (JSON object có key "posts" là mảng gồm đúng ${batchSize} phần tử):
{
  "posts": [
    {
      "variant_index": ${startIndex + 1},
      "style": "${batchStyles[0] || 'Chuyên gia / Tổng quan giá trị'}",
      "title": "TIÊU ĐỀ IN HOA ĐẦY ĐỦ THÔNG TIN BIẾN TẤU",
      "content": "Nội dung bài viết chia nhiều đoạn, có in đậm **đề mục**, in đậm **thông số/từ khóa**, in nghiêng *câu đúc kết*, có gạch đầu dòng (-), cách nhau bằng \\n\\n, cuối bài có đầy đủ thông tin liên hệ in đậm"
    }
  ]
}`

  let lastError: Error | null = null

  // Luân chuyển tuần tự các model nếu model hiện tại chạm limit (Rate Limit, Quá tải hoặc lỗi)
  for (let attempt = 0; attempt < ALL_GROQ_MODELS.length; attempt++) {
    const modelIdx = (preferredModelIndex + attempt) % ALL_GROQ_MODELS.length
    const currentModel = ALL_GROQ_MODELS[modelIdx]

    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: currentModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 4096,
          temperature: 0.85,
          response_format: { type: 'json_object' },
        }),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        if (response.status === 401) {
          throw new Error('GROQ_API_KEY không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại API Key.')
        }

        const isRateLimit = response.status === 429 || /rate_limit|rate limit|quota|tokens per minute|requests per minute|tpm|rpm/i.test(errorBody)
        const isOverloaded = response.status === 503 || /overloaded|capacity/i.test(errorBody)
        const reason = isRateLimit
          ? 'Chạm giới hạn Rate Limit (429)'
          : isOverloaded
          ? 'Máy chủ model quá tải (503)'
          : `Lỗi API (${response.status})`

        // Nếu còn model dự phòng tiếp theo trong danh sách, luân chuyển ngay
        if (attempt < ALL_GROQ_MODELS.length - 1) {
          const nextModelIdx = (modelIdx + 1) % ALL_GROQ_MODELS.length
          const nextModel = ALL_GROQ_MODELS[nextModelIdx]
          console.warn(`[Groq AI] Model "${currentModel}" ${reason}. Đang tự động chuyển sang "${nextModel}"...`)
          options.onModelFallback?.(currentModel, nextModel, reason)
          await new Promise((r) => setTimeout(r, 400))
          continue
        }

        throw new Error(`Groq API Lỗi (${response.status}): ${errorBody}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content
      if (!content) {
        throw new Error(`Groq model ${currentModel} không trả về kết quả`)
      }

      const parsed = parseJsonSafe(content)
      let rawList: any[] = []
      if (Array.isArray(parsed)) rawList = parsed
      else if (parsed.posts && Array.isArray(parsed.posts)) rawList = parsed.posts
      else if (parsed.variants && Array.isArray(parsed.variants)) rawList = parsed.variants
      else {
        const values = Object.values(parsed).find((val) => Array.isArray(val))
        if (values) rawList = values as any[]
      }

      if (rawList.length > 0) {
        const variants = rawList.map((item, idx) => cleanGeneratedPost(item, startIndex + idx, currentModel))
        return { variants, usedModelIndex: modelIdx, usedModel: currentModel }
      }

      throw new Error('Dữ liệu JSON không đúng cấu trúc mảng bài viết')
    } catch (err: any) {
      lastError = err
      if (err?.message?.includes('GROQ_API_KEY không hợp lệ')) {
        throw err
      }

      if (attempt < ALL_GROQ_MODELS.length - 1) {
        const nextModelIdx = (modelIdx + 1) % ALL_GROQ_MODELS.length
        const nextModel = ALL_GROQ_MODELS[nextModelIdx]
        const reason = err?.message || 'Lỗi xử lý kết quả'
        console.warn(`[Groq AI] Model "${currentModel}" gặp sự cố (${reason}). Đang tự động chuyển sang "${nextModel}"...`)
        options.onModelFallback?.(currentModel, nextModel, reason)
        await new Promise((r) => setTimeout(r, 400))
        continue
      }
    }
  }

  throw lastError || new Error(`Tất cả các model Groq (${ALL_GROQ_MODELS.join(', ')}) đều chạm giới hạn hoặc gặp sự cố. Vui lòng thử lại sau 30-60 giây.`)
}

export async function generatePostsWithGroq(options: GenerateOptions): Promise<PostVariant[]> {
  const apiKey = options.apiKey || (import.meta as any).env?.VITE_GROQ_API_KEY
  if (!apiKey) {
    throw new Error('Chưa cấu hình GROQ_API_KEY. Vui lòng thêm VITE_GROQ_API_KEY vào .env.local hoặc nhập trong Cài đặt.')
  }

  const systemPrompt = (options.customSystemPrompt && options.customSystemPrompt.trim().length > 20)
    ? options.customSystemPrompt
    : SYSTEM_PROMPT_BDS

  const hasPhone2 = Boolean(options.agentPhone2 && options.agentPhone2.trim().length > 0)
  const contactText = hasPhone2
    ? `**Liên hệ ngay Em ${options.agentName}**\n**SĐT 1:** ${options.agentPhone}\n**SĐT 2:** ${options.agentPhone2?.trim()}`
    : `**Liên hệ ngay Em ${options.agentName}**\n**SĐT:** ${options.agentPhone}`

  // Chia nhỏ thành các batch (tối đa 5 bài/lần) để đảm bảo không bị chạm giới hạn max_tokens (4096)
  const batchSizes = getBatchSizes(options.numVariants, 5)
  const allVariants: PostVariant[] = []

  let currentIndex = 0
  let activeModelIndex = 0

  for (let b = 0; b < batchSizes.length; b++) {
    const size = batchSizes[b]
    if (b > 0) {
      // Delay nhỏ giữa các batch để tuân thủ Groq Rate Limits
      await new Promise((resolve) => setTimeout(resolve, 350))
    }
    const { variants: batchResults, usedModelIndex } = await generateBatch(
      size,
      currentIndex,
      options,
      systemPrompt,
      contactText,
      apiKey,
      activeModelIndex
    )
    activeModelIndex = usedModelIndex
    allVariants.push(...batchResults)
    currentIndex += batchResults.length
  }

  // Cơ chế an toàn: Nếu AI trả về thiếu bài so với numVariants, gọi bổ sung đúng số lượng còn thiếu
  if (allVariants.length < options.numVariants) {
    const missing = options.numVariants - allVariants.length
    try {
      await new Promise((resolve) => setTimeout(resolve, 400))
      const { variants: topup, usedModelIndex } = await generateBatch(
        missing,
        allVariants.length,
        options,
        systemPrompt,
        contactText,
        apiKey,
        activeModelIndex
      )
      activeModelIndex = usedModelIndex
      allVariants.push(...topup)
    } catch (e) {
      console.warn('Lỗi khi sinh bù bài viết:', e)
    }
  }

  // Đảm bảo trả về đúng số bài và đánh số variant_index chính xác từ 1 đến N
  return allVariants.slice(0, options.numVariants).map((item, idx) => ({
    ...item,
    variant_index: idx + 1,
  }))
}
