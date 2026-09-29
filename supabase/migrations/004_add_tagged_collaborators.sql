-- ============================================================
-- RealPost AI — Add tagged_collaborators column
-- Lưu danh sách 1-2 cộng sự cố định để tự động gắn thẻ (Tag People) khi đăng bài Facebook
-- Chạy file này trong Supabase SQL Editor
-- ============================================================

-- 1. Lưu danh sách cộng sự mặc định trong cài đặt người dùng
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS tagged_collaborators JSONB DEFAULT '[]'::jsonb;

-- 2. Tùy chọn lưu danh sách cộng sự gắn thẻ theo từng lịch đăng bài
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS tagged_collaborators JSONB DEFAULT NULL;
