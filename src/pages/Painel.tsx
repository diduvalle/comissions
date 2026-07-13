import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import type { Comissao, Produto, Cliente, Estado } from '../types'
import { eur, fmtDate, mrefLabel, sortMrefsDesc, parseMref, dateToMref, platformUrl, nextMref } from '../utils'
import { updateComissao, getOrCreateCliente } from '../data'
import { IconClock, IconDownload, IconLock, IconSearch, IconWarn, IconEdit, IconTrash, IconCheck } from '../components/icons'

const ESTADOS: Estado[] = ['pendente', 'parcial', 'paga']
const estadoCls: Record<Estado, string> = {
  pendente: 'bg-gray-100 text-gray-700',
  parcial: 'bg-orange-100 text-orange-700',
  paga: 'bg-green-100 text-green-700',
}

function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Painel() {
  const [comissoes, setComissoes] = useState<Comissao[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [sel, setSel] = useState<string>('')
  const [aberto, setAberto] = useState(false)
  const [loading, setLoading] = useState(true)
  const [link, setLink] = useState('')
  const [tok, setTok] = useState('')
  const [envMsg, setEnvMsg] = useState('')
  const [editar, setEditar] = useState<Comissao | null>(null)
  const [hist, setHist] = useState<Comissao | null>(null)
  const [copiadoP, setCopiadoP] = useState(false)
  const [q, setQ] = useState('')
  const [fEstado, setFEstado] = useState<'' | Estado>('')
  const [links, setLinks] = useState<Record<string, string>>({})
  const [def, setDef] = useState<{ gestor_nome?: string; diretor_email?: string } | null>(null)
  const [fechados, setFechados] = useState<string[]>([])

  async function carregar() {
    setLoading(true)
    const { data: c } = await supabase.from('comissoes').select('*, cliente:clientes(*), produto:produtos(*)').order('data_adjudicacao')
    const nums = [...new Set((((c as any) || []) as any[]).map((x) => String(x.numero_projeto)))]
    const [{ data: p }, { data: cl }, { data: lk }, { data: d }, { data: ev }] = await Promise.all([
      supabase.from('produtos').select('*').order('ordem'),
      supabase.from('clientes').select('*').order('nome'),
      supabase.from('projeto_links').select('numero_projeto,data_id').in('numero_projeto', nums.length ? nums : ['__none__']),
      supabase.from('definicoes').select('gestor_nome,diretor_email').eq('id', 1).single(),
      supabase.from('envios').select('mes_referencia,estado'),
    ])
    setComissoes((c as any) || [])
    setProdutos((p as any) || [])
    setClientes((cl as any) || [])
    setLinks(Object.fromEntries(((lk as any) || []).map((x: any) => [x.numero_projeto, x.data_id])))
    setDef((d as any) || null)
    setFechados([...new Set(((ev as any) || []).filter((e: any) => e.estado === 'concluido').map((e: any) => e.mes_referencia))] as string[])
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  // meses dos dados + o mês SEGUINTE a cada mês concluído pelo diretor (novo ciclo aberto)
  const meses = useMemo(
    () => sortMrefsDesc([...comissoes.map((c) => c.mes_referencia), ...fechados.map(nextMref)]),
    [comissoes, fechados],
  )
  const selFechado = fechados.includes(sel)
  useEffect(() => { if (!sel && meses.length) setSel(meses[0]) }, [meses, sel])

  // agrupar meses por ano para o seletor
  const porAno = useMemo(() => {
    const m: Record<number, string[]> = {}
    for (const mr of meses) { const y = parseMref(mr).year; (m[y] ||= []).push(mr) }
    return m
  }, [meses])
  const anos = Object.keys(porAno).map(Number).sort((a, b) => b - a)

  const idx = meses.indexOf(sel)
  const irAnterior = () => { if (idx < meses.length - 1) { setSel(meses[idx + 1]); setLink('') } }
  const irSeguinte = () => { if (idx > 0) { setSel(meses[idx - 1]); setLink('') } }

  const selOrder = sel ? parseMref(sel).order : 0
  // "aberta" = por pagar E não finalizada (finalizada = fechada manualmente, não transita)
  const emAberto = (c: Comissao) => c.estado !== 'paga' && !c.finalizada
  const proprias = comissoes.filter((c) => c.mes_referencia === sel)
  const transitadas = comissoes.filter((c) => emAberto(c) && parseMref(c.mes_referencia).order < selOrder)
  const visiveis = aberto
    ? comissoes.filter((c) => emAberto(c))
    : [...transitadas, ...proprias]

  const totComissao = visiveis.reduce((s, c) => s + Number(c.comissao_calculada || 0), 0)
  const totPago = visiveis.reduce((s, c) => s + Number(c.valor_pago || 0), 0)
  const porPagar = visiveis.filter((c) => emAberto(c)).reduce((s, c) => s + Number(c.comissao_calculada || 0), 0)

  // pesquisa + filtro (só afeta as linhas mostradas; totais e envio usam o mês completo)
  const termo = q.trim().toLowerCase()
  const visiveisF = visiveis.filter((c) => {
    if (fEstado && c.estado !== fEstado) return false
    if (!termo) return true
    return String(c.numero_projeto).toLowerCase().includes(termo) || (c.cliente?.nome || '').toLowerCase().includes(termo)
  })
  const aFiltrar = termo !== '' || fEstado !== ''

  async function patch(c: Comissao, p: Partial<Comissao>) {
    await updateComissao(c, p, 'gestor')
    await carregar()
  }

  async function deleteLinha(c: Comissao) {
    if (!confirm(`Apagar a linha ${c.numero_projeto} — ${c.cliente?.nome}?\nEsta ação não pode ser anulada.`)) return
    const { error } = await supabase.from('comissoes').delete().eq('id', c.id)
    if (error) { alert('Erro: ' + error.message); return }
    await carregar()
  }

  async function definirLink(c: Comissao) {
    const atual = links[c.numero_projeto] ? platformUrl(links[c.numero_projeto]) : ''
    const url = window.prompt(`Cola o link da plataforma para o projeto ${c.numero_projeto}:`, atual)
    if (url == null) return
    if (url.trim() === '') { // limpar
      await supabase.from('projeto_links').delete().eq('numero_projeto', c.numero_projeto)
      setLinks((prev) => { const n = { ...prev }; delete n[c.numero_projeto]; return n })
      return
    }
    const m = url.match(/data=(\d+)/)
    if (!m) { alert('Link inválido — tem de conter "data=…".'); return }
    const { error } = await supabase.from('projeto_links').upsert({ numero_projeto: c.numero_projeto, data_id: m[1] }, { onConflict: 'numero_projeto' })
    if (error) { alert('Erro: ' + error.message); return }
    setLinks((prev) => ({ ...prev, [c.numero_projeto]: m[1] }))
  }

  async function toggleFinalizada(c: Comissao) {
    await patch(c, { finalizada: !c.finalizada } as any)
  }

  async function gerarLink() {
    const ids = visiveis.filter((c) => emAberto(c)).map((c) => c.id)
    const { data, error } = await supabase
      .from('envios').insert({ mes_referencia: sel, comissao_ids: ids, total_comissoes: totComissao, enviado_por: def?.gestor_nome || 'Diogo Vale', enviado_para: def?.diretor_email || 'marco.arroz@hostpms.com' })
      .select('token').single()
    if (error) { alert('Erro: ' + error.message); return }
    setTok(data.token)
    setEnvMsg('')
    setLink(`${window.location.origin}/validacao/${data.token}`)
  }

  async function enviarEmail() {
    setEnvMsg('A enviar…')
    try {
      const r = await fetch('/api/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok }) })
      const out = await r.json()
      setEnvMsg(r.ok ? `✓ Email enviado para ${out.to}${out.cc ? ` (CC só-leitura: ${out.cc})` : ''}` : `Erro: ${out.error}`)
    } catch (e: any) { setEnvMsg('Erro: ' + e.message) }
  }

  if (loading) return <div className="text-gray-500">A carregar…</div>

  return (
    <div>
      <div className="sticky top-16 z-30 bg-[#f5f7fb] -mx-6 px-6 pt-3 pb-3 border-b border-gray-200">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-host-navy">Painel de comissões</h1>
          {!aberto && selFechado && <span title="O diretor já reviu e concluiu este mês" className="inline-flex items-center gap-1 text-xs font-semibold rounded-full bg-green-100 text-green-700 px-2 py-1"><IconLock className="w-3 h-3" /> concluído pelo diretor</span>}
        </div>
        {!aberto && (
          <button onClick={gerarLink} className="bg-host-blue text-white text-sm font-semibold rounded-lg px-5 py-2 shadow-glow hover:bg-host-bluedark hover:-translate-y-0.5 transition-all">
            {selFechado ? 'Reenviar' : 'Enviar'}
          </button>
        )}
      </div>

      {/* Navegação compacta */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setAberto((v) => !v)}
          className={`px-3 py-2 rounded-lg text-sm font-semibold border ${aberto ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'}`}>
          {aberto ? '← Voltar aos meses' : <span className="inline-flex items-center gap-1"><IconWarn className="w-4 h-4" /> Em aberto (por pagar)</span>}
        </button>
        {!aberto && (
          <div className="flex items-center gap-1">
            <button onClick={irAnterior} disabled={idx >= meses.length - 1} className="px-2 py-2 rounded-lg border bg-white disabled:opacity-30">◀</button>
            <select value={sel} onChange={(e) => { setSel(e.target.value); setLink('') }}
              className="px-3 py-2 rounded-lg border bg-white text-sm font-semibold text-host-navy min-w-[180px]">
              {anos.map((y) => (
                <optgroup key={y} label={String(y)}>
                  {porAno[y].map((m) => <option key={m} value={m}>{mrefLabel(m)}</option>)}
                </optgroup>
              ))}
            </select>
            <button onClick={irSeguinte} disabled={idx <= 0} className="px-2 py-2 rounded-lg border bg-white disabled:opacity-30">▶</button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="relative">
            <IconSearch className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cliente ou nº…"
              className="pl-7 pr-3 py-2 rounded-lg border bg-white text-sm w-44" />
          </div>
          <select value={fEstado} onChange={(e) => setFEstado(e.target.value as any)}
            className="px-2 py-2 rounded-lg border bg-white text-sm">
            <option value="">Todos</option>
            <option value="pendente">pendente</option>
            <option value="parcial">parcial</option>
            <option value="paga">paga</option>
          </select>
          {aFiltrar && <button onClick={() => { setQ(''); setFEstado('') }} title="Limpar filtros" className="text-gray-400 hover:text-host-blue text-sm px-1">✕</button>}
        </div>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="text-gray-500">Comissão <b className="text-host-navy">{eur(totComissao)}</b></span>
          <span className="text-gray-500">Pago <b className="text-green-700">{eur(totPago)}</b></span>
          <span className="text-gray-500">Por pagar <b className="text-amber-600">{eur(porPagar)}</b></span>
        </div>
      </div>

      {!aberto && proprias.length === 0 && transitadas.length > 0 && (
        <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          ↪ <b>Novo ciclo de {mrefLabel(sel)}.</b> {transitadas.length} comissão(ões) transitada(s) de meses anteriores, por pagar. Adiciona novas vendas em baixo, se as houver.
        </div>
      )}
      {link && (
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm flex items-center gap-3">
          <span className="font-medium text-host-navy">Link para o Marco:</span>
          <input readOnly value={link} className="flex-1 bg-white border rounded px-2 py-1 text-xs" onFocus={(e) => e.target.select()} />
          <button onClick={() => { navigator.clipboard.writeText(link); setCopiadoP(true); setTimeout(() => setCopiadoP(false), 2000) }} className="text-host-blue font-semibold">{copiadoP ? '✓ Copiado!' : 'Copiar'}</button>
          <button onClick={enviarEmail} className="bg-host-blue text-white font-semibold rounded px-3 py-1.5">Enviar email ao Marco</button>
          {envMsg && <span className="text-xs text-gray-600">{envMsg}</span>}
        </div>
      )}
      </div>

      <div className="bg-white rounded-xl border mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] table-fixed text-[13px]">
          <colgroup>
            <col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[16%]" /><col className="w-[15%]" />
            <col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="px-2 py-2 font-medium">Nº</th>
              <th className="px-2 py-2 font-medium">Data</th>
              <th className="px-2 py-2 font-medium">Cliente</th>
              <th className="px-2 py-2 font-medium">Produto</th>
              <th className="px-2 py-2 font-medium text-right">Valor</th>
              <th className="px-2 py-2 font-medium text-right">Comissão</th>
              <th className="px-2 py-2 font-medium text-right">Pago</th>
              <th className="px-2 py-2 font-medium">Estado</th>
              <th className="px-2 py-2 font-medium">Obs.</th>
            </tr>
          </thead>
          <tbody>
            {visiveisF.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">{aFiltrar ? 'Nada encontrado com esse filtro.' : 'Sem comissões. Adiciona uma linha em baixo.'}</td></tr>
            )}
            {visiveisF.map((c) => {
              const trans = c.mes_referencia !== sel || aberto
              return (
                <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-2 py-1.5 truncate" title="Duplo-clique para definir/editar o link da plataforma" onDoubleClick={() => definirLink(c)}>
                    {links[c.numero_projeto]
                      ? <a href={platformUrl(links[c.numero_projeto])} target="_blank" rel="noreferrer" className="text-host-blue hover:underline">{c.numero_projeto}</a>
                      : <span className="border-b border-dashed border-gray-300 cursor-pointer">{c.numero_projeto}</span>}
                    {trans && <span className="ml-1 text-[9px] uppercase bg-amber-100 text-amber-700 px-1 py-0.5 rounded" title={`transitada de ${mrefLabel(c.mes_referencia)}`}>↪{parseMref(c.mes_referencia).year % 100}</span>}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(c.data_adjudicacao)}</td>
                  <td className="px-2 py-1.5 truncate" title={c.cliente?.nome}>{c.cliente?.nome}</td>
                  <td className="px-2 py-1.5 truncate" title={`${c.produto?.tipo} (${Number(c.percentagem)}%)`}>
                    {c.produto?.tipo} <span className="text-gray-400">{Number(c.percentagem)}%</span>
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">{eur(c.valor_venda)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">{eur(c.comissao_calculada)}</td>
                  <td className="px-2 py-1.5 text-right text-gray-500" title="Preenchido pelo diretor">
                    {c.valor_pago != null ? eur(c.valor_pago) : '—'}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`inline-block w-full text-center rounded px-1 py-1 text-xs font-medium ${c.finalizada ? 'bg-gray-100 text-gray-400 line-through' : estadoCls[c.estado]}`}>{c.estado}</span>
                    {c.finalizada && <span className="block text-center text-[10px] text-gray-400 mt-0.5">fechada</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <input defaultValue={c.observacoes ?? ''} placeholder="—" title={c.observacoes ?? ''}
                        onBlur={(e) => { if (e.target.value !== (c.observacoes ?? '')) patch(c, { observacoes: e.target.value }) }}
                        className="flex-1 min-w-0 border rounded px-1 py-1" />
                      {c.estado !== 'paga' && (
                        <button onClick={() => toggleFinalizada(c)} title={c.finalizada ? 'Reabrir — volta a transitar' : 'Finalizar — não transita (não se paga a diferença)'}
                          className={`px-1 shrink-0 ${c.finalizada ? 'text-host-blue' : 'text-gray-300 hover:text-host-blue'}`}><IconCheck className="w-4 h-4" /></button>
                      )}
                      <button onClick={() => setHist(c)} title="Ver alterações" className="text-gray-400 hover:text-host-blue px-1 shrink-0"><IconClock className="w-4 h-4" /></button>
                      <button onClick={() => setEditar(c)} title="Editar linha" className="text-gray-400 hover:text-host-blue px-1 shrink-0"><IconEdit className="w-4 h-4" /></button>
                      <button onClick={() => deleteLinha(c)} title="Apagar linha" className="text-gray-400 hover:text-red-600 px-1 shrink-0"><IconTrash className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {!aberto && (
            <tfoot>
              <NovaLinha produtos={produtos} clientes={clientes} mes={sel} onAdd={carregar} />
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">{aFiltrar ? `${visiveisF.length} de ${visiveis.length} linhas` : `${visiveis.length} linhas`}{!aberto && transitadas.length > 0 ? ` · ${transitadas.length} transitadas de meses anteriores` : ''}</p>

      {editar && <EditarLinha comissao={editar} produtos={produtos} clientes={clientes} onClose={() => setEditar(null)} onSaved={carregar} />}
      {hist && <HistoricoLinha comissao={hist} onClose={() => setHist(null)} />}
    </div>
  )
}

const CAMPO_LABEL: Record<string, string> = {
  valor_pago: 'Valor pago', comissao_calculada: 'Comissão', percentagem: 'Percentagem',
  estado: 'Estado', observacoes: 'Observações', valor_venda: 'Valor da venda',
}

function HistoricoLinha({ comissao, onClose }: { comissao: Comissao; onClose: () => void }) {
  const [linhas, setLinhas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('historico').select('*').eq('comissao_id', comissao.id).order('criado_em', { ascending: false })
      setLinhas((data as any) || [])
      setLoading(false)
    })()
  }, [comissao.id])

  const fmt = (iso: string) => new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const val = (s: string | null) => (s == null || s === '' ? '—' : s)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-5 max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-host-navy mb-1">Histórico de alterações</h3>
        <p className="text-sm text-gray-500 mb-4">{comissao.numero_projeto} — {comissao.cliente?.nome}</p>
        {loading ? <p className="text-gray-400">A carregar…</p>
          : linhas.length === 0 ? <p className="text-gray-400 text-sm">Sem alterações registadas.</p>
          : (
            <div className="space-y-2">
              {linhas.map((l) => (
                <div key={l.id} className="text-sm border-b pb-2 last:border-0">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{fmt(l.criado_em)}</span>
                    <span className={`font-medium ${l.alterado_por === 'diretor' ? 'text-host-blue' : 'text-gray-500'}`}>{l.alterado_por}</span>
                  </div>
                  <div>
                    <b>{CAMPO_LABEL[l.campo_alterado] || l.campo_alterado}:</b>{' '}
                    <span className="text-gray-400 line-through">{val(l.valor_antigo)}</span>{' → '}
                    <span className="text-host-navy font-medium">{val(l.valor_novo)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Fechar</button>
        </div>
      </div>
    </div>
  )
}

function EditarLinha({ comissao, produtos, clientes, onClose, onSaved }: { comissao: Comissao; produtos: Produto[]; clientes: Cliente[]; onClose: () => void; onSaved: () => void }) {
  const [nro, setNro] = useState(comissao.numero_projeto)
  const [data, setData] = useState(comissao.data_adjudicacao)
  const [cliente, setCliente] = useState(comissao.cliente?.nome || '')
  const [prodId, setProdId] = useState(comissao.produto_id)
  const [isSaas, setIsSaas] = useState(comissao.is_saas)
  const [mensal, setMensal] = useState(comissao.valor_mensal_saas ? String(comissao.valor_mensal_saas) : '')
  const [valor, setValor] = useState(!comissao.is_saas ? String(comissao.valor_venda) : '')
  const [pctv, setPctv] = useState(Number(comissao.percentagem))
  const [estado, setEstado] = useState<Estado>(comissao.estado)
  const [obs, setObs] = useState(comissao.observacoes || '')
  const [linkUrl, setLinkUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const valorVenda = isSaas ? Number(mensal || 0) * 12 : Number(valor || 0)
  const com = Math.round(valorVenda * pctv) / 100

  async function guardar() {
    setBusy(true)
    try {
      const cliente_id = await getOrCreateCliente(cliente)
      await updateComissao(comissao, {
        numero_projeto: nro, data_adjudicacao: data, cliente_id, produto_id: prodId,
        valor_venda: valorVenda, percentagem: pctv, comissao_calculada: com,
        is_saas: isSaas, valor_mensal_saas: isSaas ? Number(mensal || 0) : null,
        estado, observacoes: obs || null,
      } as any, 'gestor')
      const m = linkUrl.match(/data=(\d+)/)
      if (m) await supabase.from('projeto_links').upsert({ numero_projeto: nro, data_id: m[1] })
      onSaved(); onClose()
    } catch (e: any) { alert('Erro: ' + e.message) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-host-navy mb-4">Editar linha</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Nº projeto<input value={nro} onChange={(e) => setNro(e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>Data<input type="date" value={data} onChange={(e) => setData(e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label className="col-span-2">Cliente
            <input list="clientes-edit" value={cliente} onChange={(e) => setCliente(e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" />
            <datalist id="clientes-edit">{clientes.map((c) => <option key={c.id} value={c.nome} />)}</datalist>
          </label>
          <label className="col-span-2">Produto
            <select value={prodId} onChange={(e) => { setProdId(e.target.value); const p = produtos.find((x) => x.id === e.target.value); if (p) { setPctv(Number(p.percentagem_comissao)); setIsSaas(/saas/i.test(p.tipo)) } }} className="mt-1 w-full border rounded px-2 py-1.5">
              {produtos.map((p) => <option key={p.id} value={p.id}>{p.tipo} ({Number(p.percentagem_comissao)}%)</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 col-span-2"><input type="checkbox" checked={isSaas} onChange={(e) => setIsSaas(e.target.checked)} /> É SaaS (valor = mensalidade × 12)</label>
          {isSaas
            ? <label>Mensalidade €/mês<input type="number" value={mensal} onChange={(e) => setMensal(e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
            : <label>Valor da venda<input type="number" value={valor} onChange={(e) => setValor(e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>}
          <label>Percentagem %<input type="number" step="0.5" value={pctv} onChange={(e) => setPctv(Number(e.target.value))} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>Estado
            <select value={estado} onChange={(e) => setEstado(e.target.value as Estado)} className="mt-1 w-full border rounded px-2 py-1.5">
              {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="col-span-2">Observações<input value={obs} onChange={(e) => setObs(e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label className="col-span-2">Link da plataforma (cola o URL — o nº fica clicável)
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://platform.hostpms.com/?cmd=project&data=…" className="mt-1 w-full border rounded px-2 py-1.5" />
          </label>
        </div>
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">Comissão: <b className="text-host-navy">{eur(com)}</b></span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm">Cancelar</button>
            <button onClick={guardar} disabled={busy} className="px-4 py-2 rounded-lg bg-host-blue text-white text-sm font-semibold">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NovaLinha({ produtos, clientes, mes, onAdd }: { produtos: Produto[]; clientes: Cliente[]; mes: string; onAdd: () => void }) {
  const [nro, setNro] = useState('')
  const [data, setData] = useState(hojeISO())
  const [cliente, setCliente] = useState('')
  const [prodId, setProdId] = useState('')
  const [isSaas, setIsSaas] = useState(false)
  const [mensal, setMensal] = useState('')
  const [valor, setValor] = useState('')
  const [obs, setObs] = useState('')
  const [busy, setBusy] = useState(false)
  const [platVal, setPlatVal] = useState<any>(null)

  // procura os valores da plataforma para o nº de projeto (tabela projeto_valores)
  async function buscarPlat(n: string) {
    if (!n) { setPlatVal(null); return }
    const { data } = await supabase.from('projeto_valores').select('*').eq('numero_projeto', n).maybeSingle()
    setPlatVal(data || null)
  }
  function usarSetup() {
    const p = produtos.find((x) => /setup/i.test(x.tipo))
    if (p) setProdId(p.id)
    setIsSaas(false); setValor(String(platVal.setup)); setMensal('')
  }
  function usarSaas() {
    const maior = Number(platVal.meses) > 24
    let p = produtos.find((x) => /saas/i.test(x.tipo) && (maior ? x.tipo.includes('>') : x.tipo.includes('<')))
    if (!p) p = produtos.find((x) => /saas/i.test(x.tipo))
    if (p) setProdId(p.id)
    setIsSaas(true); setMensal(String(platVal.saas_mes)); setValor('')
  }

  const prod = produtos.find((p) => p.id === prodId)
  useEffect(() => { if (prod) setIsSaas(/saas/i.test(prod.tipo)) }, [prodId])

  const valorVenda = isSaas ? Number(mensal || 0) * 12 : Number(valor || 0)
  const pctv = prod ? Number(prod.percentagem_comissao) : 0
  const comissao = Math.round(valorVenda * pctv) / 100

  async function adicionar() {
    if (!nro || !cliente || !prodId) { alert('Preenche Nº, Cliente e Produto.'); return }
    setBusy(true)
    try {
      // aviso de duplicado: mesmo nº de projeto + mesmo produto
      const { data: dup } = await supabase.from('comissoes').select('id, mes_referencia').eq('numero_projeto', nro).eq('produto_id', prodId).limit(1)
      if (dup && dup.length) {
        const p = produtos.find((x) => x.id === prodId)
        if (!confirm(`Já existe uma comissão com o projeto ${nro} e o produto "${p?.tipo || ''}".\nQueres mesmo adicionar outra (duplicada)?`)) { setBusy(false); return }
      }
      const cliente_id = await getOrCreateCliente(cliente)
      const { error } = await supabase.from('comissoes').insert({
        numero_projeto: nro, data_adjudicacao: data, cliente_id, produto_id: prodId,
        valor_venda: valorVenda, percentagem: pctv, comissao_calculada: comissao,
        is_saas: isSaas, valor_mensal_saas: isSaas ? Number(mensal || 0) : null,
        estado: 'pendente', observacoes: obs || null, mes_referencia: mes || dateToMref(data),
      })
      if (error) throw error
      setNro(''); setCliente(''); setProdId(''); setIsSaas(false); setMensal(''); setValor(''); setObs(''); setPlatVal(null)
      onAdd()
    } catch (e: any) { alert('Erro: ' + e.message) } finally { setBusy(false) }
  }

  return (
    <tr className="border-t-2 border-host-blue/30 bg-blue-50/40">
      <td className="px-2 py-1.5 align-top">
        <input value={nro} onChange={(e) => setNro(e.target.value)} onBlur={(e) => buscarPlat(e.target.value.trim())} placeholder="Nº" className="w-full border rounded px-1 py-1" />
        {platVal && (Number(platVal.setup) > 0 || Number(platVal.saas_mes) > 0) && (
          <div className="mt-1 text-[10px] leading-tight text-host-blue">
            <span className="inline-flex items-center gap-0.5"><IconDownload className="w-3 h-3" /> plataforma:</span>
            {Number(platVal.setup) > 0 && <button type="button" onClick={usarSetup} className="block underline hover:no-underline">Setup {eur(platVal.setup)}</button>}
            {Number(platVal.saas_mes) > 0 && <button type="button" onClick={usarSaas} className="block underline hover:no-underline">SaaS {eur(platVal.saas_mes)}/mês</button>}
          </div>
        )}
      </td>
      <td className="px-2 py-1.5"><input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full border rounded px-1 py-1" /></td>
      <td className="px-2 py-1.5">
        <input list="clientes-list" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Cliente" className="w-full border rounded px-1 py-1" />
        <datalist id="clientes-list">{clientes.map((c) => <option key={c.id} value={c.nome} />)}</datalist>
      </td>
      <td className="px-2 py-1.5">
        <select value={prodId} onChange={(e) => setProdId(e.target.value)} className="w-full border rounded px-1 py-1">
          <option value="">Produto…</option>
          {produtos.map((p) => <option key={p.id} value={p.id}>{p.tipo} ({Number(p.percentagem_comissao)}%)</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5 text-right">
        {isSaas
          ? <input type="number" value={mensal} onChange={(e) => setMensal(e.target.value)} placeholder="€/mês" className="w-full text-right border rounded px-1 py-1" />
          : <input type="number" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="valor" className="w-full text-right border rounded px-1 py-1" />}
      </td>
      <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">
        {eur(comissao)}<label className="block text-[10px] text-gray-400 font-normal"><input type="checkbox" checked={isSaas} onChange={(e) => setIsSaas(e.target.checked)} /> SaaS ×12</label>
      </td>
      <td className="px-2 py-1.5"></td>
      <td className="px-2 py-1.5"></td>
      <td className="px-2 py-1.5">
        <div className="flex gap-1">
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Obs." className="w-full border rounded px-1 py-1" />
          <button onClick={adicionar} disabled={busy} className="bg-host-blue text-white text-xs font-semibold rounded px-2 py-1 hover:opacity-90 whitespace-nowrap">+ Linha</button>
        </div>
      </td>
    </tr>
  )
}
