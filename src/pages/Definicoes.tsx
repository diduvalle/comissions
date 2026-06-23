import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { Definicoes as Def, Produto } from '../types'

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-xl border">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-5 py-4">
        <span className="font-semibold text-host-navy">{title}</span>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-5 pb-5 border-t pt-4">{children}</div>}
    </div>
  )
}

export default function Definicoes() {
  const [def, setDef] = useState<Def | null>(null)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [novoTipo, setNovoTipo] = useState('')
  const [novoPct, setNovoPct] = useState('')
  const [msg, setMsg] = useState('')
  const [linksText, setLinksText] = useState('')
  const [linksMsg, setLinksMsg] = useState('')

  async function importarLinks() {
    const linhas = linksText.split('\n').map((l) => l.trim()).filter(Boolean)
    const rows: { numero_projeto: string; data_id: string }[] = []
    for (const l of linhas) {
      const mm = l.match(/(\d{4,6})\D+data=(\d+)/)
      if (mm) rows.push({ numero_projeto: mm[1], data_id: mm[2] })
    }
    if (!rows.length) { setLinksMsg('Nenhuma linha válida. Formato: «22182 https://…data=12074…» (nº seguido do URL).'); return }
    const { error } = await supabase.from('projeto_links').upsert(rows, { onConflict: 'numero_projeto' })
    setLinksMsg(error ? 'Erro: ' + error.message : `✓ ${rows.length} links importados.`)
    if (!error) setLinksText('')
  }

  async function carregar() {
    const [{ data: d }, { data: p }] = await Promise.all([
      supabase.from('definicoes').select('*').eq('id', 1).single(),
      supabase.from('produtos').select('*').order('ordem'),
    ])
    setDef(d as any); setProdutos((p as any) || [])
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

  // Pré-visualização do email (valores de exemplo)
  const M = (s: string) => (s || '').split('{mes}').join('Junho 2026').split('{n}').join('12').split('{total}').join('2.916,75 €').split('{diretor}').join(def.diretor_nome).split('{link}').join('(link)')
  const botaoPrev = <a className="inline-block bg-host-blue text-white px-4 py-2 rounded-lg text-sm font-semibold no-underline">{def.email_botao_label}</a>

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-host-navy">Definições</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="text-sm text-green-600">{msg}</span>}
          <button onClick={guardarDef} className="bg-host-blue text-white font-semibold rounded-lg px-5 py-2">Guardar</button>
        </div>
      </div>

      {/* Comissão por produto */}
      <Section title="Comissão por produto" defaultOpen>
        <p className="text-sm text-gray-500 mb-3">Percentagem aplicada a cada tipo de produto nas novas linhas.</p>
        <div className="space-y-2">
          {produtos.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3">
              <input value={p.tipo} onChange={(e) => { const c = [...produtos]; c[i] = { ...p, tipo: e.target.value }; setProdutos(c) }} className="flex-1 border rounded px-2 py-1.5" />
              <input type="number" step="0.5" value={p.percentagem_comissao} onChange={(e) => { const c = [...produtos]; c[i] = { ...p, percentagem_comissao: Number(e.target.value) }; setProdutos(c) }} className="w-20 text-right border rounded px-2 py-1.5" />
              <span className="text-gray-500">%</span>
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
      </Section>

      {/* Email estruturado */}
      <Section title="Email para o diretor">
        <div className="grid md:grid-cols-2 gap-5">
          <div className="space-y-3 text-sm">
            <label className="block">Assunto<input value={def.email_assunto} onChange={(e) => set('email_assunto', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
            <label className="block">Saudação<input value={def.email_saudacao} onChange={(e) => set('email_saudacao', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={def.email_mostrar_resumo} onChange={(e) => set('email_mostrar_resumo', e.target.checked)} /> Mostrar bloco de resumo (mês · nº linhas · total)</label>
            <label className="block">Corpo<textarea value={def.email_corpo} onChange={(e) => set('email_corpo', e.target.value)} rows={4} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">Texto do botão<input value={def.email_botao_label} onChange={(e) => set('email_botao_label', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
              <label className="block">Posição do botão
                <select value={def.email_botao_posicao} onChange={(e) => set('email_botao_posicao', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5">
                  <option value="antes">Antes do corpo</option>
                  <option value="depois">Depois do corpo</option>
                </select>
              </label>
            </div>
            <label className="block">Assinatura<textarea value={def.email_assinatura} onChange={(e) => set('email_assinatura', e.target.value)} rows={2} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
            <p className="text-xs text-gray-400">Marcadores: <code>{'{mes}'}</code> <code>{'{n}'}</code> <code>{'{total}'}</code> <code>{'{diretor}'}</code> <code>{'{link}'}</code></p>
          </div>
          {/* Pré-visualização */}
          <div>
            <div className="text-xs text-gray-400 mb-1">Pré-visualização</div>
            <div className="border rounded-lg p-4 bg-gray-50 text-sm leading-relaxed">
              <div className="text-xs text-gray-400 mb-2">Assunto: <b className="text-host-navy">{M(def.email_assunto)}</b></div>
              {def.email_saudacao && <p className="whitespace-pre-wrap">{M(def.email_saudacao)}</p>}
              {def.email_mostrar_resumo && <p className="bg-blue-50 rounded px-3 py-2 my-2"><b>Junho 2026</b> · 12 linhas · total 2.916,75 €</p>}
              {def.email_botao_posicao === 'antes' && <p className="my-2">{botaoPrev}</p>}
              {def.email_corpo && <p className="whitespace-pre-wrap">{M(def.email_corpo)}</p>}
              {def.email_botao_posicao === 'depois' && <p className="my-2">{botaoPrev}</p>}
              {def.email_assinatura && <p className="whitespace-pre-wrap mt-3">{M(def.email_assinatura)}</p>}
              <p className="text-[10px] text-gray-400 mt-3">Host Hotel Systems · Move beyond expectations.</p>
            </div>
          </div>
        </div>
      </Section>

      {/* Links da plataforma */}
      <Section title="Links da plataforma (nº de projeto clicável)">
        <p className="text-sm text-gray-500 mb-3">
          Cola uma linha por projeto, com o <b>nº</b> seguido do <b>URL</b> da plataforma. Exemplo:<br />
          <code className="text-xs">22182 https://platform.hostpms.com/?cmd=project&amp;data=12074&amp;ConnectionName=hostassist</code>
        </p>
        <textarea value={linksText} onChange={(e) => setLinksText(e.target.value)} rows={6}
          placeholder={'22182 https://platform.hostpms.com/?cmd=project&data=12074&...\n22244 https://platform.hostpms.com/?cmd=project&data=12147&...'}
          className="w-full border rounded px-2 py-1.5 font-mono text-xs" />
        <div className="flex items-center gap-3 mt-2">
          <button onClick={importarLinks} className="bg-host-blue text-white text-sm font-semibold rounded px-4 py-2">Importar links</button>
          {linksMsg && <span className="text-sm text-gray-600">{linksMsg}</span>}
        </div>
      </Section>

      {/* Identificação & acesso */}
      <Section title="Identificação & acesso">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Nome (gestor)<input value={def.gestor_nome} onChange={(e) => set('gestor_nome', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>Cargo<input value={def.gestor_cargo} onChange={(e) => set('gestor_cargo', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>Nome do diretor<input value={def.diretor_nome} onChange={(e) => set('diretor_nome', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>Email do diretor<input value={def.diretor_email} onChange={(e) => set('diretor_email', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>PIN de acesso<input value={def.pin} onChange={(e) => set('pin', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
        </div>
      </Section>
    </div>
  )
}
