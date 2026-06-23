import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import type { Comissao, Envio } from '../types'
import { eur, parseMref, MESES } from '../utils'

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
  const totComissao = doAno.reduce((s, c) => s + Number(c.comissao_calculada || 0), 0)
  const totPago = doAno.reduce((s, c) => s + Number(c.valor_pago || 0), 0)
  const porPagar = doAno.filter((c) => c.estado !== 'paga').reduce((s, c) => s + Number(c.comissao_calculada || 0), 0)

  // bónus: por mês fica o maior valor entre envios (evita contar reenvios duas vezes)
  const bonusPorMes: Record<string, number> = {}
  envios.forEach((e) => {
    if (parseMref(e.mes_referencia).year !== ano) return
    bonusPorMes[e.mes_referencia] = Math.max(bonusPorMes[e.mes_referencia] || 0, Number(e.bonus || 0))
  })
  const totBonus = Object.values(bonusPorMes).reduce((s, v) => s + v, 0)

  // comissão por mês (Jan..Dez)
  const porMes = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const linhas = doAno.filter((c) => parseMref(c.mes_referencia).month === m)
    return { mes: MESES[i], comissao: linhas.reduce((s, c) => s + Number(c.comissao_calculada || 0), 0), n: linhas.length }
  })
  const maxMes = Math.max(1, ...porMes.map((x) => x.comissao))
  const melhor = porMes.reduce((a, b) => (b.comissao > a.comissao ? b : a), porMes[0])

  // top clientes por comissão
  const porCliente: Record<string, { nome: string; comissao: number; n: number }> = {}
  doAno.forEach((c) => {
    const nome = c.cliente?.nome || '—'
    porCliente[nome] ||= { nome, comissao: 0, n: 0 }
    porCliente[nome].comissao += Number(c.comissao_calculada || 0)
    porCliente[nome].n += 1
  })
  const topClientes = Object.values(porCliente).sort((a, b) => b.comissao - a.comissao).slice(0, 5)

  const Card = ({ label, valor, cor }: { label: string; valor: string; cor?: string }) => (
    <div className="bg-white rounded-xl border p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold ${cor || 'text-host-navy'}`}>{valor}</div>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Card label={`Comissão ganha (${ano})`} valor={eur(totComissao)} />
        <Card label="Já pago" valor={eur(totPago)} cor="text-green-700" />
        <Card label="Por pagar" valor={eur(porPagar)} cor="text-amber-600" />
        <Card label="Bónus recebido" valor={eur(totBonus)} cor="text-host-blue" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Gráfico mensal */}
        <div className="lg:col-span-2 bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-host-navy">Comissão por mês</h3>
            {melhor && melhor.comissao > 0 && <span className="text-xs text-gray-500">Melhor mês: <b className="text-host-navy">{melhor.mes}</b> ({eur(melhor.comissao)})</span>}
          </div>
          <div className="flex items-end gap-1.5 h-44">
            {porMes.map((m) => (
              <div key={m.mes} className="flex-1 flex flex-col items-center justify-end h-full" title={`${m.mes}: ${eur(m.comissao)} · ${m.n} projeto(s)`}>
                <div className="w-full rounded-t bg-host-blue/80 hover:bg-host-blue transition-all" style={{ height: `${(m.comissao / maxMes) * 100}%` }} />
                <span className="text-[10px] text-gray-400 mt-1">{m.mes.slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top clientes */}
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-semibold text-host-navy mb-3">Top clientes</h3>
          {topClientes.length === 0 && <p className="text-sm text-gray-400">Sem dados.</p>}
          <div className="space-y-2">
            {topClientes.map((c, i) => (
              <div key={c.nome} className="flex items-center justify-between text-sm">
                <span className="truncate" title={c.nome}><span className="text-gray-400 mr-1">{i + 1}.</span>{c.nome} <span className="text-gray-400 text-xs">({c.n})</span></span>
                <b className="text-host-navy whitespace-nowrap ml-2">{eur(c.comissao)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-4">{doAno.length} projeto(s) em {ano}.</p>
    </div>
  )
}
