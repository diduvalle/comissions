// Negócios: todos os projetos com comissão registada, agrupados por nº de projeto.
// É aqui que se marcam as vendas canceladas (nunca se apagam): deixam de contar como vendas
// e de transitar; a comissão já paga fica como histórico. Tudo pode ser reativado.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import type { Comissao } from '../types'
import { fmtDate, platformUrl } from '../utils'
import { updateComissao } from '../data'
import { metricas, eur0 as eur } from '../vendas'

type Negocio = {
  nr: string
  cliente: string
  data: string
  linhas: Comissao[]
  ativas: Comissao[]
  canceladas: Comissao[]
  estado: 'ativo' | 'cancelado' | 'parcial'
  vendido: ReturnType<typeof metricas>
  comissao: number
  pago: number
}

const hoje = () => new Date().toISOString().slice(0, 10)

export default function Negocios() {
  const [comissoes, setComissoes] = useState<Comissao[]>([])
  const [links, setLinks] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [ano, setAno] = useState('')
  const [fEstado, setFEstado] = useState<'' | 'ativo' | 'cancelado'>('')
  const [modal, setModal] = useState<{ tipo: 'cancelar' | 'reativar'; n: Negocio } | null>(null)
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [dataCanc, setDataCanc] = useState(hoje())
  const [motivo, setMotivo] = useState('')
  const [aGravar, setAGravar] = useState(false)
  const [msg, setMsg] = useState('')

  async function carregar() {
    const [{ data: c }, { data: lk }] = await Promise.all([
      supabase.from('comissoes').select('*, cliente:clientes(nome), produto:produtos(tipo)').order('data_adjudicacao', { ascending: false }),
      supabase.from('projeto_links').select('numero_projeto,data_id'),
    ])
    setComissoes((c as any) || [])
    setLinks(Object.fromEntries(((lk as any) || []).map((x: any) => [x.numero_projeto, x.data_id])))
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  // sem o SQL corrido, as linhas não trazem o campo "cancelada"
  const falta_sql = comissoes.length > 0 && !('cancelada' in comissoes[0])

  const negocios = useMemo<Negocio[]>(() => {
    const g: Record<string, Comissao[]> = {}
    for (const c of comissoes) (g[String(c.numero_projeto)] ||= []).push(c)
    return Object.entries(g).map(([nr, linhas]) => {
      const ativas = linhas.filter((c) => !c.cancelada)
      const canceladas = linhas.filter((c) => c.cancelada)
      return {
        nr,
        cliente: linhas[0].cliente?.nome || '-',
        data: linhas.map((c) => c.data_adjudicacao).filter(Boolean).sort()[0] || '',
        linhas, ativas, canceladas,
        estado: canceladas.length === 0 ? 'ativo' : ativas.length === 0 ? 'cancelado' : 'parcial',
        vendido: metricas(ativas),
        // comissão de uma linha cancelada = o que já foi pago; o resto deixou de ser devido
        comissao: linhas.reduce((s, c) => s + (c.cancelada ? Number(c.valor_pago || 0) : Number(c.comissao_calculada || 0)), 0),
        pago: linhas.reduce((s, c) => s + Number(c.valor_pago || 0), 0),
      } as Negocio
    }).sort((a, b) => (b.data || '').localeCompare(a.data || '') || Number(b.nr) - Number(a.nr))
  }, [comissoes])

  const anos = useMemo(() => [...new Set(negocios.map((n) => n.data.slice(0, 4)).filter(Boolean))].sort().reverse(), [negocios])
  const termo = q.trim().toLowerCase()
  const visiveis = negocios.filter((n) => {
    if (ano && !n.data.startsWith(ano)) return false
    if (fEstado === 'ativo' && n.estado === 'cancelado') return false
    if (fEstado === 'cancelado' && n.estado === 'ativo') return false
    if (termo && !n.nr.toLowerCase().includes(termo) && !n.cliente.toLowerCase().includes(termo)) return false
    return true
  })
  const totVendido = visiveis.reduce((s, n) => s + n.vendido.total, 0)
  const comCanc = visiveis.filter((n) => n.canceladas.length)
  const totCancelado = comCanc.reduce((s, n) => s + metricas(n.canceladas).total, 0)

  function abrir(tipo: 'cancelar' | 'reativar', n: Negocio) {
    const alvo = tipo === 'cancelar' ? n.ativas : n.canceladas
    setSel(Object.fromEntries(alvo.map((c) => [c.id, true]))) // por omissão, o projeto inteiro
    setDataCanc(hoje()); setMotivo(''); setMsg('')
    setModal({ tipo, n })
  }

  async function confirmar() {
    if (!modal) return
    const alvo = (modal.tipo === 'cancelar' ? modal.n.ativas : modal.n.canceladas).filter((c) => sel[c.id])
    if (!alvo.length) { setMsg('Escolhe pelo menos uma linha.'); return }
    if (modal.tipo === 'cancelar' && !dataCanc) { setMsg('Indica a data do cancelamento.'); return }
    setAGravar(true)
    try {
      for (const c of alvo) {
        const patch = modal.tipo === 'cancelar'
          ? { cancelada: true, cancelada_em: dataCanc, motivo_cancelamento: motivo.trim() || null }
          : { cancelada: false, cancelada_em: null, motivo_cancelamento: null }
        await updateComissao(c, patch as any, 'gestor') // fica no histórico da linha
      }
      setModal(null)
      await carregar()
    } catch (e: any) {
      setMsg('Erro: ' + e.message + (/cancelad/.test(e.message) ? ' (corre primeiro o SQL criar-cancelamentos.sql)' : ''))
    } finally { setAGravar(false) }
  }

  if (loading) return <div className="text-gray-500">A carregar…</div>

  const badge = (e: Negocio['estado']) => ({
    ativo: <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-green-100 text-green-700">ativo</span>,
    cancelado: <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-gray-200 text-gray-600">cancelado</span>,
    parcial: <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">parcialmente cancelado</span>,
  })[e]

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-host-navy">Negócios</h1>
          <p className="text-sm text-gray-500">Todos os projetos com comissão registada. Marca aqui os que foram cancelados: deixam de contar como venda e a comissão por pagar deixa de ser devida.</p>
        </div>
      </div>

      {falta_sql && (
        <div className="mb-4 p-3 rounded-lg border border-orange-300 bg-orange-50 text-sm text-orange-800">
          ⚠ Para registar cancelamentos, corre primeiro o SQL <b>criar-cancelamentos.sql</b> no Supabase.
        </div>
      )}

      {/* filtros numa linha, por cima da tabela */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cliente ou nº…" className="px-3 py-2 rounded-lg border bg-white text-sm w-52" />
        <select value={ano} onChange={(e) => setAno(e.target.value)} className="px-3 py-2 rounded-lg border bg-white text-sm">
          <option value="">Todos os anos</option>
          {anos.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value as any)} className="px-3 py-2 rounded-lg border bg-white text-sm">
          <option value="">Todos</option>
          <option value="ativo">Ativos</option>
          <option value="cancelado">Com cancelamentos</option>
        </select>
        <div className="ml-auto flex items-center gap-4 text-sm text-gray-600">
          <span><b className="text-host-navy">{visiveis.length}</b> negócios</span>
          <span>vendido <b className="text-host-navy">{eur(totVendido)}</b></span>
          {comCanc.length > 0 && <span>⊘ {comCanc.length} com cancelamentos (<b>{eur(totCancelado)}</b>)</span>}
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="px-3 py-2 font-medium">Nº</th>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Produtos</th>
              <th className="px-3 py-2 font-medium text-right">Valor vendido</th>
              <th className="px-3 py-2 font-medium text-right">MRR</th>
              <th className="px-3 py-2 font-medium text-right">Comissão</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((n) => (
              <tr key={n.nr} className={`border-b last:border-0 hover:bg-gray-50 ${n.estado === 'cancelado' ? 'text-gray-400' : ''}`}>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {links[n.nr] ? <a href={platformUrl(links[n.nr])} target="_blank" rel="noreferrer" className="text-host-blue hover:underline">{n.nr}</a> : n.nr}
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtDate(n.data)}</td>
                <td className="px-3 py-2 max-w-[220px] truncate" title={n.cliente}>{n.cliente}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {n.linhas.map((c) => (
                      <span key={c.id} title={c.cancelada ? `Cancelada em ${fmtDate(c.cancelada_em || '')}${c.motivo_cancelamento ? ' - ' + c.motivo_cancelamento : ''}` : `${eur(Number(c.valor_venda))}`}
                        className={`text-[11px] rounded px-1.5 py-0.5 ${c.cancelada ? 'bg-gray-100 text-gray-400 line-through' : 'bg-blue-50 text-host-navy'}`}>
                        {c.produto?.tipo}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums font-semibold">{n.ativas.length ? eur(n.vendido.total) : '-'}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{n.vendido.mrr > 0 ? `${eur(n.vendido.mrr)}/mês` : '-'}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums" title={`Pago: ${eur(n.pago)}`}>
                  {eur(n.comissao)}{n.pago > 0 && n.pago < n.comissao - 0.005 && <span className="block text-[10px] text-gray-400">pago {eur(n.pago)}</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {badge(n.estado)}
                  {n.canceladas.length > 0 && n.canceladas[0].motivo_cancelamento && (
                    <span className="block text-[10px] text-gray-400 max-w-[160px] truncate" title={n.canceladas[0].motivo_cancelamento || ''}>{n.canceladas[0].motivo_cancelamento}</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-right">
                  {n.ativas.length > 0 && (
                    <button onClick={() => abrir('cancelar', n)} disabled={falta_sql}
                      className="text-xs font-semibold rounded-md border border-gray-300 text-gray-600 px-2 py-1 hover:border-red-400 hover:text-red-600 disabled:opacity-40">⊘ Cancelar…</button>
                  )}
                  {n.canceladas.length > 0 && (
                    <button onClick={() => abrir('reativar', n)}
                      className="ml-1 text-xs font-semibold rounded-md border border-gray-300 text-gray-600 px-2 py-1 hover:border-host-blue hover:text-host-blue">↺ Reativar…</button>
                  )}
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">Nenhum negócio com estes filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Janela: registar cancelamento / reativar */}
      {modal && (() => {
        const alvo = modal.tipo === 'cancelar' ? modal.n.ativas : modal.n.canceladas
        const escolhidas = alvo.filter((c) => sel[c.id])
        const pagoEscolhidas = escolhidas.reduce((s, c) => s + Number(c.valor_pago || 0), 0)
        const porPagar = escolhidas.reduce((s, c) => s + Math.max(0, Number(c.comissao_calculada || 0) - Number(c.valor_pago || 0)), 0)
        return (
          <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 px-4 py-[6vh] overflow-y-auto" onClick={() => !aGravar && setModal(null)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 my-auto" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-host-navy mb-1">
                {modal.tipo === 'cancelar' ? 'Registar cancelamento' : 'Reativar'} - {modal.n.nr}
              </h3>
              <p className="text-sm text-gray-500 mb-4">{modal.n.cliente}</p>

              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {modal.tipo === 'cancelar' ? 'Que linhas foram canceladas?' : 'Que linhas voltam a estar ativas?'}
              </div>
              <div className="space-y-1.5 mb-4">
                {alvo.map((c) => (
                  <label key={c.id} className="flex items-center gap-3 border rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={!!sel[c.id]} onChange={(e) => setSel((s) => ({ ...s, [c.id]: e.target.checked }))} />
                    <span className="flex-1 min-w-0">
                      <span className="font-medium text-host-navy">{c.produto?.tipo}</span>
                      <span className="text-gray-500 text-xs"> · {fmtDate(c.data_adjudicacao)} · {c.is_saas ? `${eur(Number(c.valor_mensal_saas || 0))}/mês` : eur(Number(c.valor_venda))}</span>
                    </span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      comissão {eur(Number(c.comissao_calculada || 0))}{Number(c.valor_pago || 0) > 0 ? ` · pago ${eur(Number(c.valor_pago))}` : ''}
                    </span>
                  </label>
                ))}
              </div>

              {modal.tipo === 'cancelar' && (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                    <label>Data do cancelamento
                      <input type="date" value={dataCanc} onChange={(e) => setDataCanc(e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" />
                    </label>
                    <label>Motivo <span className="text-gray-400">(opcional)</span>
                      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: cliente desistiu" className="mt-1 w-full border rounded px-2 py-1.5" />
                    </label>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
                    <div>• Estas linhas <b>deixam de contar como vendas</b> nos relatórios e aparecem à parte como canceladas.</div>
                    {porPagar > 0.005 && <div>• A comissão ainda por pagar (<b>{eur(porPagar)}</b>) <b>deixa de ser devida</b> e sai dos próximos mapas.</div>}
                    {pagoEscolhidas > 0.005 && <div>• O que já foi pago (<b>{eur(pagoEscolhidas)}</b>) fica como histórico.</div>}
                    <div>• Fica registado no histórico de cada linha e pode ser reativado.</div>
                  </div>
                </>
              )}
              {modal.tipo === 'reativar' && (
                <p className="text-xs text-gray-600 rounded-lg bg-gray-50 p-3">As linhas voltam a contar como vendas e, se ainda tiverem comissão por pagar, voltam a transitar para o mapa.</p>
              )}

              {msg && <div className="text-xs text-red-600 mt-3">{msg}</div>}

              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setModal(null)} disabled={aGravar} className="px-4 py-2 rounded-lg border text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">Voltar</button>
                <button onClick={confirmar} disabled={aGravar || escolhidas.length === 0}
                  className={`px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 ${modal.tipo === 'cancelar' ? 'bg-red-600 hover:bg-red-700' : 'bg-host-blue hover:bg-host-bluedark'}`}>
                  {aGravar ? 'A gravar…' : modal.tipo === 'cancelar' ? `Registar cancelamento (${escolhidas.length})` : `Reativar (${escolhidas.length})`}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
