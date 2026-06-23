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
  const [bonus, setBonus] = useState(0)
  const [bonusNota, setBonusNota] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  async function carregar() {
    setLoading(true)
    const { data: e } = await supabase.from('envios').select('*').eq('token', token).maybeSingle()
    if (!e) { setErro('Link inválido ou expirado.'); setLoading(false); return }
    setEnvio(e as any)
    setBonus(Number((e as any).bonus || 0))
    setBonusNota((e as any).bonus_descricao || '')
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

  async function guardarBonus(valor: number, nota: string) {
    if (!envio) return
    await supabase.from('envios').update({ bonus: valor, bonus_descricao: nota }).eq('id', envio.id)
  }

  async function marcarTodas(estado: Estado) {
    for (const c of linhas) {
      if (c.estado !== estado) {
        const extra = estado === 'paga' && c.valor_pago == null ? { valor_pago: c.comissao_calculada } : {}
        await updateComissao(c, { estado, ...extra }, 'diretor')
      }
    }
    await carregar()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">A carregar…</div>
  if (erro) return <div className="min-h-screen flex items-center justify-center text-gray-600">{erro}</div>

  const totComissao = linhas.reduce((s, c) => s + Number(c.comissao_calculada || 0), 0)
  const totPago = linhas.reduce((s, c) => s + Number(c.valor_pago || 0), 0)
  const totalAPagar = totComissao + Number(bonus || 0)

  return (
    <div className="min-h-screen bg-host-navy/5">
      <header className="bg-host-navy text-white">
        <div className="max-w-[1200px] mx-auto px-6 py-5 flex items-center gap-4">
          <img src="https://cdn.prod.website-files.com/69b142c7dd4ed4f68e7813f9/69b142c7dd4ed4f68e781635_Host_negative_RGB.png" alt="Host" className="h-7" />
          <div className="ml-auto flex items-center gap-3">
            <img src="/gestora.jpg" alt={def?.gestor_nome || 'gestora'} className="h-11 w-11 rounded-full object-cover border-2 border-white/30"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
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

        <div className="bg-white rounded-xl border">
          <table className="w-full table-fixed text-[13px]">
            <colgroup>
              <col className="w-[8%]" /><col className="w-[9%]" /><col className="w-[18%]" /><col className="w-[15%]" />
              <col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[10%]" /><col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="px-2 py-2 font-medium">Nº</th>
                <th className="px-2 py-2 font-medium">Data</th>
                <th className="px-2 py-2 font-medium">Cliente</th>
                <th className="px-2 py-2 font-medium">Produto</th>
                <th className="px-2 py-2 font-medium text-right">Comissão</th>
                <th className="px-2 py-2 font-medium text-right">Valor pago</th>
                <th className="px-2 py-2 font-medium">Estado</th>
                <th className="px-2 py-2 font-medium">Observações</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-2 py-1.5 truncate" title={c.numero_projeto}>{c.numero_projeto}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(c.data_adjudicacao)}</td>
                  <td className="px-2 py-1.5 truncate" title={c.cliente?.nome}>{c.cliente?.nome}</td>
                  <td className="px-2 py-1.5 truncate" title={c.produto?.tipo}>{c.produto?.tipo}</td>
                  <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">{eur(c.comissao_calculada)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <input type="number" step="0.01" defaultValue={c.valor_pago ?? ''} placeholder="—"
                      onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (c.valor_pago ?? null)) patch(c, { valor_pago: v }) }}
                      className="w-full text-right border rounded px-1 py-1" />
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={c.estado} onChange={(e) => patch(c, { estado: e.target.value as Estado })} className={`w-full rounded px-1 py-1 text-xs font-medium ${estadoCls[c.estado]}`}>
                      <option value="pendente">pendente</option>
                      <option value="validada">validada</option>
                      <option value="paga">paga</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input defaultValue={c.observacoes ?? ''} placeholder="—" title={c.observacoes ?? ''}
                      onBlur={(e) => { if (e.target.value !== (c.observacoes ?? '')) patch(c, { observacoes: e.target.value }) }}
                      className="w-full border rounded px-1 py-1" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Resumo + bónus */}
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <h3 className="font-semibold text-host-navy mb-3">Bónus (opcional)</h3>
            <div className="flex items-center gap-3">
              <div>
                <label className="text-xs text-gray-500 block">Valor do bónus</label>
                <input type="number" step="0.01" value={bonus} onChange={(e) => setBonus(Number(e.target.value))} onBlur={() => guardarBonus(bonus, bonusNota)}
                  className="w-32 text-right border rounded px-2 py-1.5" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 block">Descrição</label>
                <input value={bonusNota} onChange={(e) => setBonusNota(e.target.value)} onBlur={() => guardarBonus(bonus, bonusNota)} placeholder="ex.: objetivo trimestral"
                  className="w-full border rounded px-2 py-1.5" />
              </div>
            </div>
          </div>
          <div className="bg-host-navy text-white rounded-xl p-4 flex flex-col justify-center">
            <div className="flex justify-between text-sm text-white/70"><span>Total comissões ({linhas.length})</span><span>{eur(totComissao)}</span></div>
            <div className="flex justify-between text-sm text-white/70"><span>Bónus</span><span>{eur(bonus)}</span></div>
            <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t border-white/20"><span>Total a pagar</span><span>{eur(totalAPagar)}</span></div>
            <div className="flex justify-between text-xs text-white/50 mt-1"><span>Já pago</span><span>{eur(totPago)}</span></div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6 italic">Move beyond expectations.</p>
      </main>
    </div>
  )
}
