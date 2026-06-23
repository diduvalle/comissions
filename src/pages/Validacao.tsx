import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import type { Comissao, Definicoes, Envio, Estado } from '../types'
import { eur, fmtDate, mrefLabel } from '../utils'
import { updateComissao } from '../data'

const estadoCls: Record<Estado, string> = {
  pendente: 'bg-gray-100 text-gray-700',
  validada: 'bg-blue-100 text-host-blue',
  paga: 'bg-green-100 text-green-700',
}

export default function Validacao() {
  const { token } = useParams()
  const [envio, setEnvio] = useState<Envio | null>(null)
  const [def, setDef] = useState<Definicoes | null>(null)
  const [linhas, setLinhas] = useState<Comissao[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  async function carregar() {
    setLoading(true)
    const { data: e } = await supabase.from('envios').select('*').eq('token', token).maybeSingle()
    if (!e) { setErro('Link inválido ou expirado.'); setLoading(false); return }
    setEnvio(e as any)
    const [{ data: d }, { data: c }] = await Promise.all([
      supabase.from('definicoes').select('*').eq('id', 1).single(),
      supabase.from('comissoes').select('*, cliente:clientes(*), produto:produtos(*)').in('id', (e as any).comissao_ids),
    ])
    setDef(d as any)
    setLinhas((c as any) || [])
    setLoading(false)
  }
  useEffect(() => { carregar() }, [token])

  async function patch(c: Comissao, p: Partial<Comissao>) {
    await updateComissao(c, p, 'diretor')
    await carregar()
  }

  async function marcarTodas(estado: Estado) {
    for (const c of linhas) {
      if (c.estado !== estado) {
        const extra = estado === 'paga' && (c.valor_pago == null) ? { valor_pago: c.comissao_calculada } : {}
        await updateComissao(c, { estado, ...extra }, 'diretor')
      }
    }
    await carregar()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">A carregar…</div>
  if (erro) return <div className="min-h-screen flex items-center justify-center text-gray-600">{erro}</div>

  const totComissao = linhas.reduce((s, c) => s + Number(c.comissao_calculada || 0), 0)
  const totPago = linhas.reduce((s, c) => s + Number(c.valor_pago || 0), 0)
  const iniciais = (def?.gestor_nome || 'DV').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="min-h-screen bg-host-navy/5">
      <header className="bg-host-navy text-white">
        <div className="max-w-[1200px] mx-auto px-6 py-5 flex items-center gap-4">
          <img src="https://cdn.prod.website-files.com/69b142c7dd4ed4f68e7813f9/69b142c7dd4ed4f68e781635_Host_negative_RGB.png" alt="Host" className="h-7" />
          <div className="ml-auto flex items-center gap-3">
            <img
              src="/gestora.jpg" alt={def?.gestor_nome || iniciais}
              className="h-11 w-11 rounded-full object-cover border-2 border-white/30"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
            <div className="text-right">
              <div className="font-semibold leading-tight">{def?.gestor_nome}</div>
              <div className="text-xs text-white/70">{def?.gestor_cargo}</div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-host-navy">Comissões para validação — {envio && mrefLabel(envio.mes_referencia)}</h1>
          <p className="text-sm text-gray-500">Mapa enviado por {def?.gestor_nome} para validação.</p>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <button onClick={() => marcarTodas('validada')} className="bg-host-blue text-white text-sm font-semibold rounded-lg px-4 py-2">Marcar todas como validadas</button>
          <button onClick={() => marcarTodas('paga')} className="bg-green-600 text-white text-sm font-semibold rounded-lg px-4 py-2">Marcar todas como pagas</button>
        </div>

        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="px-3 py-2 font-medium">Nº</th>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Produto</th>
                <th className="px-3 py-2 font-medium text-right">Comissão</th>
                <th className="px-3 py-2 font-medium text-right">Valor pago</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Observações</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2">{c.numero_projeto}</td>
                  <td className="px-3 py-2">{fmtDate(c.data_adjudicacao)}</td>
                  <td className="px-3 py-2">{c.cliente?.nome}</td>
                  <td className="px-3 py-2">{c.produto?.tipo}</td>
                  <td className="px-3 py-2 text-right font-semibold">{eur(c.comissao_calculada)}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" defaultValue={c.valor_pago ?? ''} placeholder="—"
                      onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (c.valor_pago ?? null)) patch(c, { valor_pago: v }) }}
                      className="w-24 text-right border rounded px-2 py-1" />
                  </td>
                  <td className="px-3 py-2">
                    <select value={c.estado} onChange={(e) => patch(c, { estado: e.target.value as Estado })} className={`rounded px-2 py-1 text-xs font-medium ${estadoCls[c.estado]}`}>
                      <option value="pendente">pendente</option>
                      <option value="validada">validada</option>
                      <option value="paga">paga</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input defaultValue={c.observacoes ?? ''} placeholder="—"
                      onBlur={(e) => { if (e.target.value !== (c.observacoes ?? '')) patch(c, { observacoes: e.target.value }) }}
                      className="w-56 border rounded px-2 py-1" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-gray-50 font-semibold">
                <td className="px-3 py-2" colSpan={4}>Totais ({linhas.length} linhas)</td>
                <td className="px-3 py-2 text-right">{eur(totComissao)}</td>
                <td className="px-3 py-2 text-right">{eur(totPago)}</td>
                <td className="px-3 py-2 text-xs text-gray-500" colSpan={2}>Por pagar: {eur(totComissao - totPago)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-center text-xs text-gray-400 mt-6 italic">Move beyond expectations.</p>
      </main>
    </div>
  )
}
