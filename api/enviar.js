// Função serverless (Vercel) — envia o mapa do mês a CADA destinatário via Resend,
// com um link à medida do seu papel (leitura / editar / submeter) e rastreio individual.
// A RESEND_API_KEY vem das variáveis de ambiente do Vercel (secreta).
import { logEmail } from './_emaillog.js'
const SB = 'https://bhurcadussdjohbngekq.supabase.co'
const SB_KEY = 'sb_publishable_eKHXqa4aW7SwV8zx_euepA_ngZ3U5NU'
const ABBR = ['', 'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const BASE = 'https://comissions.cr0x.org'

function mrefLabel(mref) {
  const m = ABBR.indexOf(String(mref).slice(0, 3).toUpperCase())
  const y = 2000 + parseInt(String(mref).slice(3), 10)
  return `${MESES[m - 1] || mref} ${y}`
}
const eur = (n) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(n || 0))

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })
  const RESEND = process.env.RESEND_API_KEY
  if (!RESEND) return res.status(500).json({ error: 'RESEND_API_KEY em falta nas variáveis do Vercel.' })
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const token = body.token
  if (!token) return res.status(400).json({ error: 'token em falta' })
  const h = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }

  const enviarResend = (para, subject, html) => fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Comissões (Diogo Vale) <diogo.vale@cr0x.org>', to: [para], reply_to: 'diogo.vale@hostpms.com', subject, html }),
  })

  try {
    const envio = (await (await fetch(`${SB}/rest/v1/envios?token=eq.${token}&select=*`, { headers: h })).json())[0]
    if (!envio) return res.status(404).json({ error: 'Envio não encontrado' })
    const def = (await (await fetch(`${SB}/rest/v1/definicoes?id=eq.1&select=*`, { headers: h })).json())[0] || {}
    const mes = mrefLabel(envio.mes_referencia)
    const n = String((envio.comissao_ids || []).length)
    const total = eur(envio.total_comissoes)

    // destinatários ativos; se não houver, cai no diretor/contabilidade das definições
    let dests = await (await fetch(`${SB}/rest/v1/destinatarios?ativo=eq.true&select=id,nome,email,papel&order=ordem`, { headers: h })).json()
    if (!Array.isArray(dests) || dests.length === 0) {
      dests = []
      if (def.diretor_email) dests.push({ id: null, nome: def.diretor_nome, email: def.diretor_email, papel: 'submeter' })
      if (def.cc_email) dests.push({ id: null, nome: 'Contabilidade', email: def.cc_email, papel: 'leitura' })
    }
    if (dests.length === 0) return res.status(400).json({ error: 'Sem destinatários definidos.' })

    const enviados = []
    for (const d of dests) {
      // cria o registo por destinatário e obtém o token individual
      const created = await (await fetch(`${SB}/rest/v1/envio_destinatarios`, {
        method: 'POST', headers: { ...h, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ envio_id: envio.id, destinatario_id: d.id, nome: d.nome, email: d.email, papel: d.papel }),
      }).then((r) => r.json()).catch(() => []))
      const edToken = created[0]?.token
      if (!edToken) { enviados.push({ email: d.email, estado: 'erro-token' }); continue }

      const leitura = d.papel === 'leitura'
      const link = `${BASE}/${leitura ? 'ver' : 'validacao'}/${edToken}`
      const M = (s) => String(s || '').split('{mes}').join(mes).split('{n}').join(n).split('{total}').join(total).split('{link}').join(link).split('{diretor}').join(d.nome || '')

      let subject, html
      if (leitura) {
        subject = `Comissões ${mes} (só leitura)`
        html = `<div style="font-family:Inter,Arial,sans-serif;color:#0F1E2E;font-size:14px;line-height:1.6">
          <p>Olá${d.nome ? ' ' + d.nome : ''},</p>
          <p>Segue o mapa de comissões de <b>${mes}</b> (${n} linhas · total ${total}) para conhecimento.</p>
          <p style="margin:20px 0"><a href="${link}" style="display:inline-block;background:#1E63FF;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">Ver mapa (só leitura)</a></p>
          <p style="color:#667">Link só de leitura — reflete sempre o estado atual do mapa.</p>
          <p style="color:#9aa4b2;font-size:12px;margin-top:24px">Host Hotel Systems · Move beyond expectations.</p>
        </div>`
      } else {
        subject = M(def.email_assunto || 'Comissões para validação — {mes}')
        const saudacao = def.email_saudacao ? `<p>${M(def.email_saudacao).replace(/\n/g, '<br>')}</p>` : `<p>Olá${d.nome ? ' ' + d.nome : ''},</p>`
        const resumo = def.email_mostrar_resumo ? `<p style="background:#f3f6fc;border-radius:8px;padding:10px 14px"><b>${mes}</b> · ${n} linhas · total ${total}</p>` : ''
        const corpoTxt = def.email_corpo ? `<p>${M(def.email_corpo).replace(/\n/g, '<br>')}</p>` : ''
        const assinatura = def.email_assinatura ? `<p style="margin-top:18px">${M(def.email_assinatura).replace(/\n/g, '<br>')}</p>` : ''
        const botao = `<p style="margin:20px 0"><a href="${link}" style="display:inline-block;background:#1E63FF;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">${def.email_botao_label || 'Abrir mapa de comissões'}</a></p>`
        const antes = def.email_botao_posicao === 'antes'
        html = `<div style="font-family:Inter,Arial,sans-serif;color:#0F1E2E;font-size:14px;line-height:1.6">
          ${saudacao}${resumo}${antes ? botao : ''}${corpoTxt}${antes ? '' : botao}${assinatura}
          <p style="color:#9aa4b2;font-size:12px;margin-top:24px">Host Hotel Systems · Move beyond expectations.</p>
        </div>`
      }

      const r = await enviarResend(d.email, subject, html)
      const out = await r.json().catch(() => ({}))
      await logEmail({ tipo: `mapa-${d.papel}`, para: d.email, assunto: subject, corpo: html, envio_id: String(envio.id), resend_id: out?.id, estado: r.ok ? 'enviado' : 'erro', erro: r.ok ? null : JSON.stringify(out) })
      enviados.push({ email: d.email, papel: d.papel, estado: r.ok ? 'enviado' : 'erro' })
    }

    await fetch(`${SB}/rest/v1/envios?id=eq.${envio.id}`, {
      method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'enviado', data_envio: new Date().toISOString() }),
    })
    return res.status(200).json({ ok: true, enviados })
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) })
  }
}
