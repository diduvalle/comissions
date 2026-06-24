import { Link, useLocation } from 'react-router-dom'

export default function Layout({ children }: { children: React.ReactNode }) {
  const loc = useLocation()
  const tab = (to: string, label: string) => {
    const active = loc.pathname === to
    return (
      <Link
        to={to}
        className={`px-3 py-1.5 rounded-md text-sm font-medium ${
          active ? 'bg-host-blue text-white' : 'text-host-navy hover:bg-gray-100'
        }`}
      >
        {label}
      </Link>
    )
  }
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center gap-6">
          <img src="/host-color.png" alt="Host" className="h-7" />
          <nav className="flex items-center gap-1">
            {tab('/', 'Painel')}
            {tab('/resumo', 'Analytics')}
            {tab('/envios', 'Envios')}
            {tab('/definicoes', 'Definições')}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6">{children}</main>
      <footer className="border-t bg-white">
        <div className="max-w-[1400px] mx-auto px-6 h-12 flex items-center justify-between text-xs text-gray-400">
          <span>Host Hotel Systems · Gestão de comissões</span>
          <span className="italic">Move beyond expectations.</span>
        </div>
      </footer>
    </div>
  )
}
