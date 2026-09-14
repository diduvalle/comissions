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

    const comData = valores.filter((x) => x.data_inicio).length

    // Confirmação: nada é gravado sem veres o que vai ser enviado (rede de segurança
    // contra cliques acidentais noutras páginas do Assist).
    const amostra = valores.slice(0, 3).map((v) => '  ' + v.numero_projeto + '  ' + (v.cliente || '')).join('\n')
    const resumo = [
      'Enviar ' + valores.length + ' valores e ' + links.length + ' links para o COMISSIONS?',
      '',
      'Exemplos:',
      amostra + (valores.length > 3 ? '\n  ...' : ''),
      '',
      'Se isto não parecem propostas tuas, cancela.',
    ].join('\n')
    if (!confirm(resumo)) return

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
        alert('OK! ' + valores.length + ' valores e ' + links.length + ' links atualizados no COMISSIONS. (' + comData + ' com data)')
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
