import { Link, useLocation } from 'react-router-dom'

export default function Layout({ children }: { children: React.ReactNode }) {
  const loc = useLocation()
  const tab = (to: string, label: string) => {
    const active = loc.pathname === to
    return (
      <Link
        to={to}
        className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
          active ? 'bg-host-blue text-white shadow-glow' : 'text-host-navy/70 hover:text-host-navy hover:bg-host-navy/5'
        }`}
      >
        {label}
      </Link>
    )
  }
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white/80 backdrop-blur-md border-b border-host-navy/10 sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center gap-3 sm:gap-6 overflow-x-auto">
          <img src="/host-color.png" alt="Host" className="h-7 shrink-0" />
          <nav className="flex items-center gap-1 shrink-0">
            {tab('/', 'Painel')}
            {tab('/resumo', 'Analytics')}
            {tab('/envios', 'Envios')}
            {tab('/emails', 'Emails')}
            {tab('/definicoes', 'Definições')}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-7 animate-fade-up">{children}</main>
      <footer className="mt-4">
        <div className="max-w-[1400px] mx-auto px-6 h-12 flex items-center justify-between text-xs text-gray-400">
          <span>Host Hotel Systems · Gestão de comissões</span>
          <span className="italic">Move beyond expectations.</span>
        </div>
      </footer>
    </div>
  )
}
