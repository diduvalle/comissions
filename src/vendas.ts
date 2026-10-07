// Métricas de VENDAS (não de comissões), a partir das linhas de comissão registadas.
// Usado pela secção "Vendas" do Analytics e pelo Relatório PDF - as mesmas contas nos dois.
//
// Regras:
//  - a data é a da venda (data_adjudicacao), não o mês do ciclo de comissões;
//  - SaaS conta como novo MRR (mensalidade) e como anualizado (× 12, o que fica em valor_venda);
//  - "pontual" = tudo o que não é SaaS (Setup Fee, Serviços, ITBase, Alojamento…).
import type { Comissao } from './types'

export type Metricas = {
  n: number          // nº de linhas vendidas
  projetos: number   // nº de projetos distintos
  pontual: number    // € vendas pontuais
  mrr: number        // €/mês de novo SaaS
  anual: number      // novo SaaS anualizado (× 12)
  total: number      // pontual + anualizado = valor vendido no 1º ano
  comissao: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

// euros inteiros: num relatório de gestão os cêntimos são ruído (as contas usam o valor exato)
const fmt0 = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, minimumFractionDigits: 0 })
export const eur0 = (n: number) => fmt0.format(Math.round(Number(n) || 0))

export function mensalidade(c: Comissao): number {
  if (!c.is_saas) return 0
  const m = Number(c.valor_mensal_saas || 0)
  return m > 0 ? m : Number(c.valor_venda || 0) / 12
}

export function metricas(linhas: Comissao[]): Metricas {
  let pontual = 0, mrr = 0, anual = 0, comissao = 0
  const proj = new Set<string>()
  for (const c of linhas) {
    proj.add(String(c.numero_projeto))
    comissao += Number(c.comissao_calculada || 0)
    if (c.is_saas) { mrr += mensalidade(c); anual += Number(c.valor_venda || 0) }
    else pontual += Number(c.valor_venda || 0)
  }
  return {
    n: linhas.length, projetos: proj.size,
    pontual: r2(pontual), mrr: r2(mrr), anual: r2(anual), total: r2(pontual + anual), comissao: r2(comissao),
  }
}

/** linhas com data de venda entre de e ate (ISO 'AAAA-MM-DD', inclusive) */
export function noPeriodo(linhas: Comissao[], de: string, ate: string): Comissao[] {
  return linhas.filter((c) => c.data_adjudicacao && c.data_adjudicacao >= de && c.data_adjudicacao <= ate)
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/**
 * Período comparável: no ano corrente, de 1 jan até hoje, contra o mesmo intervalo do ano anterior.
 * Num ano já terminado, o ano inteiro contra o ano anterior inteiro.
 */
export function periodoComparavel(ano: number, hoje = new Date()) {
  const emCurso = ano === hoje.getFullYear()
  const m = emCurso ? hoje.getMonth() + 1 : 12
  const d = emCurso ? hoje.getDate() : 31
  // 29 fev num ano não bissexto -> 28
  const dAnt = m === 2 && d === 29 ? 28 : d
  return {
    emCurso,
    atual: { de: iso(ano, 1, 1), ate: iso(ano, m, d) },
    anterior: { de: iso(ano - 1, 1, 1), ate: iso(ano - 1, m, dAnt) },
    mesFim: m,
  }
}

/** métricas por mês (índice 0 = janeiro) de um ano */
export function porMes(linhas: Comissao[], ano: number): Metricas[] {
  return Array.from({ length: 12 }, (_, i) => {
    const pref = `${ano}-${String(i + 1).padStart(2, '0')}`
    return metricas(linhas.filter((c) => c.data_adjudicacao?.startsWith(pref)))
  })
}

export function porProduto(linhas: Comissao[]) {
  const g: Record<string, Comissao[]> = {}
  for (const c of linhas) (g[c.produto?.tipo || '-'] ||= []).push(c)
  return Object.entries(g).map(([tipo, ls]) => ({ tipo, saas: ls.some((c) => c.is_saas), ...metricas(ls) }))
    .sort((a, b) => b.total - a.total)
}

export function porCliente(linhas: Comissao[]) {
  const g: Record<string, Comissao[]> = {}
  for (const c of linhas) (g[c.cliente?.nome || '-'] ||= []).push(c)
  return Object.entries(g).map(([nome, ls]) => ({ nome, ...metricas(ls) })).sort((a, b) => b.total - a.total)
}

/** novo MRR acumulado mês a mês, desde a primeira venda até ao mês indicado (não desconta cancelamentos) */
export function mrrAcumulado(linhas: Comissao[], ateAno: number, ateMes: number) {
  const datas = linhas.map((c) => c.data_adjudicacao).filter(Boolean).sort()
  if (!datas.length) return []
  let y = Number(datas[0].slice(0, 4)), m = Number(datas[0].slice(5, 7))
  const out: { ano: number; mes: number; novo: number; acumulado: number }[] = []
  let acc = 0
  while (y < ateAno || (y === ateAno && m <= ateMes)) {
    const pref = `${y}-${String(m).padStart(2, '0')}`
    const novo = linhas.filter((c) => c.is_saas && c.data_adjudicacao?.startsWith(pref)).reduce((s, c) => s + mensalidade(c), 0)
    acc += novo
    out.push({ ano: y, mes: m, novo: r2(novo), acumulado: r2(acc) })
    m++; if (m > 12) { m = 1; y++ }
  }
  return out
}

/** variação percentual, ou null se não houver base de comparação */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null
  return ((atual - anterior) / anterior) * 100
}

export function fmtVar(v: number | null): string {
  if (v == null) return 'sem base'
  return `${v > 0 ? '+' : ''}${v.toFixed(0)}%`
}

// Paleta validada (scripts/validate_palette.js, modo claro): azul Host + violeta passam
// todos os testes de daltonismo e contraste; o azul claro do ano anterior tem contraste
// baixo de propósito (é contexto) e por isso há sempre uma tabela com os números.
export const COR_SAAS = '#0667FF'      // recorrente / SaaS · ano em análise
export const COR_PONTUAL = '#4a3aa7'   // vendas pontuais
export const COR_ANTERIOR = '#7fa8ee'  // ano anterior (comparação)
