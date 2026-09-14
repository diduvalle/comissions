import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { Definicoes as Def, Produto, Destinatario, Papel } from '../types'
import { MSG_DIR } from '../utils'

const PAPEL_LABEL: Record<Papel, string> = { leitura: 'Leitura', editar: 'Editar', submeter: 'Editar + Submeter' }
// A data final de uma recolha é sempre o dia em que a corres; logo a seguinte começa no dia a seguir.
const dData = (d: Date) => d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
const maisDias = (iso: string, n: number) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d }

// Atalho (bookmarklet): em Comercial > Propostas, recolhe valores + links + marca num clique.
const BOOKMARKLET = `javascript:(async()=>{try{var EXT={0:'Host',1:'Hstays',2:'Clever',3:'hey!',5:'ProfileNow'};var toISO=function(v){if(!v)return null;var dt=(v instanceof Date)?v:new Date(v);if(isNaN(dt.getTime()))return null;var y=dt.getFullYear();if(y<2015||y>2100)return null;return y+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0')};var pickDate=function(d){var ks=Object.keys(d);var tiers=[/^(datainicio|startdate|datastart|inicio|start|data|date)$/i,/inicio|start/i,/date|data/i];for(var t=0;t<tiers.length;t++){for(var i=0;i<ks.length;i++){if(tiers[t].test(ks[i])){var iso=toISO(d[ks[i]]);if(iso)return iso}}}return null};var S={},V=[],L=[];Ext.ComponentQuery.query('grid').forEach(function(g){var s=g.getStore&&g.getStore();if(s&&s.getCount&&s.getCount()>0&&s.getAt(0).data.hasOwnProperty('Nr')&&s.getAt(0).data.hasOwnProperty('TotalSum')&&s.getAt(0).data.hasOwnProperty('ProjectId')){s.each(function(r){var d=r.data;if(d.Deleted)return;var nr=String(d.Nr);if(!nr||S[nr])return;S[nr]=1;V.push({numero_projeto:nr,cliente:d.ProfileName||null,setup:Math.round(Number(d.TotalSum||0)*100)/100,saas_mes:Math.round(Number(d.SaaSSum||0)*100)/100,marca:EXT[d.ExtType]||'Outro',data_inicio:pickDate(d)});if(d.ProjectId>0)L.push({numero_projeto:nr,data_id:String(d.ProjectId)})})}});if(!V.length){alert('Abre Comercial > Propostas e os separadores das marcas primeiro.');return}var SB='https://bhurcadussdjohbngekq.supabase.co',K='sb_publishable_eKHXqa4aW7SwV8zx_euepA_ngZ3U5NU',H={apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'};try{var r1=await fetch(SB+'/rest/v1/projeto_valores?on_conflict=numero_projeto',{method:'POST',headers:H,body:JSON.stringify(V)});var r2=L.length?await fetch(SB+'/rest/v1/projeto_links?on_conflict=numero_projeto',{method:'POST',headers:H,body:JSON.stringify(L)}):{ok:true};if(r1.ok&&r2.ok){var cd=V.filter(function(x){return x.data_inicio}).length;try{await fetch(SB+'/rest/v1/recolhas',{method:'POST',headers:H,body:JSON.stringify({n_valores:V.length,n_links:L.length})})}catch(_){}alert('OK! '+V.length+' valores e '+L.length+' links atualizados no COMISSIONS. ('+cd+' com data)')}else{try{await navigator.clipboard.writeText(JSON.stringify(V))}catch(_){}alert('Envio direto bloqueado (CSP). Copiei '+V.length+' valores - cola no chat com atualiza.')}}catch(e){try{await navigator.clipboard.writeText(JSON.stringify(V))}catch(_){}alert('Envio direto bloqueado. Copiei os valores - cola no chat com atualiza.')}}catch(e){alert('Erro: '+(e.message||e))}})();`

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
  const [bmCopiado, setBmCopiado] = useState(false)
  const [dests, setDests] = useState<Destinatario[]>([])
  const [novoDest, setNovoDest] = useState<{ nome: string; email: string; papel: Papel }>({ nome: '', email: '', papel: 'leitura' })
  const [destMsg, setDestMsg] = useState('')
  const [recolha, setRecolha] = useState<any>(null)

  async function carregarDests() {
    const { data } = await supabase.from('destinatarios').select('*').order('ordem').order('criado_em')
    setDests((data as any) || [])
    const { data: r } = await supabase.from('recolhas').select('*').order('data_recolha', { ascending: false }).limit(1).maybeSingle()
    setRecolha(r || null)
  }
  async function guardarDest(d: Destinatario) {
    const { error } = await supabase.from('destinatarios').update({ nome: d.nome, email: d.email.trim(), papel: d.papel, ativo: d.ativo }).eq('id', d.id)
    setDestMsg(error ? 'Erro: ' + error.message : '✓ Guardado'); setTimeout(() => setDestMsg(''), 2000)
    if (!error) carregarDests()
  }
  async function addDest() {
    if (!novoDest.email.trim()) { setDestMsg('Falta o email.'); return }
    const { error } = await supabase.from('destinatarios').insert({ nome: novoDest.nome || null, email: novoDest.email.trim(), papel: novoDest.papel, ordem: dests.length + 1 })
    if (error) { setDestMsg(error.message.includes('duplicate') ? 'Esse email já existe.' : 'Erro: ' + error.message); return }
    setNovoDest({ nome: '', email: '', papel: 'leitura' }); carregarDests()
  }
  async function removeDest(id: string) {
    if (!confirm('Remover este destinatário?')) return
    await supabase.from('destinatarios').delete().eq('id', id); carregarDests()
  }

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
  useEffect(() => { carregar(); carregarDests() }, [])

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

      {/* Destinatários das comissões */}
      <Section title="Destinatários das comissões" defaultOpen>
        <p className="text-sm text-gray-500 mb-3">
          Quem recebe o mapa mensal e com que <b>poder</b>. <b>Leitura</b> = só vê · <b>Editar</b> = ajusta valores/%/bónus · <b>Editar + Submeter</b> = edita e fecha o mês. {destMsg && <span className="text-green-600 font-medium ml-2">{destMsg}</span>}
        </p>
        <div className="space-y-2">
          {dests.map((d, i) => (
            <div key={d.id} className="flex flex-wrap items-center gap-2">
              <input value={d.nome || ''} onChange={(e) => { const c = [...dests]; c[i] = { ...d, nome: e.target.value }; setDests(c) }} placeholder="Nome" className="w-40 border rounded px-2 py-1.5 text-sm" />
              <input value={d.email} onChange={(e) => { const c = [...dests]; c[i] = { ...d, email: e.target.value }; setDests(c) }} placeholder="email@empresa.com" className="flex-1 min-w-[180px] border rounded px-2 py-1.5 text-sm" />
              <select value={d.papel} onChange={(e) => { const c = [...dests]; c[i] = { ...d, papel: e.target.value as Papel }; setDests(c) }} className="border rounded px-2 py-1.5 text-sm">
                {(['leitura', 'editar', 'submeter'] as Papel[]).map((p) => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}
              </select>
              <label className="text-xs text-gray-500 flex items-center gap-1"><input type="checkbox" checked={d.ativo} onChange={(e) => { const c = [...dests]; c[i] = { ...d, ativo: e.target.checked }; setDests(c) }} /> ativo</label>
              <button onClick={() => guardarDest(dests[i])} className="text-host-blue text-sm font-semibold px-1">Guardar</button>
              <button onClick={() => removeDest(d.id)} className="text-gray-400 hover:text-red-600 text-sm px-1" title="Remover">✕</button>
            </div>
          ))}
          {dests.length === 0 && <p className="text-sm text-gray-400">Ainda sem destinatários - adiciona abaixo.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t">
          <input value={novoDest.nome} onChange={(e) => setNovoDest({ ...novoDest, nome: e.target.value })} placeholder="Nome" className="w-40 border rounded px-2 py-1.5 text-sm" />
          <input value={novoDest.email} onChange={(e) => setNovoDest({ ...novoDest, email: e.target.value })} placeholder="email@empresa.com" className="flex-1 min-w-[180px] border rounded px-2 py-1.5 text-sm" />
          <select value={novoDest.papel} onChange={(e) => setNovoDest({ ...novoDest, papel: e.target.value as Papel })} className="border rounded px-2 py-1.5 text-sm">
            {(['leitura', 'editar', 'submeter'] as Papel[]).map((p) => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}
          </select>
          <button onClick={addDest} className="bg-host-blue text-white text-sm font-semibold rounded px-3 py-1.5">+ Adicionar</button>
        </div>
        <p className="text-xs text-gray-400 mt-3">Na próxima fase, cada pessoa recebe um link à medida do seu papel e tu és notificada de tudo o que fazem (abrir, editar, submeter).</p>
      </Section>

      {/* Comissão por produto */}
      <Section title="Comissão por produto">
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

      {/* Mensagens automáticas ao diretor */}
      <Section title="Mensagens automáticas ao diretor">
        <p className="text-sm text-gray-500 mb-4">
          Textos que o Marco vê na <b>página de validação</b>, por momento. Marcadores: <code className="text-xs">{'{bonus}'}</code> (valor do bónus) · <code className="text-xs">{'{aPagar}'}</code> (total a pagar). Deixa em branco para usar o texto-base.
        </p>
        <div className="space-y-4 text-sm">
          <label className="block">
            <span className="font-medium text-host-navy">1. Antes de submeter - se NÃO houver bónus</span>
            <span className="block text-xs text-gray-400 mb-1">Aviso (pop-up) que aparece ao clicar "Revisto" sem ter posto bónus. Tem de confirmar para enviar.</span>
            <textarea value={def.msg_dir_confirma ?? MSG_DIR.confirma} onChange={(e) => set('msg_dir_confirma', e.target.value)} rows={4} className="w-full border rounded px-2 py-1.5" />
          </label>
          <label className="block">
            <span className="font-medium text-host-navy">2. Depois de submeter - COM bónus</span>
            <span className="block text-xs text-gray-400 mb-1">Mensagem de agradecimento que aparece após enviar, quando há bónus.</span>
            <textarea value={def.msg_dir_bonus ?? MSG_DIR.bonus} onChange={(e) => set('msg_dir_bonus', e.target.value)} rows={3} className="w-full border rounded px-2 py-1.5" />
          </label>
          <label className="block">
            <span className="font-medium text-host-navy">3. Depois de submeter - SEM bónus</span>
            <span className="block text-xs text-gray-400 mb-1">Mensagem que aparece após enviar, quando não há bónus.</span>
            <textarea value={def.msg_dir_sem_bonus ?? MSG_DIR.semBonus} onChange={(e) => set('msg_dir_sem_bonus', e.target.value)} rows={2} className="w-full border rounded px-2 py-1.5" />
          </label>
        </div>
        <p className="text-xs text-gray-400 mt-3">Carrega em <b>Guardar</b> (no topo) para aplicar.</p>
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

      {/* Atualizar valores da plataforma */}
      <Section title="Atualizar valores da plataforma (auto-preenchimento)">
        <p className="text-sm text-gray-500 mb-3">
          Os valores (Setup/SaaS) que pré-preenchem as novas linhas vêm da plataforma HostPMS. Como a plataforma exige a <b>tua sessão autenticada</b>, a atualização parte sempre de ti - mas fica a <b>1 clique</b> com o atalho abaixo.
        </p>

        {/* Que intervalo de datas usar na próxima recolha (evita buracos e memória) */}
        <div className="mb-4 rounded-lg border border-host-blue/30 bg-blue-50/60 p-3">
          {recolha ? (
            <>
              <div className="text-sm text-host-navy">
                <b>Última recolha:</b> {dData(new Date(recolha.data_recolha))}
                <span className="text-gray-500"> · {recolha.n_valores} valores</span>
              </div>
              <div className="text-sm text-host-navy mt-1">
                <b>Próxima:</b> no Assist, filtra <b className="text-host-blue">de {dData(maisDias(recolha.data_recolha, 1))}</b> até ao dia em que a correres.
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Com margem de segurança, começa antes - em <b>{dData(maisDias(recolha.data_recolha, -3))}</b>. Sobrepor é inofensivo (não duplica valores e o aviso <i>"já na lista"</i> protege-te); já um buraco perde comissões sem avisar.
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-500">Ainda sem recolhas registadas. Após a próxima, aparece aqui o intervalo de datas a usar da vez seguinte.</div>
          )}
        </div>
        <div className="text-sm text-host-navy font-semibold mb-1">Configurar (só 1 vez)</div>
        <ol className="list-decimal ml-5 text-sm text-gray-600 space-y-1 mb-3">
          <li>No Chrome, mostra a barra de favoritos (<b>Ctrl+Shift+B</b>).</li>
          <li>Botão direito na barra → <b>Adicionar página…</b> (novo favorito).</li>
          <li>Nome: <b>Atualizar valores</b>. No campo <b>URL</b>, cola o código copiado abaixo.</li>
        </ol>
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => { navigator.clipboard.writeText(BOOKMARKLET); setBmCopiado(true); setTimeout(() => setBmCopiado(false), 2000) }}
            className="bg-host-blue text-white text-sm font-semibold rounded px-4 py-2">{bmCopiado ? '✓ Copiado!' : 'Copiar código do atalho'}</button>
          <span className="text-xs text-gray-400">cola no campo URL do favorito</span>
        </div>
        <textarea readOnly value={BOOKMARKLET} rows={3} onFocus={(e) => e.target.select()} className="w-full border rounded px-2 py-1.5 font-mono text-[10px] text-gray-400" />
        <div className="text-sm text-host-navy font-semibold mt-4 mb-1">Usar (1×/mês, ~30s)</div>
        <ol className="list-decimal ml-5 text-sm text-gray-600 space-y-1">
          <li>Entra na plataforma e abre <b>Comercial → Propostas</b> (com o teu nome em Rep. Vendas, período largo).</li>
          <li>Clica nos separadores das marcas (Host, CLEVER, hey!, Profile) para carregarem.</li>
          <li>Clica no favorito <b>Atualizar valores</b>. Aparece <i>"OK! N valores e N links atualizados"</i> - valores, links e marca de uma só vez.</li>
        </ol>
        <p className="text-xs text-gray-400 mt-2">Se o navegador bloquear o envio direto, o atalho copia os valores para a área de transferência - basta colares no chat comigo com a palavra "atualiza".</p>
      </Section>

      {/* Identificação & acesso */}
      <Section title="Identificação & acesso">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Nome (gestor)<input value={def.gestor_nome} onChange={(e) => set('gestor_nome', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>Cargo<input value={def.gestor_cargo} onChange={(e) => set('gestor_cargo', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>PIN de acesso<input value={def.pin} onChange={(e) => set('pin', e.target.value)} className="mt-1 w-full border rounded px-2 py-1.5" /></label>
        </div>
        <p className="text-xs text-gray-400 mt-3">Os destinatários (diretor, contabilidade, etc.) passaram a ser geridos em <b>“Destinatários das comissões”</b>, no topo.</p>
      </Section>
    </div>
  )
}
