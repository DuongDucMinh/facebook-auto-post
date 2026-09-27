// Groq API Client for RealPost AI
// Model: openai/gpt-oss-120b
// Rate Limits:
// - RPM: 30
// - RPD: 1,000
// - TPM: 8,000
// - TPD: 200,000

export const GROQ_MODEL = 'openai/gpt-oss-120b'
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

3. TUYỆT ĐỐI KHÔNG DÙNG ICON/EMOJI: Bài viết hoàn toàn bằng văn bản thuần túy (Plain text), không dùng bất kỳ biểu tượng cảm xúc nào để tránh bị thuật toán Facebook đánh giá spam. Dùng dấu gạch đầu dòng (-) và mũi tên (->) để tạo điểm nhấn tự nhiên.

4. CẤU TRÚC ĐỊNH DẠNG: NHIỀU ĐOẠN RÕ RÀNG & CÓ GẠCH ĐẦU DÒNG (-) (TUYỆT ĐỐI KHÔNG VIẾT THÀNH 1 ĐOẠN VĂN DUY NHẤT):
- TUYỆT ĐỐI KHÔNG viết dồn toàn bộ nội dung thành 1 đoạn văn liền tù tì.
- BẮT BUỘC chia bài viết thành từng đoạn ngắn rõ ràng, giữa mỗi đoạn và mỗi khối thông tin PHẢI CÁCH NHAU 1 DÒNG TRỐNG (dùng ký tự xuống dòng \\n\\n).
- BẮT BUỘC sử dụng dấu gạch đầu dòng (-) cho các thông số chi tiết của bất động sản (Diện tích, Kích thước/Mặt tiền, Đường/Ngõ trước nhà, Kết nối giao thông...) và các hướng khai thác/tiềm năng.
- TUYỆT ĐỐI KHÔNG in ra các từ ngữ dạng dàn bài máy móc như: "Phần 1", "Phần 2", "Phần 3", "Mục 1", "Mục 2", "1.", "2.".
- Sử dụng các đề mục tự nhiên, gần gũi như: "Thông tin lô đất:", "Thông tin căn nhà:", "2 hướng khai thác:", "Ưu thế nổi bật:", "Tiềm năng sinh lời:".

5. TỪ CẤM QUẢNG CÁO: Tuyệt đối không dùng các từ ngữ phóng đại bị Facebook bóp tương tác: "rẻ nhất", "đẹp nhất", "hot nhất", "quy hoạch", "giá sốc", "siêu rẻ", "cực rẻ", "không tưởng", "độc quyền", "khan hiếm", "khủng".

6. NGUYÊN TẮC 3 "TH":
- THẬT: Thông số trung thực từ mô tả được cấp, không chém gió, không vẽ vời.
- THƠM: Tôn vinh khéo léo ưu điểm đáng tiền (ngõ nông, đường thông, dân trí cao, pháp lý sạch, ô tô đỗ gần, tiện ích trường chợ...).
- THIẾU: Chủ động ẩn bớt thông số nhạy cảm để kích thích khách gọi hỏi:
  + Giá tiền: KHÔNG để giá chính xác. Luôn làm mờ: "2.xx tỷ", "hơn 3 tỷ nhỉnh", "tầm tài chính quanh 4 tỷ".
  + Địa chỉ: KHÔNG ghi số nhà, ngõ, lô, thửa. Chỉ ghi tên phố/khu vực.
  + Thông tin chủ: KHÔNG ghi tên, tuổi, SĐT của chủ nhà.

7. XỬ LÝ THEO ĐÚNG LOẠI HÌNH TÀI SẢN:
- ĐẤT TRỐNG / ĐẤT NỀN: Tuyệt đối KHÔNG tả nhà hay phòng ngủ trên đất. Tập trung thế đất (mặt tiền, ngõ thông, hướng, nở hậu) và tiềm năng xây dựng (xây ở, xây văn phòng, xây CCMN cho thuê, đầu tư giữ tiền).
- NHÀ / CĂN HỘ: Nhấn mạnh công năng (số phòng, chất lượng xây dựng, độ thoáng sáng, tiện ích an sinh).
- NGÕ NHỎ: Nhấn mạnh khoảng cách ra mặt phố lớn, ngõ thông ra các trục chính.

8. VÍ DỤ CẤU TRÚC MẪU CHUẨN CỦA MỘT BÀI VIẾT:
Tiêu đề: BÁN GẤP LÔ ĐẤT 70M² – SÁT VÁCH ĐH BÁCH KHOA CƠ SỞ 2, VĂN GIANG

