// Exportação/importação do mapa de comissões em Excel, no formato que o diretor usa.
// A biblioteca (ExcelJS) só é carregada quando é precisa, num chunk à parte.
import type { Comissao, Produto } from './types'
import { MESES } from './utils'

async function carregarExcelJS(): Promise<any> {
  const mod: any = await import('exceljs/dist/exceljs.min.js')
  return mod.default || mod
}

// valor que NÓS pagamos nesta linha (metade se for partilhada 50/50)
export function devidoDe(c: Comissao): number {
  const com = Number(c.comissao_calculada || 0)
  return c.partilhada ? Math.round(com * 50) / 100 : com
}

// Ordem das colunas pedida pelo diretor. 'al' = alinhamento.
const COLUNAS = [
  { cab: 'Nº', larg: 10, al: 'center' },
  { cab: 'Data', larg: 12, al: 'center' },
  { cab: 'Mês', larg: 11, al: 'center' },
  { cab: 'Cliente', larg: 28, al: 'left' },
  { cab: 'Produto', larg: 16, al: 'center' },
  { cab: 'Valor', larg: 14, al: 'center' },
  { cab: '%', larg: 8, al: 'center' },
  { cab: 'Calculo Comissão', larg: 17, al: 'center' },
  { cab: 'Comissão Paga', larg: 17, al: 'center' },
  { cab: 'Observações', larg: 32, al: 'left' },
  { cab: 'ref', larg: 12, al: 'left' }, // técnica (oculta): liga a linha à comissão certa
]
const C_VALOR = 6, C_PCT = 7, C_CALC = 8, C_PAGA = 9, C_REF = 11
const EUR = '#,##0.00 €'
const NAVY = 'FF0F1E2E'
const AZUL = 'FF1E63FF'
const CINZA = 'FFF7F9FC'
const BORDA = 'FFD9E1EC'
const AMARELO = 'FFFFF7D6'

const borda = () => ({
  top: { style: 'thin', color: { argb: BORDA } },
  left: { style: 'thin', color: { argb: BORDA } },
  bottom: { style: 'thin', color: { argb: BORDA } },
  right: { style: 'thin', color: { argb: BORDA } },
})
const fundo = (argb: string) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

function nomeMes(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : MESES[d.getMonth()]
}

