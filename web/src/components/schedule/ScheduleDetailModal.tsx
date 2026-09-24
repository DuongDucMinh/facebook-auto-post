import { useState } from 'react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  X,
  Building2,
  Calendar,
  Clock,
  Globe,
  ExternalLink,
  Copy,
  Check,
  Zap,
  Save,
  Trash2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Image as ImageIcon,
  CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useUpdateSchedule, useDeleteSchedule, usePostNowSchedule, useRetrySchedule } from '@/hooks/useSchedules'
import { getStatusLabel, getStatusColor } from '@/lib/utils'

interface ScheduleDetailModalProps {
  schedule: any
  onClose: () => void
}

const GOLDEN_TIMES = ['07:00', '11:30', '16:00', '20:30']

export function ScheduleDetailModal({ schedule, onClose }: ScheduleDetailModalProps) {
  const updateScheduleMutation = useUpdateSchedule()
  const deleteScheduleMutation = useDeleteSchedule()
  const postNowMutation = usePostNowSchedule()
  const retryMutation = useRetrySchedule()

  const post = schedule.generated_posts
  const property = schedule.properties

  // Form states
  const [title, setTitle] = useState(post?.title ?? '')
  const [content, setContent] = useState(post?.content ?? '')
  const [groupUrl, setGroupUrl] = useState(schedule.target_group_url ?? '')

  const initialDate = schedule.scheduled_at ? new Date(schedule.scheduled_at) : new Date()
  const [dateStr, setDateStr] = useState(() => {
    try {
      return format(initialDate, 'yyyy-MM-dd')
    } catch {
      return format(new Date(), 'yyyy-MM-dd')
    }
  })
  const [timeStr, setTimeStr] = useState(() => {
    try {
      return format(initialDate, 'HH:mm')
    } catch {
      return '07:00'
    }
  })

  // Selected images state
  const propertyImages: string[] = property?.images ?? []
  const initialSelected = post?.selected_images ?? []
  const [selectedImages, setSelectedImages] = useState<string[]>(
    initialSelected.length > 0 ? initialSelected : propertyImages.slice(0, 3)
  )

  const [copied, setCopied] = useState(false)
  const [isPostingNow, setIsPostingNow] = useState(false)

  // Toggle image selection
  const toggleImage = (url: string) => {
    if (selectedImages.includes(url)) {
      setSelectedImages((prev) => prev.filter((img) => img !== url))
    } else {
      if (selectedImages.length >= 10) {
        toast.warning('Tối đa 10 ảnh cho 1 bài viết')
        return
      }
      setSelectedImages((prev) => [...prev, url])
    }
  }

  // Handle Save
  const handleSave = async () => {
    try {
      let scheduledAt: string
      try {
        const [year, month, day] = dateStr.split('-').map(Number)
        const [hour, minute] = timeStr.split(':').map(Number)
        const d = new Date(year, month - 1, day, hour, minute)
        scheduledAt = d.toISOString()
      } catch {
        scheduledAt = new Date().toISOString()
      }

      await updateScheduleMutation.mutateAsync({
        scheduleId: schedule.id,
        targetGroupUrl: groupUrl,
        scheduledAt,
        postId: post?.id,
        postTitle: title,
        postContent: content,
        selectedImages,
      })

      toast.success('Đã lưu các thay đổi cho bài đăng thành công!')
      onClose()
    } catch (err: any) {
      console.error('[RealPost] Error updating schedule:', err)
      toast.error(`Lỗi khi lưu: ${err?.message || 'Vui lòng thử lại'}`)
    }
  }

  // Handle Post Now
  const handlePostNow = async () => {
    if (!confirm('Bạn có muốn kích hoạt ĐĂNG NGAY bài viết này lên nhóm Facebook đã chọn không?')) {
      return
    }

    setIsPostingNow(true)
    try {
      // 1. First save any current edits
      await updateScheduleMutation.mutateAsync({
        scheduleId: schedule.id,
        targetGroupUrl: groupUrl,
        postId: post?.id,
        postTitle: title,
        postContent: content,
        selectedImages,
      })

      // 2. Trigger post now (sets scheduled_at = now, status = 'pending', and triggers extension)
      await postNowMutation.mutateAsync(schedule.id)

      toast.success('⚡ Đã kích hoạt lệnh ĐĂNG NGAY! Extension sẽ mở Facebook và đăng bài trong giây lát.')
      onClose()
    } catch (err: any) {
      console.error('[RealPost] Post now error:', err)
      toast.error(`Lỗi khi kích hoạt: ${err?.message || 'Vui lòng thử lại'}`)
    } finally {
      setIsPostingNow(false)
    }
  }

  // Copy full content
  const handleCopyContent = () => {
    const fullText = `${title}\n\n${content}`
    navigator.clipboard.writeText(fullText)
    setCopied(true)
    toast.success('Đã sao chép tiêu đề và nội dung bài viết!')
    setTimeout(() => setCopied(false), 2000)
  }

  // Open Facebook group & copy
  const handleOpenGroupAndCopy = () => {
    handleCopyContent()
    if (groupUrl) {
      window.open(groupUrl, '_blank')
    }
  }

  // Handle Delete
  const handleDelete = async () => {
    if (!confirm('Bạn có chắc chắn muốn XÓA bài đăng này khỏi lịch? Thao tác này không thể hoàn tác.')) {
      return
    }
    try {
      await deleteScheduleMutation.mutateAsync(schedule.id)
      toast.success('Đã xóa bài đăng khỏi lịch!')
      onClose()
    } catch (err: any) {
      toast.error(`Không thể xóa: ${err?.message || 'Vui lòng thử lại'}`)
    }
  }

  const statusVariant = getStatusColor(schedule.status) as any

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 truncate">
                  Chi tiết & Chỉnh sửa bài đăng
                </h2>
                <Badge variant={statusVariant} className="text-xs py-0.5">
                  {getStatusLabel(schedule.status)}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Xem lại thông tin, sửa đổi nội dung hoặc bấm Đăng ngay
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Failed Status Alert */}
          {schedule.status === 'failed' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <p className="font-semibold text-red-800">Lỗi khi đăng bài trước đó</p>
                <p className="text-xs text-red-600 mt-1 font-mono">
                  {schedule.error_log || 'Facebook không phản hồi hoặc selector đã thay đổi.'}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs bg-white text-red-700 border-red-200 hover:bg-red-50"
                    onClick={() => retryMutation.mutate(schedule.id)}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> Đặt lại trạng thái chờ
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 1. Property Info Box */}
          <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-600" /> Căn bất động sản liên kết
              </span>
              {post?.style && (
                <Badge variant="secondary" className="text-[11px] font-normal flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Phong cách: <strong className="font-semibold">{post.style}</strong>
                </Badge>
              )}
            </div>

            <div className="flex items-start gap-3 pt-1">
              {property?.images?.[0] ? (
                <img
                  src={property.images[0]}
                  alt=""
                  className="w-14 h-14 rounded-lg object-cover border border-slate-200 flex-shrink-0 shadow-2xs"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0">
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-slate-900 text-sm truncate">
                  {property?.title || 'Không có tên BĐS'}
                </h3>
                {property?.raw_description && (
                  <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                    {property.raw_description}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 2. Schedule Timing & Target Group */}
          <div className="grid grid-cols-2 gap-4">
            {/* Target Group URL */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-blue-600" /> Nhóm Facebook đăng bài
                </Label>
                {groupUrl && (
                  <a
                    href={groupUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5 hover:underline"
                  >
                    Mở nhóm <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <Input
                value={groupUrl}
                onChange={(e) => setGroupUrl(e.target.value)}
                placeholder="https://www.facebook.com/groups/..."
                className="text-xs font-mono"
              />
            </div>

            {/* Scheduled Date & Time */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-emerald-600" /> Thời gian đăng bài
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="text-xs flex-1"
                />
                <Input
                  type="time"
                  value={timeStr}
                  onChange={(e) => setTimeStr(e.target.value)}
                  className="text-xs w-28"
                />
              </div>
              {/* Quick golden hour pills */}
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[10px] text-slate-400">Giờ vàng:</span>
                {GOLDEN_TIMES.map((gt) => (
                  <button
                    key={gt}
                    type="button"
                    onClick={() => setTimeStr(gt)}
                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                      timeStr === gt
                        ? 'bg-amber-100 text-amber-800 border-amber-300 font-semibold'
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {gt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Post Title */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">
              Tiêu đề bài viết (Hook gây chú ý)
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nhập tiêu đề bài viết..."
              className="font-medium text-sm"
            />
          </div>

          {/* 4. Post Content */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-slate-700">
                Nội dung chi tiết bài viết (Cho phép chỉnh sửa câu chữ, số hotline...)
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">
                  {content.length} ký tự
                </span>
                <button
                  type="button"
                  onClick={handleCopyContent}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 hover:underline cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" /> Đã chép
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Sao chép
                    </>
                  )}
                </button>
              </div>
            </div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Nội dung bài viết..."
              rows={8}
              className="text-xs leading-relaxed font-sans"
            />
          </div>

          {/* 5. Attached Images Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                Ảnh đính kèm bài viết ({selectedImages.length} ảnh được chọn)
              </Label>
              <span className="text-[11px] text-slate-400">
                Nhấn vào ảnh để chọn hoặc bỏ chọn
              </span>
            </div>

            {propertyImages.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                Căn này chưa có ảnh trong thư viện. Bạn có thể thêm ảnh tại trang Danh sách BĐS.
              </p>
            ) : (
              <div className="grid grid-cols-6 gap-2 pt-1">
                {propertyImages.map((imgUrl, i) => {
                  const isSelected = selectedImages.includes(imgUrl)
                  return (
                    <div
                      key={i}
                      onClick={() => toggleImage(imgUrl)}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all group ${
                        isSelected
                          ? 'border-emerald-500 ring-2 ring-emerald-400/40 shadow-sm'
                          : 'border-slate-200 opacity-60 hover:opacity-100 hover:border-slate-300'
                      }`}
                    >
                      <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                      <div
                        className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                          isSelected ? 'bg-emerald-500 text-white' : 'bg-black/50 text-white opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        {isSelected ? <Check className="w-3 h-3 stroke-[3]" /> : '+'}
                      </div>
                      {isSelected && (
                        <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1 rounded">
                          #{selectedImages.indexOf(imgUrl) + 1}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t bg-slate-50 flex items-center justify-between gap-3">
          {/* Left side: Delete button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deleteScheduleMutation.isPending}
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 mr-1.5" />
            {deleteScheduleMutation.isPending ? 'Đang xóa...' : 'Xóa lịch này'}
          </Button>

          {/* Right side: Actions */}
          <div className="flex items-center gap-2">
            {/* Quick Open FB & Copy */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenGroupAndCopy}
              title="Sao chép bài viết và mở trang nhóm Facebook"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1" />
              Mở nhóm & Sao chép
            </Button>

            {/* Save Changes Button */}
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleSave}
              disabled={updateScheduleMutation.isPending}
              className="bg-slate-800 hover:bg-slate-900 text-white"
            >
              <Save className="w-3.5 h-3.5 mr-1" />
              {updateScheduleMutation.isPending ? 'Đang lưu...' : 'Lưu chỉnh sửa'}
            </Button>

            {/* POST NOW BUTTON (Super Prominent) */}
            <Button
              type="button"
              size="sm"
              onClick={handlePostNow}
              disabled={isPostingNow || postNowMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md shadow-emerald-600/20"
            >
              <Zap className="w-4 h-4 mr-1.5 fill-current" />
              {isPostingNow || postNowMutation.isPending ? 'Đang kích hoạt...' : 'ĐĂNG NGAY'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
