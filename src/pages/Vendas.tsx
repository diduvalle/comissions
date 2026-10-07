// Secção "Vendas" do Analytics + blocos reutilizados pelo Relatório PDF.
// Todas as contas vêm de ../vendas.ts, por isso o ecrã e o PDF mostram sempre os mesmos números.
import type { Comissao } from '../types'
import { MESES } from '../utils'
import {
  metricas, noPeriodo, periodoComparavel, porMes, porProduto, porCliente, mrrAcumulado,
  variacao, fmtVar, COR_SAAS, COR_PONTUAL, COR_ANTERIOR, eur0, type Metricas,
} from '../vendas'

const eur = eur0

const abrev = (i: number) => MESES[i].slice(0, 3)
export const fmtDia = (iso: string) => `${Number(iso.slice(8, 10))} ${abrev(Number(iso.slice(5, 7)) - 1).toLowerCase()}`

/** texto do período, ex.: "1 jan - 7 out" ou "ano completo" */
export function textoPeriodo(ano: number) {
  const p = periodoComparavel(ano)
  return p.emCurso ? `1 jan - ${fmtDia(p.atual.ate)}` : 'ano completo'
}

/** todas as contas de uma vez (o painel e o relatório chamam isto) */
export function calcularVendas(comissoes: Comissao[], ano: number) {
  const p = periodoComparavel(ano)
  const linhasA = noPeriodo(comissoes, p.atual.de, p.atual.ate)
  const linhasB = noPeriodo(comissoes, p.anterior.de, p.anterior.ate)
  const A = metricas(linhasA)
  const B = metricas(linhasB)
  const anos = [...new Set(comissoes.map((c) => Number(c.data_adjudicacao?.slice(0, 4))).filter(Boolean))].sort()
  return {
    p, A, B, linhasA, linhasB,
    mesesA: porMes(comissoes, ano),
    mesesB: porMes(comissoes, ano - 1),
    produtosA: porProduto(linhasA),
    produtosB: porProduto(linhasB),
    clientesA: porCliente(linhasA),
    acumulado: mrrAcumulado(comissoes, ano, p.mesFim),
    // mês em curso do ano anterior, só até ao mesmo dia (para a linha ser comparável e a coluna somar o total)
    parcialAnt: p.emCurso ? metricas(noPeriodo(comissoes, `${ano - 1}-${String(p.mesFim).padStart(2, '0')}-01`, p.anterior.ate)) : null,
    diaFim: Number(p.atual.ate.slice(8, 10)),
    mixAnos: anos.filter((y) => y <= ano).map((y) => {
      const ls = comissoes.filter((c) => c.data_adjudicacao?.startsWith(String(y)))
      const primeiroMes = Math.min(...ls.map((c) => Number(c.data_adjudicacao.slice(5, 7))))
      return { ano: y, primeiroMes, ...metricas(ls) }
    }),
  }
}

// ---------- peças visuais ----------

/** variação com sinal + cor de estado (verde sobe, vermelho desce) - nunca só a cor */
export function Var({ a, b, sufixo = '' }: { a: number; b: number; sufixo?: string }) {
  const v = variacao(a, b)
  if (v == null) return <span className="text-gray-400">sem base de comparação</span>
  return <span className={v >= 0 ? 'text-green-700' : 'text-red-600'}>{v >= 0 ? '▲' : '▼'} {fmtVar(v)}{sufixo}</span>
}

export function Kpi({ label, valor, unidade, sub, cor, destaque }: { label: string; valor: string; unidade?: string; sub?: React.ReactNode; cor?: string; destaque?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 break-inside-avoid ${destaque ? 'bg-blue-50/60 border-host-blue/30' : 'bg-white'}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="kpi-valor text-[22px] font-bold leading-tight mt-0.5 tabular-nums whitespace-nowrap" style={{ color: cor || '#0F1E2E' }}>
        {valor}{unidade && <span className="text-[13px] font-semibold ml-0.5">{unidade}</span>}
      </div>
      {sub && <div className="text-xs mt-1">{sub}</div>}
    </div>
  )
}

