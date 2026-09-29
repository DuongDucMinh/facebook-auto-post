import { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Globe,
  Copy,
  Sparkles,
  RotateCcw,
  Code2,
  FileText,
  UserCheck,
  Plus,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Search,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useSettings, useUpdateSettings } from '@/hooks/useSettings'
import { supabase } from '@/lib/supabase'
import { SYSTEM_PROMPT_BDS } from '@/lib/groq'
import { cn } from '@/lib/utils'
import type { TaggedCollaborator } from '@/types/database'

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const updateSettings = useUpdateSettings()
  const [agentName, setAgentName] = useState('')
  const [agentPhone, setAgentPhone] = useState('')
  const [agentPhone2, setAgentPhone2] = useState('')
  const [visibleMode, setVisibleMode] = useState(true)
  const [customPrompt, setCustomPrompt] = useState('')
  const [promptViewTab, setPromptViewTab] = useState<'editor' | 'default'>('editor')

  // Tagged Collaborators state
  const [collaborators, setCollaborators] = useState<TaggedCollaborator[]>([])
  const [newCollabName, setNewCollabName] = useState('')
  const [newCollabUid, setNewCollabUid] = useState('')
  const [newCollabUsername, setNewCollabUsername] = useState('')
  const [isAddingCollab, setIsAddingCollab] = useState(false)
  const [verifyInput, setVerifyInput] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [verifiedResult, setVerifiedResult] = useState<{
    name: string
    uid: string
    username?: string
    avatarUrl?: string
    verified: boolean
  } | null>(null)

  // Initialize state from settings
  const [initialized, setInitialized] = useState(false)
  if (settings && !initialized) {
    const envPhone = (import.meta as any).env?.VITE_AGENT_PHONE
    const envPhone2 = (import.meta as any).env?.VITE_AGENT_PHONE_2
    const envName = (import.meta as any).env?.VITE_AGENT_NAME

    const initialPhone = (settings.agent_phone && settings.agent_phone !== '0123456789')
      ? settings.agent_phone
      : (envPhone || settings.agent_phone || '0123456789')

    const localPhone2 = localStorage.getItem('REALPOST_AGENT_PHONE_2') || ''
    const initialPhone2 = settings.agent_phone_2 ?? (localPhone2 || envPhone2 || '')

    const initialName = (settings.agent_name && settings.agent_name !== 'An Nhiên')
      ? settings.agent_name
      : (envName || settings.agent_name || 'An Nhiên')

    setAgentName(initialName)
    setAgentPhone(initialPhone)
    setAgentPhone2(initialPhone2)
    setVisibleMode(settings.extension_visible_mode ?? true)
    const localPrompt = localStorage.getItem('REALPOST_CUSTOM_SYSTEM_PROMPT')
    setCustomPrompt(settings.custom_system_prompt ?? (localPrompt || SYSTEM_PROMPT_BDS))

    // Parse collaborators
    const localCollabs = localStorage.getItem('REALPOST_TAGGED_COLLABORATORS')
    let parsedCollabs: TaggedCollaborator[] = []
    if (settings.tagged_collaborators && Array.isArray(settings.tagged_collaborators)) {
      parsedCollabs = settings.tagged_collaborators
    } else if (localCollabs) {
      try {
        parsedCollabs = JSON.parse(localCollabs)
      } catch {}
    }
    setCollaborators(parsedCollabs)

    setInitialized(true)
  }

  const handleSaveAgent = async () => {
    try {
      try {
        await updateSettings.mutateAsync({
          agent_name: agentName,
          agent_phone: agentPhone,
          agent_phone_2: agentPhone2.trim() || null,
        })
      } catch (dbErr: any) {
        console.warn('Có thể bảng app_settings chưa có cột agent_phone_2, lưu agent_name & agent_phone:', dbErr)
        await updateSettings.mutateAsync({
          agent_name: agentName,
          agent_phone: agentPhone,
        })
      }

      if (agentPhone2.trim()) {
        localStorage.setItem('REALPOST_AGENT_PHONE_2', agentPhone2.trim())
      } else {
        localStorage.removeItem('REALPOST_AGENT_PHONE_2')
      }
      toast.success('Đã lưu thông tin môi giới thành công')
    } catch (err: any) {
      console.error('Lỗi lưu thông tin môi giới:', err)
      toast.error('Lỗi khi lưu thông tin môi giới: ' + (err.message || String(err)))
    }
  }

  const handleSaveCollaborators = async (newList: TaggedCollaborator[]) => {
    setCollaborators(newList)
    localStorage.setItem('REALPOST_TAGGED_COLLABORATORS', JSON.stringify(newList))
    try {
      await updateSettings.mutateAsync({ tagged_collaborators: newList })
      toast.success('Đã lưu danh sách cộng sự gắn thẻ thành công!')
    } catch (err: any) {
      console.warn('Lỗi lưu Supabase (có thể bảng chưa có cột tagged_collaborators):', err)
      toast.success('Đã lưu danh sách cộng sự vào trình duyệt & Extension!')
    }

    // Sync to extension immediately
    try {
      const { data: { session } } = await supabase.auth.getSession()
      window.postMessage({
        type: 'REALPOST_CONFIG',
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        accessToken: session?.access_token,
        refreshToken: session?.refresh_token,
        taggedCollaborators: newList,
      }, '*')
    } catch {}
  }

  const handleUidInputChange = (val: string) => {
    const trimmed = val.trim()
    // 1. Kiểm tra nếu người dùng dán URL có id=... (profile.php?id=1000...)
    const idMatch = trimmed.match(/[?&]id=(\d+)/i)
    if (idMatch && idMatch[1]) {
      setNewCollabUid(idMatch[1])
      toast.info(`Đã tự động trích xuất Facebook UID: ${idMatch[1]}`)
      return
    }

    // 2. Nếu là URL facebook.com/username hoặc facebook.com/1000...
    const urlMatch = trimmed.match(/facebook\.com\/(?:profile\.php\?id=)?([a-zA-Z0-9\._]+)/i)
    if (urlMatch && urlMatch[1]) {
      const slug = urlMatch[1]
      if (/^\d{8,}$/.test(slug)) {
        setNewCollabUid(slug)
        toast.info(`Đã tự động trích xuất Facebook UID: ${slug}`)
      } else {
        if (!newCollabUsername) setNewCollabUsername(slug)
        setNewCollabUid('')
        toast.info(`Đã nhận diện Username Facebook: ${slug}. Vui lòng nhập UID số để so khớp chính xác!`)
      }
      return
    }

    setNewCollabUid(val)
  }

  const handleVerifyProfile = async () => {
    const input = (verifyInput || newCollabUid || '').trim()
    if (!input) {
      toast.error('Vui lòng nhập link Facebook cá nhân hoặc UID để kiểm tra')
      return
    }

    setIsVerifying(true)
    setVerifiedResult(null)

    const reqId = 'req_' + Date.now()
    let responded = false

    const listener = (event: MessageEvent) => {
      if (event.data?.type === 'REALPOST_VERIFY_FB_PROFILE_RES' && event.data?.requestId === reqId) {
        responded = true
        window.removeEventListener('message', listener)
        setIsVerifying(false)

        if (event.data.success && event.data.verified) {
          const res = {
            name: event.data.name,
            uid: event.data.uid,
            username: event.data.username || '',
            avatarUrl: event.data.avatarUrl || '',
            verified: true,
          }
          setVerifiedResult(res)
          setNewCollabName(res.name)
          setNewCollabUid(res.uid)
          setNewCollabUsername(res.username)
          toast.success(`Đã xác thực thành công: ${res.name} (UID: ${res.uid})`)
        } else {
          toast.error(event.data.error || 'Không tìm thấy tài khoản Facebook này hoặc link không hợp lệ')
        }
      }
    }

    window.addEventListener('message', listener)

    // Gửi message sang Extension
    window.postMessage({
      type: 'REALPOST_VERIFY_FB_PROFILE',
      requestId: reqId,
      target: input,
    }, '*')

    // Fallback nếu Extension chưa nạp hoặc offline
    setTimeout(async () => {
      if (!responded) {
        window.removeEventListener('message', listener)

        // Nếu input là dãy số UID: kiểm tra nhanh qua Graph API
        const numericMatch = input.match(/(\d{6,})/)?.[1]
        if (numericMatch) {
          try {
            const avatarUrl = `https://graph.facebook.com/${numericMatch}/picture?type=normal`
            const imgRes = await fetch(avatarUrl, { method: 'HEAD' })
            if (imgRes.ok) {
              const res = {
                name: newCollabName || 'Tài khoản Facebook (' + numericMatch + ')',
                uid: numericMatch,
                username: '',
                avatarUrl,
                verified: true,
              }
              setVerifiedResult(res)
              setNewCollabUid(numericMatch)
              setIsVerifying(false)
              toast.success(`Facebook UID ${numericMatch} hợp lệ!`)
              return
            }
          } catch {}
        }

        setIsVerifying(false)
        toast.info('Chưa nhận được phản hồi từ Extension. Hãy đảm bảo bạn đã bấm Tải lại Extension tại chrome://extensions.')
      }
    }, 4500)
  }

  const handleAddCollaborator = () => {
    const name = newCollabName.trim()
    const rawUid = newCollabUid.trim()
    const username = newCollabUsername.trim().replace(/^@/, '')

    if (!name) {
      toast.error('Vui lòng nhập tên hiển thị Facebook của cộng sự')
      return
    }
    if (!rawUid) {
      toast.error('Vui lòng nhập Facebook UID (dãy số định danh)')
      return
    }
    if (!/^\d{6,}$/.test(rawUid)) {
      toast.error('Facebook UID phải là dãy chữ số (tối thiểu 6 số, VD: 100005432167890)')
      return
    }

    if (collaborators.some((c) => c.fb_uid === rawUid)) {
      toast.error('Cộng sự với UID này đã tồn tại trong danh sách')
      return
    }

    if (collaborators.length >= 3) {
      toast.error('Hệ thống khuyến nghị tối đa 2-3 cộng sự cố định để tránh bị Facebook hạn chế tính năng')
      return
    }

    const newCollab: TaggedCollaborator = {
      id: 'collab_' + Date.now(),
      name,
      fb_uid: rawUid,
      username: username || undefined,
      avatar_url: verifiedResult?.avatarUrl || undefined,
      verified: !!verifiedResult?.verified,
      active: true,
    }

    const updated = [...collaborators, newCollab]
    handleSaveCollaborators(updated)
    setNewCollabName('')
    setNewCollabUid('')
    setNewCollabUsername('')
    setVerifyInput('')
    setVerifiedResult(null)
    setIsAddingCollab(false)
  }

  const handleRemoveCollaborator = (id: string) => {
    const updated = collaborators.filter((c) => c.id !== id)
    handleSaveCollaborators(updated)
  }

  const handleToggleCollaborator = (id: string) => {
    const updated = collaborators.map((c) =>
      c.id === id ? { ...c, active: !c.active } : c
    )
    handleSaveCollaborators(updated)
  }

  const handleSavePrompt = async () => {
    const promptToSave = customPrompt.trim() === SYSTEM_PROMPT_BDS.trim() ? null : customPrompt.trim()
    try {
      // 1. Try saving to Supabase database
      await updateSettings.mutateAsync({ custom_system_prompt: promptToSave })
      // 2. Also sync to localStorage as immediate local cache
      if (promptToSave) {
        localStorage.setItem('REALPOST_CUSTOM_SYSTEM_PROMPT', promptToSave)
      } else {
        localStorage.removeItem('REALPOST_CUSTOM_SYSTEM_PROMPT')
      }
      toast.success('Đã lưu cấu hình System Prompt tùy chỉnh thành công!')
    } catch (err: any) {
      console.warn('Lỗi lưu Supabase (có thể bảng chưa có cột custom_system_prompt):', err)
      // Fallback: save to localStorage so the user can use it immediately!
      if (promptToSave) {
        localStorage.setItem('REALPOST_CUSTOM_SYSTEM_PROMPT', promptToSave)
      } else {
        localStorage.removeItem('REALPOST_CUSTOM_SYSTEM_PROMPT')
      }
      toast.success('Đã lưu Prompt vào trình duyệt!')
      toast.info('💡 Lưu ý: Hãy chạy lệnh SQL thêm cột trên Supabase để lưu vĩnh viễn trên Cloud.', { duration: 6000 })
    }
  }

  const handleResetPrompt = async () => {
    setCustomPrompt(SYSTEM_PROMPT_BDS)
    localStorage.removeItem('REALPOST_CUSTOM_SYSTEM_PROMPT')
    try {
      await updateSettings.mutateAsync({ custom_system_prompt: null })
      toast.success('Đã khôi phục System Prompt về mặc định chuẩn!')
    } catch (err: any) {
      toast.success('Đã khôi phục System Prompt về mặc định chuẩn!')
    }
  }

  const handleCopyDefault = () => {
    setCustomPrompt(SYSTEM_PROMPT_BDS)
    setPromptViewTab('editor')
    toast.info('Đã chép nội dung Prompt chuẩn vào ô soạn thảo để bạn tùy chỉnh')
  }

  const handleVisibleModeToggle = async () => {
    const newVal = !visibleMode
    setVisibleMode(newVal)
    await updateSettings.mutateAsync({ extension_visible_mode: newVal })
    toast.success(newVal ? 'Extension sẽ hiển thị tab khi đăng bài' : 'Extension sẽ chạy nền ẩn')
  }

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) toast.error(error.message)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    toast.info('Đã đăng xuất')
  }

  const copyExtensionId = () => {
    navigator.clipboard.writeText(window.location.origin)
    toast.success('Đã sao chép URL')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isUsingCustom = !!settings?.custom_system_prompt && settings.custom_system_prompt.trim().length > 0

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Cài đặt hệ thống</h1>
        <p className="text-slate-500 text-sm mt-1">
          Tùy chỉnh thông tin môi giới, AI Copywriting Prompt, kết nối Chrome Extension & tài khoản
        </p>
      </div>

      {/* ===== 1. AI COPYWRITING SKILL & SYSTEM PROMPT EDITOR ===== */}
      <Card className="border-emerald-200/80 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base text-slate-900">
                  Tùy chỉnh AI Copywriting Skill / System Prompt
                </CardTitle>
                <CardDescription>
                  Xem và điều chỉnh các quy tắc viết bài (3 "TH", 5 phong cách, từ cấm, cấu trúc 6 phần...) theo ý muốn
                </CardDescription>
              </div>
            </div>
            <Badge variant={isUsingCustom ? 'default' : 'secondary'} className="text-xs">
              {isUsingCustom ? 'Đang dùng Prompt Tùy Chỉnh' : 'Đang dùng Prompt Mặc Định'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tabs: Editor vs Default */}
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPromptViewTab('editor')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors',
                  promptViewTab === 'editor'
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                <Code2 className="w-3.5 h-3.5" /> Ô soạn thảo & Tùy biến
              </button>
              <button
                type="button"
                onClick={() => setPromptViewTab('default')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors',
                  promptViewTab === 'default'
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                <FileText className="w-3.5 h-3.5" /> Xem Prompt chuẩn gốc
              </button>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleCopyDefault}>
                <Copy className="w-3.5 h-3.5 mr-1" /> Chép mẫu chuẩn
              </Button>
              {isUsingCustom && (
                <Button type="button" variant="outline" size="sm" onClick={handleResetPrompt} className="text-amber-600 hover:text-amber-700">
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Khôi phục mặc định
                </Button>
              )}
            </div>
          </div>

          {promptViewTab === 'editor' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Bạn có thể thêm từ cấm mới, bổ sung quy tắc khu vực (Hà Nội, TP.HCM...), hoặc phong cách riêng:</span>
                <span>{customPrompt.length} ký tự</span>
              </div>
              <Textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Nhập System Prompt tùy chỉnh cho AI..."
                className="font-mono text-xs leading-relaxed h-80 bg-slate-900 text-slate-100 selection:bg-emerald-500 selection:text-white"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-500">
                  * System Prompt này sẽ định hình văn phong chuyên gia và cấu trúc bài viết của AI.
                </span>
                <Button onClick={handleSavePrompt} disabled={updateSettings.isPending}>
                  {updateSettings.isPending ? 'Đang lưu...' : 'Lưu Prompt Tùy Chỉnh'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 font-medium">Nội dung System Prompt chuẩn được thiết kế cho BĐS:</p>
              <pre className="p-4 bg-slate-100 text-slate-800 rounded-lg text-xs leading-relaxed max-h-80 overflow-y-auto whitespace-pre-wrap font-mono border">
                {SYSTEM_PROMPT_BDS}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== 2. AGENT INFO ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin môi giới mặc định</CardTitle>
          <CardDescription>Thông tin này được chèn cố định vào phần chữ ký cuối mỗi bài viết (hỗ trợ 2 số điện thoại)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Tên môi giới</Label>
              <Input
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="VD: Em Nhiên"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Số điện thoại 1 <span className="text-red-500">*</span></Label>
              <Input
                value={agentPhone}
                onChange={(e) => setAgentPhone(e.target.value)}
                placeholder="VD: 0912345678"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Số điện thoại 2 <span className="text-slate-400 font-normal">(tùy chọn)</span></Label>
              <Input
                value={agentPhone2}
                onChange={(e) => setAgentPhone2(e.target.value)}
                placeholder="VD: 0987654321"
                className="mt-1"
              />
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600 space-y-1.5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Preview chữ ký cuối bài:</p>
            <div className="font-mono text-xs whitespace-pre-line bg-white p-3 rounded border border-slate-200 text-slate-800 leading-relaxed">
              {agentPhone2.trim()
                ? `Liên hệ ngay Em ${agentName || 'Nhiên'}\nSĐT 1: ${agentPhone || '0912345678'}\nSĐT 2: ${agentPhone2}`
                : `Liên hệ ngay Em ${agentName || 'Nhiên'}\nSĐT: ${agentPhone || '0912345678'}`}
            </div>
          </div>
          <Button onClick={handleSaveAgent} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? 'Đang lưu...' : 'Lưu thông tin'}
          </Button>
        </CardContent>
      </Card>

      {/* ===== 3. TAGGED COLLABORATORS ===== */}
      <Card className="border-blue-200/80 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base text-slate-900">
                  Cộng sự gắn thẻ (Tag People trên Facebook)
                </CardTitle>
                <CardDescription>
                  Cấu hình 1–2 tài khoản Facebook cộng sự cố định để tự động gắn thẻ vào bài đăng ("cùng với...")
                </CardDescription>
              </div>
            </div>
            <Badge variant={collaborators.some((c) => c.active) ? 'success' : 'secondary'} className="text-xs">
              {collaborators.filter((c) => c.active).length} đang bật gắn thẻ
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Info callout */}
          <div className="flex items-start gap-2.5 bg-blue-50/70 border border-blue-100 rounded-lg p-3 text-xs text-blue-900 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-blue-950">Nhận diện chuẩn xác 100% bằng Facebook UID</p>
              <p className="text-blue-800/90 mt-0.5">
                Extension sử dụng dãy số <strong>Facebook UID</strong> bất biến để tìm và so khớp chính xác đối tượng trong hộp thoại <em>"Gắn thẻ người khác"</em>. Dù có nhiều người trùng cả Họ và Tên trong danh sách bạn bè, hệ thống vẫn chọn đúng người cần tag.
              </p>
            </div>
          </div>

          {/* Collaborator List */}
          <div className="space-y-2.5">
            {collaborators.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                <UserCheck className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-60" />
                <p className="text-sm font-medium text-slate-600">Chưa cấu hình cộng sự nào</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Thêm 1–2 nick Facebook bạn bè thường xuyên cùng bán BĐS để tự động gắn thẻ khi đăng bài
                </p>
              </div>
            ) : (
              collaborators.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors shadow-2xs"
                >
                  <div className="flex items-center gap-3">
                    {c.avatar_url ? (
                      <img
                        src={c.avatar_url}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-2xs"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-semibold text-sm">
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-900">{c.name}</span>
                        {c.verified && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Đã xác thực
                          </span>
                        )}
                        {c.username && (
                          <span className="text-xs text-slate-500 font-mono">@{c.username}</span>
                        )}
                        <span className={cn(
                          'inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-medium',
                          c.active ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-500'
                        )}>
                          UID: {c.fb_uid}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Trạng thái: {c.active ? (
                          <span className="text-emerald-600 font-medium">Sẵn sàng gắn thẻ tự động</span>
                        ) : (
                          <span className="text-slate-400">Tạm tắt gắn thẻ</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Toggle active switch */}
                    <button
                      type="button"
                      title={c.active ? 'Tắt gắn thẻ người này' : 'Bật gắn thẻ người này'}
                      onClick={() => handleToggleCollaborator(c.id)}
                      className={cn(
                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer',
                        c.active ? 'bg-blue-600' : 'bg-slate-300'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow',
                          c.active ? 'translate-x-4.5' : 'translate-x-0.5'
                        )}
                      />
                    </button>

                    {/* Delete button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveCollaborator(c.id)}
                      className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 h-8 w-8"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add collaborator form / trigger */}
          {isAddingCollab ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" /> Thêm & Kiểm tra tài khoản Facebook
                </span>
                <a
                  href="https://lookup-id.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" /> Tra cứu nhanh UID bằng link
                </a>
              </div>

              {/* Step 1: Verification Input Bar */}
              <div className="space-y-1.5 bg-white p-3.5 rounded-lg border border-slate-200/80">
                <Label className="text-xs font-semibold text-slate-800">
                  Bước 1: Nhập link Facebook hoặc UID để kiểm tra tính tồn tại:
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={verifyInput}
                    onChange={(e) => setVerifyInput(e.target.value)}
                    placeholder="Dán link FB (VD: https://facebook.com/minh.bds) hoặc UID (100005432167890)..."
                    className="text-sm bg-slate-50 flex-1 font-mono"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleVerifyProfile()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={handleVerifyProfile}
                    disabled={isVerifying}
                    className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer px-4 flex-shrink-0"
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Đang kiểm tra...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-1.5" /> Kiểm tra tài khoản
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Hệ thống sẽ kết nối với Facebook để kiểm tra xem tài khoản này có tồn tại không và tự động lấy đúng UID chuẩn.
                </p>
              </div>

              {/* Verified Preview Card */}
              {verifiedResult && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3 animate-in fade-in">
                  {verifiedResult.avatarUrl ? (
                    <img
                      src={verifiedResult.avatarUrl}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover border border-emerald-300 shadow-2xs"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-emerald-200 text-emerald-800 font-bold flex items-center justify-center text-sm">
                      {verifiedResult.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{verifiedResult.name}</span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Tài khoản hợp lệ & đang tồn tại
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-mono mt-0.5">
                      Facebook UID chuẩn: <strong>{verifiedResult.uid}</strong>{' '}
                      {verifiedResult.username && `(@${verifiedResult.username})`}
                    </p>
                  </div>
                </div>
              )}

              {/* Step 2: Auto-filled / Editable Form */}
              <div className="space-y-1.5 pt-1">
                <Label className="text-xs font-semibold text-slate-800">
                  Bước 2: Xác nhận thông tin lưu trữ:
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-[11px] text-slate-600">Tên hiển thị Facebook <span className="text-red-500">*</span></Label>
                    <Input
                      value={newCollabName}
                      onChange={(e) => setNewCollabName(e.target.value)}
                      placeholder="VD: Nguyễn Đức Minh"
                      className="mt-1 text-sm bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-600">Facebook UID (dãy số) <span className="text-red-500">*</span></Label>
                    <Input
                      value={newCollabUid}
                      onChange={(e) => setNewCollabUid(e.target.value)}
                      placeholder="VD: 100005432167890"
                      className="mt-1 text-sm font-mono bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-600">Username / Biệt danh <span className="text-slate-400 font-normal">(tùy chọn)</span></Label>
                    <Input
                      value={newCollabUsername}
                      onChange={(e) => setNewCollabUsername(e.target.value)}
                      placeholder="VD: minh.bds"
                      className="mt-1 text-sm font-mono bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsAddingCollab(false)
                    setNewCollabName('')
                    setNewCollabUid('')
                    setNewCollabUsername('')
                    setVerifyInput('')
                    setVerifiedResult(null)
                  }}
                >
                  Hủy
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddCollaborator}
                  className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                >
                  Lưu cộng sự vào danh sách
                </Button>
              </div>
            </div>
          ) : (
            <div>
              {collaborators.length < 3 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddingCollab(true)}
                  className="text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Thêm cộng sự gắn thẻ
                </Button>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  Đã đạt giới hạn tối đa 3 cộng sự gắn thẻ cố định (để đảm bảo tuân thủ chính sách Meta chống spam).
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== 4. INTEGRATIONS ===== */}
      <div className="grid gap-4">
        {/* Google Account */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
                  <Globe className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Tài khoản Google</p>
                  <p className="text-sm text-slate-500">Đăng nhập tài khoản bằng Google OAuth</p>
                </div>
              </div>
              <Button variant="outline" onClick={handleGoogleLogin}>
                Kết nối Google
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Facebook */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 fill-current text-blue-600" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-slate-900">Tài khoản Facebook</p>
                  <p className="text-sm text-slate-500">Quản lý phiên đăng nhập Facebook qua Extension</p>
                </div>
              </div>
              <Badge variant={settings?.fb_connected ? 'success' : 'secondary'}>
                {settings?.fb_connected ? 'Đang hoạt động' : 'Chưa kết nối'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Chrome Extension */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 fill-none stroke-current stroke-2 text-slate-600" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="4" />
                  <line x1="21.17" y1="8" x2="12" y2="8" />
                  <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
                  <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
                </svg>
              </div>
              <div>
                <CardTitle className="text-base">Chrome Extension Bridge</CardTitle>
                <CardDescription>Extension để tự động đăng bài lên Facebook Groups</CardDescription>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {settings?.extension_connected ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400" />
                )}
                <Badge variant={settings?.extension_connected ? 'success' : 'destructive'}>
                  {settings?.extension_connected ? 'Connected' : 'Not Detected'}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Installation Steps */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-slate-700">Hướng dẫn cài đặt Extension (3 bước):</p>
              <ol className="space-y-2 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs flex-shrink-0">1</span>
                  <span>Mở Chrome, truy cập <code className="bg-slate-200 px-1 rounded text-xs">chrome://extensions</code></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs flex-shrink-0">2</span>
                  <span>Bật công tắc <strong>Developer Mode</strong> (góc trên cùng bên phải)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs flex-shrink-0">3</span>
                  <span>Bấm nút <strong>Load Unpacked</strong> và chọn thư mục <code className="bg-slate-200 px-1 rounded text-xs">extension/</code></span>
                </li>
              </ol>
            </div>

            {/* Visible Mode Toggle */}
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-slate-700">Chế độ hiển thị tab Facebook khi đăng bài</p>
                <p className="text-xs text-slate-500">
                  {visibleMode ? 'Extension sẽ mở tab Facebook hiển thị trực quan khi đăng bài' : 'Extension sẽ chạy ngầm không hiển thị tab'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleVisibleModeToggle}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer',
                  visibleMode ? 'bg-emerald-500' : 'bg-slate-300'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow',
                    visibleMode ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>

            {/* Web App URL */}
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-slate-100 rounded px-3 py-2 text-xs text-slate-600 truncate">
                {window.location.origin}
              </code>
              <Button variant="outline" size="sm" onClick={copyExtensionId}>
                <Copy className="w-3.5 h-3.5 mr-1" /> Sao chép URL Web App
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sign out */}
      <div className="pt-2">
        <Button variant="destructive" onClick={handleSignOut}>Đăng xuất tài khoản</Button>
      </div>
    </div>
  )
}
