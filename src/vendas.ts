// Métricas de VENDAS (não de comissões), a partir das linhas de comissão registadas.
// Usado pela secção "Vendas" do Analytics e pelo Relatório PDF - as mesmas contas nos dois.
//
// Regras:
//  - a data é a da venda (data_adjudicacao), não o mês do ciclo de comissões;
//  - SaaS conta como novo MRR (mensalidade) e como anualizado (× 12, o que fica em valor_venda);
//  - "pontual" = tudo o que não é SaaS (Setup Fee, Serviços, ITBase, Alojamento…).
import type { Comissao } from './types'
import { MESES } from './utils'

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

// Valor de venda que conta nas estatísticas. Numa venda cancelada conta só o que o cliente
// chegou a pagar (nunca mais do que o próprio valor da venda); o resto do contrato sai.
export function valorContado(c: Comissao): number {
  const v = Number(c.valor_venda || 0)
  return c.cancelada ? Math.min(Math.max(0, Number(c.valor_realizado || 0)), v) : v
}

export function mensalidade(c: Comissao): number {
  // subscrição cancelada já não é receita recorrente, mesmo que tenha havido pagamentos
  if (!c.is_saas || c.cancelada) return 0
  const m = Number(c.valor_mensal_saas || 0)
  return m > 0 ? m : Number(c.valor_venda || 0) / 12
}

export function metricas(linhas: Comissao[]): Metricas {
  let pontual = 0, mrr = 0, anual = 0, comissao = 0
  const proj = new Set<string>()
  let n = 0
  for (const c of linhas) {
    // uma venda cancelada não conta como venda, mas o que o cliente pagou conta como valor
    if (!c.cancelada) { n++; proj.add(String(c.numero_projeto)) }
    // comissão de uma venda cancelada = a que foi efetivamente paga
    comissao += c.cancelada ? Number(c.valor_pago || 0) : Number(c.comissao_calculada || 0)
    if (c.is_saas) { mrr += mensalidade(c); anual += valorContado(c) }
    else pontual += valorContado(c)
  }
  return {
    n, projetos: proj.size,
    pontual: r2(pontual), mrr: r2(mrr), anual: r2(anual), total: r2(pontual + anual), comissao: r2(comissao),
  }
}

export type ItemComposicao = { nr: string; cliente: string; pontual: number; saas: number; total: number; cancelada: boolean }

/** De onde vem um valor: agrupa por nº de projeto o que conta nas estatísticas (numa venda
 *  cancelada, só o que o cliente pagou), do maior para o menor. SaaS vem anualizado (× 12). */
export function composicao(linhas: Comissao[]): ItemComposicao[] {
  const g: Record<string, ItemComposicao> = {}
  for (const c of linhas) {
    const v = valorContado(c)
    if (v <= 0) continue
    const k = String(c.numero_projeto)
    const it = (g[k] ||= { nr: k, cliente: c.cliente?.nome || '-', pontual: 0, saas: 0, total: 0, cancelada: false })
    if (c.is_saas) it.saas += v
    else it.pontual += v
    it.total += v
    if (c.cancelada) it.cancelada = true
  }
  return Object.values(g)
    .map((x) => ({ ...x, pontual: r2(x.pontual), saas: r2(x.saas), total: r2(x.total) }))
    .sort((a, b) => b.total - a.total)
}

/** vendas canceladas de um conjunto: nº, valor do contrato, o que foi pago e o que saiu das estatísticas */
export function resumoCanceladas(linhas: Comissao[]) {
  const ls = linhas.filter((c) => c.cancelada)
  const contrato = ls.reduce((s, c) => s + Number(c.valor_venda || 0), 0)
  const realizado = ls.reduce((s, c) => s + valorContado(c), 0)
  // um negócio (nº de projeto) pode ter várias linhas canceladas: conta-se o negócio, não as linhas
  const negocios = new Set(ls.map((c) => String(c.numero_projeto))).size
  return { n: ls.length, negocios, contrato: r2(contrato), realizado: r2(realizado), excluido: r2(contrato - realizado) }
}

