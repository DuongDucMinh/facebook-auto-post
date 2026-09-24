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
import { SYSTEM_PROMPT_BDS, GROQ_MODEL } from '@/lib/groq'
import { cn } from '@/lib/utils'

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const updateSettings = useUpdateSettings()
  const [agentName, setAgentName] = useState('')
  const [agentPhone, setAgentPhone] = useState('')
  const [visibleMode, setVisibleMode] = useState(true)
  const [customPrompt, setCustomPrompt] = useState('')
  const [promptViewTab, setPromptViewTab] = useState<'editor' | 'default'>('editor')

  // Initialize state from settings
  const [initialized, setInitialized] = useState(false)
  if (settings && !initialized) {
    const envPhone = (import.meta as any).env?.VITE_AGENT_PHONE
    const envName = (import.meta as any).env?.VITE_AGENT_NAME

    const initialPhone = (settings.agent_phone && settings.agent_phone !== '0123456789')
      ? settings.agent_phone
      : (envPhone || settings.agent_phone || '0123456789')

    const initialName = (settings.agent_name && settings.agent_name !== 'An Nhiên')
      ? settings.agent_name
      : (envName || settings.agent_name || 'An Nhiên')

    setAgentName(initialName)
    setAgentPhone(initialPhone)
    setVisibleMode(settings.extension_visible_mode ?? true)
    const localPrompt = localStorage.getItem('REALPOST_CUSTOM_SYSTEM_PROMPT')
    setCustomPrompt(settings.custom_system_prompt ?? (localPrompt || SYSTEM_PROMPT_BDS))
    setInitialized(true)
  }

  const handleSaveAgent = async () => {
    try {
      await updateSettings.mutateAsync({ agent_name: agentName, agent_phone: agentPhone })
      toast.success('Đã lưu thông tin môi giới thành công')
    } catch (err: any) {
      console.error('Lỗi lưu thông tin môi giới:', err)
      toast.error('Lỗi khi lưu thông tin môi giới: ' + (err.message || String(err)))
    }
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
          Tùy chỉnh thông tin môi giới, AI Copywriting Prompt, kết nối Groq & Chrome Extension
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
                  * Prompt này sẽ được gửi trực tiếp tới model <code>{GROQ_MODEL}</code> khi bạn bấm "Sinh bài viết".
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
          <CardDescription>Thông tin này được chèn cố định vào phần chữ ký cuối mỗi bài viết</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tên môi giới</Label>
              <Input
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="VD: An Nhiên"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Số điện thoại</Label>
              <Input
                value={agentPhone}
                onChange={(e) => setAgentPhone(e.target.value)}
                placeholder="VD: 0123456789"
                className="mt-1"
              />
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
            Preview chữ ký cuối bài: <strong>Liên hệ trực tiếp em {agentName} - SĐT: {agentPhone}</strong>
          </div>
          <Button onClick={handleSaveAgent} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? 'Đang lưu...' : 'Lưu thông tin'}
          </Button>
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
