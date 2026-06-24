import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import type { Comissao, Envio } from '../types'
import { eur, parseMref, MESES } from '../utils'

const COR_REC = '#1B6CA8' // recorrente (SaaS) — host-blue
const COR_PON = '#9aa4b2' // pontual (Setup/Serviços) — cinza

function pctTxt(n: number) { return `${n > 0 ? '+' : ''}${n.toFixed(0)}%` }

export default function Resumo({ publico = false }: { publico?: boolean }) {
  const [comissoes, setComissoes] = useState<Comissao[]>([])
  const [envios, setEnvios] = useState<Envio[]>([])
  const [projetoValores, setProjetoValores] = useState<any[]>([])
  const [metas, setMetas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [ano, setAno] = useState<number>(0)

  async function carregar() {
    const [{ data: c }, { data: e }, { data: pv }] = await Promise.all([
      supabase.from('comissoes').select('*, cliente:clientes(nome), produto:produtos(tipo)'),
      supabase.from('envios').select('*'),
      supabase.from('projeto_valores').select('numero_projeto,setup,saas_mes,cliente,marca'),
    ])
    setComissoes((c as any) || [])
    setEnvios((e as any) || [])
    setProjetoValores((pv as any) || [])
    const { data: mt } = await supabase.from('metas').select('*') // pode não existir ainda
    setMetas((mt as any) || [])
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  async function definirMeta() {
    const atual = metas.find((m) => m.ano === ano)?.objetivo ?? ''
    const v = window.prompt(`Meta de comissão para ${ano} (€):`, String(atual))
    if (v == null) return
    const n = Number(String(v).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0
    const { error } = await supabase.from('metas').upsert({ ano, objetivo: n }, { onConflict: 'ano' })
    if (error) { alert('Primeiro cria a tabela "metas" (ver instruções).'); return }
    setMetas((prev) => [...prev.filter((m) => m.ano !== ano), { ano, objetivo: n }])
  }

  const anos = useMemo(() => {
    const s = new Set<number>()
    comissoes.forEach((c) => s.add(parseMref(c.mes_referencia).year))
    return [...s].sort((a, b) => b - a)
  }, [comissoes])
  useEffect(() => { if (!ano && anos.length) setAno(anos[0]) }, [anos, ano])

  if (loading) return <div className="text-gray-500">A carregar…</div>

  const doAno = comissoes.filter((c) => parseMref(c.mes_referencia).year === ano)
  const doAnoAnt = comissoes.filter((c) => parseMref(c.mes_referencia).year === ano - 1)
  const somaCom = (arr: Comissao[]) => arr.reduce((s, c) => s + Number(c.comissao_calculada || 0), 0)

  const totComissao = somaCom(doAno)
  const totAnterior = somaCom(doAnoAnt)
  const yoy = totAnterior > 0 ? ((totComissao - totAnterior) / totAnterior) * 100 : null

  // ⭐ recorrente (SaaS) vs pontual (Setup/Serviços)
  const recorrente = somaCom(doAno.filter((c) => c.is_saas))
  const pontual = totComissao - recorrente
  const recPct = totComissao > 0 ? (recorrente / totComissao) * 100 : 0

  // pagamentos
  const totPago = doAno.reduce((s, c) => s + Number(c.valor_pago || 0), 0)
  const porPagar = doAno.filter((c) => c.estado !== 'paga').reduce((s, c) => s + Number(c.comissao_calculada || 0), 0)

  // bónus (maior valor por mês, evita reenvios duplicados)
  const bonusPorMes: Record<string, number> = {}
  envios.forEach((e) => {
    if (parseMref(e.mes_referencia).year !== ano) return
    bonusPorMes[e.mes_referencia] = Math.max(bonusPorMes[e.mes_referencia] || 0, Number(e.bonus || 0))
  })
  const totBonus = Object.values(bonusPorMes).reduce((s, v) => s + v, 0)

  // evolução mensal (ano vs ano anterior)
  const mesData = (arr: Comissao[]) => Array.from({ length: 12 }, (_, i) =>
    arr.filter((c) => parseMref(c.mes_referencia).month === i + 1).reduce((s, c) => s + Number(c.comissao_calculada || 0), 0))
  const porMes = mesData(doAno)
  const porMesAnt = mesData(doAnoAnt)
  const maxMes = Math.max(1, ...porMes, ...porMesAnt)
  const melhorIdx = porMes.indexOf(Math.max(...porMes))
  // acumulado YTD
  let acc = 0; const acumulado = porMes.map((v) => (acc += v))

  // mix por produto
  const porProduto: Record<string, number> = {}
  doAno.forEach((c) => { const t = c.produto?.tipo || '—'; porProduto[t] = (porProduto[t] || 0) + Number(c.comissao_calculada || 0) })
  const produtos = Object.entries(porProduto).map(([tipo, v]) => ({ tipo, v })).sort((a, b) => b.v - a.v)
  const maxProd = Math.max(1, ...produtos.map((p) => p.v))

  // clientes
  const porCliente: Record<string, { nome: string; v: number; n: number }> = {}
  doAno.forEach((c) => { const nome = c.cliente?.nome || '—'; porCliente[nome] ||= { nome, v: 0, n: 0 }; porCliente[nome].v += Number(c.comissao_calculada || 0); porCliente[nome].n += 1 })
  const clientes = Object.values(porCliente).sort((a, b) => b.v - a.v)
  const top5 = clientes.slice(0, 5)
  const conc = totComissao > 0 ? (top5.reduce((s, c) => s + c.v, 0) / totComissao) * 100 : 0
  const maxCli = Math.max(1, ...top5.map((c) => c.v))

  // aging dos pendentes (por antiguidade da adjudicação)
  const hoje = new Date()
  const dias = (iso: string) => Math.max(0, Math.floor((hoje.getTime() - new Date(iso).getTime()) / 86400000))
  const pend = doAno.filter((c) => c.estado !== 'paga')
  const buckets = [
    { label: '0–30 dias', min: 0, max: 30, v: 0, n: 0 },
    { label: '31–60 dias', min: 31, max: 60, v: 0, n: 0 },
    { label: '61–90 dias', min: 61, max: 90, v: 0, n: 0 },
    { label: '+90 dias', min: 91, max: Infinity, v: 0, n: 0 },
  ]
  pend.forEach((c) => { const d = dias(c.data_adjudicacao); const b = buckets.find((x) => d >= x.min && d <= x.max); if (b) { b.v += Number(c.comissao_calculada || 0); b.n += 1 } })
  const maxBucket = Math.max(1, ...buckets.map((b) => b.v))
  const velho = buckets[2].v + buckets[3].v

  // insights automáticos
  const insights: string[] = []
  if (yoy != null) insights.push(`Comissão de ${ano}: ${eur(totComissao)} — ${pctTxt(yoy)} vs ${ano - 1}.`)
  if (totComissao > 0) insights.push(`${recPct.toFixed(0)}% da tua comissão vem de produtos recorrentes (SaaS).`)
  if (top5.length) insights.push(`Os teus ${top5.length} maiores clientes valem ${conc.toFixed(0)}% do total${clientes[0] ? ` (líder: ${clientes[0].nome}).` : '.'}`)
  if (melhorIdx >= 0 && porMes[melhorIdx] > 0) insights.push(`Melhor mês: ${MESES[melhorIdx]} com ${eur(porMes[melhorIdx])}.`)
  if (velho > 0) insights.push(`Atenção: ${eur(velho)} em comissões por pagar há mais de 60 dias.`)
  if (totBonus > 0) insights.push(`Bónus recebido: ${eur(totBonus)} (${((totBonus / (totComissao || 1)) * 100).toFixed(0)}% da comissão).`)

  // ===== Fase 2: meta, previsão, pipeline, sazonalidade, diretor =====
  const now = new Date()
  const anoAtual = now.getFullYear(); const mesAtual = now.getMonth() + 1
  const mesesDecorridos = ano < anoAtual ? 12 : (ano === anoAtual ? mesAtual : 0)
  const projecao = mesesDecorridos > 0 ? (totComissao / mesesDecorridos) * 12 : totComissao
  const metaObj = Number(metas.find((m) => m.ano === ano)?.objetivo || 0)
  const metaPct = metaObj > 0 ? Math.min(100, (totComissao / metaObj) * 100) : 0

  // pipeline: projetos com valor na plataforma mas sem comissão lançada
  const temNr = new Set(comissoes.map((c) => String(c.numero_projeto)))
  const pipeline = projetoValores
    .filter((p) => !temNr.has(String(p.numero_projeto)) && (Number(p.setup) > 0 || Number(p.saas_mes) > 0))
    .map((p) => ({ ...p, est: Number(p.setup) * 0.02 + Number(p.saas_mes) * 12 * 0.03 }))
    .sort((a, b) => b.est - a.est)
  const pipelineTotal = pipeline.reduce((s, p) => s + p.est, 0)

  // heatmap mês × ano (todos os anos)
  const heat = [...anos].sort((a, b) => a - b).map((y) => ({
    ano: y,
    meses: Array.from({ length: 12 }, (_, i) => comissoes.filter((c) => { const p = parseMref(c.mes_referencia); return p.year === y && p.month === i + 1 }).reduce((s, c) => s + Number(c.comissao_calculada || 0), 0)),
  }))
  const heatMax = Math.max(1, ...heat.flatMap((h) => h.meses))

  // atividade do diretor (envios do ano)
  const enviosAno = envios.filter((e) => parseMref(e.mes_referencia).year === ano)
  const abertos = enviosAno.filter((e) => e.aberto_em)
  const concluidos = enviosAno.filter((e) => e.estado === 'concluido')
  const taxaAbertura = enviosAno.length ? (abertos.length / enviosAno.length) * 100 : 0
  const tempos = abertos.map((e) => (new Date(e.aberto_em as string).getTime() - new Date(e.data_envio).getTime()) / 3600000).filter((h) => h >= 0)
  const tempoMedioH = tempos.length ? tempos.reduce((s, h) => s + h, 0) / tempos.length : null
  const tempoTxt = tempoMedioH == null ? '—' : tempoMedioH < 48 ? `${Math.round(tempoMedioH)}h` : `${(tempoMedioH / 24).toFixed(1)} dias`

  // média móvel de 3 meses (linha de tendência)
  const ma = porMes.map((_, i) => { const w = porMes.slice(Math.max(0, i - 2), i + 1); return w.reduce((s, x) => s + x, 0) / w.length })
  const maPts = ma.map((v, i) => `${((i + 0.5) / 12 * 100).toFixed(2)},${(100 - (v / maxMes) * 100).toFixed(2)}`).join(' ')

  // por marca (junta comissões → projeto_valores.marca pelo nº de projeto)
  const marcaDe: Record<string, string> = {}
  projetoValores.forEach((p) => { if (p.marca) marcaDe[String(p.numero_projeto)] = p.marca })
  const porMarca: Record<string, number> = {}
  let comMarca = 0
  doAno.forEach((c) => { const m = marcaDe[String(c.numero_projeto)]; if (m) { porMarca[m] = (porMarca[m] || 0) + Number(c.comissao_calculada || 0); comMarca += Number(c.comissao_calculada || 0) } })
  const marcas = Object.entries(porMarca).map(([marca, v]) => ({ marca, v })).sort((a, b) => b.v - a.v)
  const maxMarca = Math.max(1, ...marcas.map((m) => m.v))

  const Card =({ label, valor, sub, cor }: { label: string; valor: string; sub?: React.ReactNode; cor?: string }) => (
    <div className="bg-white rounded-xl border p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold ${cor || 'text-host-navy'}`}>{valor}</div>
      {sub && <div className="text-xs mt-0.5">{sub}</div>}
    </div>
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold text-host-navy">Analytics</h1>
        <div className="flex items-center gap-2 no-print">
          <button onClick={() => window.print()} className="px-3 py-2 rounded-lg border bg-white text-sm font-medium text-host-navy hover:bg-gray-50">Imprimir / PDF</button>
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border bg-white text-sm font-semibold text-host-navy">
            {anos.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Card label={`Comissão ganha (${ano})`} valor={eur(totComissao)}
          sub={yoy != null ? <span className={yoy >= 0 ? 'text-green-600' : 'text-red-500'}>{pctTxt(yoy)} vs {ano - 1}</span> : <span className="text-gray-400">sem ano anterior</span>} />
        <Card label="Recorrente (SaaS)" valor={eur(recorrente)} cor="text-host-blue" sub={<span className="text-gray-400">{recPct.toFixed(0)}% do total</span>} />
        <Card label="Pontual (Setup/Serviços)" valor={eur(pontual)} sub={<span className="text-gray-400">{(100 - recPct).toFixed(0)}% do total</span>} />
        <Card label="Bónus recebido" valor={eur(totBonus)} cor="text-host-blue" />
      </div>

      {/* Meta · Previsão · Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Meta {ano}</span>
            {!publico && <button onClick={definirMeta} className="text-xs text-host-blue font-medium">{metaObj > 0 ? 'editar' : 'definir'}</button>}
          </div>
          {metaObj > 0 ? (
            <>
              <div className="text-2xl font-bold text-host-navy">{metaPct.toFixed(0)}%</div>
              <div className="text-xs text-gray-400 mb-1">{eur(totComissao)} de {eur(metaObj)}</div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-host-blue" style={{ width: `${metaPct}%` }} /></div>
            </>
          ) : <div className="text-sm text-gray-400 mt-2">Define um objetivo para acompanhares o progresso.</div>}
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-xs text-gray-500">Projeção {ano} (ritmo atual)</div>
          <div className="text-2xl font-bold text-host-navy">{eur(projecao)}</div>
          <div className="text-xs text-gray-400">{ano === anoAtual && mesesDecorridos > 0 ? `com base em ${mesesDecorridos} ${mesesDecorridos === 1 ? 'mês' : 'meses'}` : 'ano completo'}</div>
        </div>
        <div className="bg-white rounded-xl border p-4" title="Projetos com valor na plataforma ainda sem comissão lançada">
          <div className="text-xs text-gray-500">Pipeline potencial</div>
          <div className="text-2xl font-bold text-host-blue">{eur(pipelineTotal)}</div>
          <div className="text-xs text-gray-400">{pipeline.length} projeto(s) por lançar</div>
        </div>
      </div>

      {/* Recorrente vs Pontual — barra de proporção */}
      <div className="bg-white rounded-xl border p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-host-navy">Recorrente vs Pontual</h3>
          <span className="text-xs text-gray-500">previsibilidade do teu rendimento</span>
        </div>
        <div className="flex h-6 w-full rounded-lg overflow-hidden text-[11px] font-semibold text-white">
          <div style={{ width: `${recPct}%`, background: COR_REC }} className="flex items-center justify-center" title={`Recorrente ${eur(recorrente)}`}>{recPct >= 12 ? `${recPct.toFixed(0)}%` : ''}</div>
          <div style={{ width: `${100 - recPct}%`, background: COR_PON }} className="flex items-center justify-center" title={`Pontual ${eur(pontual)}`}>{(100 - recPct) >= 12 ? `${(100 - recPct).toFixed(0)}%` : ''}</div>
        </div>
        <div className="flex gap-4 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: COR_REC }} /> Recorrente {eur(recorrente)}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: COR_PON }} /> Pontual {eur(pontual)}</span>
        </div>
      </div>

      {/* Insights automáticos */}
      {insights.length > 0 && (
        <div className="bg-host-navy text-white rounded-xl p-4 mb-3">
          <h3 className="font-semibold mb-2">Destaques</h3>
          <ul className="space-y-1 text-sm text-white/90">
            {insights.map((t, i) => <li key={i} className="flex gap-2"><span className="text-white/40">•</span><span>{t}</span></li>)}
          </ul>
        </div>
      )}

      {/* Evolução mensal (ano vs ano anterior) */}
      <div className="bg-white rounded-xl border p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-host-navy">Comissão por mês</h3>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: COR_REC }} /> {ano}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-300 inline-block" /> {ano - 1}</span>
            <span className="flex items-center gap-1"><span className="w-3 inline-block border-t-2 border-host-navy/50" /> tendência</span>
          </div>
        </div>
        <div className="relative h-40">
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={maPts} fill="none" stroke="#0F1E2E" strokeWidth="0.7" opacity="0.45" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="flex items-end gap-1 h-full">
            {porMes.map((v, i) => (
              <div key={i} className="flex-1 flex items-end justify-center gap-px h-full" title={`${MESES[i]}: ${eur(v)} · ${ano - 1}: ${eur(porMesAnt[i])} · média 3m: ${eur(ma[i])}`}>
                <div className="w-1/2 rounded-t bg-gray-300" style={{ height: `${(porMesAnt[i] / maxMes) * 100}%` }} />
                <div className="w-1/2 rounded-t" style={{ height: `${(v / maxMes) * 100}%`, background: COR_REC }} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-1 mt-1">{MESES.map((m) => <div key={m} className="flex-1 text-center text-[10px] text-gray-400">{m.slice(0, 3)}</div>)}</div>
        <div className="mt-2 text-xs text-gray-500">Acumulado {ano}: <b className="text-host-navy">{eur(acumulado[11])}</b></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-3 mb-3">
        {/* Mix por produto */}
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-semibold text-host-navy mb-3">Comissão por produto</h3>
          {produtos.length === 0 ? <p className="text-sm text-gray-400">Sem dados.</p> : (
            <div className="space-y-2">
              {produtos.map((p) => (
                <div key={p.tipo}>
                  <div className="flex justify-between text-xs mb-0.5"><span className="text-gray-600 truncate">{p.tipo}</span><b className="text-host-navy whitespace-nowrap ml-2">{eur(p.v)}</b></div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(p.v / maxProd) * 100}%`, background: COR_REC }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top clientes + concentração */}
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-host-navy">Top clientes</h3>
            {top5.length > 0 && <span className="text-xs text-gray-500">top {top5.length} = <b className="text-host-navy">{conc.toFixed(0)}%</b> do total</span>}
          </div>
          {top5.length === 0 ? <p className="text-sm text-gray-400">Sem dados.</p> : (
            <div className="space-y-2">
              {top5.map((c, i) => (
                <div key={c.nome}>
                  <div className="flex justify-between text-xs mb-0.5"><span className="text-gray-600 truncate"><span className="text-gray-400 mr-1">{i + 1}.</span>{c.nome} <span className="text-gray-400">({c.n})</span></span><b className="text-host-navy whitespace-nowrap ml-2">{eur(c.v)}</b></div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-host-navy/70" style={{ width: `${(c.v / maxCli) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Por marca */}
      <div className="bg-white rounded-xl border p-4 mb-3">
        <h3 className="font-semibold text-host-navy mb-3">Comissão por marca</h3>
        {marcas.length === 0 ? (
          <p className="text-sm text-gray-400">Sem marca atribuída aos projetos ainda — é preenchida pela recolha de valores da plataforma.</p>
        ) : (
          <div className="space-y-2">
            {marcas.map((m) => (
              <div key={m.marca}>
                <div className="flex justify-between text-xs mb-0.5"><span className="text-gray-600">{m.marca}</span><b className="text-host-navy whitespace-nowrap ml-2">{eur(m.v)}</b></div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(m.v / maxMarca) * 100}%`, background: COR_REC }} /></div>
              </div>
            ))}
            {comMarca < totComissao && <p className="text-[10px] text-gray-400 mt-1">{eur(totComissao - comMarca)} ainda sem marca atribuída.</p>}
          </div>
        )}
      </div>

      {/* Pagamentos + aging */}
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-semibold text-host-navy mb-3">Pagamentos</h3>
          <div className="flex h-6 w-full rounded-lg overflow-hidden text-[11px] font-semibold text-white mb-2">
            <div className="bg-green-500 flex items-center justify-center" style={{ width: `${totComissao > 0 ? (totPago / totComissao) * 100 : 0}%` }} title={`Pago ${eur(totPago)}`}>{totPago > 0 ? 'pago' : ''}</div>
            <div className="bg-amber-400 flex items-center justify-center" style={{ width: `${totComissao > 0 ? (porPagar / totComissao) * 100 : 0}%` }} title={`Por pagar ${eur(porPagar)}`}>{porPagar > 0 ? 'por pagar' : ''}</div>
          </div>
          <div className="flex gap-4 text-xs text-gray-500">
            <span>Pago <b className="text-green-700">{eur(totPago)}</b></span>
            <span>Por pagar <b className="text-amber-600">{eur(porPagar)}</b></span>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-semibold text-host-navy mb-3">Antiguidade dos pendentes</h3>
          {pend.length === 0 ? <p className="text-sm text-gray-400">Nada por pagar. 🎯</p> : (
            <div className="space-y-2">
              {buckets.map((b) => (
                <div key={b.label}>
                  <div className="flex justify-between text-xs mb-0.5"><span className="text-gray-600">{b.label} {b.n > 0 && <span className="text-gray-400">({b.n})</span>}</span><b className={`whitespace-nowrap ml-2 ${b.min >= 61 ? 'text-red-500' : 'text-host-navy'}`}>{eur(b.v)}</b></div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${b.min >= 61 ? 'bg-red-400' : 'bg-amber-400'}`} style={{ width: `${(b.v / maxBucket) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sazonalidade (heatmap mês × ano) */}
      {heat.length > 0 && (
        <div className="bg-white rounded-xl border p-4 mt-3">
          <h3 className="font-semibold text-host-navy mb-3">Sazonalidade — comissão por mês × ano</h3>
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="flex text-[10px] text-gray-400 mb-1"><div className="w-10" />{MESES.map((m) => <div key={m} className="flex-1 text-center">{m.slice(0, 3)}</div>)}</div>
              {heat.map((h) => (
                <div key={h.ano} className="flex items-center gap-px mb-px">
                  <div className="w-10 text-xs text-gray-500">{h.ano}</div>
                  {h.meses.map((v, i) => (
                    <div key={i} className="flex-1 h-6 rounded-sm" title={`${MESES[i]} ${h.ano}: ${eur(v)}`}
                      style={{ background: v > 0 ? `rgba(27,108,168,${(0.12 + 0.88 * (v / heatMax)).toFixed(3)})` : '#f1f3f6' }} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="text-[10px] text-gray-400 mt-1">mais escuro = mais comissão</div>
        </div>
      )}

      {/* Atividade do diretor */}
      <div className="bg-white rounded-xl border p-4 mt-3">
        <h3 className="font-semibold text-host-navy mb-3">Atividade do diretor ({ano})</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div><div className="text-2xl font-bold text-host-navy">{enviosAno.length}</div><div className="text-xs text-gray-500">mapas enviados</div></div>
          <div><div className="text-2xl font-bold text-host-navy">{taxaAbertura.toFixed(0)}%</div><div className="text-xs text-gray-500">taxa de abertura</div></div>
          <div><div className="text-2xl font-bold text-host-navy">{tempoTxt}</div><div className="text-xs text-gray-500">tempo médio até abrir</div></div>
          <div><div className="text-2xl font-bold text-host-navy">{concluidos.length}</div><div className="text-xs text-gray-500">concluídos (revisto)</div></div>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-4">{doAno.length} projeto(s) em {ano}.</p>
    </div>
  )
}
