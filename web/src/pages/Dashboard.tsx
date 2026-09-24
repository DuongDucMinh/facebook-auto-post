import { useState } from 'react'
import { format, addWeeks, subWeeks, startOfWeek, addDays } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  Layers,
  X,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useScheduleStats, useChartData, useSchedules, useRetrySchedule } from '@/hooks/useSchedules'
import { getStatusLabel, truncate } from '@/lib/utils'
import { cn } from '@/lib/utils'

const GOLDEN_HOUR_LABELS = ['07:00 - 08:00', '11:00 - 12:00', '16:00 - 17:00', '20:00 - 21:00']
const GOLDEN_START = [7, 11, 16, 20]

export function Dashboard() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [selectedSlot, setSelectedSlot] = useState<{ day: Date; hourLabel: string; items: any[] } | null>(null)

  const { data: stats } = useScheduleStats()
  const { data: chartData } = useChartData()
  const { data: schedules } = useSchedules(weekStart)
  const retryMutation = useRetrySchedule()

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // Group schedules by day + hour slot
  const getSchedulesForSlot = (day: Date, slotStartHour: number) => {
    if (!schedules) return []
    const dayStr = format(day, 'yyyy-MM-dd')
    return (schedules as any[]).filter((s: any) => {
      const d = new Date(s.scheduled_at)
      return format(d, 'yyyy-MM-dd') === dayStr && d.getHours() === slotStartHour
    })
  }

  const statusBadgeVariant = (status: string) => {
    const map: Record<string, string> = {
      pending: 'warning',
      posting: 'info',
      success: 'success',
      failed: 'destructive',
    }
    return (map[status] ?? 'secondary') as any
  }

  const METRIC_CARDS = [
    {
      label: 'Tổng bài đã lên lịch',
      value: stats?.total ?? 0,
      icon: Calendar,
      color: 'text-blue-500',
      bg: 'bg-blue-50',
    },
    {
      label: 'Đã đăng hôm nay',
      value: stats?.postedToday ?? 0,
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Đang chờ xử lý',
      value: stats?.pending ?? 0,
      icon: Clock,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
    },
    {
      label: 'Lỗi đăng bài',
      value: stats?.failed ?? 0,
      icon: XCircle,
      color: 'text-red-500',
      bg: 'bg-red-50',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Tổng quan về hoạt động đăng bài tự động trên Facebook Groups</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-4 gap-4">
        {METRIC_CARDS.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', bg)}>
                  <Icon className={cn('w-5 h-5', color)} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{value}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hiệu suất đăng bài 7 ngày qua</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData ?? []} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="success" name="Thành công" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="failed" name="Thất bại" fill="#f87171" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Calendar Grid */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Lịch đăng bài theo khung giờ vàng</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Mỗi ô đại diện cho 1 khung giờ. Hỗ trợ hiển thị và đăng cùng lúc nhiều căn trên nhiều nhóm.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-slate-600 w-44 text-center font-medium">
                {format(weekStart, 'dd/MM', { locale: vi })} — {format(addDays(weekStart, 6), 'dd/MM/yyyy', { locale: vi })}
              </span>
              <Button variant="outline" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
                Hôm nay
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="p-3 text-left text-slate-500 font-medium w-28">Giờ vàng</th>
                {weekDays.map((day) => {
                  const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                  return (
                    <th key={day.toISOString()} className="p-3 text-center font-medium">
                      <div className={cn('text-xs text-slate-500', isToday && 'text-emerald-600 font-semibold')}>
                        {format(day, 'EEE', { locale: vi })}
                      </div>
                      <div
                        className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center mx-auto text-sm font-semibold mt-0.5',
                          isToday ? 'bg-emerald-500 text-white' : 'text-slate-700'
                        )}
                      >
                        {format(day, 'd')}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {GOLDEN_START.map((startHour, slotIdx) => (
                <tr key={startHour} className="border-b last:border-0">
                  <td className="p-3 text-xs text-slate-600 font-medium bg-amber-50/50 border-r align-middle">
                    <span className="font-semibold block">{GOLDEN_HOUR_LABELS[slotIdx]}</span>
                    <span className="text-[10px] text-amber-700/80">Khung giờ vàng</span>
                  </td>
                  {weekDays.map((day) => {
                    const cells = getSchedulesForSlot(day, startHour)
                    const hasMany = cells.length > 2
                    const displayItems = hasMany ? cells.slice(0, 2) : cells

                    return (
                      <td key={day.toISOString()} className="p-1.5 align-top border-r last:border-0 min-w-[130px]">
                        {cells.length === 0 ? (
                          <div className="h-14 border border-dashed border-slate-100 rounded flex items-center justify-center text-[11px] text-slate-300">
                            Trống
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {displayItems.map((s: any) => (
                              <div
                                key={s.id}
                                className="rounded p-1.5 bg-slate-50 border border-slate-200 text-xs hover:bg-slate-100 transition-colors shadow-2xs"
                              >
                                {s.properties && (
                                  <p className="font-medium text-slate-800 truncate" title={(s.properties as any).title}>
                                    {truncate((s.properties as any).title ?? '', 18)}
                                  </p>
                                )}
                                <div className="text-[10px] text-slate-400 truncate font-mono">
                                  {s.target_group_url ? s.target_group_url.replace('https://www.facebook.com/groups/', 'fb/') : ''}
                                </div>
                                <div className="flex items-center justify-between mt-1 gap-1">
                                  <Badge variant={statusBadgeVariant(s.status)} className="text-[10px] py-0 px-1.5">
                                    {getStatusLabel(s.status)}
                                  </Badge>
                                  {s.status === 'failed' && (
                                    <button
                                      type="button"
                                      onClick={() => retryMutation.mutate(s.id)}
                                      title="Thử lại"
                                      className="text-slate-400 hover:text-emerald-500 cursor-pointer"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}

                            {/* Badge if there are many items in this slot (e.g. 12 posts) */}
                            {hasMany && (
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedSlot({
                                    day,
                                    hourLabel: GOLDEN_HOUR_LABELS[slotIdx],
                                    items: cells,
                                  })
                                }
                                className="w-full mt-1 py-1 px-1.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Layers className="w-3 h-3" />
                                +{cells.length - 2} bài khác ({cells.length} bài)
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ===== MODAL: CHI TIẾT TẤT CẢ BÀI ĐĂNG TRONG 1 KHUNG GIỜ (VÍ DỤ 12 BÀI) ===== */}
      {selectedSlot && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 border-b bg-slate-50">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  Lịch đăng ngày {format(selectedSlot.day, 'dd/MM/yyyy')} — Khung giờ {selectedSlot.hourLabel}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tổng cộng <strong>{selectedSlot.items.length} bài đăng</strong> (nhiều căn x nhiều nhóm) được lên lịch cùng khung giờ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSlot(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {selectedSlot.items.map((s: any, idx: number) => (
                <div
                  key={s.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-xs flex items-center justify-center font-bold flex-shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-semibold text-slate-900 truncate">
                        {s.properties?.title || 'Bất động sản'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant={statusBadgeVariant(s.status)} className="text-xs py-0.5">
                        {getStatusLabel(s.status)}
                      </Badge>
                      {s.status === 'failed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => retryMutation.mutate(s.id)}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" /> Thử lại
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 flex items-center gap-1.5 font-mono bg-white p-2 rounded-lg border border-slate-200/70">
                    <span className="text-slate-400 font-sans">Nhóm:</span>
                    <span className="truncate max-w-[420px] text-blue-600 font-medium">
                      {s.target_group_url}
                    </span>
                  </div>

                  {s.generated_posts && (
                    <p className="text-xs text-slate-500 line-clamp-2 italic px-1">
                      "{truncate(s.generated_posts.content || s.generated_posts.title || '', 140)}"
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="p-4 border-t bg-slate-50 flex justify-between items-center">
              <span className="text-xs text-slate-500">
                Extension sẽ lấy các bài này ra đăng tuần tự với khoảng cách trễ 30-90 giây/bài.
              </span>
              <Button variant="outline" size="sm" onClick={() => setSelectedSlot(null)}>
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
