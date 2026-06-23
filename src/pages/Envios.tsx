import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { Envio } from '../types'
import { eur, mrefLabel } from '../utils'

function fmtDataHora(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const estadoBadge: Record<string, string> = {
  enviado: 'bg-blue-100 text-host-blue',
  em_revisao: 'bg-amber-100 text-amber-700',
  concluido: 'bg-green-100 text-green-700',
}

export default function Envios() {
  const [envios, setEnvios] = useState<Envio[]>([])
  const [loading, setLoading] = useState(true)
  const [copiado, setCopiado] = useState<string>('')

  async function carregar() {
    setLoading(true)
    const { data } = await supabase.from('envios').select('*').order('data_envio', { ascending: false })
    setEnvios((data as any) || [])
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  function copiar(e: Envio) {
    navigator.clipboard.writeText(`${window.location.origin}/validacao/${e.token}`)
    setCopiado(e.id)
    setTimeout(() => setCopiado(''), 2000)
  }

  async function apagar(e: Envio) {
    if (!confirm(`Apagar o envio de ${mrefLabel(e.mes_referencia)} (${fmtDataHora(e.data_envio)})?\nO link deixa de funcionar.`)) return
    const { error } = await supabase.from('envios').delete().eq('id', e.id)
    if (error) { alert('Erro: ' + error.message); return }
    carregar()
  }

  if (loading) return <div className="text-gray-500">A carregar…</div>

  return (
    <div>
      <h1 className="text-2xl font-bold text-host-navy mb-1">Histórico de envios</h1>
      <p className="text-sm text-gray-500 mb-5">Todos os mapas gerados/enviados ao diretor.</p>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="px-3 py-2 font-medium">Mês</th>
              <th className="px-3 py-2 font-medium">Data de envio</th>
              <th className="px-3 py-2 font-medium">De → Para</th>
              <th className="px-3 py-2 font-medium text-center">Linhas</th>
              <th className="px-3 py-2 font-medium text-right">Comissões</th>
              <th className="px-3 py-2 font-medium text-right">Bónus</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Aberto pelo diretor</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {envios.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">Ainda não há envios.</td></tr>}
            {envios.map((e) => (
              <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">{mrefLabel(e.mes_referencia)}</td>
                <td className="px-3 py-2">{fmtDataHora(e.data_envio)}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{e.enviado_por || '—'} <span className="text-gray-400">→</span> {e.enviado_para || '—'}</td>
                <td className="px-3 py-2 text-center">{(e.comissao_ids || []).length}</td>
                <td className="px-3 py-2 text-right">{eur(e.total_comissoes)}</td>
                <td className="px-3 py-2 text-right">{Number(e.bonus) ? eur(e.bonus) : '—'}</td>
                <td className="px-3 py-2"><span className={`text-xs font-medium rounded px-2 py-1 ${estadoBadge[e.estado] || 'bg-gray-100 text-gray-700'}`}>{e.estado}</span></td>
                <td className="px-3 py-2 text-xs">
                  {e.aberto_em
                    ? <span className="text-green-700">✓ {fmtDataHora(e.aberto_em)} <span className="text-gray-400">({e.aberto_contagem}×)</span></span>
                    : <span className="text-gray-400">Por abrir</span>}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => copiar(e)} className="text-host-blue text-xs font-semibold mr-3">{copiado === e.id ? '✓ Copiado!' : 'Copiar link'}</button>
                  {e.estado === 'concluido'
                    ? <span title="Concluído pelo diretor — guardado para histórico (não pode ser apagado)" className="text-gray-400 cursor-default">🔒</span>
                    : <button onClick={() => apagar(e)} title="Apagar envio" className="text-red-400 hover:text-red-600">✕</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