/** linhas com data de venda entre de e ate (ISO 'AAAA-MM-DD', inclusive) */
export function noPeriodo(linhas: Comissao[], de: string, ate: string): Comissao[] {
  return linhas.filter((c) => c.data_adjudicacao && c.data_adjudicacao >= de && c.data_adjudicacao <= ate)
}

// ---------- períodos e comparação ----------
//
// Boas práticas aplicadas:
//  - comparação por defeito com o MESMO período do ano anterior (neutraliza a sazonalidade);
//    em alternativa, com o período IMEDIATAMENTE ANTERIOR (ex.: Q3 vs Q2), que mostra a tendência;
//  - os dois períodos têm sempre a mesma duração; um período em curso compara só até ao mesmo dia;
//  - trimestres de calendário (Q1 = jan-mar); o fim de mês corresponde a fim de mês (30 jun ↔ 30 set);
//  - máximo 12 meses, para o período de comparação nunca se sobrepor ao período analisado.

export type Intervalo = { de: string; ate: string } // ISO 'AAAA-MM-DD', inclusive
export type ModoComparacao = 'homologo' | 'anterior'
export type Preset = 'ano' | 'q1' | 'q2' | 'q3' | 'q4' | 'pers'
export type SelecaoPeriodo = { preset: Preset; modo: ModoComparacao; de?: string; ate?: string }

/** um mês do período (o 1.º e o último podem ser parciais) e o pedaço correspondente da comparação */
export type Balde = { ano: number; mes: number; atual: Intervalo; anterior: Intervalo; aDecorrer: boolean }

export type Periodo = {
  atual: Intervalo        // o que se analisa (cortado em hoje, se ainda não acabou)
  anterior: Intervalo     // com o que se compara (mesma duração)
  previsto: Intervalo     // o período escolhido, sem o corte de hoje
  emCurso: boolean
  modo: ModoComparacao
  nome: string            // "Q3 2026", "2026", "Março 2026" ou as datas
  nomeAnt: string
  baldes: Balde[]
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const partes = (s: string) => s.split('-').map(Number) as [number, number, number]
const diasNoMes = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const ehFimDeMes = (s: string) => { const [y, m, d] = partes(s); return d === diasNoMes(y, m) }
export const hojeIso = (hoje = new Date()) => iso(hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate())
const isoValido = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && partes(s)[2] >= 1 && partes(s)[2] <= diasNoMes(partes(s)[0], partes(s)[1])

function somarDias(s: string, n: number) {
  const [y, m, d] = partes(s)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}
/** desloca n meses; com ancorarFim, um fim de mês fica fim de mês (30 set - 3 meses = 30 jun, 28 fev - 12 = 29 fev) */
function somarMeses(s: string, n: number, ancorarFim = false) {
  const [y, m, d] = partes(s)
  const k = y * 12 + (m - 1) + n
  const ny = Math.floor(k / 12), nm = k - ny * 12 + 1
  const ult = diasNoMes(ny, nm)
  return iso(ny, nm, ancorarFim ? ult : Math.min(d, ult))
}
const diasEntre = (a: string, b: string) => {
  const [y1, m1, d1] = partes(a), [y2, m2, d2] = partes(b)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5)
}

const abrevMes = (m: number) => MESES[m - 1].slice(0, 3).toLowerCase()
/** "7 out" */
export const fmtDia = (s: string) => `${partes(s)[2]} ${abrevMes(partes(s)[1])}`
/** "1 jul - 30 set 2026" ou "15 dez 2025 - 14 jan 2026" */
export function textoDatas({ de, ate }: Intervalo) {
  const y1 = partes(de)[0], y2 = partes(ate)[0]
  return y1 === y2 ? `${fmtDia(de)} - ${fmtDia(ate)} ${y2}` : `${fmtDia(de)} ${y1} - ${fmtDia(ate)} ${y2}`
}
/** nome curto de um período completo: ano, trimestre, mês; senão, as datas */
export function nomeIntervalo({ de, ate }: Intervalo) {
  const [y1, m1, d1] = partes(de), [y2, m2] = partes(ate)
  if (d1 === 1 && ehFimDeMes(ate) && y1 === y2) {
    if (m1 === 1 && m2 === 12) return String(y1)
    if (m2 - m1 === 2 && (m1 - 1) % 3 === 0) return `Q${(m1 + 2) / 3} ${y1}`
    if (m1 === m2) return `${MESES[m1 - 1]} ${y1}`
  }
  return textoDatas({ de, ate })
}