function Legenda({ itens }: { itens: { cor: string; texto: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
      {itens.map((i) => (
        <span key={i.texto} className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: i.cor }} />{i.texto}
        </span>
      ))}
    </div>
  )
}

/** valor vendido por mês: ano em análise vs ano anterior (barras emparelhadas, eixo único) */
export function GraficoMensal({ mesesA, mesesB, ano, mesFim, emCurso, soPeriodo = false, parcialAnt = null }: {
  mesesA: Metricas[]; mesesB: Metricas[]; ano: number; mesFim: number; emCurso: boolean
  soPeriodo?: boolean; parcialAnt?: Metricas | null // relatório: só o período comparável (igual à tabela)
}) {
  // valor do ano anterior a desenhar em cada mês: no relatório, o mês em curso conta só os mesmos dias
  // e os meses seguintes não aparecem, para o gráfico bater certo com a tabela e com o total
  const ant = mesesB.map((b, i) => {
    if (!soPeriodo || !emCurso) return b.total
    if (i + 1 > mesFim) return 0
    return i + 1 === mesFim && parcialAnt ? parcialAnt.total : b.total
  })
  const max = Math.max(1, ...mesesA.map((m) => m.total), ...ant)
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-host-navy">Valor vendido por mês</h3>
        <Legenda itens={[{ cor: COR_ANTERIOR, texto: String(ano - 1) }, { cor: COR_SAAS, texto: String(ano) }]} />
      </div>
      <div className="relative h-44">
        {/* grelha recessiva: 50% e 100% do máximo */}
        {[0.5, 1].map((f) => (
          <div key={f} className="absolute left-0 right-0 border-t border-dashed border-gray-200" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2 right-0 bg-white pl-1 text-[9px] text-gray-400 tabular-nums">{eur(max * f).replace(/,\d\d/, '')}</span>
          </div>
        ))}
        <div className="relative flex items-end gap-1.5 h-full border-b border-gray-300">
          {mesesA.map((m, i) => {
            const futuro = emCurso && i + 1 > mesFim
            return (
              <div key={i} className="flex-1 flex items-end justify-center gap-[2px] h-full"
                title={`${MESES[i]} ${ano}: ${futuro ? '-' : eur(m.total)}  (pontual ${eur(m.pontual)} · SaaS ${eur(m.mrr)}/mês)\n${MESES[i]} ${ano - 1}: ${eur(ant[i])}`}>
                <div className="w-[42%] rounded-t-[4px]" style={{ height: `${(ant[i] / max) * 100}%`, background: COR_ANTERIOR }} />
                <div className="w-[42%] rounded-t-[4px]" style={{ height: futuro ? 0 : `${(m.total / max) * 100}%`, background: COR_SAAS }} />
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex gap-1.5 mt-1">{MESES.map((_, i) => <div key={i} className="flex-1 text-center text-[10px] text-gray-500">{abrev(i)}</div>)}</div>
      <p className="text-[11px] text-gray-500 mt-2">Valor vendido = vendas pontuais + SaaS anualizado (mensalidade × 12).</p>
    </div>
  )
}

/** a tabela é a vista acessível do gráfico mensal: todos os números, sem depender da cor */
export function TabelaMensal({ mesesA, mesesB, ano, mesFim, emCurso, A, B, periodo, parcialAnt, diaFim }: {
  mesesA: Metricas[]; mesesB: Metricas[]; ano: number; mesFim: number; emCurso: boolean; A: Metricas; B: Metricas; periodo: string
  parcialAnt?: Metricas | null; diaFim?: number
}) {
  const td = 'px-2 py-1.5 text-right tabular-nums'
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-gray-500 border-b">
            <th className="px-2 py-1.5 text-left font-medium">Mês</th>
            <th className={`${td} font-medium`}>Pontual</th>
            <th className={`${td} font-medium`}>Novo MRR</th>
            <th className={`${td} font-medium`}>SaaS anual.</th>
            <th className={`${td} font-medium`}>Total {ano}</th>
            <th className={`${td} font-medium`}>Total {ano - 1}</th>
            <th className={`${td} font-medium`}>Δ</th>
          </tr>
        </thead>
        <tbody>
          {mesesA.map((m, i) => {
            const futuro = emCurso && i + 1 > mesFim
            const corrente = emCurso && i + 1 === mesFim
            const b = mesesB[i]
            return (
              <tr key={i} className={`border-b border-gray-100 ${futuro ? 'text-gray-300' : ''}`}>
                <td className="px-2 py-1.5">{MESES[i]}{corrente && <span className="ml-1 text-[10px] text-gray-400">(1-{diaFim})</span>}</td>
                <td className={td}>{futuro ? '-' : eur(m.pontual)}</td>
                <td className={td}>{futuro ? '-' : `${eur(m.mrr)}`}</td>
                <td className={td}>{futuro ? '-' : eur(m.anual)}</td>
                <td className={`${td} font-semibold text-host-navy`}>{futuro ? '-' : eur(m.total)}</td>
                <td className={`${td} text-gray-500`}>{futuro ? '-' : eur(corrente && parcialAnt ? parcialAnt.total : b.total)}</td>
                {/* o mês em curso ainda não está completo: comparar seria enganador */}
                <td className={td}>{futuro || corrente ? '-' : <Var a={m.total} b={b.total} />}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-300 font-semibold text-host-navy">
            <td className="px-2 py-2">{emCurso ? `Período (${periodo})` : 'Total do ano'}</td>
            <td className={td}>{eur(A.pontual)}</td>
            <td className={td}>{eur(A.mrr)}</td>
            <td className={td}>{eur(A.anual)}</td>
            <td className={td}>{eur(A.total)}</td>
            <td className={`${td} text-gray-500`}>{eur(B.total)}</td>
            <td className={td}><Var a={A.total} b={B.total} /></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** novo MRR acumulado ao longo do tempo (uma série: o título identifica-a, sem caixa de legenda) */
export function GraficoMrrAcumulado({ dados }: { dados: { ano: number; mes: number; novo: number; acumulado: number }[] }) {
  if (dados.length < 2) return <p className="text-sm text-gray-400">Sem histórico suficiente.</p>
  const W = 600, H = 170, padT = 12, padB = 4
  const max = Math.max(1, ...dados.map((d) => d.acumulado))
  const x = (i: number) => (i / (dados.length - 1)) * W
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB)
  const pts = dados.map((d, i) => `${x(i).toFixed(1)},${y(d.acumulado).toFixed(1)}`).join(' ')
  const ult = dados[dados.length - 1]
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-semibold text-host-navy">Novo MRR acumulado</h3>
        <span className="text-sm text-gray-600">hoje: <b className="tabular-nums" style={{ color: COR_SAAS }}>{eur(ult.acumulado)}/mês</b></span>
      </div>
      <p className="text-[11px] text-gray-500 mb-2">Soma da receita recorrente mensal que vendeste desde {MESES[dados[0].mes - 1].toLowerCase()} {dados[0].ano}. Não desconta cancelamentos.</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44 overflow-visible" preserveAspectRatio="none">
        <style>{`.col:hover .cruz{opacity:1}`}</style>
        {[0.5, 1].map((f) => <line key={f} x1="0" x2={W} y1={y(max * f)} y2={y(max * f)} stroke="#e5e7eb" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />)}
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill={COR_SAAS} opacity="0.10" />
        <polyline points={pts} fill="none" stroke={COR_SAAS} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {dados.map((d, i) => (
          <g key={i} className="col">
            <title>{`${MESES[d.mes - 1]} ${d.ano}: ${eur(d.acumulado)}/mês acumulado (+${eur(d.novo)} novo)`}</title>
            <rect x={x(i) - W / dados.length / 2} y="0" width={W / dados.length} height={H} fill="transparent" />
            <line className="cruz" x1={x(i)} x2={x(i)} y1="0" y2={H} stroke="#94a3b8" strokeWidth="1" opacity="0" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        <circle cx={x(dados.length - 1)} cy={y(ult.acumulado)} r="4" fill={COR_SAAS} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-gray-500 mt-1">
        {dados.filter((d, i) => i === 0 || d.mes === 1).map((d) => <span key={`${d.ano}-${d.mes}`}>{abrev(d.mes - 1)} {d.ano}</span>)}
        <span>{abrev(ult.mes - 1)} {ult.ano}</span>
      </div>
    </div>
  )
}

/** mix pontual vs recorrente por ano (barras 100%, duas categorias com o mesmo peso visual) */
export function MixPorAno({ dados, anoAtual }: { dados: (Metricas & { ano: number; primeiroMes: number })[]; anoAtual: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-host-navy">Mix pontual vs recorrente</h3>
        <Legenda itens={[{ cor: COR_PONTUAL, texto: 'Pontual' }, { cor: COR_SAAS, texto: 'SaaS (anualizado)' }]} />
      </div>
      <div className="space-y-2.5">
        {dados.map((d) => {
          const pp = d.total > 0 ? (d.pontual / d.total) * 100 : 0
          return (
            <div key={d.ano} className="flex items-center gap-3" title={`${d.ano}: pontual ${eur(d.pontual)} · SaaS ${eur(d.anual)}`}>
              <span className="w-28 text-xs text-gray-600 shrink-0">{d.ano}{d.ano === anoAtual && new Date().getFullYear() === anoAtual ? ' (até hoje)' : d.primeiroMes > 1 ? ` (desde ${abrev(d.primeiroMes - 1).toLowerCase()})` : ''}</span>
              <div className="flex-1 flex h-6 gap-[2px] rounded-md overflow-hidden text-[11px] font-semibold text-white">
                <div className="flex items-center justify-center" style={{ width: `${pp}%`, background: COR_PONTUAL }}>{pp >= 14 ? `${pp.toFixed(0)}%` : ''}</div>
                <div className="flex items-center justify-center" style={{ width: `${100 - pp}%`, background: COR_SAAS }}>{100 - pp >= 14 ? `${(100 - pp).toFixed(0)}%` : ''}</div>
              </div>
              <span className="w-24 text-right text-xs font-semibold text-host-navy tabular-nums shrink-0">{eur(d.total)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** lista com barras horizontais (produtos, clientes) - a cor segue a categoria do produto */
export function ListaBarras({ titulo, itens, comparar }: {
  titulo: string
  itens: { nome: string; total: number; cor: string; detalhe?: string }[]
  comparar?: Record<string, number>
}) {
  const max = Math.max(1, ...itens.map((i) => i.total))
  return (
    <div>
      <h3 className="font-semibold text-host-navy mb-3">{titulo}</h3>
      {itens.length === 0 ? <p className="text-sm text-gray-400">Sem vendas no período.</p> : (
        <div className="space-y-2">
          {itens.map((it) => (
            <div key={it.nome} className="break-inside-avoid">
              <div className="flex justify-between text-xs mb-0.5 gap-2">
                <span className="text-gray-700 truncate">{it.nome}{it.detalhe && <span className="text-gray-400"> · {it.detalhe}</span>}</span>
                <span className="whitespace-nowrap">
                  <b className="text-host-navy tabular-nums">{eur(it.total)}</b>
                  {comparar && <span className="ml-2 text-[11px]"><Var a={it.total} b={comparar[it.nome] || 0} /></span>}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(it.total / max) * 100}%`, background: it.cor }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- secção completa no Analytics (só para o gestor) ----------

export default function VendasPainel({ comissoes, ano }: { comissoes: Comissao[]; ano: number }) {
  const v = calcularVendas(comissoes, ano)
  const { p, A, B } = v
  const periodo = textoPeriodo(ano)
  const ticketA = A.n ? A.total / A.n : 0
  const ticketB = B.n ? B.total / B.n : 0
  const ref = p.emCurso ? `mesmo período de ${ano - 1}` : String(ano - 1)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
        <p className="text-sm text-gray-600">
          Vendas pela <b>data da venda</b> · {periodo} {ano}, comparado com o {ref}.
        </p>
        <button onClick={() => window.open(`/relatorio?ano=${ano}`, '_blank')}
          className="no-print px-4 py-2 rounded-lg bg-host-blue text-white text-sm font-semibold shadow-glow hover:bg-host-bluedark">
          📄 Relatório de desempenho (PDF)
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
        <Kpi destaque label="Novo MRR (SaaS)" valor={eur(A.mrr)} unidade="/mês" cor={COR_SAAS} sub={<><Var a={A.mrr} b={B.mrr} /> <span className="text-gray-500">vs {ref}</span></>} />
        <Kpi label="SaaS anualizado" valor={eur(A.anual)} cor={COR_SAAS} sub={<Var a={A.anual} b={B.anual} />} />
        <Kpi label="Vendas pontuais" valor={eur(A.pontual)} cor={COR_PONTUAL} sub={<Var a={A.pontual} b={B.pontual} />} />
        <Kpi label="Valor total vendido" valor={eur(A.total)} sub={<Var a={A.total} b={B.total} />} />
        <Kpi label="Nº de vendas" valor={String(A.n)} sub={<><Var a={A.n} b={B.n} /> <span className="text-gray-500">· média {eur(ticketA)}</span></>} />
      </div>

      <div className="bg-white rounded-xl border p-4 mb-3">
        <GraficoMensal mesesA={v.mesesA} mesesB={v.mesesB} ano={ano} mesFim={p.mesFim} emCurso={p.emCurso} />
      </div>

      <div className="bg-white rounded-xl border p-4 mb-3">
        <h3 className="font-semibold text-host-navy mb-2">Mês a mês</h3>
        <TabelaMensal mesesA={v.mesesA} mesesB={v.mesesB} ano={ano} mesFim={p.mesFim} emCurso={p.emCurso} A={A} B={B} periodo={periodo} parcialAnt={v.parcialAnt} diaFim={v.diaFim} />
      </div>

      <div className="grid lg:grid-cols-2 gap-3 mb-3">
        <div className="bg-white rounded-xl border p-4"><GraficoMrrAcumulado dados={v.acumulado} /></div>
        <div className="bg-white rounded-xl border p-4"><MixPorAno dados={v.mixAnos} anoAtual={ano} /></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-3 mb-3">
        <div className="bg-white rounded-xl border p-4">
          <ListaBarras titulo={`Por produto (${periodo})`}
            itens={v.produtosA.map((x) => ({ nome: x.tipo, total: x.total, cor: x.saas ? COR_SAAS : COR_PONTUAL, detalhe: `${x.n} venda(s)` }))}
          />
          <p className="text-[11px] text-gray-500 mt-3">{"Desde dez/2025, Setup Fee e SaaS > 24 passaram a ser registados à parte (antes contavam como Serviços e SaaS < 24). Por isso não se compara produto a produto com anos anteriores; a comparação válida é pontual vs recorrente."}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <ListaBarras titulo={`Top clientes (${periodo})`}
            itens={v.clientesA.slice(0, 8).map((x) => ({ nome: x.nome, total: x.total, cor: x.mrr > 0 ? COR_SAAS : COR_PONTUAL, detalhe: `${x.n} linha(s)` }))} />
        </div>
      </div>

      <p className="text-[11px] text-gray-500">
        Fonte: vendas com comissão registada nesta aplicação (não substitui a contabilidade). Ticket médio no {ref}: {eur(ticketB)}.
      </p>
    </div>
  )
}
