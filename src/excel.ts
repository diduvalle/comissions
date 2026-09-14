// Exportação/importação do mapa de comissões em Excel, no formato do ficheiro original
// (uma folha por mês, colunas A-J). A biblioteca só é carregada quando é precisa.
import type { Comissao, Produto } from './types'
import { MESES } from './utils'

// carrega o ExcelJS a pedido (build de browser, sem dependências de Node)
async function carregarExcelJS(): Promise<any> {
  const mod: any = await import('exceljs/dist/exceljs.min.js')
  return mod.default || mod
}

// valor que NÓS pagamos nesta linha (metade se for partilhada 50/50)
export function devidoDe(c: Comissao): number {
  const com = Number(c.comissao_calculada || 0)
  return c.partilhada ? Math.round(com * 50) / 100 : com
}

// Colunas, na ordem e com as larguras do ficheiro original do Diogo.
const COLUNAS = [
  { cab: 'Nº', larg: 9 },
  { cab: 'Mês', larg: 8.4 },
  { cab: 'Data', larg: 14 },
  { cab: 'Cliente', larg: 25.4 },
  { cab: 'Produto', larg: 18.1 },
  { cab: 'Valor', larg: 20.4 },
  { cab: 'Calculo Comissão', larg: 20.3 },
  { cab: 'Comissão Paga', larg: 18.1 },
  { cab: '%', larg: 7.7 },
  { cab: 'Observações', larg: 30 },
  { cab: 'ref', larg: 12 }, // técnica (oculta): liga a linha de volta à comissão certa
]
const COL_REF = 11
const EUR = '#,##0.00 €'

function nomeMes(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : MESES[d.getMonth()]
}

/** Gera e descarrega o .xlsx do mapa, no formato do original. */
export async function exportarExcel(linhas: Comissao[], mref: string, produtos: Produto[], nomeFicheiro: string) {
  const ExcelJS = await carregarExcelJS()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(mref)

  ws.columns = COLUNAS.map((c) => ({ width: c.larg }))
  const cab = ws.addRow(COLUNAS.map((c) => c.cab))
  cab.font = { bold: true }

  for (const c of linhas) {
    const r = ws.addRow([
      isNaN(Number(c.numero_projeto)) ? c.numero_projeto : Number(c.numero_projeto),
      nomeMes(c.data_adjudicacao),
      c.data_adjudicacao ? new Date(c.data_adjudicacao) : null,
      c.cliente?.nome || '',
      c.produto?.tipo || '',
      Number(c.valor_venda || 0),
      devidoDe(c),
      null, // "Comissão Paga" fica em branco - é o que ele preenche à mão
      Number(c.percentagem || 0) / 100,
      c.observacoes || '',
      c.id,
    ])
    r.getCell(3).numFmt = 'dd/mm/yyyy'
    r.getCell(6).numFmt = EUR
    r.getCell(7).numFmt = EUR
    r.getCell(8).numFmt = EUR
    r.getCell(9).numFmt = '0.0%'
  }

  // legenda das taxas por produto, como no ficheiro original
  ws.addRow([])
  const tit = ws.addRow(['Taxas por produto'])
  tit.font = { bold: true }
  for (const p of produtos) ws.addRow([p.tipo, Number(p.percentagem_comissao || 0) / 100]).getCell(2).numFmt = '0.0%'

  // a coluna técnica fica escondida para não distrair quem preenche
  ws.getColumn(COL_REF).hidden = true

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nomeFicheiro
  a.click()
  URL.revokeObjectURL(url)
}

export type LinhaLida = {
  id: string | null
  numero: string
  pago: number | null   // null = célula vazia (sem alteração)
  pct: number | null
  obs: string | null
}

// "25,48 €" / "25,48" / 25.48 / "PAGO" -> número (ou 'PAGO' / null)
function lerValor(v: any): number | 'PAGO' | null {
  if (v == null || v === '') return null
  if (typeof v === 'object' && v.result != null) v = v.result // célula com fórmula
  if (typeof v === 'number') return v
  const s = String(v).trim()
  if (!s) return null
  if (/^pago$/i.test(s)) return 'PAGO'
  const n = Number(s.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

function texto(v: any): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    if (v.result != null) return String(v.result)
    if (Array.isArray(v.richText)) return v.richText.map((t: any) => t.text).join('')
    if (v.text != null) return String(v.text)
  }
  return String(v)
}

/** Lê um .xlsx devolvido e extrai as linhas preenchidas (por cabeçalho, não por posição). */
export async function lerExcel(file: File): Promise<LinhaLida[]> {
  const ExcelJS = await carregarExcelJS()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('O ficheiro não tem nenhuma folha.')

  // localiza as colunas pelo cabeçalho (aguenta colunas inseridas/movidas)
  const cabs: Record<string, number> = {}
  ws.getRow(1).eachCell((cell: any, col: number) => {
    const t = texto(cell.value).trim().toLowerCase()
    if (t) cabs[t] = col
  })
  const cRef = cabs['ref']
  const cNum = cabs['nº'] ?? cabs['n'] ?? 1
  const cPago = cabs['comissão paga']
  const cPct = cabs['%']
  const cObs = cabs['observações']
  if (!cPago) throw new Error('Não encontrei a coluna "Comissão Paga" no ficheiro.')

  const out: LinhaLida[] = []
  ws.eachRow((row: any, n: number) => {
    if (n === 1) return
    const id = cRef ? texto(row.getCell(cRef).value).trim() : ''
    const numero = texto(row.getCell(cNum).value).trim()
    if (!id && !numero) return
    // a legenda de taxas no fim não tem ref nem nº de projeto numérico
    if (!id && isNaN(Number(numero))) return

    const pagoRaw = lerValor(row.getCell(cPago).value)
    const pctRaw = cPct ? lerValor(row.getCell(cPct).value) : null
    out.push({
      id: id || null,
      numero,
      pago: pagoRaw === 'PAGO' ? -1 : (pagoRaw as number | null), // -1 = marcar como totalmente paga
      pct: typeof pctRaw === 'number' ? (pctRaw <= 1 ? pctRaw * 100 : pctRaw) : null,
      obs: cObs ? texto(row.getCell(cObs).value).trim() : null,
    })
  })
  return out
}
