import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import type { Comissao, Definicoes, Envio, Estado } from '../types'
import { eur, fmtDate, mrefLabel, platformUrl } from '../utils'

const estadoCls: Record<Estado, string> = {
  pendente: 'bg-gray-100 text-gray-700',
  parcial: 'bg-orange-100 text-orange-700',
  paga: 'bg-green-100 text-green-700',
}

// Vista só de leitura de um mapa de comissões (para contabilidade/RH em CC).
// Sem edição, sem bónus/piadas do diretor, sem Revisto. Link vivo: mostra sempre o estado atual.
export default function VerEnvio() {
  const { token } = useParams()
  const [envio, setEnvio] = useState<Envio | null>(null)
  const [def, setDef] = useState<Definicoes | null>(null)
  const [linhas, setLinhas] = useState<Comissao[]>([])
  const [links, setLinks] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const registado = useRef(false)

  useEffect(() => {
    (async () => {
      const { data: e } = await supabase.from('envios').select('*').eq('token', token).maybeSingle()
      if (!e) { setErro('Link inválido ou expirado.'); setLoading(false); return }
      setEnvio(e as any)
      // avisa o gestor quando a contabilidade abre (1ª vez), distinto do diretor
      if (!registado.current && !(e as any).cc_aberto_em) {
        registado.current = true
        supabase.from('envios').update({ cc_aberto_em: new Date().toISOString() }).eq('id', (e as any).id)
        fetch('/api/abriu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, who: 'cc' }) }).catch(() => {})
      }
      const [{ data: d }, { data: c }] = await Promise.all([
        supabase.from('definicoes').select('*').eq('id', 1).single(),
        supabase.from('comissoes').select('*, cliente:clientes(*), produto:produtos(*)').in('id', (e as any).comissao_ids),
      ])
      setDef(d as any)
      setLinhas((c as any) || [])
      const nums = [...new Set((((c as any) || []) as any[]).map((x) => String(x.numero_projeto)))]
      const { data: lk } = await supabase.from('projeto_links').select('numero_projeto,data_id').in('numero_projeto', nums.length ? nums : ['__none__'])
      setLinks(Object.fromEntries(((lk as any) || []).map((x: any) => [x.numero_projeto, x.data_id])))
      setLoading(false)
    })()
  }, [token])

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">A carregar…</div>
  if (erro) return <div className="min-h-screen flex items-center justify-center text-gray-600">{erro}</div>

  const totCom = linhas.reduce((s, c) => s + Number(c.comissao_calculada || 0), 0)
  const totPago = linhas.reduce((s, c) => s + Number(c.valor_pago || 0), 0)
  const bonus = Number(envio?.bonus || 0)
  const aPagar = totPago + bonus

  return (
    <div className="min-h-screen">
      <header className="relative overflow-hidden bg-gradient-to-br from-host-ink via-host-navy to-[#1c3047] text-white shadow-elevated">
        <div className="absolute -top-24 -right-16 w-80 h-80 rounded-full bg-host-blue/20 blur-3xl pointer-events-none" />
        <div className="relative max-w-[1100px] mx-auto px-6 py-6 flex items-center gap-4">
          <img src="/host-white.png" alt="Host" className="h-7" />
          <div className="ml-auto text-right">
            <div className="font-semibold leading-tight">{def?.gestor_nome}</div>
            <div className="text-xs text-white/70">{def?.gestor_cargo}</div>
          </div>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 py-6 animate-fade-up">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-host-navy">Mapa de comissões — {envio && mrefLabel(envio.mes_referencia)}</h1>
          <p className="text-sm text-gray-500">Vista só de leitura · gerido por {def?.gestor_nome}</p>
        </div>

        {/* Telemóvel: cartões */}
        <div className="md:hidden space-y-3">
          {linhas.map((c) => (
            <div key={c.id} className={`rounded-xl border p-3 ${c.estado === 'paga' ? 'bg-green-50 border-green-200' : c.estado === 'parcial' ? 'bg-orange-50 border-orange-200' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold">
                  {links[c.numero_projeto] ? <a href={platformUrl(links[c.numero_projeto])} target="_blank" rel="noreferrer" className="text-host-blue underline">{c.numero_projeto}</a> : c.numero_projeto}
                  <span className="text-gray-400 font-normal text-xs ml-2">{fmtDate(c.data_adjudicacao)}</span>
                </div>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${estadoCls[c.estado]}`}>{c.estado}</span>
              </div>
              <div className="font-medium text-host-navy">{c.cliente?.nome}</div>
              <div className="text-sm text-gray-500">{c.produto?.tipo} · venda {eur(c.valor_venda)}</div>
              <div className="flex justify-between text-sm mt-1"><span>Comissão <b>{eur(c.comissao_calculada)}</b></span><span className="text-gray-500">Pago {c.valor_pago != null ? eur(c.valor_pago) : '—'}</span></div>
            </div>
          ))}
        </div>

        {/* Ecrã grande: tabela */}
        <div className="hidden md:block bg-white rounded-xl border overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="px-3 py-2 font-medium">Nº</th>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Produto</th>
                <th className="px-3 py-2 font-medium text-right">Valor</th>
                <th className="px-3 py-2 font-medium text-right">Comissão</th>
                <th className="px-3 py-2 font-medium text-right">Pago</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => (
                <tr key={c.id} className={`border-b last:border-0 ${c.estado === 'paga' ? 'bg-green-50' : c.estado === 'parcial' ? 'bg-orange-50' : ''}`}>
                  <td className="px-3 py-1.5 whitespace-nowrap">{links[c.numero_projeto] ? <a href={platformUrl(links[c.numero_projeto])} target="_blank" rel="noreferrer" className="text-host-blue hover:underline">{c.numero_projeto}</a> : c.numero_projeto}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(c.data_adjudicacao)}</td>
                  <td className="px-3 py-1.5">{c.cliente?.nome}</td>
                  <td className="px-3 py-1.5">{c.produto?.tipo}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">{eur(c.valor_venda)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold whitespace-nowrap">{eur(c.comissao_calculada)}</td>
                  <td className="px-3 py-1.5 text-right text-gray-500 whitespace-nowrap">{c.valor_pago != null ? eur(c.valor_pago) : '—'}</td>
                  <td className="px-3 py-1.5"><span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${estadoCls[c.estado]}`}>{c.estado}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totais */}
        <div className="mt-4 relative overflow-hidden bg-gradient-to-br from-host-ink via-host-navy to-[#1c3047] text-white rounded-xl p-5 shadow-elevated md:max-w-md md:ml-auto">
          <div className="absolute -top-12 -right-8 w-44 h-44 rounded-full bg-host-blue/20 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex justify-between text-sm text-white/70"><span>Total comissões ({linhas.length})</span><span>{eur(totCom)}</span></div>
            <div className="flex justify-between text-sm text-white/70"><span>Marcado para pagar</span><span>{eur(totPago)}</span></div>
            <div className="flex justify-between text-sm text-white/70"><span>Bónus</span><span>{eur(bonus)}</span></div>
            <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t border-white/20"><span>A pagar — {envio && mrefLabel(envio.mes_referencia)}</span><span>{eur(aPagar)}</span></div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6 italic">Host Hotel Systems · Move beyond expectations.</p>
      </main>
    </div>
  )
}
