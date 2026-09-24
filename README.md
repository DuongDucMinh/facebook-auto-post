# RealPost AI — Hệ thống AI Đăng Bài BĐS Facebook Tự Động

Hệ thống SaaS full-stack giúp môi giới bất động sản tự động tạo nội dung bài đăng bằng AI (Groq: `openai/gpt-oss-120b`) và lên lịch đăng tự động lên các nhóm Facebook — tuân thủ thuật toán chống spam của Meta.

## Kiến trúc hệ thống

```
facebook-auto-post/
├── web/                           # React 18 + Vite + TypeScript (Frontend)
│   ├── src/
│   │   ├── pages/                 # Dashboard, PostGenerator, PropertyList, Settings, Auth
│   │   ├── components/            # UI components (Button, Card, Input, Badge...)
│   │   ├── hooks/                 # React Query hooks (useProperties, useSchedules...)
│   │   ├── lib/                   # groq.ts, scheduler.ts, supabase.ts, utils.ts
│   │   └── types/                 # database.ts (Supabase TypeScript types)
│   └── .env.example
├── extension/                     # Chrome Extension Manifest V3
│   ├── manifest.json
│   ├── background.js              # Service Worker (Polling, Alarm, Tab Manager)
│   ├── content-script.js          # DOM Injection Facebook (Human-like delay)
│   ├── icons/                     # Extension icons (16, 48, 128)
│   └── popup/                     # Popup giao diện kiểm tra trạng thái
├── supabase/
│   ├── migrations/                # 001_initial_schema.sql (Schema + RLS + Storage)
│   └── functions/generate-posts/  # Edge Function (Groq openai/gpt-oss-120b)
└── .env.example
```

## Tech Stack & Thông số AI

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS v4 + Radix UI + Lucide Icons + Recharts
- **State Management**: TanStack Query v5 + Zustand
- **Backend / Database**: Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions)
- **AI Engine**: **Groq API**
  - Model: `openai/gpt-oss-120b`
  - Giới hạn:
    - **RPM**: 30 requests/phút
    - **RPD**: 1,000 requests/ngày
    - **TPM**: 8,000 tokens/phút
    - **TPD**: 200,000 tokens/ngày
  - Tối ưu hóa: Prompt tinh gọn, format JSON, giới hạn max_tokens (4096) đảm bảo không bao giờ vượt 8K TPM.
- **Chrome Extension**: Manifest V3 (hỗ trợ cả 2 chế độ: Mở Tab trực quan hoặc Chạy nền ngầm).

---

## Hướng dẫn thiết lập từng bước

