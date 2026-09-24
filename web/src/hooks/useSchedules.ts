import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ScheduleInsert } from '@/types/database'
import { startOfWeek, endOfWeek } from 'date-fns'

export function useSchedules(weekStart?: Date) {
  const start = weekStart ? startOfWeek(weekStart, { weekStartsOn: 1 }) : startOfWeek(new Date(), { weekStartsOn: 1 })
  const end = endOfWeek(start, { weekStartsOn: 1 })

  return useQuery({
    queryKey: ['schedules', start.toISOString()],
    queryFn: async () => {
      const { data, error } = await (supabase.from('schedules') as any)
        .select('*, generated_posts(id, title, content, style, variant_index, selected_images), properties(id, title, images, raw_description)')
        .gte('scheduled_at', start.toISOString())
        .lte('scheduled_at', end.toISOString())
        .order('scheduled_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as any[]
    },
  })
}

export function useScheduleStats() {
  return useQuery({
    queryKey: ['schedule-stats'],
    queryFn: async () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const [totalRes, todayRes, pendingRes, failedRes] = await Promise.all([
        (supabase.from('schedules') as any).select('id', { count: 'exact', head: true }),
        (supabase.from('schedules') as any).select('id', { count: 'exact', head: true })
          .eq('status', 'success')
          .gte('scheduled_at', today.toISOString())
          .lt('scheduled_at', tomorrow.toISOString()),
        (supabase.from('schedules') as any).select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        (supabase.from('schedules') as any).select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      ])

      return {
        total: totalRes.count ?? 0,
        postedToday: todayRes.count ?? 0,
        pending: pendingRes.count ?? 0,
        failed: failedRes.count ?? 0,
      }
    },
    refetchInterval: 30_000,
  })
}

export function useChartData() {
  return useQuery({
    queryKey: ['chart-data'],
    queryFn: async () => {
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (6 - i))
        d.setHours(0, 0, 0, 0)
        return d
      })

      const results = await Promise.all(
        days.map(async (day) => {
          const next = new Date(day)
          next.setDate(next.getDate() + 1)
          const [s, f] = await Promise.all([
            (supabase.from('schedules') as any).select('id', { count: 'exact', head: true })
              .eq('status', 'success').gte('scheduled_at', day.toISOString()).lt('scheduled_at', next.toISOString()),
            (supabase.from('schedules') as any).select('id', { count: 'exact', head: true })
              .eq('status', 'failed').gte('scheduled_at', day.toISOString()).lt('scheduled_at', next.toISOString()),
          ])
          return {
            date: day.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric' }),
            success: s.count ?? 0,
            failed: f.count ?? 0,
          }
        })
      )
      return results
    },
    refetchInterval: 60_000,
  })
}

export function useBatchCreateSchedules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (schedules: ScheduleInsert[]) => {
      const { data, error } = await (supabase.from('schedules') as any)
        .insert(schedules)
        .select()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] })
      qc.invalidateQueries({ queryKey: ['schedule-stats'] })
    },
  })
}

export function useRetrySchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (scheduleId: string) => {
      const { error } = await (supabase.from('schedules') as any)
        .update({ status: 'pending', error_log: null })
        .eq('id', scheduleId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  })
}

export interface UpdateSchedulePayload {
  scheduleId: string
  targetGroupUrl?: string
  scheduledAt?: string
  postId?: string
  postTitle?: string
  postContent?: string
  selectedImages?: string[]
}

export function useUpdateSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: UpdateSchedulePayload) => {
      // 1. Update schedules table
      const scheduleUpdates: any = {}
      if (payload.targetGroupUrl !== undefined) scheduleUpdates.target_group_url = payload.targetGroupUrl
      if (payload.scheduledAt !== undefined) scheduleUpdates.scheduled_at = payload.scheduledAt

      if (Object.keys(scheduleUpdates).length > 0) {
        const { error: schedErr } = await (supabase.from('schedules') as any)
          .update(scheduleUpdates)
          .eq('id', payload.scheduleId)
        if (schedErr) throw schedErr
      }

      // 2. Update generated_posts table
      if (payload.postId) {
        const postUpdates: any = {}
        if (payload.postTitle !== undefined) postUpdates.title = payload.postTitle
        if (payload.postContent !== undefined) postUpdates.content = payload.postContent
        if (payload.selectedImages !== undefined) postUpdates.selected_images = payload.selectedImages

        if (Object.keys(postUpdates).length > 0) {
          const { error: postErr } = await (supabase.from('generated_posts') as any)
            .update(postUpdates)
            .eq('id', payload.postId)
          if (postErr) throw postErr
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] })
      qc.invalidateQueries({ queryKey: ['schedule-stats'] })
    },
  })
}

export function useDeleteSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (scheduleId: string) => {
      const { error } = await (supabase.from('schedules') as any)
        .delete()
        .eq('id', scheduleId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] })
      qc.invalidateQueries({ queryKey: ['schedule-stats'] })
    },
  })
}

export function usePostNowSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (scheduleId: string) => {
      const now = new Date().toISOString()
      const { error } = await (supabase.from('schedules') as any)
        .update({
          scheduled_at: now,
          status: 'pending',
          error_log: null,
        })
        .eq('id', scheduleId)
      if (error) throw error

      // Trigger extension to poll and post immediately
      try {
        window.postMessage({ type: 'REALPOST_FORCE_POLL' }, '*')
      } catch {
        // ignore
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] })
      qc.invalidateQueries({ queryKey: ['schedule-stats'] })
    },
  })
}
