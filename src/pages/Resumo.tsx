import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import type { Comissao, Envio } from '../types'
import { eur, parseMref, MESES } from '../utils'

const COR_REC = '#1B6CA8' // recorrente (SaaS) — host-blue
const COR_PON = '#9aa4b2' // pontual (Setup/Serviços) — cinza

function pctTxt(n: number) { return `${n > 0 ? '+' : ''}${n.toFixed(0)}%` }

export default function Resumo() {
  const [comissoes, setComissoes] = useState<Comissao[]>([])
  const [envios, setEnvios] = useState<Envio[]>([])
  const [loading, setLoading] = useState(true)
  const [ano, setAno] = useState<number>(0)

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: e }] = await Promise.all([
        supabase.from('comissoes').select('*, cliente:clientes(nome), produto:produtos(tipo)'),
        supabase.from('envios').select('*'),
      ])
      setComissoes((c as any) || [])
      setEnvios((e as any) || [])
      setLoading(false)
    })()
  }, [])

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

  const Card = ({ label, valor, sub, cor }: { label: string; valor: string; sub?: React.ReactNode; cor?: string }) => (
    <div className="bg-white rounded-xl border p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold ${cor || 'text-host-navy'}`}>{valor}</div>
      {sub && <div className="text-xs mt-0.5">{sub}</div>}
    </div>
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold text-host-navy">Resumo anual</h1>
        <select value={ano} onChange={(e) => setAno(Number(e.target.value))}
          className="px-3 py-2 rounded-lg border bg-white text-sm font-semibold text-host-navy">
          {anos.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Card label={`Comissão ganha (${ano})`} valor={eur(totComissao)}
          sub={yoy != null ? <span className={yoy >= 0 ? 'text-green-600' : 'text-red-500'}>{pctTxt(yoy)} vs {ano - 1}</span> : <span className="text-gray-400">sem ano anterior</span>} />
        <Card label="Recorrente (SaaS)" valor={eur(recorrente)} cor="text-host-blue" sub={<span className="text-gray-400">{recPct.toFixed(0)}% do total</span>} />
        <Card label="Pontual (Setup/Serviços)" valor={eur(pontual)} sub={<span className="text-gray-400">{(100 - recPct).toFixed(0)}% do total</span>} />
        <Card label="Bónus recebido" valor={eur(totBonus)} cor="text-host-blue" />
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
          </div>
        </div>
        <div className="flex items-end gap-1 h-44">
          {porMes.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-0.5" title={`${MESES[i]}: ${eur(v)} (${ano - 1}: ${eur(porMesAnt[i])})`}>
              <div className="w-full flex items-end justify-center gap-px h-full">
                <div className="w-1/2 rounded-t bg-gray-300" style={{ height: `${(porMesAnt[i] / maxMes) * 100}%` }} />
                <div className="w-1/2 rounded-t" style={{ height: `${(v / maxMes) * 100}%`, background: COR_REC }} />
              </div>
              <span className="text-[10px] text-gray-400">{MESES[i].slice(0, 3)}</span>
            </div>
          ))}
        </div>
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

      <p className="text-xs text-gray-400 mt-4">{doAno.length} projeto(s) em {ano}.</p>
    </div>
  )
}
