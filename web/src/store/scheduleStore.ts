import { create } from 'zustand'
import type { ScheduleEntry } from '@/lib/scheduler'

interface ScheduleStore {
  pendingSchedules: ScheduleEntry[]
  setPendingSchedules: (schedules: ScheduleEntry[]) => void
  clearPendingSchedules: () => void
  isGenerating: boolean
  setIsGenerating: (v: boolean) => void
}

export const useScheduleStore = create<ScheduleStore>((set) => ({
  pendingSchedules: [],
  setPendingSchedules: (schedules) => set({ pendingSchedules: schedules }),
  clearPendingSchedules: () => set({ pendingSchedules: [] }),
  isGenerating: false,
  setIsGenerating: (v) => set({ isGenerating: v }),
}))
