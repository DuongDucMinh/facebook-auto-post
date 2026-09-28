import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Sparkles,
  RefreshCw,
  CalendarDays,
  X,
  Plus,
  CheckSquare,
  Eye,
  Building2,
  Check,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { addDays, format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useProperties,
  useUploadPropertyImage,
  useSavedPosts,
  useDeleteSavedPost,
  useSaveGeneratedPosts,
} from '@/hooks/useProperties'
import { useBatchCreateSchedules } from '@/hooks/useSchedules'
import { useSettings } from '@/hooks/useSettings'
import { supabase } from '@/lib/supabase'
import { DEFAULT_GOLDEN_HOURS, generateScheduleSlots } from '@/lib/scheduler'
import { randomPick } from '@/lib/utils'
import { generatePostsWithGroq, type PostVariant } from '@/lib/groq'
import { markdownToFacebookHtml } from '@/lib/formatter'
import { ImageUploader } from '@/components/ui/image-uploader'
import type { Property, GeneratedPost } from '@/types/database'

function fmtHour(h: number, m: number) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const formSchema = z.object({
  propertyId: z.string().optional(),
  title: z.string().min(5, 'Tên tối thiểu 5 ký tự'),
  description: z.string().min(20, 'Mô tả tối thiểu 20 ký tự'),
  numVariants: z.number().min(1).max(20),
  numDays: z.number().min(1).max(30),
  startPreference: z.enum(['auto', 'tomorrow', 'today']).default('auto'),
  groupUrls: z.array(z.string()).min(1, 'Cần ít nhất 1 nhóm Facebook'),
})

type FormValues = {
  propertyId?: string
  title: string
  description: string
  numVariants: number
  numDays: number
  startPreference?: 'auto' | 'tomorrow' | 'today'
  groupUrls: string[]
}

interface VariantCard {
  savedPostId?: string
  variant_index: number
  style: string
  title: string
  content: string
  selectedImages: string[]
  scheduledAt: string
  groupUrl: string
}

const STYLE_COLORS: Record<string, string> = {
  'Chuyên gia / Ngắn gọn': 'bg-blue-100 text-blue-700',
  'Chuyên gia / Tổng quan giá trị': 'bg-blue-100 text-blue-700',
  'Chuyên gia / Dòng tiền & Tiềm năng': 'bg-emerald-100 text-emerald-700',
  'Chuyên gia / Vị trí & An sinh': 'bg-cyan-100 text-cyan-700',
  'Chuyên gia / Đánh giá thực tế': 'bg-amber-100 text-amber-700',
  'Chuyên gia / Điểm nhấn độc bản': 'bg-indigo-100 text-indigo-700',
  'Hóm hỉnh / Đời thực': 'bg-yellow-100 text-yellow-700',
  'Kích thích tò mò (Hook mạnh)': 'bg-red-100 text-red-700',
  'Kể chuyện (Storytelling)': 'bg-purple-100 text-purple-700',
  'Tâm sự nghề': 'bg-slate-100 text-slate-700',
}

