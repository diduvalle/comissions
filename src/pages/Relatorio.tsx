// Relatório de desempenho comercial - página A4 pensada para "Guardar como PDF".
// Usa os mesmos cálculos e gráficos da secção Vendas do Analytics (nunca números diferentes).
// Nota: nada aqui usa <header>/<footer>/<main>, porque o CSS de impressão esconde-os.
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import type { Comissao } from '../types'
import { COR_SAAS, COR_PONTUAL, variacao, fmtVar, eur0 as eur } from '../vendas'
import {
  calcularVendas, textoPeriodo, Kpi, Var, GraficoMensal, TabelaMensal,
  GraficoMrrAcumulado, MixPorAno, ListaBarras,
} from './Vendas'

export default function Relatorio() {
  const [params] = useSearchParams()
  const ano = Number(params.get('ano')) || new Date().getFullYear()
  const [comissoes, setComissoes] = useState<Comissao[]>([])
  const [def, setDef] = useState<{ gestor_nome?: string; gestor_cargo?: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: d }] = await Promise.all([
        supabase.from('comissoes').select('*, cliente:clientes(nome), produto:produtos(tipo)'),
        supabase.from('definicoes').select('gestor_nome,gestor_cargo').eq('id', 1).single(),
      ])
      setComissoes((c as any) || [])
      setDef((d as any) || null)
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    document.title = `Relatório de desempenho ${ano} - ${def?.gestor_nome || ''}`.trim()
  }, [ano, def])

  if (loading) return <div className="p-10 text-gray-500">A preparar o relatório…</div>

  const v = calcularVendas(comissoes, ano)
  const { p, A, B } = v
  const periodo = textoPeriodo(ano)
  const anoAnt = ano - 1
  const ref = p.emCurso ? `no mesmo período de ${anoAnt}` : `em ${anoAnt}`
  const vTotal = variacao(A.total, B.total)
  const vMrr = variacao(A.mrr, B.mrr)
  const ticketA = A.n ? A.total / A.n : 0
  const acumulado = v.acumulado.length ? v.acumulado[v.acumulado.length - 1].acumulado : 0
  const hoje = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // frase de abertura, escrita a partir dos números (o que a direção lê primeiro)
  const sobeDesce = (x: number | null) => (x == null ? '' : x >= 0 ? `mais ${fmtVar(x).replace('+', '')}` : `menos ${fmtVar(x).replace('-', '')}`)
  const resumo = [
    `${p.emCurso ? `De ${periodo.replace(' - ', ' a ')} de ${ano}` : `Em ${ano}`}, o valor total vendido foi de ${eur(A.total)}`,
    vTotal != null ? `, ${sobeDesce(vTotal)} do que ${ref}` : '',
    '. ',
    `A nova receita recorrente (MRR) foi de ${eur(A.mrr)}/mês`,
    vMrr != null ? ` (${sobeDesce(vMrr)})` : '',
    `, e as vendas pontuais somaram ${eur(A.pontual)}.`,
  ].join('')

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* barra de ações (não sai no PDF) */}
      <div className="no-print sticky top-0 z-10 bg-host-navy text-white">
        <div className="max-w-[210mm] mx-auto px-4 py-2.5 flex items-center gap-3">
          <span className="text-sm font-semibold">Relatório de desempenho {ano}</span>
          <span className="text-xs text-white/60 hidden sm:inline">No ecrã de impressão, escolhe <b>"Guardar como PDF"</b> no destino.</span>
          <button onClick={() => window.print()} className="ml-auto bg-white text-host-navy text-sm font-semibold rounded-lg px-4 py-1.5 hover:bg-gray-100">
            Guardar PDF
          </button>
          <button onClick={() => window.close()} className="text-sm text-white/70 hover:text-white">Fechar</button>
        </div>
      </div>

      <div className="relatorio max-w-[210mm] mx-auto bg-white shadow-elevated print:shadow-none my-6 print:my-0 px-[12mm] py-[12mm] print:p-0 text-host-navy">
        {/* ===== Capa / cabeçalho ===== */}
        <div className="flex items-start justify-between gap-6 pb-5 border-b-2 border-host-navy">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-host-blue">Relatório de desempenho comercial</div>
            <div className="text-[26px] font-bold leading-tight mt-1">{def?.gestor_nome}</div>
            <div className="text-sm text-gray-600">{def?.gestor_cargo}</div>
          </div>
          <img src="/host-color.png" alt="Host Hotel Systems" className="h-9 mt-1" />
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-gray-600 mt-3 mb-5">
          <span>Período: <b className="text-host-navy">{periodo} {ano}</b>{p.emCurso && <> · comparado com o mesmo período de {anoAnt}</>}</span>
          <span>Emitido em {hoje}</span>
        </div>

        {/* ===== Resumo executivo ===== */}
        <div className="break-inside-avoid">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-2">Resumo executivo</h2>
          <p className="text-[15px] leading-relaxed mb-4">{resumo}</p>
          <div className="grid grid-cols-4 gap-2.5 mb-3">
            <Kpi destaque label="Novo MRR (SaaS)" valor={eur(A.mrr)} unidade="/mês" cor={COR_SAAS}
              sub={<><Var a={A.mrr} b={B.mrr} /><div className="text-gray-500">{anoAnt}: {eur(B.mrr)}/mês</div></>} />
            <Kpi label="SaaS anualizado" valor={eur(A.anual)} cor={COR_SAAS}
              sub={<><Var a={A.anual} b={B.anual} /><div className="text-gray-500">{anoAnt}: {eur(B.anual)}</div></>} />
            <Kpi label="Vendas pontuais" valor={eur(A.pontual)} cor={COR_PONTUAL}
              sub={<><Var a={A.pontual} b={B.pontual} /><div className="text-gray-500">{anoAnt}: {eur(B.pontual)}</div></>} />
            <Kpi label="Valor total vendido" valor={eur(A.total)}
              sub={<><Var a={A.total} b={B.total} /><div className="text-gray-500">{anoAnt}: {eur(B.total)}</div></>} />
          </div>
          <div className="grid grid-cols-3 gap-2.5 text-xs mb-6">
            <div className="rounded-lg bg-gray-50 px-3 py-2"><span className="text-gray-500">Nº de vendas</span><div className="text-base font-bold tabular-nums">{A.n} <span className="text-xs font-normal"><Var a={A.n} b={B.n} /></span></div></div>
            <div className="rounded-lg bg-gray-50 px-3 py-2"><span className="text-gray-500">Valor médio por venda</span><div className="text-base font-bold tabular-nums">{eur(ticketA)}</div></div>
            <div className="rounded-lg bg-gray-50 px-3 py-2"><span className="text-gray-500">Novo MRR acumulado (histórico)</span><div className="text-base font-bold tabular-nums" style={{ color: COR_SAAS }}>{eur(acumulado)}/mês</div></div>
          </div>
        </div>

        <div className="break-inside-avoid mb-6">
          <GraficoMensal mesesA={v.mesesA} mesesB={v.mesesB} ano={ano} mesFim={p.mesFim} emCurso={p.emCurso} soPeriodo parcialAnt={v.parcialAnt} />
        </div>

        {/* ===== Página 2: detalhe ===== */}
        <div className="break-before-page">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-2">Mês a mês</h2>
          <div className="break-inside-avoid mb-6">
            <TabelaMensal mesesA={v.mesesA} mesesB={v.mesesB} ano={ano} mesFim={p.mesFim} emCurso={p.emCurso} A={A} B={B} periodo={periodo} parcialAnt={v.parcialAnt} diaFim={v.diaFim} />
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="break-inside-avoid">
              <ListaBarras titulo="Por produto"
                itens={v.produtosA.map((x) => ({ nome: x.tipo, total: x.total, cor: x.saas ? COR_SAAS : COR_PONTUAL, detalhe: `${x.n}` }))}
              />
              <p className="text-[10px] text-gray-500 mt-2 leading-snug">{"Desde dez/2025, Setup Fee e SaaS > 24 passaram a ser registados à parte (antes contavam como Serviços e SaaS < 24). Por isso não se compara produto a produto com anos anteriores; a comparação válida é pontual vs recorrente."}</p>
            </div>
            <div className="break-inside-avoid">
              <ListaBarras titulo="Principais clientes"
                itens={v.clientesA.slice(0, 10).map((x) => ({ nome: x.nome, total: x.total, cor: x.mrr > 0 ? COR_SAAS : COR_PONTUAL }))} />
            </div>
          </div>
        </div>

        {/* ===== Página 3: tendência ===== */}
        <div className="break-before-page">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">Tendência</h2>
          <div className="break-inside-avoid mb-6"><GraficoMrrAcumulado dados={v.acumulado} /></div>
          <div className="break-inside-avoid mb-6"><MixPorAno dados={v.mixAnos} anoAtual={ano} /></div>

          <div className="break-inside-avoid mb-6 rounded-xl border p-4">
            <h3 className="font-semibold mb-2">Comissões geradas no período</h3>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold tabular-nums">{eur(A.comissao)}</span>
              <span className="text-sm"><Var a={A.comissao} b={B.comissao} /> <span className="text-gray-500">({anoAnt}: {eur(B.comissao)})</span></span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">Comissão calculada sobre as vendas do período, independentemente de já ter sido paga.</p>
          </div>

          {/* ===== Notas: o que torna os números defensáveis ===== */}
          <div className="break-inside-avoid border-t pt-3 text-[10.5px] leading-relaxed text-gray-600">
            <div className="font-semibold text-gray-700 mb-1">Notas metodológicas</div>
            <ul className="list-disc ml-4 space-y-0.5">
              <li><b>Fonte:</b> vendas com comissão registada na aplicação de gestão de comissões. Não substitui os registos contabilísticos da empresa.</li>
              <li><b>Data:</b> cada venda conta no mês da sua data de adjudicação.</li>
              {p.emCurso && <li><b>Comparação justa:</b> o ano em curso ({periodo} {ano}) é comparado com o mesmo intervalo de dias de {anoAnt}, nunca com o ano completo. O mês em curso não é comparado, por estar incompleto.</li>}
              <li><b>SaaS:</b> "novo MRR" é a mensalidade das novas subscrições vendidas; "anualizado" = mensalidade × 12. <b>Valor total vendido</b> = vendas pontuais + SaaS anualizado (valor do primeiro ano).</li>
              <li><b>Novo MRR acumulado</b> soma as mensalidades vendidas desde o início do registo e não desconta cancelamentos.</li>
              <li><b>Arredondamentos:</b> os valores são apresentados ao euro; a soma das linhas pode diferir do total em ±1 €.</li>
            </ul>
            <div className="mt-3 text-gray-400">Host Hotel Systems · Move beyond expectations.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
