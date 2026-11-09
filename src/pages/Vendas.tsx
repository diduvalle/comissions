// Secção "Vendas" do Analytics + blocos reutilizados pelo Relatório PDF.
// Todas as contas vêm de ../vendas.ts, por isso o ecrã e o PDF mostram sempre os mesmos números.
import { useEffect, useRef, useState } from 'react'
import type { Comissao } from '../types'
import { MESES } from '../utils'
import {
  metricas, noPeriodo, porProduto, porCliente, mrrAcumulado, resumoCanceladas, composicao, type ItemComposicao,
  variacao, fmtVar, COR_SAAS, COR_PONTUAL, COR_ANTERIOR, eur0, type Metricas,
  calcularPeriodo, textoDatas, nomeIntervalo, diasParciais, hojeIso, fmtDia,
  type Periodo, type Balde, type SelecaoPeriodo, type Preset, type ModoComparacao,
} from '../vendas'

const eur = eur0

const abrev = (i: number) => MESES[i].slice(0, 3)

/** um mês do período, com as métricas dele e do pedaço correspondente da comparação */
export type MesComparado = Balde & { A: Metricas; B: Metricas }

/** todas as contas de uma vez (o painel e o relatório chamam isto) */
export function calcularVendas(todas: Comissao[], p: Periodo) {
  // vendas canceladas: contam só o que o cliente chegou a pagar (o resto do contrato sai, e o MRR
  // sai por inteiro). Essa regra vive em vendas.ts (valorContado/mensalidade), por isso entram todas.
  const linhasA = noPeriodo(todas, p.atual.de, p.atual.ate)
  const linhasB = noPeriodo(todas, p.anterior.de, p.anterior.ate)
  const A = metricas(linhasA)
  const B = metricas(linhasB)
  const anoFim = Number(p.atual.ate.slice(0, 4)), mesFim = Number(p.atual.ate.slice(5, 7))
  const datas = todas.map((c) => c.data_adjudicacao).filter(Boolean).sort()
  const inicioHistorico = datas.length ? `${datas[0].slice(0, 7)}-01` : null
  const anos = [...new Set(datas.map((d) => Number(d.slice(0, 4))))].sort()
  return {
    p, A, B, linhasA, linhasB,
    todas, // para o detalhe por projeto nos gráficos
    // o que saiu deste período por ter sido cancelado (pela data da venda)
    canceladasA: resumoCanceladas(linhasA),
    canceladasB: resumoCanceladas(linhasB),
    // mês a mês: os baldes partem os dois períodos sem sobras, por isso as linhas somam os totais
    meses: p.baldes.map((b): MesComparado => ({
      ...b,
      A: metricas(noPeriodo(todas, b.atual.de, b.atual.ate)),
      B: metricas(noPeriodo(todas, b.anterior.de, b.anterior.ate)),
    })),
    produtosA: porProduto(linhasA).filter((x) => x.total > 0),
    produtosB: porProduto(linhasB),
    clientesA: porCliente(linhasA).filter((x) => x.total > 0),
    acumulado: mrrAcumulado(todas, anoFim, mesFim),
    anoFim,
    // a comparação começa antes do primeiro registo: os números de lá estão incompletos
    inicioHistorico,
    comparacaoIncompleta: !!inicioHistorico && p.anterior.de < inicioHistorico,
    mixAnos: anos.filter((y) => y <= anoFim).map((y) => {
      const ls = todas.filter((c) => c.data_adjudicacao?.startsWith(String(y)))
      const primeiroMes = Math.min(...ls.map((c) => Number(c.data_adjudicacao.slice(5, 7))))
      return { ano: y, primeiroMes, ...metricas(ls) }
    }),
  }
}

