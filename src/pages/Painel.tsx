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
  // data local sem depender de toISOString (fuso)
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Painel() {
  const [comissoes, setComissoes] = useState<Comissao[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [sel, setSel] = useState<string>('')
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

  const selOrder = sel ? parseMref(sel).order : 0
  const proprias = comissoes.filter((c) => c.mes_referencia === sel)
  const transitadas = comissoes.filter((c) => c.estado !== 'paga' && parseMref(c.mes_referencia).order < selOrder)
  const visiveis = [...transitadas, ...proprias]

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
      .from('envios')
      .insert({ mes_referencia: sel, comissao_ids: ids, total_comissoes: totComissao })
      .select('token')
      .single()
    if (error) { alert('Erro: ' + error.message); return }
    setLink(`${window.location.origin}/validacao/${data.token}`)
  }

  if (loading) return <div className="text-gray-500">A carregar…</div>

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-host-navy">Painel de comissões</h1>
          <p className="text-sm text-gray-500">Cada mês é uma página. As não-pagas transitam para os meses seguintes.</p>
        </div>
        <button onClick={gerarLink} className="bg-host-blue text-white text-sm font-semibold rounded-lg px-4 py-2 hover:opacity-90">
          Fechar mês / Gerar link do diretor
        </button>
      </div>

      {/* seletor de mês */}
      <div className="flex flex-wrap gap-2 mb-4">
        {meses.map((m) => (
          <button key={m} onClick={() => { setSel(m); setLink('') }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border ${sel === m ? 'bg-host-navy text-white border-host-navy' : 'bg-white text-host-navy hover:bg-gray-50'}`}>
            {mrefLabel(m)}
          </button>
        ))}
      </div>

      {link && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm flex items-center gap-3">
          <span className="font-medium text-host-navy">Link para o Marco:</span>
          <input readOnly value={link} className="flex-1 bg-white border rounded px-2 py-1 text-xs" onFocus={(e) => e.target.select()} />
          <button onClick={() => navigator.clipboard.writeText(link)} className="text-host-blue font-semibold">Copiar</button>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="px-3 py-2 font-medium">Nº</th>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 font-medium">Produto</th>
              <th className="px-3 py-2 font-medium text-right">Valor</th>
              <th className="px-3 py-2 font-medium text-right">%</th>
              <th className="px-3 py-2 font-medium text-right">Comissão</th>
              <th className="px-3 py-2 font-medium text-right">Valor pago</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Observações</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">Sem comissões neste mês. Adiciona uma linha em baixo.</td></tr>
            )}
            {visiveis.map((c) => {
              const trans = c.mes_referencia !== sel
              return (
                <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    {c.numero_projeto}
                    {trans && <span className="ml-2 text-[10px] uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">transitada {mrefLabel(c.mes_referencia)}</span>}
                  </td>
                  <td className="px-3 py-2">{fmtDate(c.data_adjudicacao)}</td>
                  <td className="px-3 py-2">{c.cliente?.nome}</td>
                  <td className="px-3 py-2">{c.produto?.tipo}{c.is_saas && c.valor_mensal_saas ? <span className="text-gray-400"> ({eur(c.valor_mensal_saas)}/mês)</span> : null}</td>
                  <td className="px-3 py-2 text-right">{eur(c.valor_venda)}</td>
                  <td className="px-3 py-2 text-right">{Number(c.percentagem)}%</td>
                  <td className="px-3 py-2 text-right font-semibold">{eur(c.comissao_calculada)}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.01" defaultValue={c.valor_pago ?? ''} placeholder="—"
                      onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (c.valor_pago ?? null)) patch(c, { valor_pago: v }) }}
                      className="w-24 text-right border rounded px-2 py-1" />
                  </td>
                  <td className="px-3 py-2">
                    <select value={c.estado} onChange={(e) => patch(c, { estado: e.target.value as Estado })}
                      className={`rounded px-2 py-1 text-xs font-medium ${estadoCls[c.estado]}`}>
                      {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input defaultValue={c.observacoes ?? ''} placeholder="—"
                      onBlur={(e) => { if (e.target.value !== (c.observacoes ?? '')) patch(c, { observacoes: e.target.value }) }}
                      className="w-48 border rounded px-2 py-1" />
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <NovaLinha produtos={produtos} clientes={clientes} mes={sel} onAdd={carregar} />
            <tr className="border-t bg-gray-50 font-semibold">
              <td className="px-3 py-2" colSpan={6}>Totais ({visiveis.length} linhas)</td>
              <td className="px-3 py-2 text-right">{eur(totComissao)}</td>
              <td className="px-3 py-2 text-right">{eur(totPago)}</td>
              <td className="px-3 py-2 text-xs text-gray-500" colSpan={2}>Por pagar: {eur(porPagar)}</td>
            </tr>
          </tfoot>
        </table>
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

  const prod = produtos.find((p) => p.id === prodId)
  useEffect(() => { if (prod) setIsSaas(/saas/i.test(prod.tipo)) }, [prodId])

  const valorVenda = isSaas ? (Number(mensal || 0) * 12) : Number(valor || 0)
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
    <tr className="border-t-2 border-host-blue/30 bg-blue-50/40 align-top">
      <td className="px-3 py-2"><input value={nro} onChange={(e) => setNro(e.target.value)} placeholder="Nº proj." className="w-20 border rounded px-2 py-1" /></td>
      <td className="px-3 py-2"><input type="date" value={data} onChange={(e) => setData(e.target.value)} className="border rounded px-2 py-1" /></td>
      <td className="px-3 py-2">
        <input list="clientes-list" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Cliente" className="w-40 border rounded px-2 py-1" />
        <datalist id="clientes-list">{clientes.map((c) => <option key={c.id} value={c.nome} />)}</datalist>
      </td>
      <td className="px-3 py-2">
        <select value={prodId} onChange={(e) => setProdId(e.target.value)} className="border rounded px-2 py-1">
          <option value="">Produto…</option>
          {produtos.map((p) => <option key={p.id} value={p.id}>{p.tipo} ({Number(p.percentagem_comissao)}%)</option>)}
        </select>
        <label className="ml-2 text-xs text-gray-500"><input type="checkbox" checked={isSaas} onChange={(e) => setIsSaas(e.target.checked)} /> SaaS</label>
      </td>
      <td className="px-3 py-2 text-right">
        {isSaas
          ? <input type="number" value={mensal} onChange={(e) => setMensal(e.target.value)} placeholder="€/mês" className="w-20 text-right border rounded px-2 py-1" />
          : <input type="number" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="valor" className="w-24 text-right border rounded px-2 py-1" />}
      </td>
      <td className="px-3 py-2 text-right text-gray-500">{pctv}%</td>
      <td className="px-3 py-2 text-right font-semibold">{eur(comissao)}</td>
      <td className="px-3 py-2"></td>
      <td className="px-3 py-2"></td>
      <td className="px-3 py-2">
        <div className="flex gap-2">
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Obs." className="w-32 border rounded px-2 py-1" />
          <button onClick={adicionar} disabled={busy} className="bg-host-blue text-white text-xs font-semibold rounded px-3 py-1 hover:opacity-90 whitespace-nowrap">+ Nova Linha</button>
        </div>
      </td>
    </tr>
  )
}
