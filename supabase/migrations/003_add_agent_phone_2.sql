-- ============================================================
-- RealPost AI — Add agent_phone_2 column to app_settings
-- Chạy file này trong Supabase SQL Editor
-- ============================================================

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS agent_phone_2 TEXT DEFAULT '';
