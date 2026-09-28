// Supabase Edge Function: generate-posts
// Deploy with: supabase functions deploy generate-posts
// Primary Model: openai/gpt-oss-120b via Groq API
// Fallback Models: openai/gpt-oss-20b, openai/gpt-oss-safeguard-20b, qwen/qwen3.8-27b
// Rate Limits: RPM: 30 | RPD: 1K | TPM: 8K | TPD: 200K

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b'
const GROQ_FALLBACK_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-safeguard-20b',
  'qwen/qwen3.8-27b',
] as const
const ALL_GROQ_MODELS = [DEFAULT_GROQ_MODEL, ...GROQ_FALLBACK_MODELS] as const
const GROQ_MODEL = DEFAULT_GROQ_MODEL

const SYSTEM_PROMPT = `Bạn là một chuyên gia Copywriter Bất Động Sản thực chiến với hơn 10 năm kinh nghiệm marketing mạng xã hội. Nhiệm vụ của bạn là viết các bài đăng bán nhà/đất trên Facebook mang văn phong CHUYÊN GIA / THỰC TẾ, súc tích, trung thực, rõ ràng và chia nhiều đoạn có gạch đầu dòng (-).

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
- TIÊU ĐỀ: Bắt buộc VIẾT HOA toàn bộ, nằm riêng ở trường "title", đầy đủ thông tin (loại hình, khu vực, điểm mạnh, giá mờ). Hệ thống sẽ tự động biến tiêu đề thành Header lớn (H1) nổi bật trên Facebook.
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GenerateRequest {
  property_id: string
  title: string
  description: string
  num_variants?: number
  agent_name?: string
  agent_phone?: string
  agent_phone_2?: string
}

// Hàm phân tích JSON an toàn, tự bóc tách markdown code fence nếu có
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
    throw new Error('Không thể phân tích dữ liệu JSON')
  }
}

function cleanGeneratedPost(post: any, index: number, usedModel?: string) {
  let content = String(post.content || '')
  content = content.replace(/^\s*(?:phần|mục)\s*\d+[\s\:\-\.]*/gim, '')
  content = content.replace(/^\s*(?:phần|mục)\s*\d+\s*$/gim, '')
  content = content.replace(/\n{3,}/g, '\n\n').trim()

  let title = String(post.title || '').trim()
  title = title.replace(/^\s*(?:tiêu đề|title)[\s\:\-]+/i, '').trim()

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
  title: string,
  description: string,
  contactText: string,
  apiKey: string
) {
  const batchStyles = Array.from({ length: batchSize }, (_, i) => {
    return ALL_EXPERT_STYLES[(startIndex + i) % ALL_EXPERT_STYLES.length]
  })

  const userPrompt = `Thông tin căn bất động sản:
- Tiêu đề gốc: ${title}
- Mô tả chi tiết: ${description}
- Thông tin liên hệ cố định bắt buộc đặt ở cuối bài (giữ nguyên định dạng từng dòng):
${contactText}