Thôn Kim Ngưu, Văn Giang – vị trí đón đầu nhu cầu ở, kinh doanh và cho thuê quanh khu vực Đại học Bách Khoa Cơ sở 2.

Thông tin lô đất:

- Diện tích: 70m²
- Kích thước: 5m × 14m, tiền hậu 5m
- Ngõ trước đất rộng 7m, ô tô tải vào tận đất
- Ngõ thông ra đường 40m, kết nối thuận tiện

2 hướng khai thác:
- Mua đầu tư, đón tiềm năng tăng giá theo sự phát triển của khu vực.
- Xây tòa căn hộ/CCMN 8 tầng, khai thác nhu cầu thuê khi lượng sinh viên, giảng viên và người lao động gia tăng.

-> Một lô đất – vừa có giá trị tích lũy, vừa có thể tạo dòng tiền.

Liên hệ ngay Em Nhiên
SĐT 1: 0912345678
SĐT 2: 0987654321

9. CHỮ KÝ VÀ THÔNG TIN LIÊN HỆ CỐ ĐỊNH:
- Nếu người dùng cung cấp 2 số điện thoại, bắt buộc đăng cả 2 số theo mẫu:
Liên hệ ngay Em [Tên môi giới]
SĐT 1: [Số điện thoại 1]
SĐT 2: [Số điện thoại 2]
- Nếu chỉ có 1 số điện thoại:
Liên hệ ngay Em [Tên môi giới]
SĐT: [Số điện thoại 1]

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
}

