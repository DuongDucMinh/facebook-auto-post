-- ============================================================
-- RealPost AI — Add tagged_collaborators column to schedules
-- Chạy file này trong Supabase SQL Editor nếu gặp lỗi khi
-- nhấn "Nạp vào lịch" (lỗi: column "tagged_collaborators" does not exist)
-- ============================================================

ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS tagged_collaborators JSONB DEFAULT NULL;
