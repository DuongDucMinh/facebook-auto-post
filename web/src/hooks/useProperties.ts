import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Property, PropertyInsert, PropertyUpdate } from '@/types/database'

export function useProperties() {
  return useQuery<Property[]>({
    queryKey: ['properties'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('properties') as any)
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Property[]
    },
  })
}

export function useProperty(id: string) {
  return useQuery<Property | null>({
    queryKey: ['properties', id],
    queryFn: async () => {
      const { data, error } = await (supabase.from('properties') as any)
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Property
    },
    enabled: !!id,
  })
}

export function useCreateProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (property: Omit<PropertyInsert, 'id' | 'user_id'> & { user_id?: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Vui lòng đăng nhập để thêm bất động sản')

      const payload = {
        ...property,
        user_id: user.id,
      }

      const { data, error } = await (supabase.from('properties') as any)
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return data as Property
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] })
    },
  })
}

export function useUpdateProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: PropertyUpdate }) => {
      const { data, error } = await (supabase.from('properties') as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Property
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] })
    },
  })
}

export function useDeleteProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('properties') as any).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] })
    },
  })
}

export function useUploadPropertyImage() {
  return useMutation({
    mutationFn: async ({ file, propertyId }: { file: File; propertyId: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const folder = user?.id || propertyId || 'general'
      const cleanFileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

      try {
        const { error } = await supabase.storage
          .from('property-images')
          .upload(cleanFileName, file, {
            cacheControl: '3600',
            upsert: true,
          })

        if (error) throw error

        const { data } = supabase.storage.from('property-images').getPublicUrl(cleanFileName)
        return data.publicUrl
      } catch (err: any) {
        console.warn('[RealPost] Supabase Storage upload failed, fallback sang Base64 data URL:', err)
        // Fallback sang Base64 data URL nếu bucket storage chưa tạo hoặc bị chặn RLS (403)
        // Giúp người dùng không bao giờ bị nghẽn quy trình thêm BĐS
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = (e) => reject(e)
          reader.readAsDataURL(file)
        })
      }
    },
  })
}
