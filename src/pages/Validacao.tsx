import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import type { Comissao, Definicoes, Envio, Estado } from '../types'
import { eur, fmtDate, mrefLabel, platformUrl } from '../utils'
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
  const [revMsg, setRevMsg] = useState('')
  const [links, setLinks] = useState<Record<string, string>>({})
  const registado = useRef(false)

  async function carregar() {
    setLoading(true)
    const { data: e } = await supabase.from('envios').select('*').eq('token', token).maybeSingle()
    if (!e) { setErro('Link inválido ou expirado.'); setLoading(false); return }
    setEnvio(e as any)
    setBonus(Number((e as any).bonus || 0))
    setBonusNota((e as any).bonus_descricao || '')
    if (!registado.current) {
      registado.current = true
      supabase.from('envios').update({ aberto_em: (e as any).aberto_em || new Date().toISOString(), aberto_contagem: ((e as any).aberto_contagem || 0) + 1 }).eq('id', (e as any).id)
    }
    const [{ data: d }, { data: c }] = await Promise.all([
      supabase.from('definicoes').select('*').eq('id', 1).single(),
      supabase.from('comissoes').select('*, cliente:clientes(*), produto:produtos(*)').in('id', (e as any).comissao_ids),
    ])
    setDef(d as any)
    setLinhas((c as any) || [])
    const { data: lk } = await supabase.from('projeto_links').select('numero_projeto,data_id')
    setLinks(Object.fromEntries(((lk as any) || []).map((x: any) => [x.numero_projeto, x.data_id])))
    setLoading(false)
  }
  useEffect(() => { carregar() }, [token])

  async function patch(c: Comissao, p: Partial<Comissao>) {
    // atualização otimista (sem reload da página) — fluxo ágil
    setLinhas((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...p } : x)))
    try { await updateComissao(c, p, 'diretor') } catch (e: any) { alert('Erro: ' + e.message); carregar() }
  }

  async function guardarBonus(valor: number, nota: string) {
    if (!envio) return
    await supabase.from('envios').update({ bonus: valor, bonus_descricao: nota }).eq('id', envio.id)
  }

  function adicionarNota(c: Comissao, texto: string) {
    const t = texto.trim()
    if (!t) return
    const stamp = new Date().toLocaleDateString('pt-PT')
    const novo = (c.observacoes ? c.observacoes + '\n' : '') + `[${stamp}] ${t}`
    patch(c, { observacoes: novo })
  }

  async function enviarRevisto() {
    setRevMsg('A submeter…')
    try {
      const r = await fetch('/api/revisto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      const out = await r.json()
      setRevMsg(r.ok ? `✓ Revisto submetido ao Diogo (a pagar ${eur(out.aPagar)})` : `Erro: ${out.error}`)
    } catch (e: any) { setRevMsg('Erro: ' + e.message) }
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
          <img src="/host-white.png" alt="Host" className="h-7" />
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
                <tr key={c.id} className={`border-b last:border-0 hover:bg-gray-50 ${c.estado === 'paga' ? 'bg-green-50' : ''}`}>
                  <td className="px-2 py-1.5 truncate" title={c.numero_projeto}>
                    {links[c.numero_projeto]
                      ? <a href={platformUrl(links[c.numero_projeto])} target="_blank" rel="noreferrer" className="text-host-blue hover:underline">{c.numero_projeto}</a>
                      : c.numero_projeto}
                  </td>
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
                  <td className="px-2 py-1.5 align-top">
                    {c.observacoes && <div className="text-[11px] text-gray-600 whitespace-pre-wrap mb-1 max-h-20 overflow-auto">{c.observacoes}</div>}
                    <input placeholder="+ nota…"
                      onKeyDown={(e) => { if (e.key === 'Enter') { adicionarNota(c, (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = '' } }}
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
            <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t border-white/20">
              <span>A pagar — {envio && mrefLabel(envio.mes_referencia)}</span><span>{eur(totalAPagar)}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center gap-2">
          <button onClick={enviarRevisto} className="bg-green-600 text-white font-semibold rounded-lg px-6 py-3 hover:opacity-90">
            ✓ Revisto — submeter ao Diogo
          </button>
          {revMsg && <span className="text-sm text-gray-600">{revMsg}</span>}
          <span className="text-xs text-gray-400">Envia ao Diogo o ponto de situação e o total a pagar deste mês.</span>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6 italic">Move beyond expectations.</p>
      </main>
    </div>
  )
}
