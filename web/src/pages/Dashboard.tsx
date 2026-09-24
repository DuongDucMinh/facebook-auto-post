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
  Zap,
  Globe,
  Building2,
  Edit3,
  ExternalLink,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useScheduleStats,
  useChartData,
  useSchedules,
  useRetrySchedule,
  usePostNowSchedule,
} from '@/hooks/useSchedules'
import { getStatusLabel, truncate, getStatusColor, cn } from '@/lib/utils'
import { ScheduleDetailModal } from '@/components/schedule/ScheduleDetailModal'
import { toast } from 'sonner'

const GOLDEN_HOUR_LABELS = ['07:00 - 08:00', '11:00 - 12:00', '16:00 - 17:00', '20:00 - 21:00']
const GOLDEN_START = [7, 11, 16, 20]

export function Dashboard() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [selectedSlot, setSelectedSlot] = useState<{ day: Date; hourLabel: string; items: any[] } | null>(null)
  const [viewingSchedule, setViewingSchedule] = useState<any | null>(null)

  const { data: stats } = useScheduleStats()
  const { data: chartData } = useChartData()
  const { data: schedules } = useSchedules(weekStart)
  const retryMutation = useRetrySchedule()
  const postNowMutation = usePostNowSchedule()

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
    return (getStatusColor(status) ?? 'secondary') as any
  }

  // Quick post now from card
  const handleQuickPostNow = async (e: React.MouseEvent, scheduleId: string) => {
    e.stopPropagation()
    if (!confirm('Bạn có muốn kích hoạt ĐĂNG NGAY bài viết này lên nhóm Facebook không?')) {
      return
    }
    try {
      await postNowMutation.mutateAsync(scheduleId)
      toast.success('⚡ Đã kích hoạt lệnh ĐĂNG NGAY! Extension sẽ đăng bài trong giây lát.')
    } catch (err: any) {
      toast.error(`Lỗi: ${err?.message || 'Không thể đăng ngay'}`)
    }
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
                Nhấn vào từng ô bài viết để <strong>xem chi tiết, chỉnh sửa câu chữ</strong> hoặc bấm <strong>Đăng ngay</strong>.
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
                      <td key={day.toISOString()} className="p-1.5 align-top border-r last:border-0 min-w-[135px]">
                        {cells.length === 0 ? (
                          <div className="h-16 border border-dashed border-slate-100 rounded-lg flex items-center justify-center text-[11px] text-slate-300">
                            Trống
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {displayItems.map((s: any) => (
                              <div
                                key={s.id}
                                onClick={() => setViewingSchedule(s)}
                                className="group relative rounded-lg p-2 bg-white border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/30 hover:shadow-sm cursor-pointer transition-all space-y-1"
                                title="Nhấn để xem chi tiết, chỉnh sửa hoặc đăng ngay"
                              >
                                {/* Property Title */}
                                <div className="flex items-center justify-between gap-1">
                                  <p
                                    className="font-semibold text-slate-800 text-xs truncate group-hover:text-emerald-700 transition-colors flex items-center gap-1"
                                    title={s.properties?.title || 'BĐS'}
                                  >
                                    <Building2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                                    <span className="truncate">{s.properties?.title || 'BĐS'}</span>
                                  </p>
                                </div>

                                {/* Facebook Group info */}
                                <div className="text-[10px] text-slate-500 truncate font-mono flex items-center gap-1">
                                  <Globe className="w-2.5 h-2.5 text-blue-500 flex-shrink-0" />
                                  <span className="truncate">
                                    {s.target_group_url ? s.target_group_url.replace('https://www.facebook.com/groups/', 'fb/') : 'Facebook Group'}
                                  </span>
                                </div>

                                {/* Status badge and quick actions */}
                                <div className="flex items-center justify-between mt-1 pt-0.5 gap-1 border-t border-slate-100">
                                  <Badge variant={statusBadgeVariant(s.status)} className="text-[9px] py-0 px-1">
                                    {getStatusLabel(s.status)}
                                  </Badge>

                                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                    {/* Quick Post Now */}
                                    <button
                                      type="button"
                                      onClick={(e) => handleQuickPostNow(e, s.id)}
                                      title="Kích hoạt đăng ngay bài này"
                                      className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100/70 p-0.5 rounded transition-colors cursor-pointer"
                                    >
                                      <Zap className="w-3 h-3 fill-current" />
                                    </button>

                                    {/* Retry on failed */}
                                    {s.status === 'failed' && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          retryMutation.mutate(s.id)
                                        }}
                                        title="Thử lại"
                                        className="text-red-500 hover:text-red-700 p-0.5 rounded transition-colors cursor-pointer"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
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
                                +{cells.length - 2} bài khác (Tổng {cells.length} bài)
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

      {/* ===== MODAL: DANH SÁCH BÀI TRONG 1 KHUNG GIỜ KHI CÓ NHIỀU BÀI ===== */}
      {selectedSlot && (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
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
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {selectedSlot.items.map((s: any, idx: number) => (
                <div
                  key={s.id}
                  onClick={() => setViewingSchedule(s)}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-emerald-500 hover:bg-emerald-50/20 hover:shadow-xs transition-all space-y-2 cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-slate-100 group-hover:bg-emerald-100 text-slate-700 group-hover:text-emerald-700 text-xs flex items-center justify-center font-bold flex-shrink-0 transition-colors">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 transition-colors truncate">
                        {s.properties?.title || 'Bất động sản'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant={statusBadgeVariant(s.status)} className="text-xs py-0.5">
                        {getStatusLabel(s.status)}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200"
                        onClick={(e) => handleQuickPostNow(e, s.id)}
                      >
                        <Zap className="w-3 h-3 mr-1 fill-current" /> Đăng ngay
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-slate-600 hover:text-slate-900"
                        onClick={(e) => {
                          e.stopPropagation()
                          setViewingSchedule(s)
                        }}
                      >
                        <Edit3 className="w-3 h-3 mr-1" /> Chi tiết
                      </Button>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 flex items-center gap-1.5 font-mono bg-slate-50 p-2 rounded-lg border border-slate-200/70">
                    <Globe className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <span className="text-slate-400 font-sans">Nhóm:</span>
                    <span className="truncate max-w-[400px] text-blue-600 font-medium">
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
                Nhấn vào bất kỳ bài nào để chỉnh sửa câu chữ hoặc xem ảnh đính kèm.
              </span>
              <Button variant="outline" size="sm" onClick={() => setSelectedSlot(null)}>
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: CHI TIẾT & CHỈNH SỬA TỪNG BÀI ĐĂNG (KÈM NÚT ĐĂNG NGAY) ===== */}
      {viewingSchedule && (
        <ScheduleDetailModal
          schedule={viewingSchedule}
          onClose={() => setViewingSchedule(null)}
        />
      )}
    </div>
  )
}
