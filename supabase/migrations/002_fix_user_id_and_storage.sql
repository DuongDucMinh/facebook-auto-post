-- ============================================================
-- RealPost AI — Fix Property user_id Default & Storage Permissions
-- Chạy script này trong Supabase SQL Editor nếu gặp lỗi 403
-- ============================================================

-- 1. Tự động gán user_id là auth.uid() nếu client không truyền
ALTER TABLE public.properties
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.schedules
  ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 2. Đảm bảo Storage Bucket 'property-images' tồn tại và là Public
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-images',
  'property-images',
  TRUE,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 3. Cấp quyền RLS đầy đủ trên storage.objects cho bucket 'property-images'
DROP POLICY IF EXISTS "Public read property images" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload property images" ON storage.objects;
DROP POLICY IF EXISTS "Auth update property images" ON storage.objects;
DROP POLICY IF EXISTS "Owner delete property images" ON storage.objects;

-- Cho phép xem và tải ảnh công khai (để Facebook & Web hiển thị ảnh)
CREATE POLICY "Public read property images" ON storage.objects
  FOR SELECT USING (bucket_id = 'property-images');

-- Cho phép người dùng đã đăng nhập tải ảnh lên (INSERT)
CREATE POLICY "Auth upload property images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'property-images'
    AND auth.role() = 'authenticated'
  );

-- Cho phép cập nhật ảnh (UPDATE - cần thiết khi gọi upload với upsert: true)
CREATE POLICY "Auth update property images" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'property-images'
    AND auth.role() = 'authenticated'
  );

-- Cho phép xóa ảnh
CREATE POLICY "Owner delete property images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'property-images'
    AND auth.role() = 'authenticated'
  );