/** Gera e descarrega o .xlsx do mapa. */
export async function exportarExcel(linhas: Comissao[], mref: string, produtos: Produto[], nomeFicheiro: string) {
  const ExcelJS = await carregarExcelJS()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(mref, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = COLUNAS.map((c) => ({ width: c.larg }))

  // ---- cabeçalho ----
  const cab = ws.addRow(COLUNAS.map((c) => c.cab))
  cab.height = 22
  cab.eachCell((cel: any) => {
    cel.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cel.fill = fundo(NAVY)
    cel.alignment = { horizontal: 'center', vertical: 'middle' }
    cel.border = borda()
  })

  // ---- linhas ----
  const primeira = 2
  linhas.forEach((c, i) => {
    const n = primeira + i
    const r = ws.addRow([
      isNaN(Number(c.numero_projeto)) ? c.numero_projeto : Number(c.numero_projeto),
      c.data_adjudicacao ? new Date(c.data_adjudicacao) : null,
      nomeMes(c.data_adjudicacao),
      c.cliente?.nome || '',
      c.produto?.tipo || '',
      Number(c.valor_venda || 0),
      Number(c.percentagem || 0) / 100,
      // fórmula: muda sozinha se ele corrigir a %
      { formula: `F${n}*G${n}` },
      null, // "Comissão Paga" - é ele que preenche
      c.observacoes || '',
      c.id,
    ])
    r.height = 18
    r.eachCell({ includeEmpty: true }, (cel: any, col: number) => {
      const def = COLUNAS[col - 1]
      if (!def) return
      cel.alignment = { horizontal: def.al, vertical: 'middle', wrapText: false }
      cel.border = borda()
      if (i % 2 === 1) cel.fill = fundo(CINZA) // listrado suave
    })
    r.getCell(2).numFmt = 'dd/mm/yyyy'
    r.getCell(C_VALOR).numFmt = EUR
    r.getCell(C_PCT).numFmt = '0.0%'
    r.getCell(C_CALC).numFmt = EUR
    r.getCell(C_PAGA).numFmt = EUR
    // a célula que ele preenche fica destacada
    r.getCell(C_PAGA).fill = fundo(AMARELO)
  })
  const ultima = primeira + linhas.length - 1

  // ---- totais: soma do que ele marcou + bónus + a pagar ----
  ws.addRow([])
  const linhaTotal = ws.lastRow.number + 1
  const linhaBonus = linhaTotal + 1
  const linhaPagar = linhaTotal + 2

  const bloco = (rotulo: string, valor: any, destaque: boolean) => {
    const r = ws.addRow([])
    r.height = 20
    const cr = r.getCell(C_CALC)
    cr.value = rotulo
    cr.font = { bold: true, size: 11, color: { argb: destaque ? 'FFFFFFFF' : NAVY } }
    cr.alignment = { horizontal: 'right', vertical: 'middle' }
    cr.fill = fundo(destaque ? AZUL : CINZA)
    cr.border = borda()
    const cv = r.getCell(C_PAGA)
    cv.value = valor
    cv.numFmt = EUR
    cv.font = { bold: true, size: 11, color: { argb: destaque ? 'FFFFFFFF' : NAVY } }
    cv.alignment = { horizontal: 'center', vertical: 'middle' }
    cv.fill = fundo(destaque ? AZUL : AMARELO)
    cv.border = borda()
    return r
  }

  bloco('Total comissão paga', linhas.length ? { formula: `SUM(I${primeira}:I${ultima})` } : 0, false)
  bloco('Bónus', null, false)
  bloco('A PAGAR', { formula: `I${linhaTotal}+I${linhaBonus}` }, true)

  // ---- legenda das taxas ----
  ws.addRow([])
  const tit = ws.addRow([])
  tit.getCell(1).value = 'Taxas por produto'
  tit.getCell(1).font = { bold: true, color: { argb: NAVY } }
  for (const p of produtos) {
    const r = ws.addRow([p.tipo, Number(p.percentagem_comissao || 0) / 100])
    r.getCell(2).numFmt = '0.0%'
    r.getCell(2).alignment = { horizontal: 'center' }
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 10 } }
  ws.getColumn(C_REF).hidden = true

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
  cliente: string
  produto: string
  pago: number | null   // null = célula vazia (sem alteração); -1 = "PAGO"
  pct: number | null
  obs: string | null
}
export type LeituraExcel = { linhas: LinhaLida[]; bonus: number | null }

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

/** Lê o .xlsx devolvido: linhas preenchidas + bónus. Localiza colunas pelo cabeçalho. */
export async function lerExcel(file: File): Promise<LeituraExcel> {
  const ExcelJS = await carregarExcelJS()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('O ficheiro não tem nenhuma folha.')

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
  const cCli = cabs['cliente']
  const cProd = cabs['produto']
  if (!cPago) throw new Error('Não encontrei a coluna "Comissão Paga" no ficheiro.')

  const linhas: LinhaLida[] = []
  let bonus: number | null = null

  ws.eachRow((row: any, n: number) => {
    if (n === 1) return

    // bloco de totais no fim: "Bónus" com o valor na coluna ao lado
    const rotulo = texto(row.getCell(C_CALC).value).trim().toLowerCase()
    if (/^b[oó]nus$/.test(rotulo)) {
      const v = lerValor(row.getCell(cPago).value)
      if (typeof v === 'number') bonus = v
      return
    }
    if (rotulo.startsWith('total') || rotulo.startsWith('a pagar')) return

    const id = cRef ? texto(row.getCell(cRef).value).trim() : ''
    const numero = texto(row.getCell(cNum).value).trim()
    if (!id && !numero) return
    if (!id && isNaN(Number(numero))) return // legenda de taxas

    const pagoRaw = lerValor(row.getCell(cPago).value)
    const pctRaw = cPct ? lerValor(row.getCell(cPct).value) : null
    linhas.push({
      id: id || null,
      numero,
      cliente: cCli ? texto(row.getCell(cCli).value).trim() : '',
      produto: cProd ? texto(row.getCell(cProd).value).trim() : '',
      pago: pagoRaw === 'PAGO' ? -1 : (pagoRaw as number | null),
      pct: typeof pctRaw === 'number' ? (pctRaw <= 1 ? pctRaw * 100 : pctRaw) : null,
      obs: cObs ? texto(row.getCell(cObs).value).trim() : null,
    })
  })

  return { linhas, bonus }
}
