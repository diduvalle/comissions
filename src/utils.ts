export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
export const ABBR = ['', 'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

const eurFmt = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
export const eur = (n: number | null | undefined) => eurFmt.format(Number(n || 0))

export const pct = (n: number | null | undefined) => `${Number(n || 0).toLocaleString('pt-PT')}%`

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('T')[0].split('-')
  return `${d}/${m}/${y}`
}

// "JUN26" -> { month: 6, year: 2026, order: 202606, label: "Junho 2026" }
export function parseMref(mref: string) {
  const ab = mref.slice(0, 3).toUpperCase()
  const yy = parseInt(mref.slice(3), 10)
  const month = ABBR.indexOf(ab)
  const year = 2000 + yy
  return { month, year, order: year * 100 + month, label: `${MESES[month - 1] || ab} ${year}` }
}

// dd/mm/aaaa ou iso -> "JUN26"
export function dateToMref(iso: string): string {
  const [y, m] = iso.split('-')
  return `${ABBR[parseInt(m, 10)]}${y.slice(2)}`
}

export function mrefLabel(mref: string): string {
  return parseMref(mref).label
}

// "JUN26" -> "JUL26"  (mês seguinte, salta o ano em dezembro)
export function nextMref(mref: string): string {
  const { month, year } = parseMref(mref)
  const m = month === 12 ? 1 : month + 1
  const y = month === 12 ? year + 1 : year
  return `${ABBR[m]}${String(y).slice(2)}`
}

export function sortMrefsDesc(mrefs: string[]): string[] {
  return [...new Set(mrefs)].sort((a, b) => parseMref(b).order - parseMref(a).order)
}

// Uma comissão está "em aberto" (transita) se não estiver paga
export function emAberto(estado: string): boolean {
  return estado !== 'paga'
}

// Link para o projeto na plataforma HostPMS (data id interno).
export function platformUrl(dataId: string): string {
  return `https://platform.hostpms.com/?cmd=project&data=${dataId}&ConnectionName=hostassist`
}
