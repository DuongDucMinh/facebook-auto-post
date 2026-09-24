import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AppSettings } from '@/types/database'
import { useEffect } from 'react'

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await (supabase
        .from('app_settings') as any)
        .select('*')
        .eq('user_id', user.id)
        .single()
      if (error) throw error
      return data as AppSettings
    },
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates: Partial<AppSettings>) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await (supabase.from('app_settings') as any)
        .upsert({ user_id: user.id, ...updates, updated_at: new Date().toISOString() })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}

// Extension bridge: check connection
export function useExtensionBridge() {
  const qc = useQueryClient()

  useEffect(() => {
    const checkExtension = () => {
      try {
        // Try to ping extension via window message
        window.postMessage({ type: 'REALPOST_PING' }, '*')
      } catch { /* extension not present */ }
    }

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'REALPOST_PONG') {
        // Extension is connected
        const { data: { user } } = await supabase.auth.getUser()
        const { data: { session } } = await supabase.auth.getSession()
        if (user) {
          await (supabase.from('app_settings') as any)
            .update({ extension_connected: true, extension_token: event.data.token })
            .eq('user_id', user.id)
          qc.invalidateQueries({ queryKey: ['settings'] })

          // Automatically sync credentials to Extension
          if (session?.access_token) {
            window.postMessage({
              type: 'REALPOST_CONFIG',
              supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
              supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
              accessToken: session.access_token,
            }, '*')
          }
        }
      }
    }

    window.addEventListener('message', handleMessage)
    checkExtension()
    const interval = setInterval(checkExtension, 10_000)
    return () => {
      window.removeEventListener('message', handleMessage)
      clearInterval(interval)
    }
  }, [qc])
}