YÊU CẦU ĐẶC BIỆT:
1. Hãy tạo đúng chính xác ${batchSize} bài viết biến thể khác nhau (từ biến thể #${startIndex + 1} đến #${startIndex + batchSize}) theo phong cách CHUYÊN GIA / THỰC TẾ, các góc tiếp cận:
${batchStyles.map((st, idx) => `   - Biến thể ${startIndex + idx + 1}: ${st}`).join('\n')}

2. YÊU CẦU TIÊU ĐỀ ("title"):
   - BẮT BUỘC VIẾT HOA TOÀN BỘ TIÊU ĐỀ.
   - Mỗi tiêu đề PHẢI ĐẦY ĐỦ THÔNG TIN: (1) Loại hình + Khu vực, (2) Điểm mạnh nổi bật, (3) Giá trị/Công năng, (4) Mức giá mờ.
   - Giữa các bài viết, tiêu đề PHẢI BIẾN TẤU LINH HOẠT về trật tự từ, cách nhấn mạnh và từ ngữ diễn đạt, TUYỆT ĐỐI KHÔNG ĐƯỢC GIỐNG NHAU Y CHANG.

3. YÊU CẦU ĐỊNH DẠNG NỘI DUNG ("content") (TUÂN THỦ TUYỆT ĐỐI ĐỂ KÍCH HOẠT THANH CÔNG CỤ FACEBOOK):
   - BẮT BUỘC CHIA THÀNH NHIỀU ĐOẠN KHÁC NHAU, GIỮA CÁC ĐOẠN CÁCH NHAU 1 DÒNG TRỐNG (dùng ký tự \\n\\n). TUYỆT ĐỐI KHÔNG ĐƯỢC VIẾT DỒN THÀNH 1 ĐOẠN VĂN DUY NHẤT.
   - BẮT BUỘC SỬ DỤNG DẤU GẠCH ĐẦU DÒNG (-) cho phần thông số chi tiết (Diện tích, Kích thước, Mặt tiền, Ngõ/Đường...) và các hướng khai thác/tiềm năng.
   - BẮT BUỘC IN ĐẬM (**...**) các đề mục chính: **Thông tin lô đất:** (hoặc **Thông tin căn nhà:**), **2 hướng khai thác:**.
   - BẮT BUỘC IN ĐẬM (**...**) các từ khóa & thông số đắt giá: vị trí (**Thôn Kim Ngưu, Văn Giang**), thông số (**Diện tích: 70m²**, **Mặt tiền rộng 5m**, **Ngõ rộng 7m ô tô vào tận đất**), tiềm năng & giá (**xây CCMN cho thuê**, **tiềm năng tăng giá**, **nhỉnh 3 tỷ**).
   - IN NGHIÊNG (*...*) câu đúc kết giá trị cốt lõi cuối bài.
   - Cấu trúc mẫu chuẩn cho "content":
[1 - 2 câu mở đầu giới thiệu vị trí & tiềm năng, có in đậm vị trí đắc địa]

**Thông tin lô đất:** (hoặc **Thông tin căn nhà:**)
- **Diện tích:** ...
- **Kích thước / Mặt tiền:** ...
- **Ngõ/Đường trước đất/nhà:** ...
- **Kết nối giao thông:** ...

**2 hướng khai thác:** (hoặc **Tiềm năng & Công năng:**)
- [Hướng khai thác 1 / Đầu tư, có in đậm từ khóa quan trọng]
- [Hướng khai thác 2 / Dòng tiền, có in đậm từ khóa quan trọng]

*-> [1 câu chốt đúc kết giá trị cốt lõi / tích lũy / tạo dòng tiền]*

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
      "title": "TIÊU ĐỀ IN HOA ĐẦY ĐỦ THÔNG TIN BIẾN TẤU",
      "content": "Nội dung bài viết chia nhiều đoạn, có in đậm **đề mục**, in đậm **thông số/từ khóa**, in nghiêng *câu đúc kết*, có gạch đầu dòng (-), cách nhau bằng \\n\\n, cuối bài có đầy đủ thông tin liên hệ in đậm"
    }
  ]
}`

async function generateBatch(
  batchSize: number,
  startIndex: number,
  title: string,
  description: string,
  contactText: string,
  apiKey: string,
  preferredModelIndex = 0
): Promise<{ variants: any[]; usedModelIndex: number; usedModel: string }> {
  const batchStyles = Array.from({ length: batchSize }, (_, i) => {
    return ALL_EXPERT_STYLES[(startIndex + i) % ALL_EXPERT_STYLES.length]
  })

  const styleRequirements = batchStyles
    .map((style, i) => `   - Bài ${startIndex + i + 1}: Áp dụng góc tiếp cận "${style}"`)
    .join('\n')

  const userPrompt = `Hãy viết ĐÚNG ${batchSize} bài viết theo các thông tin sau:
- Tiêu đề gốc tham khảo: ${title}
- Mô tả chi tiết BĐS: ${description}

### THÔNG TIN LIÊN HỆ BẮT BUỘC Ở CUỐI MỖI BÀI VIẾT:
${contactText}

