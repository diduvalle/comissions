import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const LABEL: Record<string, string> = {
  'mapa-diretor': 'Mapa → diretor',
  'mapa-cc': 'Mapa → contabilidade',
  'revisto': 'Revisto → gestor',
  'aviso-abertura-diretor': 'Aviso: diretor abriu',
  'aviso-abertura-cc': 'Aviso: contabilidade abriu',
  'backup': 'Backup mensal',
}
const COR: Record<string, string> = {
  'mapa-diretor': 'bg-blue-100 text-host-blue',
  'mapa-cc': 'bg-indigo-100 text-indigo-700',
  'revisto': 'bg-green-100 text-green-700',
  'aviso-abertura-diretor': 'bg-amber-100 text-amber-700',
  'aviso-abertura-cc': 'bg-amber-100 text-amber-700',
  'backup': 'bg-gray-100 text-gray-600',
}
const fmt = (iso: string) => new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function Emails() {
  const [emails, setEmails] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [ver, setVer] = useState<any | null>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('emails').select('*').order('criado_em', { ascending: false }).limit(500)
      setEmails((data as any) || [])
      setLoading(false)
    })()
  }, [])

  if (loading) return <div className="text-gray-500">A carregar…</div>

  const tipos = [...new Set(emails.map((e) => e.tipo))]
  const lista = filtro ? emails.filter((e) => e.tipo === filtro) : emails

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-host-navy">Emails enviados</h1>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="px-3 py-2 rounded-lg border bg-white text-sm">
          <option value="">Todos os tipos</option>
          {tipos.map((t) => <option key={t} value={t}>{LABEL[t] || t}</option>)}
        </select>
      </div>
      <p className="text-sm text-gray-500 mb-5">Registo de todos os emails que a app enviou — o quê, para quem e quando.</p>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Para</th>
              <th className="px-3 py-2 font-medium">Assunto</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Ainda não há emails registados.</td></tr>}
            {lista.map((e) => (
              <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">{fmt(e.criado_em)}</td>
                <td className="px-3 py-2"><span className={`text-xs font-medium rounded px-2 py-1 ${COR[e.tipo] || 'bg-gray-100 text-gray-600'}`}>{LABEL[e.tipo] || e.tipo}</span></td>
                <td className="px-3 py-2 whitespace-nowrap">{e.para}</td>
                <td className="px-3 py-2 max-w-[280px] truncate" title={e.assunto}>{e.assunto}</td>
                <td className="px-3 py-2">{e.estado === 'erro' ? <span className="text-xs text-red-600" title={e.erro}>erro</span> : <span className="text-xs text-green-700">enviado</span>}</td>
                <td className="px-3 py-2 text-right"><button onClick={() => setVer(e)} className="text-host-blue text-xs font-semibold">ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">{lista.length} email(s).</p>

      {ver && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setVer(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-5 max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="text-xs text-gray-400">{fmt(ver.criado_em)} · {LABEL[ver.tipo] || ver.tipo}</div>
            <h3 className="text-lg font-bold text-host-navy">{ver.assunto}</h3>
            <p className="text-sm text-gray-500 mb-3">Para: {ver.para}{ver.estado === 'erro' && <span className="text-red-600"> · erro: {ver.erro}</span>}</p>
            <div className="border rounded-lg p-4 bg-gray-50 text-sm" dangerouslySetInnerHTML={{ __html: ver.corpo || '<i>(sem corpo)</i>' }} />
            <div className="flex justify-end mt-4"><button onClick={() => setVer(null)} className="px-4 py-2 rounded-lg border text-sm">Fechar</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
