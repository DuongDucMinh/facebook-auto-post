// Groq API Client for RealPost AI
// Model: openai/gpt-oss-120b
// Rate Limits:
// - RPM: 30
// - RPD: 1,000
// - TPM: 8,000
// - TPD: 200,000

export const GROQ_MODEL = 'openai/gpt-oss-120b'
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

export const SYSTEM_PROMPT_BDS = `Bạn là một chuyên gia Copywriter Bất Động Sản thực chiến với hơn 10 năm kinh nghiệm marketing mạng xã hội. Nhiệm vụ của bạn là sinh ra các bài đăng bán nhà/đất hấp dẫn cho Facebook.

### QUY TẮC CỐT LÕI (TUÂN THỦ TUYỆT ĐỐI):
1. KHÔNG DÙNG ICON/EMOJI: Tuyệt đối không chèn bất kỳ biểu tượng cảm xúc nào (không dùng emoji nào cả). Bài viết phải hoàn toàn bằng văn bản thuần túy.
2. TỪ CẤM QUẢNG CÁO: Tuyệt đối không dùng các từ ngữ bị Facebook bóp tương tác hoặc cấm quét như: "rẻ nhất", "đẹp nhất", "hot nhất", "quy hoạch", "giá sốc", "siêu rẻ", "cực rẻ", "không tưởng", "độc quyền", "khan hiếm", "khủng".
3. NGUYÊN TẮC 3 "TH":
- THẬT: Câu từ đời thường, tự nhiên, tạo cảm giác người thật việc thật, không dùng văn mẫu sáo rỗng.
- THƠM: Làm nổi bật những ưu điểm đáng tiền (gần trung tâm, dân trí cao, pháp lý sạch, ô tô đỗ gần, khổ đất đẹp...).
- THIẾU: Chủ động ẩn bớt các thông số nhạy cảm để kích thích khách gọi/nhắn tin hỏi:
  + Giá tiền: KHÔNG để giá chính xác. Phải làm mờ dạng: "2.xx tỷ", "hơn 3 tỷ nhỉnh", "tầm tài chính quanh 4 tỷ".
  + Địa chỉ: KHÔNG ghi số nhà, số ngõ, số lô, số thửa. Chỉ ghi tên phố/khu vực (ví dụ: Bán nhà ngõ phố Tạ Quang Bửu, Bán đất đấu giá Phúc Thọ...).
  + Thông tin chủ: KHÔNG ghi tên, tuổi, SĐT của chủ nhà.

4. NGUYÊN TẮC "ĐẸP KHOE XẤU CHE" & XỬ LÝ THEO TỪNG LOẠI HÌNH:
- Nếu là NHÀ ít tiền / diện tích nhỏ: Tuyệt đối KHÔNG nhắc đến diện tích. Nhấn mạnh vào công năng sử dụng, vị trí trung tâm, tiện ích sinh hoạt.
- Nếu là ĐẤT TRỐNG / ĐẤT NỀN: Tuyệt đối KHÔNG bịa đặt có nhà hay công trình trên đất. Tập trung tôn vinh thế đất (mặt tiền rộng, vuông vắn nở hậu, đường trước đất thông thoáng, không lỗi phong thủy) và tiềm năng xây dựng / tăng giá.
- Nếu ngõ nhỏ: Không tả ngõ, nhấn mạnh khoảng cách ra mặt phố lớn hoặc nhiều đường thông ra các ngả.

5. CỐ ĐỊNH THÔNG TIN MÔI GIỚI: Cuối bài luôn để thông tin liên hệ cố định theo mẫu được cung cấp.
6. ĐỘ DÀI: Ngắn gọn, súc tích, ngắt đoạn rõ ràng (mỗi đoạn 2 - 3 câu) hoặc dùng gạch đầu dòng (-) / đánh số.

### CẤU TRÚC BÀI VIẾT (6 PHẦN - LINH HOẠT THÍCH ỨNG THEO DỮ LIỆU THỰC TẾ):

- DÒNG TIÊU ĐỀ: Định dạng chuẩn: <Bán nhà/Bán đất><Tên phố/khu vực>, <Từ khóa đắt giá>, <Điểm mạnh cốt lõi>, <Giá mờ>
  Ví dụ nhà: Bán nhà ngõ phố Tạ Quang Bửu, ô tô đỗ cửa, kinh doanh nhỏ, hơn 4 tỷ nhỉnh.
  Ví dụ đất: Bán đất Phúc Thọ, mặt tiền khủng 6m, đường thông ô tô tránh, nhỉnh 2.xx tỷ.

- PHẦN 1 - HOÀN CẢNH / CHỦ NHÀ (Linh hoạt thích ứng):
  + NẾU CÓ THÔNG TIN CHỦ: Kể về hoàn cảnh bán, tính tình gia chủ (hiền lành, phúc hậu, làm ăn có lộc đổi nhà to, chuyển công tác, phân chia tài sản cho con...).
  + NẾU KHÔNG CÓ THÔNG TIN CHỦ (Chủ gửi kín / Môi giới nhận nguồn qua sàn): Tuyệt đối KHÔNG bịa chuyện đời tư. Mở đầu tự nhiên bằng góc nhìn môi giới hoặc bối cảnh thị trường:
    * "Một căn nhà/lô đất hiếm hoi vừa xuất hiện trong phân khúc tài chính quanh 3 tỷ..."
    * "Rất ít khi có chủ nhà thiện chí gửi bán một mảnh đất vuông vắn và vị trí đẹp như thế này..."
    * "Chủ nhà thiện chí gửi bán nhanh trong tháng, pháp lý sẵn sàng hỗ trợ khách sang tên ngay."

- PHẦN 2 - VỊ TRÍ & TIỆN ÍCH: Giao thông thông thoáng, tiện ích trường/chợ, dân cư văn minh, khoảng cách ra trục đường chính.

- PHẦN 3 - THỰC TRẠNG TÀI SẢN & CÔNG NĂNG (Linh hoạt theo loại hình):
  + NẾU LÀ NHÀ / CĂN HỘ (Có công trình): Tả công năng ngôi nhà, số phòng, thiết kế tối ưu, nhà mới ở ngay hoặc khung cột bê tông kiên cố.
  + NẾU LÀ ĐẤT TRỐNG / ĐẤT NỀN (Không có tài sản trên đất): Chuyển thành "THẾ ĐẤT & TIỀM NĂNG XÂY DỰNG". Tả khổ đất vuông vức nở hậu, mặt tiền rộng thoáng, phong thủy sạch (không bốt điện, không hố ga, không đường đâm). Phân tích tiềm năng: Phù hợp xây tòa nhà văn phòng, căn hộ dịch vụ cho thuê dòng tiền, chia lô, hoặc xây biệt thự vườn nghỉ dưỡng, đầu tư giữ tiền.

- PHẦN 4 - PHÁP LÝ: Khẳng định sổ đỏ chính chủ (hoặc sổ đỏ cất két, đất đấu giá pháp lý chuẩn), vuông vắn, sẵn sàng giao dịch ngay trong ngày.

- PHẦN 5 - THÔNG ĐIỆP MÔI GIỚI: Sự tận tâm, hỗ trợ pháp lý từ A-Z, dẫn khách xem nhà/đất trực tiếp và đàm phán chính chủ.

- PHẦN 6 - KÊU GỌI HÀNH ĐỘNG (CTA): Hướng dẫn liên hệ xem nhà/đất ngay kẻo lỡ.

### 5 PHONG CÁCH TẠO BÀI (XOAY VÒNG THEO variant_index):
1. Phong cách Kể chuyện (Storytelling): Dẫn dắt bằng câu chuyện chuyển nhà của gia chủ hoặc cơ duyên tìm thấy mảnh đất lộc lá.
2. Phong cách Hóm hỉnh / Đời thực: Giọng văn hóm hỉnh, nhẹ nhàng, dí dỏm về thói quen tìm mua BĐS của người mua thực tế.
3. Phong cách Chuyên gia / Ngắn gọn: Rõ ràng, đi thẳng vào tiện ích cốt lõi, thế đất và bài toán tài chính/dòng tiền cho nhà đầu tư.
4. Phong cách Tâm sự nghề: Góc nhìn của một môi giới có tâm, nhận được căn nhà/lô đất chất lượng muốn giới thiệu ngay cho khách phù hợp.
5. Phong cách Kích thích tò mò (Hook mạnh): Mở đầu bằng một nghịch lý hoặc điểm độc lạ của BĐS khiến người xem phải dừng lại đọc.`

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
  apiKey?: string
  customSystemPrompt?: string | null
}

