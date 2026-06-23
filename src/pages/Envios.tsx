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

  useEffect(() => {
    supabase.from('envios').select('*').order('data_envio', { ascending: false }).then(({ data }) => {
      setEnvios((data as any) || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="text-gray-500">A carregar…</div>

  return (
    <div>
      <h1 className="text-2xl font-bold text-host-navy mb-1">Histórico de envios</h1>
      <p className="text-sm text-gray-500 mb-5">Todos os mapas gerados/enviados ao diretor.</p>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="px-3 py-2 font-medium">Mês</th>
              <th className="px-3 py-2 font-medium">Data de envio</th>
              <th className="px-3 py-2 font-medium text-center">Linhas</th>
              <th className="px-3 py-2 font-medium text-right">Total comissões</th>
              <th className="px-3 py-2 font-medium text-right">Bónus</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Link</th>
            </tr>
          </thead>
          <tbody>
            {envios.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Ainda não há envios.</td></tr>}
            {envios.map((e) => (
              <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">{mrefLabel(e.mes_referencia)}</td>
                <td className="px-3 py-2">{fmtDataHora(e.data_envio)}</td>
                <td className="px-3 py-2 text-center">{(e.comissao_ids || []).length}</td>
                <td className="px-3 py-2 text-right">{eur(e.total_comissoes)}</td>
                <td className="px-3 py-2 text-right">{Number(e.bonus) ? eur(e.bonus) : '—'}</td>
                <td className="px-3 py-2"><span className={`text-xs font-medium rounded px-2 py-1 ${estadoBadge[e.estado] || 'bg-gray-100 text-gray-700'}`}>{e.estado}</span></td>
                <td className="px-3 py-2">
                  <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/validacao/${e.token}`)} className="text-host-blue text-xs font-semibold">Copiar link</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
