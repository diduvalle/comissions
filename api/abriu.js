// Avisa o gestor (Diogo) quando ALGUÉM abre o mapa pela 1ª vez.
// who='diretor' → abriu a página de validação (link editável).
// who='cc'      → contabilidade abriu a vista só-leitura (/ver).
import { logEmail } from './_emaillog.js'
const SB = 'https://bhurcadussdjohbngekq.supabase.co'
const SB_KEY = 'sb_publishable_eKHXqa4aW7SwV8zx_euepA_ngZ3U5NU'
const GESTOR_EMAIL = 'diogo.vale@hostpms.com'
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const ABBR = ['', 'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
const mrefLabel = (m) => `${MESES[ABBR.indexOf(String(m).slice(0, 3).toUpperCase()) - 1] || m} ${2000 + parseInt(String(m).slice(3), 10)}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })
  const RESEND = process.env.RESEND_API_KEY
  if (!RESEND) return res.status(200).json({ ok: false, skip: 'sem RESEND' })
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const token = body.token
  const who = body.who === 'cc' ? 'cc' : 'diretor'
  if (!token) return res.status(400).json({ error: 'token em falta' })
  const h = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  try {
    const envio = (await (await fetch(`${SB}/rest/v1/envios?token=eq.${token}&select=id,mes_referencia`, { headers: h })).json())[0]
    if (!envio) return res.status(404).json({ error: 'Envio não encontrado' })
    const def = (await (await fetch(`${SB}/rest/v1/definicoes?id=eq.1&select=diretor_nome,cc_email`, { headers: h })).json())[0] || {}
    const mes = mrefLabel(envio.mes_referencia)

    let subject, corpo
    if (who === 'cc') {
      subject = `📄 Contabilidade abriu o mapa (só leitura) — ${mes}`
      corpo = `A <b>contabilidade</b>${def.cc_email ? ` (${def.cc_email})` : ''} acabou de <b>abrir</b> a vista <b>só de leitura</b> do mapa de <b>${mes}</b>.`
    } else {
      subject = `👀 ${def.diretor_nome || 'O diretor'} abriu o mapa (validação) — ${mes}`
      corpo = `O teu <b>diretor</b>, <b>${def.diretor_nome || ''}</b>, acabou de <b>abrir</b> o mapa de <b>validação</b> de <b>${mes}</b>. Está a rever os valores — quando concluir, recebes o mapa revisto.`
    }

    const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0F1E2E;font-size:14px">
      <p>${who === 'cc' ? '📄' : '👀'} ${corpo}</p>
      <p style="color:#9aa4b2;font-size:12px;margin-top:24px">Host Hotel Systems · Move beyond expectations.</p>
    </div>`
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Comissões <diogo.vale@cr0x.org>', to: [GESTOR_EMAIL], subject, html }),
    })
    const rt = r.ok ? null : await r.text()
    await logEmail({ tipo: who === 'cc' ? 'aviso-abertura-cc' : 'aviso-abertura-diretor', para: GESTOR_EMAIL, assunto: subject, corpo: html, envio_id: String(envio.id), estado: r.ok ? 'enviado' : 'erro', erro: rt })
    if (!r.ok) return res.status(502).json({ error: 'Resend: ' + rt })
    return res.status(200).json({ ok: true, who })
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) })
  }
}
