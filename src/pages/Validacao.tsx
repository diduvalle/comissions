import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import type { Comissao, Definicoes, Envio, Estado } from '../types'
import { eur, fmtDate, mrefLabel, platformUrl } from '../utils'
import { updateComissao } from '../data'

const estadoCls: Record<Estado, string> = {
  pendente: 'bg-gray-100 text-gray-700',
  parcial: 'bg-orange-100 text-orange-700',
  paga: 'bg-green-100 text-green-700',
}

// valor que NÓS pagamos nesta linha (metade se for comissão partilhada 50/50)
function devido(c: Comissao): number {
  const com = Number(c.comissao_calculada || 0)
  return c.partilhada ? Math.round(com * 50) / 100 : com
}
function estadoAuto(c: Comissao, pago: number): Estado {
  const d = devido(c)
  if (pago > 0 && pago >= d - 0.005) return 'paga'
  if (pago > 0) return 'parcial'
  return 'pendente'
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
    const nums = [...new Set((((c as any) || []) as any[]).map((x) => String(x.numero_projeto)))]
    const { data: lk } = await supabase.from('projeto_links').select('numero_projeto,data_id').in('numero_projeto', nums.length ? nums : ['__none__'])
    setLinks(Object.fromEntries(((lk as any) || []).map((x: any) => [x.numero_projeto, x.data_id])))
    setLoading(false)
  }
  useEffect(() => { carregar() }, [token])

  async function patch(c: Comissao, p: Partial<Comissao>) {
    // atualização otimista (sem reload da página) — fluxo ágil
    setLinhas((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...p } : x)))
    try { await updateComissao(c, p, 'diretor') } catch (e: any) { alert('Erro: ' + e.message); carregar() }
  }

  function setPago(c: Comissao, v: number | null) {
    patch(c, { valor_pago: v, estado: estadoAuto(c, Number(v || 0)) })
  }

  function togglePisco(c: Comissao) {
    if (!c.partilhada) {
      const metade = Math.round(Number(c.comissao_calculada || 0) * 50) / 100
      patch(c, { partilhada: true, valor_pago: metade, estado: 'paga' })
    } else {
      // desativar partilha → volta a zero (comissão por pagar a 100%)
      patch(c, { partilhada: false, valor_pago: null, estado: 'pendente' })
    }
  }

  function pagarComissao(c: Comissao) {
    patch(c, { valor_pago: devido(c), estado: 'paga' })
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
    const temBonus = Number(bonus || 0) > 0
    // 🥚 easter egg — sem bónus, o Marco leva uma "cutucada" antes de submeter
    if (!temBonus) {
      const ok = window.confirm(
        '🤔 Marco… zero bónus para o Diogo este mês?\n\n' +
        'Ele andou a fechar negócios como uma máquina e nem um cafezinho? ☕😅\n' +
        'O Diogo MERECE e tu sabes disso.\n\n' +
        'De certeza que queres submeter as comissões assim, sem nenhum bónus?'
      )
      if (!ok) return
    }
    setRevMsg('A submeter…')
    try {
      const r = await fetch('/api/revisto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      const out = await r.json()
      if (!r.ok) { setRevMsg(`Erro: ${out.error}`); return }
      // 🥚 easter egg — com bónus, mensagem de agradecimento calorosa
      setRevMsg(temBonus
        ? `🎉 Boom! O Diogo vai abrir este email e sorrir de orelha a orelha. Obrigado por seres generoso e reconheceres o desempenho de alto nível dele — ${eur(bonus)} de bónus registados! 💙`
        : `✓ Revisto submetido ao Diogo — a pagar ${eur(out.aPagar)}. (Fica para o próximo o bónus, certo? 😉)`)
    } catch (e: any) { setRevMsg('Erro: ' + e.message) }
  }

  async function marcarTodasPagas() {
    for (const c of linhas) {
      if (c.estado !== 'paga') {
        await updateComissao(c, { estado: 'paga', valor_pago: devido(c) }, 'diretor')
      }
    }
    await carregar()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">A carregar…</div>
  if (erro) return <div className="min-h-screen flex items-center justify-center text-gray-600">{erro}</div>

  const totComissao = linhas.reduce((s, c) => s + Number(c.comissao_calculada || 0), 0)
  const totPago = linhas.reduce((s, c) => s + Number(c.valor_pago || 0), 0)
  const totalAPagar = totPago + Number(bonus || 0)
  const tratadas = linhas.filter((c) => c.estado === 'paga').length
  const falta = linhas.reduce((s, c) => s + Math.max(0, devido(c) - Number(c.valor_pago || 0)), 0)
  const progresso = linhas.length ? Math.round((tratadas / linhas.length) * 100) : 0

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

        {/* Barra de progresso */}
        <div className="bg-white rounded-xl border p-4 mb-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-semibold text-host-navy">{tratadas} de {linhas.length} pagas</span>
            <span className={falta > 0.005 ? 'text-orange-600 font-semibold' : 'text-green-700 font-semibold'}>
              {falta > 0.005 ? `Faltam ${eur(falta)}` : '✓ Tudo pago!'}
            </span>
          </div>
          <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${progresso === 100 ? 'bg-green-500' : 'bg-host-blue'}`} style={{ width: `${progresso}%` }} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button onClick={marcarTodasPagas} className="bg-green-600 text-white text-sm font-semibold rounded-lg px-4 py-2">Marcar todas como pagas</button>
          <span className="text-xs text-gray-500">Escreve o "valor pago" (ou usa <b>✓</b> para pagar a comissão toda) em cada linha — fica <b>verde/paga</b> quando ≥ comissão, ou <b>laranja/parcial</b> se for menos. Botão <b>½</b> = comissão partilhada (pagas metade).</span>
        </div>

        {/* ===== Telemóvel: cartões ===== */}
        <div className="md:hidden space-y-3">
          {linhas.map((c) => {
            const pend = devido(c) - Number(c.valor_pago || 0)
            return (
              <div key={c.id} className={`rounded-xl border p-3 ${c.estado === 'paga' ? 'bg-green-50 border-green-200' : c.estado === 'parcial' ? 'bg-orange-50 border-orange-200' : 'bg-white'}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="font-semibold">
                    {links[c.numero_projeto]
                      ? <a href={platformUrl(links[c.numero_projeto])} target="_blank" rel="noreferrer" className="text-host-blue underline">{c.numero_projeto}</a>
                      : c.numero_projeto}
                    <span className="text-gray-400 font-normal text-xs ml-2">{fmtDate(c.data_adjudicacao)}</span>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${estadoCls[c.estado]}`}>{c.estado}</span>
                </div>
                <div className="font-medium text-host-navy">{c.cliente?.nome}</div>
                <div className="text-sm text-gray-500 mb-2">{c.produto?.tipo} · {Number(c.percentagem)}% · venda {eur(c.valor_venda)}</div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span>Comissão <b>{eur(c.comissao_calculada)}</b>{c.partilhada && <span className="text-host-blue"> (50/50 → {eur(devido(c))})</span>}</span>
                  <button onClick={() => togglePisco(c)}
                    className={`text-xs font-bold rounded-md px-2 py-1 border ${c.partilhada ? 'bg-host-blue text-white border-host-blue' : 'bg-white text-gray-400 border-gray-300'}`}>
                    {c.partilhada ? '50/50' : '½ partilhar'}
                  </button>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-xs text-gray-500">Pago</label>
                  <input key={`${c.id}-${c.valor_pago ?? ''}`} type="number" step="0.01" defaultValue={c.valor_pago ?? ''} placeholder="—" inputMode="decimal"
                    onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (c.valor_pago ?? null)) setPago(c, v) }}
                    className="flex-1 text-right border rounded px-2 py-1.5" />
                  <button onClick={() => pagarComissao(c)} title="Pagar a comissão toda" className="bg-green-600 text-white text-sm font-semibold rounded px-3 py-1.5">✓ Pagar</button>
                </div>
                {pend > 0.005 && <div className="text-xs text-orange-600 mb-2">Pendente: {eur(pend)}</div>}
                {c.observacoes && <div className="text-[11px] text-gray-600 whitespace-pre-wrap mb-1">{c.observacoes}</div>}
                <input placeholder="+ nota…"
                  onKeyDown={(e) => { if (e.key === 'Enter') { adicionarNota(c, (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = '' } }}
                  className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
            )
          })}
        </div>

        {/* ===== Ecrã grande: tabela ===== */}
        <div className="hidden md:block bg-white rounded-xl border">
          <table className="w-full table-fixed text-[13px]">
            <colgroup>
              <col className="w-[6%]" /><col className="w-[7%]" /><col className="w-[12%]" /><col className="w-[11%]" />
              <col className="w-[8%]" /><col className="w-[9%]" /><col className="w-[7%]" /><col className="w-[9%]" /><col className="w-[8%]" /><col className="w-[9%]" /><col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="px-2 py-2 font-medium">Nº</th>
                <th className="px-2 py-2 font-medium">Data</th>
                <th className="px-2 py-2 font-medium">Cliente</th>
                <th className="px-2 py-2 font-medium">Produto</th>
                <th className="px-2 py-2 font-medium text-right">Valor</th>
                <th className="px-2 py-2 font-medium text-right">Comissão</th>
                <th className="px-2 py-2 font-medium text-center">Partilha</th>
                <th className="px-2 py-2 font-medium text-right">Valor pago</th>
                <th className="px-2 py-2 font-medium text-right">Pendente</th>
                <th className="px-2 py-2 font-medium">Estado</th>
                <th className="px-2 py-2 font-medium">Observações</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => (
                <tr key={c.id} className={`border-b last:border-0 hover:bg-gray-50 ${c.estado === 'paga' ? 'bg-green-50' : c.estado === 'parcial' ? 'bg-orange-50' : ''}`}>
                  <td className="px-2 py-1.5 truncate" title={c.numero_projeto}>
                    {links[c.numero_projeto]
                      ? <a href={platformUrl(links[c.numero_projeto])} target="_blank" rel="noreferrer" className="text-host-blue hover:underline">{c.numero_projeto}</a>
                      : c.numero_projeto}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(c.data_adjudicacao)}</td>
                  <td className="px-2 py-1.5 truncate" title={c.cliente?.nome}>{c.cliente?.nome}</td>
                  <td className="px-2 py-1.5 truncate" title={`${c.produto?.tipo} (${Number(c.percentagem)}%)`}>{c.produto?.tipo} <span className="text-gray-400">{Number(c.percentagem)}%</span></td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap" title={c.is_saas && c.valor_mensal_saas ? `${eur(c.valor_mensal_saas)}/mês × 12` : ''}>{eur(c.valor_venda)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">{eur(c.comissao_calculada)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <button onClick={() => togglePisco(c)}
                      title={c.partilhada ? 'Partilhada 50/50 — só pagas metade. Clica para desativar.' : 'Marcar como partilhada 50/50 (pagas só metade; a outra metade é de um colega)'}
                      className={`text-xs font-bold rounded-md px-2 py-1 border transition-colors ${c.partilhada ? 'bg-host-blue text-white border-host-blue shadow-sm' : 'bg-white text-gray-400 border-gray-300 hover:border-host-blue hover:text-host-blue'}`}>
                      {c.partilhada ? '50/50' : '½'}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <div className="flex items-center gap-1">
                      <input key={`${c.id}-${c.valor_pago ?? ''}`} type="number" step="0.01" defaultValue={c.valor_pago ?? ''} placeholder="—"
                        onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (c.valor_pago ?? null)) setPago(c, v) }}
                        className="w-full min-w-0 text-right border rounded px-1 py-1" />
                      <button onClick={() => pagarComissao(c)} title="Pagar a comissão toda (1 clique)"
                        className="shrink-0 text-green-600 hover:text-white hover:bg-green-600 border border-green-600 rounded px-1.5 py-1 text-xs font-bold transition-colors">✓</button>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right text-xs">
                    {devido(c) - Number(c.valor_pago || 0) > 0.005
                      ? <span className="text-orange-600 font-medium">{eur(devido(c) - Number(c.valor_pago || 0))}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={c.estado} onChange={(e) => patch(c, { estado: e.target.value as Estado })} className={`w-full rounded px-1 py-1 text-xs font-medium ${estadoCls[c.estado]}`}>
                      <option value="pendente">pendente</option>
                      <option value="parcial">parcial</option>
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
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs text-gray-400">Rápido:</span>
              {[50, 100].map((v) => (
                <button key={v} onClick={() => { const nv = Math.round((Number(bonus || 0) + v) * 100) / 100; setBonus(nv); guardarBonus(nv, bonusNota) }}
                  className="text-xs font-semibold rounded-md px-2 py-1 border border-host-blue text-host-blue hover:bg-host-blue hover:text-white transition-colors">+{v}€</button>
              ))}
              <button onClick={() => { const nv = Math.round(totComissao * 5) / 100; setBonus(nv); guardarBonus(nv, bonusNota) }}
                className="text-xs font-semibold rounded-md px-2 py-1 border border-host-blue text-host-blue hover:bg-host-blue hover:text-white transition-colors">5% do total</button>
              <button onClick={() => { setBonus(0); guardarBonus(0, bonusNota) }}
                className="text-xs rounded-md px-2 py-1 border border-gray-300 text-gray-500 hover:bg-gray-100">limpar</button>
            </div>
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
            <div className="flex justify-between text-sm text-white/70"><span>Marcado para pagar</span><span>{eur(totPago)}</span></div>
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
