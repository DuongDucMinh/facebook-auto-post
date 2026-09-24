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
    mutationFn: async (property: PropertyInsert) => {
      const { data, error } = await (supabase.from('properties') as any)
        .insert(property)
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
      const ext = file.name.split('.').pop()
      const fileName = `${propertyId}/${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('property-images')
        .upload(fileName, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('property-images').getPublicUrl(fileName)
      return data.publicUrl
    },
  })
}
