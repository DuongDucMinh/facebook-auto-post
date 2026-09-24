import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Sparkles, RefreshCw, CalendarDays, X, Image as ImageIcon, Plus, CheckSquare } from 'lucide-react'
import { toast } from 'sonner'
import { addDays } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useProperties, useUploadPropertyImage } from '@/hooks/useProperties'
import { useBatchCreateSchedules } from '@/hooks/useSchedules'
import { useSettings } from '@/hooks/useSettings'
import { supabase } from '@/lib/supabase'
import { DEFAULT_GOLDEN_HOURS, getDefaultDateRange } from '@/lib/scheduler'
import { randomPick } from '@/lib/utils'
import { generatePostsWithGroq, type PostVariant } from '@/lib/groq'
import { ImageUploader } from '@/components/ui/image-uploader'
import type { Property } from '@/types/database'

function fmtHour(h: number, m: number) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const formSchema = z.object({
  propertyId: z.string().optional(),
  title: z.string().min(5, 'Tên tối thiểu 5 ký tự'),
  description: z.string().min(20, 'Mô tả tối thiểu 20 ký tự'),
  numVariants: z.number().min(1).max(20),
  numDays: z.number().min(1).max(30),
  groupUrls: z.array(z.string()).min(1, 'Cần ít nhất 1 nhóm Facebook'),
})

type FormValues = {
  propertyId?: string
  title: string
  description: string
  numVariants: number
  numDays: number
  groupUrls: string[]
}

interface VariantCard {
  variant_index: number
  style: string
  title: string
  content: string
  selectedImages: string[]
  scheduledAt: string
  groupUrl: string
}