### YÊU CẦU CHO TỪNG BÀI VIẾT TRONG BATCH NÀY:
${styleRequirements}
   - Tiêu đề: ĐẦY ĐỦ THÔNG TIN (loại hình, khu vực, điểm mạnh, giá mờ) nhưng BIẾN TẤU từ ngữ khác nhau.
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
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 4096,
          temperature: 0.85,
          response_format: { type: 'json_object' },
        }),
      })

      if (!response.ok) {
        const errText = await response.text()
        if (response.status === 401) {
          throw new Error('GROQ_API_KEY không hợp lệ hoặc đã hết hạn trong Supabase Secrets')
        }

        const isRateLimit = response.status === 429 || /rate_limit|rate limit|quota|tokens per minute|requests per minute|tpm|rpm/i.test(errText)
        const isOverloaded = response.status === 503 || /overloaded|capacity/i.test(errText)
        const reason = isRateLimit
          ? 'Chạm giới hạn Rate Limit (429)'
          : isOverloaded
          ? 'Máy chủ model quá tải (503)'
          : `Lỗi API (${response.status})`

        // Nếu còn model dự phòng tiếp theo trong danh sách, luân chuyển ngay
        if (attempt < ALL_GROQ_MODELS.length - 1) {
          const nextModelIdx = (modelIdx + 1) % ALL_GROQ_MODELS.length
          const nextModel = ALL_GROQ_MODELS[nextModelIdx]
          console.warn(`[Groq Edge Function] Model "${currentModel}" ${reason}. Luân chuyển sang "${nextModel}"...`)
          await new Promise((r) => setTimeout(r, 400))
          continue
        }

        throw new Error(`Groq API error: ${response.status} — ${errText}`)
      }

      const groqData = await response.json()
      const rawText = groqData.choices?.[0]?.message?.content ?? '{"posts":[]}'

      let parsed: any = {}
      try {
        parsed = parseJsonSafe(rawText)
      } catch (e) {
        console.error(`JSON parse error from Groq model ${currentModel}:`, e)
        if (attempt < ALL_GROQ_MODELS.length - 1) {
          const nextModelIdx = (modelIdx + 1) % ALL_GROQ_MODELS.length
          const nextModel = ALL_GROQ_MODELS[nextModelIdx]
          console.warn(`[Groq Edge Function] Không thể parse JSON từ model "${currentModel}". Thử model "${nextModel}"...`)
          await new Promise((r) => setTimeout(r, 400))
          continue
        }
        return { variants: [], usedModelIndex: modelIdx, usedModel: currentModel }
      }

      const rawVariants = Array.isArray(parsed) ? parsed : (parsed.posts ?? parsed.variants ?? [])
      const variants = rawVariants.map((item: any, idx: number) => {
        const cleaned = cleanGeneratedPost(item, startIndex + idx, currentModel)
        cleaned.variant_index = startIndex + idx + 1
        if (!cleaned.style || cleaned.style === 'Chuyên gia / Ngắn gọn') {
          cleaned.style = batchStyles[idx] || 'Chuyên gia / Thực tế'
        }
        return cleaned
      })

      return { variants, usedModelIndex: modelIdx, usedModel: currentModel }
    } catch (err: any) {
      lastError = err
      if (err?.message?.includes('GROQ_API_KEY không hợp lệ')) {
        throw err
      }

      if (attempt < ALL_GROQ_MODELS.length - 1) {
        const nextModelIdx = (modelIdx + 1) % ALL_GROQ_MODELS.length
        const nextModel = ALL_GROQ_MODELS[nextModelIdx]
        console.warn(`[Groq Edge Function] Lỗi model "${currentModel}": ${err?.message}. Luân chuyển sang "${nextModel}"...`)
        await new Promise((r) => setTimeout(r, 400))
        continue
      }
    }
  }

  throw lastError || new Error(`Tất cả các model Groq (${ALL_GROQ_MODELS.join(', ')}) đều chạm giới hạn hoặc gặp sự cố.`)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: GenerateRequest = await req.json()
    const {
      property_id,
      title,
      description,
      num_variants = 10,
      agent_name = 'An Nhiên',
      agent_phone = '0123456789',
      agent_phone_2 = '',
    } = body

    if (!property_id || !title || !description) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: property_id, title, description' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = Deno.env.get('GROQ_API_KEY')
    if (!apiKey) throw new Error('GROQ_API_KEY not configured in Supabase secrets')

    const hasPhone2 = Boolean(agent_phone_2 && agent_phone_2.trim().length > 0)
    const contactText = hasPhone2
      ? `**Liên hệ ngay Em ${agent_name}**\n**SĐT 1:** ${agent_phone}\n**SĐT 2:** ${agent_phone_2.trim()}`
      : `**Liên hệ ngay Em ${agent_name}**\n**SĐT:** ${agent_phone}`

    const batchSizes = getBatchSizes(num_variants, 5)
    let allVariants: any[] = []
    let currentStartIndex = 0
    let activeModelIndex = 0

    for (const size of batchSizes) {
      const { variants: batchVariants, usedModelIndex } = await generateBatch(
        size,
        currentStartIndex,
        title,
        description,
        contactText,
        apiKey,
        activeModelIndex
      )
      activeModelIndex = usedModelIndex
      allVariants = [...allVariants, ...batchVariants]
      currentStartIndex += size
    }

    // Top-up fallback if AI returned fewer variants
    if (allVariants.length < num_variants) {
      const missingCount = num_variants - allVariants.length
      try {
        const { variants: topUpVariants, usedModelIndex } = await generateBatch(
          missingCount,
          allVariants.length,
          title,
          description,
          contactText,
          apiKey,
          activeModelIndex
        )
        activeModelIndex = usedModelIndex
        allVariants = [...allVariants, ...topUpVariants]
      } catch (err) {
        console.warn('Top-up batch failed:', err)
      }
    }

    allVariants = allVariants.map((v, i) => ({
      ...v,
      variant_index: i + 1,
    }))

    return new Response(JSON.stringify(allVariants.slice(0, num_variants)), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('generate-posts error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