/** "1-9" se o intervalo não cobre o mês inteiro (mês em curso, ou datas soltas); senão null */
export function diasParciais({ de, ate }: Intervalo) {
  return partes(de)[2] === 1 && ehFimDeMes(ate) ? null : `${partes(de)[2]}-${partes(ate)[2]}`
}

export function intervaloDoPreset(preset: Exclude<Preset, 'pers'>, ano: number): Intervalo {
  if (preset === 'ano') return { de: iso(ano, 1, 1), ate: iso(ano, 12, 31) }
  const q = Number(preset.slice(1))
  return { de: iso(ano, 3 * q - 2, 1), ate: iso(ano, 3 * q, diasNoMes(ano, 3 * q)) }
}

/** período escolhido + período de comparação, ou o motivo pelo qual não é válido */
export function calcularPeriodo(sel: SelecaoPeriodo, ano: number, hoje = new Date()): { p: Periodo; erro?: undefined } | { p?: undefined; erro: string } {
  let previsto: Intervalo
  if (sel.preset === 'pers') {
    if (!isoValido(sel.de) || !isoValido(sel.ate)) return { erro: 'Indica as duas datas.' }
    previsto = { de: sel.de!, ate: sel.ate! }
    if (previsto.de > previsto.ate) return { erro: 'A data inicial tem de ser anterior à data final.' }
    if (previsto.ate >= somarMeses(previsto.de, 12)) return { erro: 'O período máximo é de 12 meses (para não se sobrepor ao período de comparação).' }
  } else previsto = intervaloDoPreset(sel.preset, ano)

  const h = hojeIso(hoje)
  if (previsto.de > h) return { erro: 'Este período ainda não começou.' }
  const emCurso = previsto.ate > h
  const atual = { de: previsto.de, ate: emCurso ? h : previsto.ate }

  // como se desloca uma data para o período de comparação
  const alinhadoMeses = partes(previsto.de)[2] === 1 && ehFimDeMes(previsto.ate)
  const nMeses = (partes(previsto.ate)[0] * 12 + partes(previsto.ate)[1]) - (partes(previsto.de)[0] * 12 + partes(previsto.de)[1]) + 1
  const nDias = diasEntre(previsto.de, previsto.ate) + 1
  const desloca = (s: string, ehFim: boolean) => {
    if (sel.modo === 'homologo') return somarMeses(s, -12, ehFim && ehFimDeMes(s))
    if (alinhadoMeses) return somarMeses(s, -nMeses, ehFim && ehFimDeMes(s)) // Q3 -> Q2, mês -> mês anterior
    return somarDias(s, -nDias) // datas soltas: os N dias imediatamente antes
  }
  const mover = (i: Intervalo) => ({ de: desloca(i.de, false), ate: desloca(i.ate, true) })

  const baldes: Balde[] = []
  let [y, m] = partes(atual.de)
  const [yF, mF] = partes(atual.ate)
  while (y < yF || (y === yF && m <= mF)) {
    const ini = iso(y, m, 1), fim = iso(y, m, diasNoMes(y, m))
    const b = { de: ini < atual.de ? atual.de : ini, ate: fim > atual.ate ? atual.ate : fim }
    baldes.push({ ano: y, mes: m, atual: b, anterior: mover(b), aDecorrer: emCurso && b.ate === atual.ate && b.ate < fim })
    m++; if (m > 12) { m = 1; y++ }
  }

  const previstoAnt = mover(previsto)
  return {
    p: {
      atual, anterior: mover(atual), previsto, emCurso, modo: sel.modo,
      nome: nomeIntervalo(previsto), nomeAnt: nomeIntervalo(previstoAnt), baldes,
    },
  }
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

/** novo MRR acumulado mês a mês, desde a primeira venda até ao mês indicado.
 *  Recebe só as vendas ativas: as canceladas registadas já não entram. */
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
