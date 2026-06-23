import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import type { Comissao, Produto, Cliente, Estado } from '../types'
import { eur, fmtDate, mrefLabel, sortMrefsDesc, parseMref, dateToMref } from '../utils'
import { updateComissao, getOrCreateCliente } from '../data'

const ESTADOS: Estado[] = ['pendente', 'validada', 'paga']
const estadoCls: Record<Estado, string> = {
  pendente: 'bg-gray-100 text-gray-700',
  validada: 'bg-blue-100 text-host-blue',
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

  async function carregar() {
    setLoading(true)
    const [{ data: c }, { data: p }, { data: cl }] = await Promise.all([
      supabase.from('comissoes').select('*, cliente:clientes(*), produto:produtos(*)').order('data_adjudicacao'),
      supabase.from('produtos').select('*').order('ordem'),
      supabase.from('clientes').select('*').order('nome'),
    ])
    setComissoes((c as any) || [])
    setProdutos((p as any) || [])
    setClientes((cl as any) || [])
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  const meses = useMemo(() => sortMrefsDesc(comissoes.map((c) => c.mes_referencia)), [comissoes])
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
  const proprias = comissoes.filter((c) => c.mes_referencia === sel)
  const transitadas = comissoes.filter((c) => c.estado !== 'paga' && parseMref(c.mes_referencia).order < selOrder)
  const visiveis = aberto
    ? comissoes.filter((c) => c.estado !== 'paga')
    : [...transitadas, ...proprias]

  const totComissao = visiveis.reduce((s, c) => s + Number(c.comissao_calculada || 0), 0)
  const totPago = visiveis.reduce((s, c) => s + Number(c.valor_pago || 0), 0)
  const porPagar = visiveis.filter((c) => c.estado !== 'paga').reduce((s, c) => s + Number(c.comissao_calculada || 0), 0)

  async function patch(c: Comissao, p: Partial<Comissao>) {
    await updateComissao(c, p, 'gestor')
    await carregar()
  }

  async function gerarLink() {
    const ids = visiveis.map((c) => c.id)
    const { data, error } = await supabase
      .from('envios').insert({ mes_referencia: sel, comissao_ids: ids, total_comissoes: totComissao })
      .select('token').single()
    if (error) { alert('Erro: ' + error.message); return }
    setLink(`${window.location.origin}/validacao/${data.token}`)
  }

  if (loading) return <div className="text-gray-500">A carregar…</div>

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-host-navy">Painel de comissões</h1>
        {!aberto && (
          <button onClick={gerarLink} className="bg-host-blue text-white text-sm font-semibold rounded-lg px-4 py-2 hover:opacity-90">
            Fechar mês / Gerar link do diretor
          </button>
        )}
      </div>

      {/* Navegação compacta */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button onClick={() => setAberto((v) => !v)}
          className={`px-3 py-2 rounded-lg text-sm font-semibold border ${aberto ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'}`}>
          {aberto ? '← Voltar aos meses' : '⚠ Em aberto (por pagar)'}
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
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="text-gray-500">Comissão <b className="text-host-navy">{eur(totComissao)}</b></span>
          <span className="text-gray-500">Pago <b className="text-green-700">{eur(totPago)}</b></span>
          <span className="text-gray-500">Por pagar <b className="text-amber-600">{eur(porPagar)}</b></span>
        </div>
      </div>

      {link && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm flex items-center gap-3">
          <span className="font-medium text-host-navy">Link para o Marco:</span>
          <input readOnly value={link} className="flex-1 bg-white border rounded px-2 py-1 text-xs" onFocus={(e) => e.target.select()} />
          <button onClick={() => navigator.clipboard.writeText(link)} className="text-host-blue font-semibold">Copiar</button>
        </div>
      )}

      <div className="bg-white rounded-xl border">
        <table className="w-full table-fixed text-[13px]">
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
            {visiveis.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">Sem comissões. Adiciona uma linha em baixo.</td></tr>
            )}
            {visiveis.map((c) => {
              const trans = c.mes_referencia !== sel || aberto
              return (
                <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-2 py-1.5 truncate" title={c.numero_projeto}>
                    {c.numero_projeto}
                    {trans && <span className="ml-1 text-[9px] uppercase bg-amber-100 text-amber-700 px-1 py-0.5 rounded" title={`transitada de ${mrefLabel(c.mes_referencia)}`}>↪{parseMref(c.mes_referencia).year % 100}</span>}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(c.data_adjudicacao)}</td>
                  <td className="px-2 py-1.5 truncate" title={c.cliente?.nome}>{c.cliente?.nome}</td>
                  <td className="px-2 py-1.5 truncate" title={`${c.produto?.tipo} (${Number(c.percentagem)}%)`}>
                    {c.produto?.tipo} <span className="text-gray-400">{Number(c.percentagem)}%</span>
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">{eur(c.valor_venda)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">{eur(c.comissao_calculada)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <input type="number" step="0.01" defaultValue={c.valor_pago ?? ''} placeholder="—"
                      onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (c.valor_pago ?? null)) patch(c, { valor_pago: v }) }}
                      className="w-full text-right border rounded px-1 py-1" />
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={c.estado} onChange={(e) => patch(c, { estado: e.target.value as Estado })}
                      className={`w-full rounded px-1 py-1 text-xs font-medium ${estadoCls[c.estado]}`}>
                      {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input defaultValue={c.observacoes ?? ''} placeholder="—" title={c.observacoes ?? ''}
                      onBlur={(e) => { if (e.target.value !== (c.observacoes ?? '')) patch(c, { observacoes: e.target.value }) }}
                      className="w-full border rounded px-1 py-1" />
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
      <p className="text-xs text-gray-400 mt-2">{visiveis.length} linhas{!aberto && transitadas.length > 0 ? ` · ${transitadas.length} transitadas de meses anteriores` : ''}</p>
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

  const prod = produtos.find((p) => p.id === prodId)
  useEffect(() => { if (prod) setIsSaas(/saas/i.test(prod.tipo)) }, [prodId])

  const valorVenda = isSaas ? Number(mensal || 0) * 12 : Number(valor || 0)
  const pctv = prod ? Number(prod.percentagem_comissao) : 0
  const comissao = Math.round(valorVenda * pctv) / 100

  async function adicionar() {
    if (!nro || !cliente || !prodId) { alert('Preenche Nº, Cliente e Produto.'); return }
    setBusy(true)
    try {
      const cliente_id = await getOrCreateCliente(cliente)
      const { error } = await supabase.from('comissoes').insert({
        numero_projeto: nro, data_adjudicacao: data, cliente_id, produto_id: prodId,
        valor_venda: valorVenda, percentagem: pctv, comissao_calculada: comissao,
        is_saas: isSaas, valor_mensal_saas: isSaas ? Number(mensal || 0) : null,
        estado: 'pendente', observacoes: obs || null, mes_referencia: mes || dateToMref(data),
      })
      if (error) throw error
      setNro(''); setCliente(''); setProdId(''); setIsSaas(false); setMensal(''); setValor(''); setObs('')
      onAdd()
    } catch (e: any) { alert('Erro: ' + e.message) } finally { setBusy(false) }
  }

  return (
    <tr className="border-t-2 border-host-blue/30 bg-blue-50/40">
      <td className="px-2 py-1.5"><input value={nro} onChange={(e) => setNro(e.target.value)} placeholder="Nº" className="w-full border rounded px-1 py-1" /></td>
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