export function PostGenerator() {
  const [searchParams] = useSearchParams()
  const preselectedPropertyId = searchParams.get('propertyId')

  const { data: properties } = useProperties()
  const { data: settings } = useSettings()
  const uploadImage = useUploadPropertyImage()
  const batchCreateSchedules = useBatchCreateSchedules()

  const [images, setImages] = useState<string[]>([])
  const [groupUrlInput, setGroupUrlInput] = useState('')
  const [variantCards, setVariantCards] = useState<VariantCard[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState<'new' | 'saved'>('new')
  const [previewModes, setPreviewModes] = useState<Record<number, boolean>>({})

  // Specific dates selection state
  const [scheduleMode, setScheduleMode] = useState<'auto_days' | 'specific_dates'>('auto_days')
  const [selectedSpecificDates, setSelectedSpecificDates] = useState<string[]>([])
  const [specificDateInput, setSpecificDateInput] = useState('')

  // Form setup
  const { register, handleSubmit, watch, getValues, setValue, control, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      title: '',
      description: '',
      numVariants: 10,
      numDays: 3,
      startPreference: 'auto',
      groupUrls: [],
    },
  })

  const watchedPropertyId = watch('propertyId')
  const watchedGroupUrls = watch('groupUrls') ?? []

  // Saved posts data & mutations
  const { data: savedPosts = [], isLoading: isLoadingSaved } = useSavedPosts(watchedPropertyId)
  const deleteSavedPost = useDeleteSavedPost()
  const saveGeneratedPosts = useSaveGeneratedPosts()
  const [selectedSavedIds, setSelectedSavedIds] = useState<string[]>([])
  const [savedPreviewModes, setSavedPreviewModes] = useState<Record<string, boolean>>({})

  // Next 14 days quick pills
  const next14Days = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const d = addDays(new Date(), i)
      const dateStr = format(d, 'yyyy-MM-dd')
      const weekday = i === 0 ? 'Hôm nay' : (i === 1 ? 'Ngày mai' : ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()])
      return {
        date: d,
        dateStr,
        label: `${weekday} (${format(d, 'dd/MM')})`,
      }
    })
  }, [])

  const toggleSpecificDate = (dateStr: string) => {
    setSelectedSpecificDates((prev) =>
      prev.includes(dateStr)
        ? prev.filter((d) => d !== dateStr)
        : [...prev, dateStr].sort()
    )
  }

  const removeSpecificDate = (dateStr: string) => {
    setSelectedSpecificDates((prev) => prev.filter((d) => d !== dateStr))
  }

  const addPresetDates = (daysToAdd: number) => {
    const dates: string[] = []
    for (let i = 1; i <= daysToAdd; i++) {
      dates.push(format(addDays(new Date(), i), 'yyyy-MM-dd'))
    }
    setSelectedSpecificDates((prev) => Array.from(new Set([...prev, ...dates])).sort())
  }

  const applyFormat = (cardIdx: number, prefix: string, suffix: string = '') => {
    const card = variantCards[cardIdx]
    if (!card) return
    const textarea = document.getElementById(`card-content-${cardIdx}`) as HTMLTextAreaElement | null
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = card.content
    const selectedText = text.substring(start, end) || 'từ khóa'
    const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end)
    updateCard(cardIdx, { content: newText })
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length)
    }, 50)
  }

  // Auto-fill when property is selected
  useEffect(() => {
    const propId = preselectedPropertyId ?? watchedPropertyId
    if (propId && properties) {
      const prop = (properties as Property[]).find((p) => p.id === propId)
      if (prop) {
        setValue('propertyId', prop.id)
        setValue('title', prop.title)
        setValue('description', prop.raw_description)
        setValue('groupUrls', prop.group_urls ?? [])
        setImages(prop.images ?? [])
      }
    }
  }, [watchedPropertyId, preselectedPropertyId, properties, setValue])

  const handleUpload = async (file: File) => {
    return await uploadImage.mutateAsync({ file, propertyId: watchedPropertyId ?? 'draft' })
  }

  const addGroupUrl = () => {
    const url = groupUrlInput.trim()
    if (!url) return
    if (!url.includes('facebook.com/groups/')) { toast.error('URL nhóm Facebook không hợp lệ'); return }
    if (watchedGroupUrls.includes(url)) { toast.error('URL này đã có trong danh sách'); return }
    setValue('groupUrls', [...watchedGroupUrls, url])
    setGroupUrlInput('')
  }

  const removeGroupUrl = (url: string) => {
    setValue('groupUrls', watchedGroupUrls.filter((u) => u !== url))
  }

  const generatePosts = async (data: FormValues) => {
    if (images.length === 0) { toast.error('Vui lòng thêm ít nhất 1 ảnh'); return }
    setIsGenerating(true)
    try {
      const envName = (import.meta as any).env?.VITE_AGENT_NAME
      const envPhone = (import.meta as any).env?.VITE_AGENT_PHONE
      const envPhone2 = (import.meta as any).env?.VITE_AGENT_PHONE_2

      const agentName = (settings?.agent_name && settings.agent_name !== 'An Nhiên')
        ? settings.agent_name
        : (envName || settings?.agent_name || 'An Nhiên')

      const agentPhone = (settings?.agent_phone && settings.agent_phone !== '0123456789')
        ? settings.agent_phone
        : (envPhone || settings?.agent_phone || '0123456789')

      const localPhone2 = localStorage.getItem('REALPOST_AGENT_PHONE_2') || ''
      const agentPhone2 = settings?.agent_phone_2 || localPhone2 || envPhone2 || ''

      let variants: PostVariant[] = []

      // Option 1: Try Direct Groq API first if VITE_GROQ_API_KEY is present
      const groqKey = (import.meta as any).env?.VITE_GROQ_API_KEY
      if (groqKey) {
        variants = await generatePostsWithGroq({
          title: data.title,
          description: data.description,
          numVariants: data.numVariants,
          agentName,
          agentPhone,
          agentPhone2,
          apiKey: groqKey,
          customSystemPrompt: settings?.custom_system_prompt || localStorage.getItem('REALPOST_CUSTOM_SYSTEM_PROMPT'),
        })
      } else {
        // Option 2: Fallback to Supabase Edge Function
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL

        const response = await fetch(`${supabaseUrl}/functions/v1/generate-posts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            property_id: data.propertyId ?? 'draft',
            title: data.title,
            description: data.description,
            num_variants: data.numVariants,
            agent_name: agentName,
            agent_phone: agentPhone,
            agent_phone_2: agentPhone2,
          }),
        })

        if (!response.ok) throw new Error(`Lỗi sinh bài (${response.status})`)
        variants = await response.json()
      }

      // Generate intelligent schedule slots (using specific dates if selected, or default auto days)
      const scheduleSlots = generateScheduleSlots({
        numPosts: variants.length,
        numDays: data.numDays,
        startPreference: data.startPreference ?? 'auto',
        specificDates: scheduleMode === 'specific_dates' && selectedSpecificDates.length > 0 ? selectedSpecificDates : undefined,
      })

      // Auto-save generated posts to generated_posts as 'draft' if a property is selected
      // so user never loses their generated posts even without scheduling immediately!
      let savedPostIds: string[] = []
      if (data.propertyId) {
        try {
          const toInsert = variants.map((v, i) => ({
            property_id: data.propertyId!,
            title: v.title,
            content: v.content,
            style: v.style ?? 'Phong cách BĐS',
            variant_index: v.variant_index ?? i + 1,
            selected_images: randomPick(images, Math.min(3, images.length)),
            is_approved: true,
            status: 'draft' as const,
          }))
          const savedResults = await saveGeneratedPosts.mutateAsync(toInsert)
          if (savedResults && savedResults.length > 0) {
            savedPostIds = savedResults.map((p) => p.id)
          }
        } catch (saveErr) {
          console.warn('Không thể tự động lưu nháp:', saveErr)
        }
      }

      // Assign scheduled times to cards
      const cards: VariantCard[] = variants.map((v, i) => {
        const slotDate = scheduleSlots[i] || addDays(new Date(), Math.floor(i / 4) + 1)
        return {
          savedPostId: savedPostIds[i],
          variant_index: v.variant_index ?? i + 1,
          style: v.style ?? 'Phong cách BĐS',
          title: v.title,
          content: v.content,
          selectedImages: randomPick(images, Math.min(3, images.length)),
          scheduledAt: slotDate.toISOString(),
          groupUrl: data.groupUrls[i % data.groupUrls.length],
        }
      })

      setVariantCards(cards)
      setActiveTab('new')
      toast.success(`Đã tạo thành công ${variants.length} bài viết!`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi khi sinh bài viết')
    } finally {
      setIsGenerating(false)
    }
  }

  const updateCard = (index: number, updates: Partial<VariantCard>) => {
    setVariantCards((prev) => prev.map((c, i) => i === index ? { ...c, ...updates } : c))
  }

  const refreshCardImages = (index: number) => {
    updateCard(index, { selectedImages: randomPick(images, Math.min(3, images.length)) })
  }

  // Reuse saved posts without consuming tokens
  const loadSavedPostsToSchedule = (postsToLoad: GeneratedPost[]) => {
    if (postsToLoad.length === 0) return
    const currentGroupUrls = watchedGroupUrls.length > 0
      ? watchedGroupUrls
      : (properties?.find((p) => p.id === watchedPropertyId)?.group_urls ?? [])

    if (currentGroupUrls.length === 0) {
      toast.warning('Vui lòng thêm ít nhất 1 nhóm Facebook ở cột bên trái để lên lịch')
      return
    }

    const scheduleSlots = generateScheduleSlots({
      numPosts: postsToLoad.length,
      numDays: getValues('numDays') || 3,
      startPreference: getValues('startPreference') || 'auto',
      specificDates: scheduleMode === 'specific_dates' && selectedSpecificDates.length > 0 ? selectedSpecificDates : undefined,
    })

    const newCards: VariantCard[] = postsToLoad.map((p, i) => {
      const slotDate = scheduleSlots[i] || addDays(new Date(), Math.floor(i / 4) + 1)
      const cardImages = p.selected_images && p.selected_images.length > 0
        ? p.selected_images
        : (images.length > 0 ? randomPick(images, Math.min(3, images.length)) : [])

      return {
        savedPostId: p.id,
        variant_index: p.variant_index ?? (variantCards.length + i + 1),
        style: p.style,
        title: p.title,
        content: p.content,
        selectedImages: cardImages,
        scheduledAt: slotDate.toISOString(),
        groupUrl: currentGroupUrls[i % currentGroupUrls.length],
      }
    })

    setVariantCards((prev) => [...prev, ...newCards])
    setActiveTab('new')
    toast.success(`Đã nạp ${postsToLoad.length} bài viết đã lưu vào danh sách đăng!`)
  }

  const handleDeleteSaved = async (postId: string) => {
    if (!confirm('Bạn có chắc muốn xóa bài viết đã lưu này không?')) return
    try {
      await deleteSavedPost.mutateAsync(postId)
      setSelectedSavedIds((prev) => prev.filter((id) => id !== postId))
      toast.success('Đã xóa bài viết khỏi danh sách lưu')
    } catch {
      toast.error('Có lỗi khi xóa bài viết')
    }
  }

  const confirmAndSchedule = async () => {
    if (variantCards.length === 0) { toast.error('Chưa có bài viết nào để lên lịch'); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Chưa đăng nhập'); return }

    const approvedCards = variantCards.filter((c) => c.groupUrl && c.scheduledAt)
    if (approvedCards.length === 0) {
      toast.error('Vui lòng kiểm tra lại thời gian và nhóm đăng cho các bài viết')
      return
    }

    try {
      // 1. Ensure propertyId exists (auto-create property if user entered manually)
      let targetPropertyId = watchedPropertyId
      if (!targetPropertyId) {
        const { data: createdProp, error: propErr } = await (supabase.from('properties') as any)
          .insert({
            user_id: user.id,
            title: watch('title') || 'Bất động sản',
            raw_description: watch('description') || '',
            images: images,
            group_urls: watchedGroupUrls,
          })
          .select()
          .single()
        if (propErr) throw propErr
        targetPropertyId = createdProp.id
        setValue('propertyId', targetPropertyId)
      }

      if (!targetPropertyId) {
        toast.error('Không tìm thấy thông tin bất động sản')
        return
      }

      const validPropertyId: string = targetPropertyId

      // 2. Save or update generated_posts
      const postIds: string[] = []

      for (const card of approvedCards) {
        if (card.savedPostId) {
          // Update existing post
          await (supabase.from('generated_posts') as any)
            .update({
              title: card.title,
              content: card.content,
              style: card.style,
              selected_images: card.selectedImages,
              status: 'scheduled',
              is_approved: true,
            })
            .eq('id', card.savedPostId)
          postIds.push(card.savedPostId)
        } else {
          // Insert new post
          const { data: newPost, error: insertErr } = await (supabase.from('generated_posts') as any)
            .insert({
              property_id: validPropertyId,
              title: card.title,
              content: card.content,
              style: card.style,
              variant_index: card.variant_index,
              selected_images: card.selectedImages,
              is_approved: true,
              status: 'scheduled',
            })
            .select()
            .single()
          if (insertErr) throw insertErr
          postIds.push(newPost.id)
        }
      }

      // 3. Create schedules
      const schedules = approvedCards.map((card, i) => ({
        user_id: user.id,
        post_id: postIds[i],
        property_id: validPropertyId,
        target_group_url: card.groupUrl,
        scheduled_at: card.scheduledAt,
        status: 'pending' as const,
      }))

      await batchCreateSchedules.mutateAsync(schedules)
      toast.success(`Đã nạp ${schedules.length} bài vào lịch đăng!`)
      setVariantCards([])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi khi lên lịch')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tạo bài đăng</h1>
        <p className="text-slate-500 text-sm mt-1">
          Tự động tạo nội dung bài viết marketing BĐS bằng AI và lên lịch đăng bài tối ưu
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* ===== LEFT COLUMN: SETUP ===== */}
        <div className="space-y-4 flex flex-col">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Thông tin bất động sản</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Property Selector */}
              <div>
                <Label>Chọn BĐS có sẵn (tuỳ chọn)</Label>
                <select
                  {...register('propertyId')}
                  className="w-full mt-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">-- Nhập thủ công --</option>
                  {((properties as Property[]) ?? []).map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <Label>Tên/Tiêu đề BĐS <span className="text-red-500">*</span></Label>
                <Input {...register('title')} placeholder="VD: Bán nhà Tạ Quang Bửu, ô tô đỗ cửa" className="mt-1" />
                {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
              </div>

              {/* Description */}
              <div>
                <Label>Mô tả thô (AI đọc để sinh bài) <span className="text-red-500">*</span></Label>
                <Textarea
                  {...register('description')}
                  placeholder="Nhập đầy đủ: vị trí, diện tích, số tầng, tiện ích, pháp lý, giá..."
                  className="mt-1 h-28"
                />
                {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
              </div>

              {/* Images with Drag & Drop and Ctrl+V */}
              <div>
                <Label className="block mb-1.5">Ảnh BĐS (Tối đa 10 ảnh)</Label>
                <ImageUploader
                  images={images}
                  onChange={setImages}
                  onUpload={handleUpload}
                  maxImages={10}
                />
              </div>

              {/* Group URLs */}
              <div>
                <Label>Nhóm Facebook mục tiêu <span className="text-red-500">*</span></Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={groupUrlInput}
                    onChange={(e) => setGroupUrlInput(e.target.value)}
                    placeholder="https://www.facebook.com/groups/..."
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addGroupUrl())}
                  />
                  <Button type="button" variant="outline" onClick={addGroupUrl} size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {errors.groupUrls && <p className="text-red-500 text-xs mt-1">{errors.groupUrls.message}</p>}
                <div className="flex flex-wrap gap-1 mt-2">
                  {watchedGroupUrls.map((url) => (
                    <div key={url} className="flex items-center gap-1 bg-slate-100 rounded-full px-2 py-1 text-xs max-w-full">
                      <span className="truncate max-w-[200px]">{url.replace('https://www.facebook.com/groups/', 'fb/groups/')}</span>
                      <button type="button" onClick={() => removeGroupUrl(url)}>
                        <X className="w-3 h-3 text-slate-400 hover:text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Scheduling Parameters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Thông số lên lịch & Model AI</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Number of variants */}
              <div>
                <Label>Số bài cần sinh</Label>
                <Controller
                  name="numVariants"
                  control={control}
                  render={({ field }) => (
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={field.value}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      className="mt-1"
                    />
                  )}
                />
              </div>

              {/* Schedule Mode Selector */}
              <div>
                <Label className="font-medium text-xs text-slate-700">Chế độ chọn ngày đăng</Label>
                <div className="grid grid-cols-2 gap-2 mt-1.5 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setScheduleMode('auto_days')}
                    className={`py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                      scheduleMode === 'auto_days'
                        ? 'bg-white shadow text-slate-900 font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🔄 Số ngày liên tiếp
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode('specific_dates')}
                    className={`py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                      scheduleMode === 'specific_dates'
                        ? 'bg-white shadow text-slate-900 font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📅 Chọn ngày cụ thể
                  </button>
                </div>
              </div>

              {/* Mode A: Continuous Days (Default) */}
              {scheduleMode === 'auto_days' && (
                <div className="space-y-4 border border-slate-200/70 rounded-lg p-3 bg-slate-50/50">
                  <div>
                    <Label className="text-xs">Số ngày đăng liên tiếp</Label>
                    <Controller
                      name="numDays"
                      control={control}
                      render={({ field }) => (
                        <Input
                          type="number"
                          min={1}
                          max={30}
                          value={field.value}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                          className="mt-1 bg-white"
                        />
                      )}
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Thời điểm bắt đầu đăng</Label>
                    <select
                      {...register('startPreference')}
                      className="w-full mt-1 rounded-md border border-input bg-white px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="auto">⚡ Tự động (Khung giờ tới tiếp theo, không bao giờ đặt giờ quá khứ)</option>
                      <option value="tomorrow">🌅 Bắt đầu từ sáng mai (07:00)</option>
                      <option value="today">🕒 Bắt đầu từ hôm nay (chỉ nhận giờ chưa qua)</option>
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1">
                      🛡️ Tự động lọc bỏ các khung giờ đã trôi qua trong ngày hôm nay.
                    </p>
                  </div>
                </div>
              )}

              {/* Mode B: Specific Dates Selection */}
              {scheduleMode === 'specific_dates' && (
                <div className="space-y-3.5 border border-emerald-200 bg-emerald-50/30 rounded-lg p-3.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-800">Chọn các ngày đăng cụ thể</Label>
                    {selectedSpecificDates.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedSpecificDates([])}
                        className="text-[11px] text-red-500 hover:underline"
                      >
                        Xóa tất cả ({selectedSpecificDates.length} ngày)
                      </button>
                    )}
                  </div>

                  {/* Date Input + Add Button */}
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      min={format(new Date(), 'yyyy-MM-dd')}
                      value={specificDateInput}
                      onChange={(e) => setSpecificDateInput(e.target.value)}
                      className="text-xs bg-white h-8"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs shrink-0 bg-white hover:bg-slate-50"
                      onClick={() => {
                        if (!specificDateInput) return
                        if (selectedSpecificDates.includes(specificDateInput)) {
                          toast.info('Ngày này đã có trong danh sách')
                          return
                        }
                        setSelectedSpecificDates((prev) => [...prev, specificDateInput].sort())
                        setSpecificDateInput('')
                      }}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Thêm ngày
                    </Button>
                  </div>

                  {/* Quick Presets */}
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="text-[11px] text-slate-500 self-center mr-1">Thêm nhanh:</span>
                    <button
                      type="button"
                      onClick={() => addPresetDates(2)}
                      className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-100 text-[11px] text-slate-700"
                    >
                      + 2 ngày tới
                    </button>
                    <button
                      type="button"
                      onClick={() => addPresetDates(3)}
                      className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-100 text-[11px] text-slate-700"
                    >
                      + 3 ngày tới
                    </button>
                    <button
                      type="button"
                      onClick={() => addPresetDates(5)}
                      className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-100 text-[11px] text-slate-700"
                    >
                      + 5 ngày tới
                    </button>
                  </div>

                  {/* 14 Days Pills */}
                  <div>
                    <p className="text-[11px] text-slate-600 mb-1.5">Nhấp vào ngày để bật/tắt đăng:</p>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                      {next14Days.map((d) => {
                        const isSelected = selectedSpecificDates.includes(d.dateStr)
                        return (
                          <button
                            key={d.dateStr}
                            type="button"
                            onClick={() => toggleSpecificDate(d.dateStr)}
                            className={`text-xs px-2 py-1 rounded-md border transition-all flex items-center gap-1 ${
                              isSelected
                                ? 'bg-emerald-600 text-white border-emerald-600 font-medium shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                            <span>{d.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Selected Dates Badges */}
                  {selectedSpecificDates.length > 0 ? (
                    <div className="pt-1 border-t border-emerald-200/60">
                      <p className="text-[11px] font-medium text-slate-700 mb-1.5">
                        Đã chọn {selectedSpecificDates.length} ngày đăng ({selectedSpecificDates.length * 4} lượt giờ vàng):
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedSpecificDates.map((dateStr) => {
                          const [y, m, day] = dateStr.split('-')
                          return (
                            <span
                              key={dateStr}
                              className="inline-flex items-center gap-1 bg-white text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-xs font-medium shadow-2xs"
                            >
                              <CalendarDays className="w-3 h-3 text-emerald-600" />
                              {`${day}/${m}/${y}`}
                              <button
                                type="button"
                                onClick={() => removeSpecificDate(dateStr)}
                                className="hover:text-red-500 ml-0.5 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                      💡 Chưa chọn ngày cụ thể nào. Nếu để trống, hệ thống sẽ tự động đăng theo số ngày liên tiếp như mặc định.
                    </p>
                  )}
                </div>
              )}

              {/* Golden Hours Display */}
              <div>
                <Label>Khung giờ vàng đăng bài (4 lần/ngày)</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {DEFAULT_GOLDEN_HOURS.map((h) => (
                    <Badge key={fmtHour(h.hour, h.minute)} variant="secondary">
                      {fmtHour(h.hour, h.minute)}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="bg-emerald-50/70 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-800 space-y-1">
                <p className="font-semibold flex items-center gap-1">
                  ⚡ Tiêu chuẩn bài viết BĐS chuyên nghiệp
                </p>
                <p>Văn phong chuyên gia thực tế, tuân thủ nguyên tắc 3 "TH" (Thật - Thơm - Thiếu), không icon, tránh từ cấm Facebook.</p>
              </div>

              <Button
                onClick={handleSubmit(generatePosts as any)}
                disabled={isGenerating}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Đang tạo bài viết bằng AI...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Tạo bài viết bằng AI
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ===== RIGHT COLUMN: RESULTS ===== */}
        <div className="space-y-4 flex flex-col h-full">
          {/* Tab Switcher */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setActiveTab('new')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                activeTab === 'new' ? 'bg-white shadow text-slate-900' : 'text-slate-500'
              }`}
            >
              Bài viết mới sinh ({variantCards.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('saved')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                activeTab === 'saved' ? 'bg-white shadow text-slate-900' : 'text-slate-500'
              }`}
            >
              Bài viết đã lưu {savedPosts.length > 0 ? `(${savedPosts.length})` : ''}
            </button>
          </div>

          {/* TAB 1: NEW POSTS */}
          {activeTab === 'new' && (
            <div className="flex-1 flex flex-col">
              {variantCards.length === 0 ? (
                <div className="flex-1 min-h-[500px] flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-white/50">
                  <Sparkles className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="font-semibold text-slate-600">Chưa có bài viết nào</p>
                  <p className="text-sm text-slate-400 mt-1 max-w-sm">
                    Điền thông tin bên trái và bấm "Tạo bài viết bằng AI" hoặc chọn các bài viết đã lưu từ tab bên cạnh để tiết kiệm token.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 flex-1">
                  {variantCards.map((card, idx) => (
                    <Card key={idx} className="border-slate-200 shadow-xs">
                      <CardContent className="pt-4 space-y-3">
                        {/* Style Badge */}
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STYLE_COLORS[card.style] ?? 'bg-slate-100 text-slate-600'}`}>
                            #{card.variant_index} — {card.style}
                          </span>
                          {card.savedPostId && (
                            <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-200 bg-emerald-50">
                              Đã lưu trong database
                            </Badge>
                          )}
                        </div>

                        {/* Title */}
                        <div>
                          <Label className="text-xs">Tiêu đề</Label>
                          <Input
                            value={card.title}
                            onChange={(e) => updateCard(idx, { title: e.target.value })}
                            className="mt-1 text-sm font-medium"
                          />
                        </div>

                        {/* Content */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <Label className="text-xs">Nội dung (Header, In đậm, In nghiêng, Gạch đầu dòng)</Label>
                            <div className="flex items-center gap-1.5">
                              {/* Format Buttons */}
                              <div className="flex items-center bg-slate-100 rounded p-0.5 border border-slate-200 text-xs shadow-xs">
                                <button
                                  type="button"
                                  title="In đậm (Ctrl+B / **text**)"
                                  onClick={() => applyFormat(idx, '**', '**')}
                                  className="px-1.5 py-0.5 font-bold hover:bg-white rounded text-slate-700 transition-colors cursor-pointer"
                                >
                                  B
                                </button>
                                <button
                                  type="button"
                                  title="In nghiêng (Ctrl+I / *text*)"
                                  onClick={() => applyFormat(idx, '*', '*')}
                                  className="px-1.5 py-0.5 italic font-serif hover:bg-white rounded text-slate-700 transition-colors cursor-pointer"
                                >
                                  I
                                </button>
                                <button
                                  type="button"
                                  title="Tiêu đề (Header 2)"
                                  onClick={() => applyFormat(idx, '## ', '')}
                                  className="px-1.5 py-0.5 font-semibold text-[11px] hover:bg-white rounded text-slate-700 transition-colors cursor-pointer"
                                >
                                  H2
                                </button>
                                <button
                                  type="button"
                                  title="Gạch đầu dòng (Bullet)"
                                  onClick={() => applyFormat(idx, '- ', '')}
                                  className="px-1.5 py-0.5 text-xs hover:bg-white rounded text-slate-700 transition-colors cursor-pointer"
                                >
                                  •
                                </button>
                              </div>

                              {/* Toggle Preview Button */}
                              <button
                                type="button"
                                onClick={() => setPreviewModes((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                                className={`text-[11px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1 font-medium cursor-pointer ${
                                  previewModes[idx]
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                <Eye className="w-3 h-3" />
                                {previewModes[idx] ? 'Sửa văn bản' : 'Xem trước Facebook'}
                              </button>
                            </div>
                          </div>

                          {previewModes[idx] ? (
                            <div className="mt-1 h-44 overflow-y-auto rounded-md border border-slate-200 bg-white p-3 text-xs leading-relaxed shadow-inner">
                              <div
                                className="text-slate-800 space-y-2 [&>h1]:text-sm [&>h1]:font-bold [&>h1]:text-slate-900 [&>h1]:mb-2 [&>p]:mb-2 [&>ul]:list-disc [&>ul]:pl-5 [&>ul>li]:mb-1 [&>blockquote]:border-l-4 [&>blockquote]:border-emerald-500 [&>blockquote]:pl-2.5 [&>blockquote]:italic [&>blockquote]:text-slate-600"
                                dangerouslySetInnerHTML={{
                                  __html: markdownToFacebookHtml(card.content, card.title),
                                }}
                              />
                            </div>
                          ) : (
                            <Textarea
                              id={`card-content-${idx}`}
                              value={card.content}
                              onChange={(e) => updateCard(idx, { content: e.target.value })}
                              className="mt-1 h-44 text-sm leading-relaxed"
                              placeholder="Nhập nội dung bài viết với cú pháp markdown (**in đậm**, *in nghiêng*, - gạch đầu dòng)..."
                            />
                          )}
                        </div>

                        {/* Selected Images */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <Label className="text-xs">Ảnh chọn ngẫu nhiên (3/{images.length})</Label>
                            <button
                              type="button"
                              onClick={() => refreshCardImages(idx)}
                              className="text-xs text-emerald-600 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" /> Đổi 3 ảnh khác
                            </button>
                          </div>
                          <div className="flex gap-2">
                            {card.selectedImages.map((url, imgIdx) => (
                              <img
                                key={imgIdx}
                                src={url}
                                alt=""
                                className="w-16 h-16 rounded-lg object-cover border cursor-pointer hover:ring-2 ring-emerald-400"
                                onClick={() => refreshCardImages(idx)}
                              />
                            ))}
                          </div>
                        </div>

                        {/* DateTime + Group */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Thời gian đăng</Label>
                            <Input
                              type="datetime-local"
                              value={card.scheduledAt.slice(0, 16)}
                              onChange={(e) => updateCard(idx, { scheduledAt: new Date(e.target.value).toISOString() })}
                              className="mt-1 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Nhóm đăng</Label>
                            <select
                              value={card.groupUrl}
                              onChange={(e) => updateCard(idx, { groupUrl: e.target.value })}
                              className="w-full mt-1 rounded-md border border-input bg-transparent px-2 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                              {watchedGroupUrls.map((url) => (
                                <option key={url} value={url}>
                                  {url.replace('https://www.facebook.com/groups/', 'fb/')}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SAVED POSTS (REUSE FROM DATABASE) */}
          {activeTab === 'saved' && (
            <div className="flex-1 flex flex-col">
              {!watchedPropertyId ? (
                <div className="flex-1 min-h-[500px] flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-white/50">
                  <Building2 className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="font-semibold text-slate-700">Chưa chọn bất động sản</p>
                  <p className="text-sm text-slate-400 mt-1 max-w-sm">
                    Vui lòng chọn 1 bất động sản ở cột bên trái để tải và tái sử dụng các bài viết đã từng sinh trước đó trong database.
                  </p>
                </div>
              ) : isLoadingSaved ? (
                <div className="flex-1 min-h-[500px] flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-white/50">
                  <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
                  <p className="font-medium text-slate-600">Đang tải các bài viết đã lưu từ database...</p>
                </div>
              ) : savedPosts.length === 0 ? (
                <div className="flex-1 min-h-[500px] flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-white/50">
                  <CalendarDays className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="font-semibold text-slate-700">Chưa có bài viết đã lưu cho BĐS này</p>
                  <p className="text-sm text-slate-400 mt-1 max-w-sm">
                    Khi bạn sinh bài viết bằng AI cho BĐS này, các bài viết sẽ tự động được lưu lại tại đây để bạn có thể tái sử dụng bất cứ lúc nào mà không tốn thêm token AI.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 flex-1">
                  {/* Action Bar for Saved Posts */}
                  <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-xs flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="select-all-saved"
                        checked={selectedSavedIds.length === savedPosts.length && savedPosts.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSavedIds(savedPosts.map((p) => p.id))
                          } else {
                            setSelectedSavedIds([])
                          }
                        }}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                      />
                      <Label htmlFor="select-all-saved" className="text-xs font-medium cursor-pointer">
                        Chọn tất cả ({savedPosts.length} bài)
                      </Label>
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedSavedIds.length > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            const selected = savedPosts.filter((p) => selectedSavedIds.includes(p.id))
                            loadSavedPostsToSchedule(selected)
                          }}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Nạp {selectedSavedIds.length} bài đã chọn vào lịch
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => loadSavedPostsToSchedule(savedPosts)}
                        className="text-xs h-8"
                      >
                        <CalendarDays className="w-3.5 h-3.5 mr-1" />
                        Nạp toàn bộ {savedPosts.length} bài
                      </Button>
                    </div>
                  </div>

                  {/* Saved Posts List */}
                  {savedPosts.map((post) => (
                    <Card key={post.id} className="border-slate-200 shadow-xs hover:border-slate-300 transition-all">
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedSavedIds.includes(post.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSavedIds((prev) => [...prev, post.id])
                                } else {
                                  setSelectedSavedIds((prev) => prev.filter((id) => id !== post.id))
                                }
                              }}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                            />
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STYLE_COLORS[post.style] ?? 'bg-slate-100 text-slate-600'}`}>
                              #{post.variant_index} — {post.style}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                post.status === 'scheduled'
                                  ? 'border-blue-200 text-blue-700 bg-blue-50'
                                  : (post.status === 'approved'
                                    ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                                    : 'border-slate-200 text-slate-600')
                              }`}
                            >
                              {post.status === 'scheduled' ? 'Đã lên lịch' : (post.status === 'approved' ? 'Đã duyệt' : 'Bản nháp')}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span>{post.created_at ? format(new Date(post.created_at), 'dd/MM/yyyy HH:mm') : ''}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteSaved(post.id)}
                              className="text-slate-400 hover:text-red-500 p-1 transition-colors cursor-pointer"
                              title="Xóa bài viết này khỏi kho lưu trữ"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Title */}
                        <div>
                          <h4 className="text-sm font-semibold text-slate-800">{post.title}</h4>
                        </div>

                        {/* Content */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <Label className="text-xs text-slate-500">Nội dung bài viết</Label>
                            <button
                              type="button"
                              onClick={() => setSavedPreviewModes((prev) => ({ ...prev, [post.id]: !prev[post.id] }))}
                              className={`text-[11px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1 font-medium cursor-pointer ${
                                savedPreviewModes[post.id]
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <Eye className="w-3 h-3" />
                              {savedPreviewModes[post.id] ? 'Xem văn bản gốc' : 'Xem trước Facebook'}
                            </button>
                          </div>

                          {savedPreviewModes[post.id] ? (
                            <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white p-3 text-xs leading-relaxed shadow-inner">
                              <div
                                className="text-slate-800 space-y-2 [&>h1]:text-sm [&>h1]:font-bold [&>h1]:text-slate-900 [&>h1]:mb-2 [&>p]:mb-2 [&>ul]:list-disc [&>ul]:pl-5 [&>ul>li]:mb-1 [&>blockquote]:border-l-4 [&>blockquote]:border-emerald-500 [&>blockquote]:pl-2.5 [&>blockquote]:italic [&>blockquote]:text-slate-600"
                                dangerouslySetInnerHTML={{
                                  __html: markdownToFacebookHtml(post.content, post.title),
                                }}
                              />
                            </div>
                          ) : (
                            <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-slate-50/50 p-3 text-xs font-mono whitespace-pre-wrap text-slate-700">
                              {post.content}
                            </div>
                          )}
                        </div>

                        {/* Selected Images */}
                        {post.selected_images && post.selected_images.length > 0 && (
                          <div>
                            <Label className="text-xs text-slate-500 mb-1 block">Ảnh đính kèm ({post.selected_images.length} ảnh):</Label>
                            <div className="flex gap-2">
                              {post.selected_images.map((url, imgIdx) => (
                                <img
                                  key={imgIdx}
                                  src={url}
                                  alt=""
                                  className="w-14 h-14 rounded-lg object-cover border"
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action Button */}
                        <div className="pt-2 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => loadSavedPostsToSchedule([post])}
                            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                          >
                            <CalendarDays className="w-3.5 h-3.5 mr-1" />
                            Sử dụng bài này để lên lịch
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sticky Bottom Action Bar */}
          {variantCards.length > 0 && (
            <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md shadow-lg border border-slate-200 rounded-xl p-3 flex gap-3 mt-4">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setVariantCards([])}>
                Hủy bỏ
              </Button>
              <Button
                type="button"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={confirmAndSchedule}
                disabled={batchCreateSchedules.isPending}
              >
                <CheckSquare className="w-4 h-4 mr-1" />
                {batchCreateSchedules.isPending ? 'Đang lưu...' : `Xác nhận & Nạp vào lịch (${variantCards.length} bài)`}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
