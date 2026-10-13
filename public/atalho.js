// Atalho "Atualizar valores" - recolhe os valores da grelha de Propostas do Assist
// e envia-os para o COMISSIONS (valores, links da plataforma, marca e data de início).
//
// Este ficheiro é carregado pelo favorito (bookmarklet), que só contém um carregador.
// Assim, melhorias aqui entram automaticamente no próximo clique, sem voltar a colar nada.
(async () => {
  try {
    const SB = 'https://bhurcadussdjohbngekq.supabase.co'
    const K = 'sb_publishable_eKHXqa4aW7SwV8zx_euepA_ngZ3U5NU'
    const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }
    const HL = { apikey: K, Authorization: 'Bearer ' + K } // só leitura
    const EXT = { 0: 'Host', 1: 'Hstays', 2: 'Clever', 3: 'hey!', 5: 'ProfileNow' }

    if (typeof Ext === 'undefined') {
      alert('Este atalho só funciona dentro da plataforma HostPMS (Comercial > Propostas).')
      return
    }

    // converte um valor da grelha em data ISO (YYYY-MM-DD), ou null se não for data plausível
    const toISO = (v) => {
      if (!v) return null
      const dt = (v instanceof Date) ? v : new Date(v)
      if (isNaN(dt.getTime())) return null
      const y = dt.getFullYear()
      if (y < 2015 || y > 2100) return null
      return y + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0')
    }

    // procura a data de início do projeto, por ordem de preferência dos nomes de campo
    const pickDate = (d) => {
      const ks = Object.keys(d)
      const tiers = [/^(datainicio|startdate|datastart|inicio|start|data|date)$/i, /inicio|start/i, /date|data/i]
      for (const t of tiers) {
        for (const k of ks) {
          if (t.test(k)) { const iso = toISO(d[k]); if (iso) return iso }
        }
      }
      return null
    }

    // percorre as grelhas abertas e recolhe as linhas de propostas (sem repetir nº de projeto)
    const vistos = {}
    const valores = []
    const links = []
    Ext.ComponentQuery.query('grid').forEach((g) => {
      const s = g.getStore && g.getStore()
      if (!s || !s.getCount || s.getCount() === 0) return
      const d0 = s.getAt(0).data
      // exige TODOS os campos exclusivos da grelha de Propostas - assim outras grelhas
      // do Assist (tickets, projetos, etc.) nunca são recolhidas por engano
      const obrigatorios = ['Nr', 'TotalSum', 'SaaSSum', 'ProjectId', 'ProfileName', 'ExtType']
      if (!obrigatorios.every((c) => d0.hasOwnProperty(c))) return
      s.each((r) => {
        const d = r.data
        if (d.Deleted) return
        const nr = String(d.Nr)
        if (!nr || vistos[nr]) return
        vistos[nr] = 1
        valores.push({
          numero_projeto: nr,
          cliente: d.ProfileName || null,
          setup: Math.round(Number(d.TotalSum || 0) * 100) / 100,
          saas_mes: Math.round(Number(d.SaaSSum || 0) * 100) / 100,
          marca: EXT[d.ExtType] || 'Outro',
          data_inicio: pickDate(d),
        })
        if (d.ProjectId > 0) links.push({ numero_projeto: nr, data_id: String(d.ProjectId) })
      })
    })

    if (!valores.length) {
      alert('Abre Comercial > Propostas e os separadores das marcas primeiro.')
      return
    }

    // ---- compara com o que o COMISSIONS já conhece: o que é novo e o que mudou ----
    // (a grelha traz sempre as propostas todas, antigas incluídas; o que interessa é a diferença)
    let ultimaRecolha = null
    let conhecidos = null // nº de projeto -> { setup, saas_mes }
    try {
      const [rr, rv] = await Promise.all([
        fetch(SB + '/rest/v1/recolhas?select=data_recolha&order=data_recolha.desc&limit=1', { headers: HL }),
        fetch(SB + '/rest/v1/projeto_valores?select=numero_projeto,setup,saas_mes', { headers: HL }),
      ])
      if (rr.ok) { const j = await rr.json(); if (j[0]) ultimaRecolha = j[0].data_recolha }
      if (rv.ok) conhecidos = new Map((await rv.json()).map((p) => [String(p.numero_projeto), p]))
    } catch (_) { /* sem comparação: a confirmação cai no formato simples */ }

    const novos = []
    const alterados = []
    if (conhecidos) {
      for (const v of valores) {
        const e = conhecidos.get(v.numero_projeto)
        if (!e) { novos.push(v); continue }
        const mudouSetup = Math.abs(Number(e.setup || 0) - v.setup) > 0.005
        const mudouSaas = Math.abs(Number(e.saas_mes || 0) - v.saas_mes) > 0.005
        if (mudouSetup || mudouSaas) alterados.push({ v, e, mudouSetup, mudouSaas })
      }
    }

    const nome = (s) => { s = s || ''; return s.length > 34 ? s.slice(0, 33) + '…' : s }
    const eurTxt = (n) => Number(n || 0).toLocaleString('pt-PT', { maximumFractionDigits: 2 }) + ' €'
    const maisRecentes = (arr, nr) => arr.slice().sort((a, b) => Number(nr(b)) - Number(nr(a)))
    const lista = (arr, fmt, max) => arr.slice(0, max).map(fmt).join('\n') + (arr.length > max ? '\n  … e mais ' + (arr.length - max) : '')
    const dataTxt = (iso) => iso ? new Date(iso).toLocaleDateString('pt-PT') : null

    const partes = ['Enviar ' + valores.length + ' valores e ' + links.length + ' links para o COMISSIONS?', '']
    if (conhecidos) {
      if (novos.length) {
        partes.push('✚ ' + novos.length + ' novo(s) - ainda não estavam no COMISSIONS:')
        partes.push(lista(maisRecentes(novos, (x) => x.numero_projeto), (x) => '  ' + x.numero_projeto + '  ' + nome(x.cliente), 8))
        partes.push('')
      }
      if (alterados.length) {
        partes.push('✎ ' + alterados.length + ' com valores alterados na plataforma:')
        partes.push(lista(maisRecentes(alterados, (x) => x.v.numero_projeto), (x) => {
          const m = []
          if (x.mudouSetup) m.push('Setup ' + eurTxt(x.e.setup) + ' → ' + eurTxt(x.v.setup))
          if (x.mudouSaas) m.push('SaaS ' + eurTxt(x.e.saas_mes) + ' → ' + eurTxt(x.v.saas_mes) + '/mês')
          return '  ' + x.v.numero_projeto + '  ' + nome(x.v.cliente) + '  (' + m.join(', ') + ')'
        }, 6))
        partes.push('')
      }
      const iguais = valores.length - novos.length - alterados.length
      if (!novos.length && !alterados.length) partes.push('Nada de novo nem alterado desde a última recolha - só confirma o que já existe.')
      else partes.push('= ' + iguais + ' sem alterações (só confirmados).')
      if (ultimaRecolha) partes.push('Última recolha: ' + dataTxt(ultimaRecolha) + '.')
    } else {
      // não foi possível comparar: mostra uma amostra, para pelo menos confirmar que são propostas
      partes.push('Exemplos:')
      partes.push(lista(valores, (v) => '  ' + v.numero_projeto + '  ' + nome(v.cliente), 3))
    }
    partes.push('', 'Se isto não parecem propostas tuas, cancela.')
    if (!confirm(partes.join('\n'))) return

    const copiarParaChat = async () => {
      try { await navigator.clipboard.writeText(JSON.stringify(valores)) } catch (_) {}
    }

    try {
      const r1 = await fetch(SB + '/rest/v1/projeto_valores?on_conflict=numero_projeto', { method: 'POST', headers: H, body: JSON.stringify(valores) })
      const r2 = links.length
        ? await fetch(SB + '/rest/v1/projeto_links?on_conflict=numero_projeto', { method: 'POST', headers: H, body: JSON.stringify(links) })
        : { ok: true }

      if (r1.ok && r2.ok) {
        // regista a recolha, para a app saber o intervalo de datas da próxima
        try {
          await fetch(SB + '/rest/v1/recolhas', { method: 'POST', headers: H, body: JSON.stringify({ n_valores: valores.length, n_links: links.length }) })
        } catch (_) {}
        const fim = ['OK! ' + valores.length + ' valores e ' + links.length + ' links atualizados no COMISSIONS.']
        // o passo seguinte, para não ficar esquecido
        if (novos.length) fim.push('', novos.length + ' projeto(s) novo(s): vê no Painel do mês se algum deve ter comissão.')
        if (alterados.length) fim.push(alterados.length + ' com valores alterados: confirma se alguma linha precisa de ser corrigida.')
        alert(fim.join('\n'))
      } else {
        await copiarParaChat()
        alert('Envio direto bloqueado (CSP). Copiei ' + valores.length + ' valores - cola no chat com a palavra atualiza.')
      }
    } catch (e) {
      await copiarParaChat()
      alert('Envio direto bloqueado. Copiei os valores - cola no chat com a palavra atualiza.')
    }
  } catch (e) {
    alert('Erro: ' + (e.message || e))
  }
})()