const STYLE_COLORS: Record<string, string> = {
  'Kể chuyện (Storytelling)': 'bg-purple-100 text-purple-700',
  'Hóm hỉnh / Đời thực': 'bg-yellow-100 text-yellow-700',
  'Chuyên gia / Ngắn gọn': 'bg-blue-100 text-blue-700',
  'Tâm sự nghề': 'bg-emerald-100 text-emerald-700',
  'Kích thích tò mò (Hook mạnh)': 'bg-red-100 text-red-700',
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

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      title: '',
      description: '',
      numVariants: 10,
      numDays: 3,
      groupUrls: [],
    },
  })

  const watchedPropertyId = watch('propertyId')
  const watchedGroupUrls = watch('groupUrls') ?? []

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

      const agentName = (settings?.agent_name && settings.agent_name !== 'An Nhiên')
        ? settings.agent_name
        : (envName || settings?.agent_name || 'An Nhiên')

      const agentPhone = (settings?.agent_phone && settings.agent_phone !== '0123456789')
        ? settings.agent_phone
        : (envPhone || settings?.agent_phone || '0123456789')

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
          }),
        })

        if (!response.ok) throw new Error(`Lỗi sinh bài (${response.status})`)
        variants = await response.json()
      }

      // Build schedule dates
      const { startDate } = getDefaultDateRange(data.numDays)
      const goldenHours = DEFAULT_GOLDEN_HOURS

      // Assign scheduled times to cards
      const cards: VariantCard[] = variants.map((v, i) => {
        const dayOffset = Math.floor(i / goldenHours.length)
        const slotIdx = i % goldenHours.length
        const date = addDays(startDate, dayOffset)
        const { hour, minute } = goldenHours[slotIdx]
        date.setHours(hour, minute, 0, 0)
        return {
          variant_index: v.variant_index ?? i + 1,
          style: v.style ?? 'Phong cách BĐS',
          title: v.title,
          content: v.content,
          selectedImages: randomPick(images, Math.min(3, images.length)),
          scheduledAt: date.toISOString(),
          groupUrl: data.groupUrls[i % data.groupUrls.length],
        }
      })

      setVariantCards(cards)
      setActiveTab('new')
      toast.success(`Đã sinh ${variants.length} bài viết bằng Groq (openai/gpt-oss-120b)!`)
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

  const confirmAndSchedule = async () => {
    if (variantCards.length === 0) { toast.error('Chưa có bài viết nào để lên lịch'); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Chưa đăng nhập'); return }

    const approvedCards = variantCards.filter((c) => c.groupUrl && c.scheduledAt)

    try {
      // 1. Save generated_posts
      const postsToInsert = approvedCards.map((c) => ({
        property_id: watchedPropertyId ?? 'draft',
        title: c.title,
        content: c.content,
        style: c.style,
        variant_index: c.variant_index,
        selected_images: c.selectedImages,
        is_approved: true,
        status: 'scheduled' as const,
      }))

      const { data: savedPosts, error: postsErr } = await (supabase
        .from('generated_posts') as any)
        .insert(postsToInsert)
        .select()
      if (postsErr) throw postsErr

      // 2. Create schedules
      const schedules = (savedPosts as any[]).map((post: any, i: number) => ({
        user_id: user.id,
        post_id: post.id,
        property_id: watchedPropertyId ?? post.property_id,
        target_group_url: approvedCards[i].groupUrl,
        scheduled_at: approvedCards[i].scheduledAt,
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
          Sinh bài viết marketing BĐS bằng Groq AI (<code>openai/gpt-oss-120b</code>) và lên lịch xoay vòng chống spam
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6 items-start">
        {/* ===== LEFT COLUMN: SETUP ===== */}
        <div className="space-y-4">
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
              <div className="grid grid-cols-2 gap-4">
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
                <div>
                  <Label>Số ngày đăng</Label>
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
                        className="mt-1"
                      />
                    )}
                  />
                </div>
              </div>

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
                  ⚡ AI Model: openai/gpt-oss-120b (Groq)
                </p>
                <p>Tuân thủ: 3 "TH" (Thật - Thơm - Thiếu), Không icon, Không từ cấm FB, 5 phong cách xoay vòng.</p>
                <p className="text-emerald-700/80">Rate Limits: 30 req/phút • 8K token/phút • Phân phối an toàn chống Meta spam.</p>
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
                    Đang sinh bài viết bằng Groq...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Sinh bài viết bằng AI
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ===== RIGHT COLUMN: RESULTS ===== */}
        <div className="space-y-4">
          {/* Tab Switcher */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setActiveTab('new')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'new' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
            >
              Bài viết mới sinh ({variantCards.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('saved')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'saved' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
            >
              Bài viết đã lưu
            </button>
          </div>

          {activeTab === 'new' && (
            <>
              {variantCards.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-200 rounded-xl">
                  <Sparkles className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="font-medium text-slate-500">Chưa có bài viết nào</p>
                  <p className="text-sm text-slate-400 mt-1">Điền thông tin bên trái và bấm "Sinh bài viết bằng AI"</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto pr-1">
                  {variantCards.map((card, idx) => (
                    <Card key={idx}>
                      <CardContent className="pt-4 space-y-3">
                        {/* Style Badge */}
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STYLE_COLORS[card.style] ?? 'bg-slate-100 text-slate-600'}`}>
                            #{card.variant_index} — {card.style}
                          </span>
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
                          <Label className="text-xs">Nội dung bài viết (6 phần, không icon)</Label>
                          <Textarea
                            value={card.content}
                            onChange={(e) => updateCard(idx, { content: e.target.value })}
                            className="mt-1 h-32 text-sm leading-relaxed"
                          />
                        </div>

                        {/* 3 Selected Images */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <Label className="text-xs">Ảnh chọn ngẫu nhiên (3/{images.length})</Label>
                            <button
                              type="button"
                              onClick={() => refreshCardImages(idx)}
                              className="text-xs text-emerald-600 hover:underline flex items-center gap-1"
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
            </>
          )}

          {activeTab === 'saved' && (
            <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-200 rounded-xl">
              <CalendarDays className="w-10 h-10 text-slate-300 mb-3" />
              <p className="font-medium text-slate-500">Bài viết đã lưu</p>
              <p className="text-sm text-slate-400 mt-1">Chọn BĐS để xem các bài viết đã sinh trước đó</p>
            </div>
          )}

          {/* Sticky Bottom Action Bar */}
          {variantCards.length > 0 && (
            <div className="sticky bottom-0 bg-white border-t pt-3 pb-2 flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setVariantCards([])}>
                Hủy bỏ
              </Button>
              <Button
                type="button"
                className="flex-1"
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
