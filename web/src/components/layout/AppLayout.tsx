import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useExtensionBridge } from '@/hooks/useSettings'

export function AppLayout() {
  useExtensionBridge()

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 ml-60 overflow-auto">
        <div className="min-h-full p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