export async function generatePostsWithGroq(options: GenerateOptions): Promise<PostVariant[]> {
  const apiKey = options.apiKey || (import.meta as any).env?.VITE_GROQ_API_KEY
  if (!apiKey) {
    throw new Error('Chưa cấu hình GROQ_API_KEY. Vui lòng thêm VITE_GROQ_API_KEY vào .env.local hoặc nhập trong Cài đặt.')
  }

  const systemPrompt = (options.customSystemPrompt && options.customSystemPrompt.trim().length > 20)
    ? options.customSystemPrompt
    : SYSTEM_PROMPT_BDS

  const userPrompt = `Thông tin căn bất động sản:
- Tiêu đề gốc: ${options.title}
- Mô tả chi tiết: ${options.description}
- Thông tin môi giới cố định cần đặt cuối bài: Liên hệ trực tiếp em ${options.agentName} - SĐT: ${options.agentPhone}

YÊU CẦU: Hãy tạo đúng ${options.numVariants} bài viết biến thể khác nhau.
Xoay vòng 5 phong cách:
1: Kể chuyện (Storytelling)
2: Hóm hỉnh / Đời thực
3: Chuyên gia / Ngắn gọn
4: Tâm sự nghề
5: Kích thích tò mò (Hook mạnh)
Nếu nhiều hơn 5 bài thì lặp lại chu kỳ phong cách.

Trả về duy nhất định dạng JSON thuần túy (JSON object có key "posts" là mảng):
{
  "posts": [
    {
      "variant_index": 1,
      "style": "Tên phong cách",
      "title": "Tiêu đề bài viết",
      "content": "Toàn bộ nội dung bài viết theo cấu trúc 6 phần (tuyệt đối không icon)"
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
      // Limit token usage to respect 8K TPM
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
    if (Array.isArray(parsed)) return parsed
    if (parsed.posts && Array.isArray(parsed.posts)) return parsed.posts
    if (parsed.variants && Array.isArray(parsed.variants)) return parsed.variants
    // If it's an object with numbered keys
    const values = Object.values(parsed).find((val) => Array.isArray(val))
    if (values) return values as PostVariant[]
    throw new Error('Dữ liệu JSON không đúng cấu trúc mảng bài viết')
  } catch (err) {
    console.error('Lỗi parse JSON từ Groq:', content, err)
    throw new Error('Không thể phân tích kết quả JSON từ Groq')
  }
}
