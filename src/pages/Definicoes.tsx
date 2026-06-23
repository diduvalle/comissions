import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { Definicoes as Def, Produto } from '../types'

export default function Definicoes() {
  const [def, setDef] = useState<Def | null>(null)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [novoTipo, setNovoTipo] = useState('')
  const [novoPct, setNovoPct] = useState('')
  const [msg, setMsg] = useState('')

  async function carregar() {
    const [{ data: d }, { data: p }] = await Promise.all([
      supabase.from('definicoes').select('*').eq('id', 1).single(),
      supabase.from('produtos').select('*').order('ordem'),
    ])
    setDef(d as any)
    setProdutos((p as any) || [])
  }
  useEffect(() => { carregar() }, [])

  async function guardarDef() {
    if (!def) return
    const { error } = await supabase.from('definicoes').update(def).eq('id', 1)
    setMsg(error ? 'Erro: ' + error.message : 'Definições guardadas ✓')
    setTimeout(() => setMsg(''), 2500)
  }

  async function guardarProduto(p: Produto) {
    await supabase.from('produtos').update({ tipo: p.tipo, percentagem_comissao: p.percentagem_comissao, ativo: p.ativo }).eq('id', p.id)
    carregar()
  }

  async function addProduto() {
    if (!novoTipo || !novoPct) return
    await supabase.from('produtos').insert({ tipo: novoTipo, percentagem_comissao: Number(novoPct), ordem: produtos.length + 1 })
    setNovoTipo(''); setNovoPct(''); carregar()
  }

  if (!def) return <div className="text-gray-500">A carregar…</div>
  const set = (k: keyof Def, v: any) => setDef({ ...def, [k]: v })

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold text-host-navy">Definições</h1>

      {/* Validador por produto */}
      <section className="bg-white rounded-xl border p-5">
        <h2 className="font-semibold text-host-navy mb-1">Comissão por produto</h2>
        <p className="text-sm text-gray-500 mb-4">Percentagem aplicada a cada tipo de produto nas novas linhas.</p>
        <div className="space-y-2">
          {produtos.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3">
              <input value={p.tipo} onChange={(e) => { const c = [...produtos]; c[i] = { ...p, tipo: e.target.value }; setProdutos(c) }} className="flex-1 border rounded px-2 py-1.5" />
              <div className="flex items-center gap-1">
                <input type="number" step="0.5" value={p.percentagem_comissao} onChange={(e) => { const c = [...produtos]; c[i] = { ...p, percentagem_comissao: Number(e.target.value) }; setProdutos(c) }} className="w-20 text-right border rounded px-2 py-1.5" />
                <span className="text-gray-500">%</span>
              </div>
              <label className="text-xs text-gray-500 flex items-center gap-1"><input type="checkbox" checked={p.ativo} onChange={(e) => { const c = [...produtos]; c[i] = { ...p, ativo: e.target.checked }; setProdutos(c) }} /> ativo</label>
              <button onClick={() => guardarProduto(produtos[i])} className="text-host-blue text-sm font-semibold">Guardar</button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-4 pt-4 border-t">
          <input value={novoTipo} onChange={(e) => setNovoTipo(e.target.value)} placeholder="Novo produto" className="flex-1 border rounded px-2 py-1.5" />
          <input type="number" step="0.5" value={novoPct} onChange={(e) => setNovoPct(e.target.value)} placeholder="%" className="w-20 text-right border rounded px-2 py-1.5" />
          <button onClick={addProduto} className="bg-host-blue text-white text-sm font-semibold rounded px-3 py-1.5">+ Adicionar</button>
        </div>
      </section>

      {/* Email ao diretor */}
      <section className="bg-white rounded-xl border p-5 space-y-3">
        <h2 className="font-semibold text-host-navy">Email para o diretor</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Nome do diretor<input value={def.diretor_nome} onChange={(e) => set('diretor_nome', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label className="text-sm">Email do diretor<input value={def.diretor_email} onChange={(e) => set('diretor_email', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
        </div>
        <label className="text-sm block">Assunto<input value={def.email_assunto} onChange={(e) => set('email_assunto', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
        <label className="text-sm block">Corpo do email
          <textarea value={def.email_corpo} onChange={(e) => set('email_corpo', e.target.value)} rows={6} className="mt-1 w-full border rounded px-2 py-1.5 font-mono text-xs" />
        </label>
        <p className="text-xs text-gray-400">Marcadores: <code>{'{mes}'}</code>, <code>{'{n}'}</code>, <code>{'{total}'}</code>, <code>{'{link}'}</code></p>
      </section>

      {/* Conta / PIN */}
      <section className="bg-white rounded-xl border p-5 space-y-3">
        <h2 className="font-semibold text-host-navy">Identificação & acesso</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Nome (gestor)<input value={def.gestor_nome} onChange={(e) => set('gestor_nome', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label className="text-sm">Cargo<input value={def.gestor_cargo} onChange={(e) => set('gestor_cargo', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label className="text-sm">PIN de acesso<input value={def.pin} onChange={(e) => set('pin', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button onClick={guardarDef} className="bg-host-blue text-white font-semibold rounded-lg px-5 py-2.5">Guardar definições</button>
        {msg && <span className="text-sm text-green-600">{msg}</span>}
      </div>
    </div>
  )
}
