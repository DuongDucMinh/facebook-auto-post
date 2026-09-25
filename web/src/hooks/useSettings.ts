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

// Extension bridge: check connection and keep credentials synchronized
export function useExtensionBridge() {
  const qc = useQueryClient()

  useEffect(() => {
    const syncConfigToExtension = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          window.postMessage({
            type: 'REALPOST_CONFIG',
            supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
            supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
          }, '*')
        }
      } catch { /* ignore */ }
    }

    const checkExtension = () => {
      try {
        window.postMessage({ type: 'REALPOST_PING' }, '*')
      } catch { /* extension not present */ }
    }

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'REALPOST_PONG' || event.data?.type === 'REALPOST_REQUEST_AUTH_SYNC') {
        const { data: { user } } = await supabase.auth.getUser()
        if (user && event.data?.token) {
          await (supabase.from('app_settings') as any)
            .update({ extension_connected: true, extension_token: event.data.token })
            .eq('user_id', user.id)
          qc.invalidateQueries({ queryKey: ['settings'] })
        }
        await syncConfigToExtension()
      }
    }

    window.addEventListener('message', handleMessage)
    checkExtension()
    syncConfigToExtension()

    // Sync on token refresh or sign in/out
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.access_token) {
        window.postMessage({
          type: 'REALPOST_CONFIG',
          supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
          supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
        }, '*')
      }
    })

    const interval = setInterval(() => {
      checkExtension()
      syncConfigToExtension()
    }, 15_000)

    return () => {
      window.removeEventListener('message', handleMessage)
      subscription.unsubscribe()
      clearInterval(interval)
    }
  }, [qc])
}