// Hàm làm sạch triệt để các nhãn máy móc nếu AI vô tình sinh ra
function cleanGeneratedPost(post: any, index: number): PostVariant {
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
  apiKey: string
): Promise<PostVariant[]> {
  const batchStyles = Array.from({ length: batchSize }, (_, i) => {
    return ALL_EXPERT_STYLES[(startIndex + i) % ALL_EXPERT_STYLES.length]
  })

  const userPrompt = `Thông tin căn bất động sản:
- Tiêu đề gốc: ${options.title}
- Mô tả chi tiết: ${options.description}
- Thông tin liên hệ cố định bắt buộc đặt ở cuối bài (giữ nguyên định dạng từng dòng):
${contactText}

YÊU CẦU ĐẶC BIỆT:
1. Hãy tạo đúng chính xác ${batchSize} bài viết biến thể khác nhau (từ biến thể #${startIndex + 1} đến #${startIndex + batchSize}) theo phong cách CHUYÊN GIA / THỰC TẾ, các góc tiếp cận:
${batchStyles.map((st, idx) => `   - Biến thể ${startIndex + idx + 1}: ${st}`).join('\n')}

2. YÊU CẦU TIÊU ĐỀ ("title"):
   - Mỗi tiêu đề PHẢI ĐẦY ĐỦ THÔNG TIN: (1) Loại hình + Khu vực, (2) Điểm mạnh nổi bật, (3) Giá trị/Công năng, (4) Mức giá mờ.
   - Giữa các bài viết, tiêu đề PHẢI BIẾN TẤU LINH HOẠT về trật tự từ, cách nhấn mạnh và từ ngữ diễn đạt, TUYỆT ĐỐI KHÔNG ĐƯỢC GIỐNG NHAU Y CHANG.

3. YÊU CẦU ĐỊNH DẠNG NỘI DUNG ("content") (TUÂN THỦ TUYỆT ĐỐI):
   - BẮT BUỘC CHIA THÀNH NHIỀU ĐOẠN KHÁC NHAU, GIỮA CÁC ĐOẠN CÁCH NHAU 1 DÒNG TRỐNG (dùng ký tự \\n\\n). TUYỆT ĐỐI KHÔNG ĐƯỢC VIẾT DỒN THÀNH 1 ĐOẠN VĂN DUY NHẤT.
   - BẮT BUỘC SỬ DỤNG DẤU GẠCH ĐẦU DÒNG (-) cho phần thông số chi tiết (Diện tích, Kích thước, Mặt tiền, Ngõ/Đường...) và các hướng khai thác/tiềm năng.
   - Cấu trúc mẫu chuẩn cho "content":
[1 - 2 câu mở đầu giới thiệu vị trí & tiềm năng đón đầu nhu cầu]

Thông tin lô đất: (hoặc Thông tin căn nhà:)
- Diện tích: ...
- Kích thước: ...
- Ngõ/Đường trước đất/nhà: ...
- Kết nối giao thông: ...

2 hướng khai thác: (hoặc Tiềm năng & Công năng:)
- [Hướng khai thác 1 / Đầu tư sinh lời]
- [Hướng khai thác 2 / Xây CCMN, cho thuê, ở sướng]

-> [1 câu chốt đúc kết giá trị cốt lõi / tích lũy / tạo dòng tiền]

${contactText}

   - Viết ngắn gọn, súc tích, chuyên nghiệp, đi thẳng vào giá trị thật.
   - TUYỆT ĐỐI KHÔNG BỊA CHUYỆN, không bịa người mua, không kể chuyện dẫn ai đi xem hay đã bán cho ai.
   - TUYỆT ĐỐI KHÔNG NHẮC TÊN BẤT KỲ NGƯỜI LẠ NÀO.
   - TUYỆT ĐỐI KHÔNG dùng các nhãn máy móc như "Phần 1:", "Phần 2:".
   - Tuyệt đối KHÔNG có icon/emoji.
   - Cuối bài gắn chính xác khối thông tin liên hệ như trên.

Trả về duy nhất định dạng JSON thuần túy (JSON object có key "posts" là mảng gồm đúng ${batchSize} phần tử):
{
  "posts": [
    {
      "variant_index": ${startIndex + 1},
      "style": "${batchStyles[0] || 'Chuyên gia / Tổng quan giá trị'}",
      "title": "Tiêu đề đầy đủ thông tin nhưng được biến tấu riêng",
      "content": "Nội dung bài viết chia nhiều đoạn rõ ràng, có gạch đầu dòng (-), cách nhau bằng \\n\\n, cuối bài có đầy đủ thông tin liên hệ"
    }
  ]
}`

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
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
    if (response.status === 429) {
      throw new Error('Đã chạm giới hạn Groq Rate Limit (30 req/phút hoặc 8K token/phút). Vui lòng đợi 30 giây và thử lại.')
    }
    throw new Error(`Groq API Lỗi (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('Groq không trả về kết quả')
  }

  try {
    const parsed = JSON.parse(content)
    let rawList: any[] = []
    if (Array.isArray(parsed)) rawList = parsed
    else if (parsed.posts && Array.isArray(parsed.posts)) rawList = parsed.posts
    else if (parsed.variants && Array.isArray(parsed.variants)) rawList = parsed.variants
    else {
      const values = Object.values(parsed).find((val) => Array.isArray(val))
      if (values) rawList = values as any[]
    }

    if (rawList.length > 0) {
      return rawList.map((item, idx) => cleanGeneratedPost(item, startIndex + idx))
    }
    throw new Error('Dữ liệu JSON không đúng cấu trúc mảng bài viết')
  } catch (err) {
    console.error('Lỗi parse JSON từ Groq:', content, err)
    throw new Error('Không thể phân tích kết quả JSON từ Groq')
  }
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
    ? `Liên hệ ngay Em ${options.agentName}\nSĐT 1: ${options.agentPhone}\nSĐT 2: ${options.agentPhone2?.trim()}`
    : `Liên hệ ngay Em ${options.agentName}\nSĐT: ${options.agentPhone}`

  // Chia nhỏ thành các batch (tối đa 5 bài/lần) để đảm bảo không bị chạm giới hạn max_tokens (4096)
  const batchSizes = getBatchSizes(options.numVariants, 5)
  const allVariants: PostVariant[] = []

  let currentIndex = 0
  for (let b = 0; b < batchSizes.length; b++) {
    const size = batchSizes[b]
    if (b > 0) {
      // Delay nhỏ giữa các batch để tuân thủ Groq Rate Limits
      await new Promise((resolve) => setTimeout(resolve, 350))
    }
    const batchResults = await generateBatch(size, currentIndex, options, systemPrompt, contactText, apiKey)
    allVariants.push(...batchResults)
    currentIndex += batchResults.length
  }

  // Cơ chế an toàn: Nếu AI trả về thiếu bài so với numVariants, gọi bổ sung đúng số lượng còn thiếu
  if (allVariants.length < options.numVariants) {
    const missing = options.numVariants - allVariants.length
    try {
      await new Promise((resolve) => setTimeout(resolve, 400))
      const topup = await generateBatch(missing, allVariants.length, options, systemPrompt, contactText, apiKey)
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
