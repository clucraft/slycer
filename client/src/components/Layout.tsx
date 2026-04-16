import { Outlet } from 'react-router-dom'
import { Layers } from 'lucide-react'
import ParticleBackground from './ParticleBackground'

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col relative">
      <ParticleBackground />

      {/* Header */}
      <header className="bg-surface-800/90 backdrop-blur-sm border-b border-surface-600 relative z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <Layers className="h-8 w-8 text-primary-400" />
          <div>
            <h1 className="text-xl font-bold text-primary-400 text-glow">Slycer</h1>
            <p className="text-xs text-zinc-500 tracking-wider">AI-OPTIMIZED 3D PRINT SETTINGS</p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 relative z-10">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-surface-800/50 border-t border-surface-600 relative z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 text-center text-xs text-zinc-600">
          Slycer v0.1.0
        </div>
      </footer>
    </div>
  )
}
