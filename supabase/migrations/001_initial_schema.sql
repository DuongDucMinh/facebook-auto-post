-- ============================================================
-- RealPost AI — Initial Database Schema
-- Chạy file này trong Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: properties
-- ============================================================
CREATE TABLE IF NOT EXISTS public.properties (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  raw_description TEXT DEFAULT '',
  images        TEXT[] DEFAULT '{}',
  group_urls    TEXT[] DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: generated_posts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.generated_posts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id     UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  style           TEXT NOT NULL,
  variant_index   INTEGER NOT NULL DEFAULT 1,
  selected_images TEXT[] DEFAULT '{}',
  is_approved     BOOLEAN DEFAULT FALSE,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'scheduled')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: schedules
-- ============================================================
CREATE TABLE IF NOT EXISTS public.schedules (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id          UUID NOT NULL REFERENCES public.generated_posts(id) ON DELETE CASCADE,
  property_id      UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  target_group_url TEXT NOT NULL,
  scheduled_at     TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posting', 'success', 'failed')),
  error_log        TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient polling by extension
CREATE INDEX IF NOT EXISTS idx_schedules_status_time
  ON public.schedules (status, scheduled_at)
  WHERE status = 'pending';

-- ============================================================
-- TABLE: posting_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.posting_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id     UUID NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  posted_at       TIMESTAMPTZ,
  result          TEXT NOT NULL CHECK (result IN ('success', 'failed')),
  error_message   TEXT,
  screenshot_url  TEXT
);

-- ============================================================
-- TABLE: app_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
  user_id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fb_connected           BOOLEAN DEFAULT FALSE,
  extension_token        TEXT,
  extension_connected    BOOLEAN DEFAULT FALSE,
  default_golden_hours   JSONB DEFAULT '["07:00","11:30","16:00","20:30"]',
  agent_name             TEXT DEFAULT 'An Nhiên',
  agent_phone            TEXT DEFAULT '0123456789',
  extension_visible_mode BOOLEAN DEFAULT TRUE,
  custom_system_prompt   TEXT DEFAULT NULL,
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FUNCTION: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- FUNCTION: auto-create app_settings on new user
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.app_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posting_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Properties: user chỉ thấy BĐS của mình
CREATE POLICY "Users can view own properties" ON public.properties
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own properties" ON public.properties
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own properties" ON public.properties
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own properties" ON public.properties
  FOR DELETE USING (auth.uid() = user_id);

-- Generated posts: qua property ownership
CREATE POLICY "Users can view own posts" ON public.generated_posts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_id AND p.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert own posts" ON public.generated_posts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_id AND p.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can update own posts" ON public.generated_posts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_id AND p.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can delete own posts" ON public.generated_posts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_id AND p.user_id = auth.uid()
    )
  );

-- Schedules
CREATE POLICY "Users can view own schedules" ON public.schedules
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own schedules" ON public.schedules
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own schedules" ON public.schedules
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own schedules" ON public.schedules
  FOR DELETE USING (auth.uid() = user_id);

-- Posting logs: qua schedule
CREATE POLICY "Users can view own logs" ON public.posting_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.schedules s
      WHERE s.id = schedule_id AND s.user_id = auth.uid()
    )
  );
CREATE POLICY "Service can insert logs" ON public.posting_logs
  FOR INSERT WITH CHECK (TRUE);

-- App settings
CREATE POLICY "Users can view own settings" ON public.app_settings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.app_settings
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON public.app_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- STORAGE: property-images bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-images', 'property-images', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Public read property images" ON storage.objects
  FOR SELECT USING (bucket_id = 'property-images');

-- Authenticated upload
CREATE POLICY "Auth upload property images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-images'
    AND auth.role() = 'authenticated'
  );

-- Owner delete
CREATE POLICY "Owner delete property images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-images'
    AND auth.uid()::TEXT = (storage.foldername(name))[1]
  );