/** "Q3 2026 (1 jul - 30 set 2026)", sem repetir quando o nome já são as datas */
export function nomeComDatas(nome: string, i: { de: string; ate: string }, emCurso = false) {
  const d = textoDatas(i)
  return nome === d ? `${d}${emCurso ? ', em curso' : ''}` : `${nome} (${d}${emCurso ? ', em curso' : ''})`
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

/** Cartão de detalhe (mouseover): de onde vem um valor, projeto a projeto.
 *  Mostra os maiores e agrupa o resto, para se ler de relance. */
function Detalhe({ titulo, total, subtitulo, itens, campo, estilo }: {
  titulo: string; total: number; subtitulo?: string
  itens: ItemComposicao[]; campo: 'total' | 'pontual' | 'saas'; estilo: React.CSSProperties
}) {
  const MAX = 8
  const lista = itens.filter((x) => x[campo] > 0)
  const top = lista.slice(0, MAX)
  const resto = lista.slice(MAX)
  const somaResto = resto.reduce((s, x) => s + x[campo], 0)
  const pct = (v: number) => { const p = total > 0 ? (v / total) * 100 : 0; return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%` }
  return (
    <div className="absolute z-30 w-80 pointer-events-none rounded-lg border border-gray-200 bg-white shadow-xl p-3 text-xs" style={estilo}>
      <div className="flex items-baseline justify-between gap-2">
        <b className="text-[13px] text-host-navy">{titulo}</b>
        <b className="tabular-nums text-host-navy">{eur(total)}</b>
      </div>
      {subtitulo && <div className="text-gray-500 mt-0.5">{subtitulo}</div>}
      {top.length === 0 ? <div className="text-gray-400 mt-2">Sem vendas registadas.</div> : (
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
          {top.map((it) => (
            <div key={it.nr} className="flex items-baseline gap-2">
              <span className="w-11 shrink-0 tabular-nums text-gray-400">{it.nr}</span>
              <span className="flex-1 min-w-0 truncate text-gray-700">
                {it.cliente}{it.cancelada && <span className="text-gray-400"> · cancelado (pago)</span>}
              </span>
              <span className="tabular-nums font-semibold text-host-navy">{eur(it[campo])}</span>
              <span className="w-9 shrink-0 text-right tabular-nums text-gray-400">{pct(it[campo])}</span>
            </div>
          ))}
          {resto.length > 0 && (
            <div className="flex items-baseline gap-2 pt-1 border-t border-gray-100 text-gray-500">
              <span className="flex-1">+ {resto.length} outro(s) projeto(s)</span>
              <span className="tabular-nums">{eur(somaResto)}</span>
              <span className="w-9 shrink-0 text-right tabular-nums">{pct(somaResto)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const multiAno = (meses: MesComparado[]) => new Set(meses.map((m) => m.ano)).size > 1
/** mês do período de comparação que corresponde a este (só se mostra quando não é o mesmo mês do ano anterior) */
const mesAnt = (m: MesComparado) => Number(m.anterior.de.slice(5, 7))
const outroMes = (m: MesComparado) => mesAnt(m) !== m.mes

/** valor vendido por mês: período em análise vs comparação (barras emparelhadas, eixo único).
 *  Com `linhas`, cada barra mostra no mouseover os projetos que fazem esse valor. */
export function GraficoMensal({ meses, nomeA, nomeB, altura = 'h-44', linhas }: {
  meses: MesComparado[]; nomeA: string; nomeB: string
  altura?: string
  linhas?: Comissao[] // todas as linhas: ativa o detalhe por projeto no mouseover
}) {
  const [hover, setHover] = useState<{ i: number; lado: 'A' | 'B' } | null>(null)
  const n = Math.max(1, meses.length)
  const varios = multiAno(meses)
  const max = Math.max(1, ...meses.map((m) => Math.max(m.A.total, m.B.total)))
  const col = 100 / n

  // composição do mês em foco (só se calcula ao passar o rato)
  let detalhe: React.ReactNode = null
  if (hover && linhas && meses[hover.i]) {
    const iv = hover.lado === 'A' ? meses[hover.i].atual : meses[hover.i].anterior
    const itens = composicao(noPeriodo(linhas, iv.de, iv.ate))
    const tot = itens.reduce((s, x) => s + x.total, 0)
    const pon = itens.reduce((s, x) => s + x.pontual, 0)
    const centro = (hover.i + 0.5) * col
    // 1.ª metade: cartão à direita das barras do mês; 2.ª metade: à esquerda
    detalhe = (
      <Detalhe titulo={nomeIntervalo(iv)} total={tot} itens={itens} campo="total"
        subtitulo={`${itens.length} projeto(s) · pontual ${eur(pon)} · SaaS anual. ${eur(tot - pon)}`}
        estilo={hover.i < n / 2 ? { top: 0, left: `calc(${centro}% + 62px)` } : { top: 0, right: `calc(${100 - centro}% + 62px)` }} />
    )
  }

  const barra = (i: number, lado: 'A' | 'B', valor: number) => {
    const ativo = hover && hover.i === i && hover.lado === lado
    return (
      <div className={`w-1/2 h-full flex items-end ${lado === 'B' ? 'justify-end pr-px' : 'justify-start pl-px'}`}
        onMouseEnter={linhas ? () => setHover({ i, lado }) : undefined}>
        <div className="w-[84%] max-w-[56px] rounded-t-[4px] transition-opacity"
          style={{ height: `${(valor / max) * 100}%`, background: lado === 'A' ? COR_SAAS : COR_ANTERIOR, opacity: hover && !ativo ? 0.35 : 1 }} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-host-navy">Valor vendido por mês</h3>
        <Legenda itens={[{ cor: COR_ANTERIOR, texto: nomeB }, { cor: COR_SAAS, texto: nomeA }]} />
      </div>
      <div className={`relative ${altura}`} onMouseLeave={() => setHover(null)}>
        {/* grelha recessiva: 50% e 100% do máximo */}
        {[0.5, 1].map((f) => (
          <div key={f} className="absolute left-0 right-0 border-t border-dashed border-gray-200" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2 right-0 bg-white pl-1 text-[9px] text-gray-400 tabular-nums">{eur(max * f)}</span>
          </div>
        ))}
        <div className="relative flex items-end gap-1.5 h-full border-b border-gray-300">
          {meses.map((m, i) => (
            <div key={i} className="flex-1 flex items-end justify-center h-full"
              title={linhas ? undefined : `${nomeIntervalo(m.atual)}: ${eur(m.A.total)}\n${nomeIntervalo(m.anterior)}: ${eur(m.B.total)}`}>
              {barra(i, 'B', m.B.total)}
              {barra(i, 'A', m.A.total)}
            </div>
          ))}
        </div>
        {detalhe}
      </div>
      <div className="flex gap-1.5 mt-1">
        {meses.map((m, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-gray-500 leading-tight">
            {abrev(m.mes - 1)}{varios && ` ${String(m.ano).slice(2)}`}
            {outroMes(m) && <span className="block text-[9px] text-gray-400">vs {abrev(mesAnt(m) - 1).toLowerCase()}</span>}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-500 mt-2">
        Valor vendido = vendas pontuais + SaaS anualizado (mensalidade × 12).{linhas && <span className="no-print"> Passa o rato sobre uma barra para ver os projetos.</span>}
      </p>
    </div>
  )
}

/** a tabela é a vista acessível do gráfico mensal: todos os números, sem depender da cor */
export function TabelaMensal({ meses, A, B, nomeA, nomeB, compacta = false }: {
  meses: MesComparado[]; A: Metricas; B: Metricas; nomeA: string; nomeB: string
  compacta?: boolean // relatório A4: linhas mais baixas
}) {
  const py = compacta ? 'py-1' : 'py-1.5'
  const td = `px-2 ${py} text-right tabular-nums`
  const varios = multiAno(meses)
  // nomes compridos (datas soltas) não cabem no cabeçalho: aí diz-se só "período"/"comparação"
  const cab = (nome: string, alt: string) => (nome.length <= 12 ? nome : alt)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-gray-500 border-b">
            <th className={`px-2 ${py} text-left font-medium`}>Mês</th>
            <th className={`${td} font-medium`}>Pontual</th>
            <th className={`${td} font-medium`}>Receita mensal</th>
            <th className={`${td} font-medium`}>SaaS anual.</th>
            <th className={`${td} font-medium`}>Total {cab(nomeA, 'período')}</th>
            <th className={`${td} font-medium`}>Total {cab(nomeB, 'comparação')}</th>
            <th className={`${td} font-medium`}>Δ</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m, i) => {
            const dias = diasParciais(m.atual)
            return (
              <tr key={i} className="border-b border-gray-100">
                <td className={`px-2 ${py}`}>
                  {MESES[m.mes - 1]}{varios && ` ${m.ano}`}
                  {dias && <span className="ml-1 text-[10px] text-gray-400">({dias})</span>}
                  {outroMes(m) && <span className="ml-1 text-[10px] text-gray-400">vs {abrev(mesAnt(m) - 1).toLowerCase()}</span>}
                </td>
                <td className={td}>{eur(m.A.pontual)}</td>
                <td className={td}>{eur(m.A.mrr)}</td>
                <td className={td}>{eur(m.A.anual)}</td>
                <td className={`${td} font-semibold text-host-navy`}>{eur(m.A.total)}</td>
                <td className={`${td} text-gray-500`}>{eur(m.B.total)}</td>
                {/* mês a decorrer: compara os mesmos dias, mas ainda pode haver vendas por carregar */}
                <td className={td} title={m.aDecorrer ? 'Mês a decorrer: ainda pode haver vendas por carregar.' : undefined}>
                  {m.aDecorrer ? '-' : <Var a={m.A.total} b={m.B.total} />}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-300 font-semibold text-host-navy">
            <td className={`px-2 ${compacta ? 'py-1.5' : 'py-2'}`}>Total{nomeA.length <= 12 ? ` ${nomeA}` : ' do período'}</td>
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
export function GraficoMrrAcumulado({ dados, altura = 'h-44', rotuloFim = 'hoje' }: { dados: { ano: number; mes: number; novo: number; acumulado: number }[]; altura?: string; rotuloFim?: string }) {
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
        <h3 className="font-semibold text-host-navy">Receita mensal acumulada</h3>
        <span className="text-sm text-gray-600">{rotuloFim}: <b className="tabular-nums" style={{ color: COR_SAAS }}>{eur(ult.acumulado)}/mês</b></span>
      </div>
      <p className="text-[11px] text-gray-500 mb-2">Soma da receita recorrente mensal que vendeste desde {MESES[dados[0].mes - 1].toLowerCase()} {dados[0].ano}. Exclui as vendas registadas como canceladas.</p>
      <svg viewBox={`0 0 ${W} ${H}`} className={`w-full ${altura} overflow-visible`} preserveAspectRatio="none">
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

/** mix pontual vs recorrente por ano (barras 100%, duas categorias com o mesmo peso visual).
 *  Com `linhas`, cada parte mostra no mouseover os projetos que a compõem. */
export function MixPorAno({ dados, anoAtual, linhas }: {
  dados: (Metricas & { ano: number; primeiroMes: number })[]; anoAtual: number
  linhas?: Comissao[]
}) {
  const [hover, setHover] = useState<{ ano: number; tipo: 'pontual' | 'saas' } | null>(null)
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-host-navy">Mix pontual vs recorrente</h3>
        <Legenda itens={[{ cor: COR_PONTUAL, texto: 'Pontual' }, { cor: COR_SAAS, texto: 'SaaS (anualizado)' }]} />
      </div>
      <div className="space-y-2.5" onMouseLeave={() => setHover(null)}>
        {dados.map((d) => {
          const pp = d.total > 0 ? (d.pontual / d.total) * 100 : 0
          const emFoco = hover?.ano === d.ano
          const seg = (tipo: 'pontual' | 'saas') => ({
            onMouseEnter: linhas ? () => setHover({ ano: d.ano, tipo }) : undefined,
            style: {
              width: `${tipo === 'pontual' ? pp : 100 - pp}%`,
              background: tipo === 'pontual' ? COR_PONTUAL : COR_SAAS,
              opacity: hover && !(emFoco && hover.tipo === tipo) ? 0.4 : 1,
            },
          })
          let detalhe: React.ReactNode = null
          if (emFoco && linhas && hover) {
            const itens = composicao(linhas.filter((c) => c.data_adjudicacao?.startsWith(String(d.ano))))
              .filter((x) => x[hover.tipo] > 0).sort((a, b) => b[hover.tipo] - a[hover.tipo])
            const tot = hover.tipo === 'pontual' ? d.pontual : d.anual
            const pctAno = d.total > 0 ? Math.round((tot / d.total) * 100) : 0
            detalhe = (
              <Detalhe titulo={`${d.ano} · ${hover.tipo === 'pontual' ? 'Pontual' : 'SaaS (anualizado)'}`} total={tot} itens={itens} campo={hover.tipo}
                subtitulo={`${itens.length} projeto(s) · ${pctAno}% do valor vendido no ano`}
                estilo={hover.tipo === 'pontual' ? { top: '100%', left: '7.5rem', marginTop: 6 } : { top: '100%', right: '6.75rem', marginTop: 6 }} />
            )
          }
          return (
            <div key={d.ano} className="relative flex items-center gap-3" title={linhas ? undefined : `${d.ano}: pontual ${eur(d.pontual)} · SaaS ${eur(d.anual)}`}>
              <span className="w-28 text-xs text-gray-600 shrink-0">{d.ano}{d.ano === anoAtual && new Date().getFullYear() === anoAtual ? ' (até hoje)' : d.primeiroMes > 1 ? ` (desde ${abrev(d.primeiroMes - 1).toLowerCase()})` : ''}</span>
              <div className="flex-1 flex h-6 gap-[2px] rounded-md overflow-hidden text-[11px] font-semibold text-white">
                <div className="flex items-center justify-center transition-opacity" {...seg('pontual')}>{pp >= 14 ? `${pp.toFixed(0)}%` : ''}</div>
                <div className="flex items-center justify-center transition-opacity" {...seg('saas')}>{100 - pp >= 14 ? `${(100 - pp).toFixed(0)}%` : ''}</div>
              </div>
              <span className="w-24 text-right text-xs font-semibold text-host-navy tabular-nums shrink-0">{eur(d.total)}</span>
              {detalhe}
            </div>
          )
        })}
      </div>
      {linhas && <p className="text-[11px] text-gray-500 mt-3 no-print">Passa o rato sobre uma parte da barra para ver os projetos.</p>}
    </div>
  )
}

/** lista com barras horizontais (produtos, clientes) - a cor segue a categoria do produto */
export function ListaBarras({ titulo, itens, comparar, compacta = false }: {
  titulo: string
  itens: { nome: string; total: number; cor: string; detalhe?: string }[]
  comparar?: Record<string, number>
  compacta?: boolean // relatório A4: itens mais juntos
}) {
  const max = Math.max(1, ...itens.map((i) => i.total))
  return (
    <div>
      <h3 className={`font-semibold text-host-navy ${compacta ? 'mb-2' : 'mb-3'}`}>{titulo}</h3>
      {itens.length === 0 ? <p className="text-sm text-gray-400">Sem vendas no período.</p> : (
        <div className={compacta ? 'space-y-1' : 'space-y-2'}>
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

/** link do relatório PDF com o mesmo período e a mesma comparação do ecrã */
export function urlRelatorio(sel: SelecaoPeriodo, ano: number) {
  const q = new URLSearchParams({ ano: String(ano), p: sel.preset, comp: sel.modo })
  if (sel.preset === 'pers') { q.set('de', sel.de || ''); q.set('ate', sel.ate || '') }
  return `/relatorio?${q.toString()}`
}

/** lê do URL do relatório a seleção feita no ecrã (valores desconhecidos -> predefinição) */
export function selecaoDoUrl(params: URLSearchParams): SelecaoPeriodo {
  const presets: Preset[] = ['ano', 'q1', 'q2', 'q3', 'q4', 'pers']
  const p = params.get('p') as Preset
  return {
    preset: presets.includes(p) ? p : 'ano',
    modo: params.get('comp') === 'anterior' ? 'anterior' : 'homologo',
    de: params.get('de') || undefined,
    ate: params.get('ate') || undefined,
  }
}

/** escolha do período (ano, trimestre ou datas) e da base de comparação */
function SeletorPeriodo({ sel, setSel, ano, p, erro, inicioHistorico, comparacaoIncompleta }: {
  sel: SelecaoPeriodo; setSel: (s: SelecaoPeriodo) => void; ano: number
  p?: Periodo; erro?: string; inicioHistorico: string | null; comparacaoIncompleta: boolean
}) {
  const hoje = hojeIso()
  const anoEmCurso = ano === new Date().getFullYear()
  const opcoes: { k: Preset; txt: string; futuro?: boolean }[] = [
    { k: 'ano', txt: anoEmCurso ? `${ano} até hoje` : `Ano ${ano}` },
    ...[1, 2, 3, 4].map((q) => ({ k: `q${q}` as Preset, txt: `Q${q}`, futuro: `${ano}-${String(3 * q - 2).padStart(2, '0')}-01` > hoje })),
    { k: 'pers', txt: 'Datas…' },
  ]
  const modos: { k: ModoComparacao; txt: string; dica: string }[] = [
    { k: 'homologo', txt: 'Mesmo período do ano anterior', dica: 'Recomendado: compara com as mesmas datas do ano anterior, sem o efeito da sazonalidade.' },
    { k: 'anterior', txt: 'Período imediatamente anterior', dica: 'Mostra a tendência recente (ex.: Q3 vs Q2), mas é afetado pela sazonalidade.' },
  ]
  const escolher = (k: Preset) => {
    // ao passar para "Datas…", começa com as datas do período que estava a ver
    if (k === 'pers') setSel({ ...sel, preset: k, de: sel.de || p?.atual.de, ate: sel.ate || p?.atual.ate })
    else setSel({ ...sel, preset: k })
  }
  const botao = (ativo: boolean) =>
    `px-3 py-1.5 text-sm font-semibold rounded-md transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${ativo ? 'bg-host-navy text-white' : 'text-host-navy hover:bg-gray-100'}`

  return (
    <div className="bg-white rounded-xl border p-3 mb-3 no-print">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Período</span>
          <div className="flex flex-wrap gap-0.5 rounded-lg border p-0.5" role="group" aria-label="Período">
            {opcoes.map((o) => (
              <button key={o.k} type="button" aria-pressed={sel.preset === o.k} disabled={o.futuro}
                title={o.futuro ? 'Este trimestre ainda não começou' : undefined}
                onClick={() => escolher(o.k)} className={botao(sel.preset === o.k)}>{o.txt}</button>
            ))}
          </div>
        </div>
        {sel.preset === 'pers' && (
          <div className="flex items-center gap-1.5 text-sm">
            <input type="date" value={sel.de || ''} max={hoje} min={inicioHistorico || undefined}
              onChange={(e) => setSel({ ...sel, de: e.target.value })} className="border rounded-md px-2 py-1 text-sm" aria-label="Data inicial" />
            <span className="text-gray-500">até</span>
            <input type="date" value={sel.ate || ''} min={sel.de || undefined}
              onChange={(e) => setSel({ ...sel, ate: e.target.value })} className="border rounded-md px-2 py-1 text-sm" aria-label="Data final" />
          </div>
        )}
        <div className="flex items-center gap-2 lg:ml-auto">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Comparar com</span>
          <div className="flex flex-wrap gap-0.5 rounded-lg border p-0.5" role="group" aria-label="Comparar com">
            {modos.map((m) => (
              <button key={m.k} type="button" aria-pressed={sel.modo === m.k} title={m.dica}
                onClick={() => setSel({ ...sel, modo: m.k })} className={botao(sel.modo === m.k)}>{m.txt}</button>
            ))}
          </div>
        </div>
      </div>

      {erro ? <p className="mt-2 text-sm text-red-600">{erro}</p> : p && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-100 text-sm text-gray-700 space-y-1">
          <div>
            <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: COR_SAAS }} />
            <b className="text-host-navy">{nomeComDatas(p.nome, p.atual, p.emCurso)}</b>
            <span className="mx-2 text-gray-400">vs</span>
            <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: COR_ANTERIOR }} />
            <b className="text-host-navy">{nomeComDatas(p.nomeAnt, p.anterior)}</b>
          </div>
          {p.emCurso && <p className="text-xs text-gray-500">O período ainda está a decorrer: compara-se só até hoje, com o mesmo número de dias do período de comparação.</p>}
          {p.modo === 'anterior' && <p className="text-xs text-amber-700">Atenção à sazonalidade: períodos seguidos têm épocas diferentes. Para avaliar crescimento, usa o mesmo período do ano anterior.</p>}
          {comparacaoIncompleta && inicioHistorico && <p className="text-xs text-amber-700">O registo de vendas começa em {MESES[Number(inicioHistorico.slice(5, 7)) - 1].toLowerCase()} {inicioHistorico.slice(0, 4)}: o período de comparação está incompleto.</p>}
        </div>
      )}
    </div>
  )
}

export default function VendasPainel({ comissoes, ano, sel, setSel }: {
  comissoes: Comissao[]; ano: number; sel: SelecaoPeriodo; setSel: (s: SelecaoPeriodo) => void
}) {
  // mudar o ano no topo da página volta ao ano inteiro se estavam escolhidas datas soltas
  const anoAnt = useRef(ano)
  useEffect(() => {
    if (anoAnt.current !== ano && sel.preset === 'pers') setSel({ ...sel, preset: 'ano' })
    anoAnt.current = ano
  }, [ano]) // eslint-disable-line react-hooks/exhaustive-deps

  const r = calcularPeriodo(sel, ano)
  const datas = comissoes.map((c) => c.data_adjudicacao).filter(Boolean).sort()
  const inicio = datas.length ? `${datas[0].slice(0, 7)}-01` : null
  if (!r.p) {
    return <SeletorPeriodo sel={sel} setSel={setSel} ano={ano} erro={r.erro} inicioHistorico={inicio} comparacaoIncompleta={false} />
  }
  const v = calcularVendas(comissoes, r.p)
  const { p, A, B } = v
  const ticketA = A.n ? A.total / A.n : 0
  const ticketB = B.n ? B.total / B.n : 0
  const ref = p.nomeAnt
  const fimTxt = p.atual.ate === hojeIso() ? 'hoje' : `em ${fmtDia(p.atual.ate)} ${p.atual.ate.slice(0, 4)}`

  return (
    <div>
      <SeletorPeriodo sel={sel} setSel={setSel} ano={ano} p={p} inicioHistorico={v.inicioHistorico} comparacaoIncompleta={v.comparacaoIncompleta} />

      <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
        <p className="text-sm text-gray-600">
          Vendas pela <b>data da venda</b>.
          {v.canceladasA.n > 0 && <span className="ml-2 text-gray-500">⊘ {v.canceladasA.negocios} negócio(s) cancelado(s) neste período{v.canceladasA.n > v.canceladasA.negocios ? ` (${v.canceladasA.n} linhas)` : ''}: excluídos {eur(v.canceladasA.excluido)}{v.canceladasA.realizado > 0 ? ` (conta só o que o cliente pagou: ${eur(v.canceladasA.realizado)})` : ''}.</span>}
        </p>
        <button onClick={() => window.open(urlRelatorio(sel, ano), '_blank')}
          className="no-print px-4 py-2 rounded-lg bg-host-blue text-white text-sm font-semibold shadow-glow hover:bg-host-bluedark">
          📄 Relatório de desempenho (PDF)
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
        <Kpi destaque label="Nova receita mensal (SaaS)" valor={eur(A.mrr)} unidade="/mês" cor={COR_SAAS} sub={<><Var a={A.mrr} b={B.mrr} /> <span className="text-gray-500">vs {ref}</span></>} />
        <Kpi label="SaaS anualizado" valor={eur(A.anual)} cor={COR_SAAS} sub={<Var a={A.anual} b={B.anual} />} />
        <Kpi label="Vendas pontuais" valor={eur(A.pontual)} cor={COR_PONTUAL} sub={<Var a={A.pontual} b={B.pontual} />} />
        <Kpi label="Valor total vendido" valor={eur(A.total)} sub={<Var a={A.total} b={B.total} />} />
        <Kpi label="Nº de vendas" valor={String(A.n)} sub={<><Var a={A.n} b={B.n} /> <span className="text-gray-500">· média {eur(ticketA)}</span></>} />
      </div>

      <div className="bg-white rounded-xl border p-4 mb-3">
        <GraficoMensal meses={v.meses} nomeA={p.nome} nomeB={p.nomeAnt} linhas={v.todas} />
      </div>

      <div className="bg-white rounded-xl border p-4 mb-3">
        <h3 className="font-semibold text-host-navy mb-2">Mês a mês</h3>
        <TabelaMensal meses={v.meses} A={A} B={B} nomeA={p.nome} nomeB={p.nomeAnt} />
      </div>

      <div className="grid lg:grid-cols-2 gap-3 mb-3">
        <div className="bg-white rounded-xl border p-4"><GraficoMrrAcumulado dados={v.acumulado} rotuloFim={fimTxt} /></div>
        <div className="bg-white rounded-xl border p-4"><MixPorAno dados={v.mixAnos} anoAtual={v.anoFim} linhas={v.todas} /></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-3 mb-3">
        <div className="bg-white rounded-xl border p-4">
          <ListaBarras titulo={`Por produto (${p.nome})`}
            itens={v.produtosA.map((x) => ({ nome: x.tipo, total: x.total, cor: x.saas ? COR_SAAS : COR_PONTUAL, detalhe: `${x.n} venda(s)` }))}
          />
          <p className="text-[11px] text-gray-500 mt-3">{"Desde dez/2025, Setup Fee e SaaS > 24 passaram a ser registados à parte (antes contavam como Serviços e SaaS < 24). Por isso não se compara produto a produto com anos anteriores; a comparação válida é pontual vs recorrente."}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <ListaBarras titulo={`Top clientes (${p.nome})`}
            itens={v.clientesA.slice(0, 8).map((x) => ({ nome: x.nome, total: x.total, cor: x.mrr > 0 ? COR_SAAS : COR_PONTUAL, detalhe: `${x.n} linha(s)` }))} />
        </div>
      </div>

      <p className="text-[11px] text-gray-500">
        Fonte: vendas com comissão registada nesta aplicação (não substitui a contabilidade). Ticket médio em {ref}: {eur(ticketB)}.
      </p>
    </div>
  )
}
