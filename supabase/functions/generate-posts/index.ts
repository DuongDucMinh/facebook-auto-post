// Supabase Edge Function: generate-posts
// Deploy with: supabase functions deploy generate-posts
// Model: openai/gpt-oss-120b via Groq API
// Rate Limits: RPM: 30 | RPD: 1K | TPM: 8K | TPD: 200K

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'openai/gpt-oss-120b'

const SYSTEM_PROMPT = `Bạn là một chuyên gia Copywriter Bất Động Sản thực chiến với hơn 10 năm kinh nghiệm marketing mạng xã hội. Nhiệm vụ của bạn là sinh ra các bài đăng bán nhà/đất hấp dẫn cho Facebook.

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
    } = body

    if (!property_id || !title || !description) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: property_id, title, description' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = Deno.env.get('GROQ_API_KEY')
    if (!apiKey) throw new Error('GROQ_API_KEY not configured in Supabase secrets')

    const userPrompt = `Thông tin bất động sản cần viết bài:
- Tên/Tiêu đề: ${title}
- Mô tả thô: ${description}
- Thông tin môi giới cố định: Liên hệ trực tiếp em ${agent_name} - SĐT: ${agent_phone}

Hãy sinh ra đúng ${num_variants} biến thể bài viết khác nhau theo 5 phong cách xoay vòng.
Trả về JSON object với key "posts":
{
  "posts": [
    {
      "variant_index": 1,
      "style": "Tên phong cách",
      "title": "Tiêu đề bài viết",
      "content": "Toàn bộ nội dung bài viết theo cấu trúc 6 phần (tuyệt đối không có icon/emoji)"
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
      throw new Error(`Groq API error: ${response.status} — ${errText}`)
    }

    const groqData = await response.json()
    const rawText = groqData.choices?.[0]?.message?.content ?? '{"posts":[]}'

    const parsed = JSON.parse(rawText)
    const variants = Array.isArray(parsed) ? parsed : (parsed.posts ?? parsed.variants ?? [])

    return new Response(JSON.stringify(variants), {
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