### BƯỚC 1: Tạo Project Supabase mới
1. Truy cập [https://supabase.com](https://supabase.com) và đăng nhập (hoặc đăng ký).
2. Click **New Project** → Đặt tên project (ví dụ: `realpost-ai`), chọn mật khẩu database và Region gần bạn nhất (ví dụ: `Singapore - ap-southeast-1`).
3. Sau khi project tạo xong:
   - Vào **Project Settings** (biểu tượng bánh răng ở sidebar trái) → **API**.
   - Copy **Project URL** và **Project API keys (anon public)**.

### BƯỚC 2: Chạy Database Migration trên Supabase
1. Trên Supabase Dashboard, vào menu **SQL Editor** ở sidebar trái.
2. Click **New query**.
3. Mở file [001_initial_schema.sql](file:///d:/Python/project/facebook-auto-post/supabase/migrations/001_initial_schema.sql), copy toàn bộ nội dung và dán vào SQL Editor.
4. Click nút **Run** (hoặc nhấn Ctrl + Enter).
5. Sau khi chạy xong, bạn sẽ thấy 5 bảng được tạo cùng Row Level Security (RLS) và Storage bucket `property-images`:
   - `properties`
   - `generated_posts`
   - `schedules`
   - `posting_logs`
   - `app_settings`

### BƯỚC 3: Cấu hình biến môi trường
Tạo file `web/.env.local`:
```bash
cd web
cp .env.example .env.local
```
Mở file `web/.env.local` và điền:
```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
VITE_AGENT_NAME=An Nhiên
VITE_AGENT_PHONE=0123456789
```

> **Lấy Groq API Key**: Truy cập [https://console.groq.com/keys](https://console.groq.com/keys) để tạo key miễn phí.

### BƯỚC 4: Chạy Web App
```bash
cd web
npm install
npm run dev
```
Mở trình duyệt tại [http://localhost:5173](http://localhost:5173). Đăng ký một tài khoản admin để bắt đầu!

### BƯỚC 5: Cài đặt Chrome Extension
1. Mở trình duyệt Google Chrome hoặc Cốc Cốc / Brave / Edge.
2. Nhập vào thanh địa chỉ: `chrome://extensions`
3. Gạt bật **Developer mode** ở góc trên cùng bên phải.
4. Nhấn nút **Load unpacked** (Tải tiện ích đã giải nén).
5. Chọn thư mục `extension/` trong repo `facebook-auto-post`:
   `d:\Python\project\facebook-auto-post\extension`
6. Extension **RealPost AI Bridge** sẽ xuất hiện trên thanh công cụ của Chrome.

---

## Tính năng chi tiết

### 1. 🤖 AI Sinh bài viết (Groq `openai/gpt-oss-120b`)
- Sinh từ 1 đến 20 bài viết chất lượng cao từ mô tả thô của căn nhà.
- **Quy tắc 3 "TH"**:
  - **THẬT**: Câu từ đời thường, tự nhiên, chân thật.
  - **THƠM**: Tôn vinh ưu điểm đắt giá (trung tâm, dân trí cao, ô tô đỗ cửa...).
  - **THIẾU**: Giá mờ (2.xx tỷ), giấu số nhà/lô/thửa, giấu tên/SĐT chủ nhà.
- **Đẹp khoe xấu che**: Nhà nhỏ không tả diện tích, ngõ nhỏ nhấn mạnh đường thông ra phố lớn.
- **Tuyệt đối KHÔNG có icon/emoji** và không chứa các từ cấm bị bóp tương tác.
- **5 phong cách xoay vòng**:
  1. Kể chuyện (Storytelling)
  2. Hóm hỉnh / Đời thực
  3. Chuyên gia / Ngắn gọn
  4. Tâm sự nghề
  5. Kích thích tò mò (Hook mạnh)
- Cấu trúc 6 phần chuẩn mực: Chủ nhà → Vị trí → Tài sản → Pháp lý → Thông điệp môi giới → CTA cố định em An Nhiên - SĐT: 0123456789.

### 2. 📅 Thuật toán lên lịch chống Meta Spam
- Phân phối bài viết vào **4 khung giờ vàng**:
  - `07:00` (Buổi sáng bắt đầu ngày mới)
  - `11:30` (Nghỉ trưa)
  - `16:00` (Xế chiều)
  - `20:30` (Buổi tối thư giãn)
- Trong cùng 1 ngày và cùng 1 hội nhóm: Tối đa 4 bài, các bài bắt buộc khác phong cách/nội dung.
- Tự động bốc ngẫu nhiên 3 ảnh từ kho ảnh tối đa 10 ảnh của BĐS.

### 3. 🌐 Dashboard & Lịch dạng Grid
- 4 thẻ đo lường: Tổng bài đã lên lịch, Đã đăng hôm nay, Đang chờ xử lý, Lỗi đăng bài.
- Biểu đồ thống kê 7 ngày gần nhất (Recharts).
- Bảng lịch hàng tuần (Thứ 2 - Chủ Nhật) phân bổ theo 4 khung giờ vàng.

### 4. 🧩 Chrome Extension (2 chế độ hoạt động)
Người dùng có thể chuyển đổi linh hoạt trong trang **Cài đặt**:
- **Chế độ hiển thị (Visible Tab)**: Mở tab Facebook trực quan để bạn quan sát quá trình hệ thống tự động soạn thảo và đăng bài.
- **Chế độ chạy ngầm (Background Tab)**: Tự động chạy nền phía sau, không làm gián đoạn công việc của bạn.
- Tích hợp độ trễ ngẫu nhiên mô phỏng người dùng thật (2-5 giây giữa các thao tác bấm chuột, dán nội dung, tải ảnh, bấm Đăng).