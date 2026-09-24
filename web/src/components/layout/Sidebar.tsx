import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  PenSquare,
  Building2,
  Settings,
  Zap,
  User,
  Circle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/hooks/useSettings'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/generator', label: 'Tạo bài đăng', icon: PenSquare },
  { to: '/properties', label: 'Danh sách BĐS', icon: Building2 },
  { to: '/settings', label: 'Cài đặt', icon: Settings },
]

export function Sidebar() {
  const { data: settings } = useSettings()

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-slate-900 text-slate-100 flex flex-col z-50 border-r border-slate-800">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-slate-800">
        <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-lg tracking-tight">RealPost AI</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              )
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: User + Extension status */}
      <div className="px-3 py-4 border-t border-slate-800 space-y-3">
        {/* Extension status */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800">
          <Circle
            className={cn(
              'w-2 h-2 fill-current',
              settings?.extension_connected ? 'text-emerald-400' : 'text-red-400'
            )}
          />
          <span className="text-xs text-slate-400">
            Extension {settings?.extension_connected ? 'Connected' : 'Not Detected'}
          </span>
        </div>
        {/* User */}
        {(() => {
          const envPhone = (import.meta as any).env?.VITE_AGENT_PHONE
          const envName = (import.meta as any).env?.VITE_AGENT_NAME
          const displayName = (settings?.agent_name && settings.agent_name !== 'An Nhiên')
            ? settings.agent_name
            : (envName || settings?.agent_name || 'Môi giới')
          const displayPhone = (settings?.agent_phone && settings.agent_phone !== '0123456789')
            ? settings.agent_phone
            : (envPhone || settings?.agent_phone || '')

          return (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer">
              <div className="w-7 h-7 bg-slate-600 rounded-full flex items-center justify-center">
                <User className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-200 truncate">
                  {displayName}
                </p>
                <p className="text-xs text-slate-500 truncate">{displayPhone}</p>
              </div>
            </div>
          )
        })()}
      </div>
    </aside>
  )
}
