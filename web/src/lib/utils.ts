import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateTime(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function formatTime(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + '...'
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'warning',
    posting: 'info',
    success: 'success',
    failed: 'destructive',
    draft: 'secondary',
    approved: 'success',
    scheduled: 'info',
  }
  return colors[status] ?? 'secondary'
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Đang chờ',
    posting: 'Đang đăng',
    success: 'Thành công',
    failed: 'Thất bại',
    draft: 'Bản nháp',
    approved: 'Đã duyệt',
    scheduled: 'Đã lên lịch',
  }
  return labels[status] ?? status
}

export function randomPick<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

export function formatGoldenHour(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
