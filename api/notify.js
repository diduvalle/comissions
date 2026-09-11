// Notifica o gestor (privado) sobre a atividade de um destinatário no seu link.
// evento: 'abriu' (1ª abertura) | 'editou' (1ª edição). A submissão é tratada em /api/revisto.
import { logEmail } from './_emaillog.js'
const SB = 'https://bhurcadussdjohbngekq.supabase.co'
const SB_KEY = 'sb_publishable_eKHXqa4aW7SwV8zx_euepA_ngZ3U5NU'
const GESTOR_EMAIL = 'diogo.vale@hostpms.com'
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const ABBR = ['', 'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
const mrefLabel = (m) => `${MESES[ABBR.indexOf(String(m).slice(0, 3).toUpperCase()) - 1] || m} ${2000 + parseInt(String(m).slice(3), 10)}`
const PAPEL = { leitura: 'leitura', editar: 'edição', submeter: 'edição + submissão' }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })
  const RESEND = process.env.RESEND_API_KEY
  if (!RESEND) return res.status(200).json({ ok: false, skip: 'sem RESEND' })
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const { token, evento } = body
  if (!token || !['abriu', 'editou'].includes(evento)) return res.status(400).json({ error: 'parâmetros inválidos' })
  const h = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  try {
    const ed = (await (await fetch(`${SB}/rest/v1/envio_destinatarios?token=eq.${token}&select=nome,email,papel,envio_id`, { headers: h })).json())[0]
    if (!ed) return res.status(404).json({ error: 'destinatário não encontrado' })
    const envio = (await (await fetch(`${SB}/rest/v1/envios?id=eq.${ed.envio_id}&select=mes_referencia`, { headers: h })).json())[0] || {}
    const mes = mrefLabel(envio.mes_referencia)
    const quem = `${ed.nome || ed.email} (${PAPEL[ed.papel] || ed.papel})`
    const emoji = evento === 'abriu' ? '👀' : '✏️'
    const frase = evento === 'abriu'
      ? `<b>${quem}</b> acabou de <b>abrir</b> o mapa de <b>${mes}</b>.`
      : `<b>${quem}</b> <b>começou a editar</b> o mapa de <b>${mes}</b>.`
    const subject = evento === 'abriu' ? `${emoji} ${ed.nome || ed.email} abriu — ${mes}` : `${emoji} ${ed.nome || ed.email} está a editar — ${mes}`
    const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0F1E2E;font-size:14px"><p>${emoji} ${frase}</p><p style="color:#9aa4b2;font-size:12px;margin-top:24px">Host Hotel Systems · Move beyond expectations.</p></div>`
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Comissões <diogo.vale@cr0x.org>', to: [GESTOR_EMAIL], subject, html }),
    })
    const rt = r.ok ? null : await r.text()
    await logEmail({ tipo: evento === 'abriu' ? 'aviso-abertura' : 'aviso-edicao', para: GESTOR_EMAIL, assunto: subject, corpo: html, envio_id: String(ed.envio_id), estado: r.ok ? 'enviado' : 'erro', erro: rt })
    if (!r.ok) return res.status(502).json({ error: 'Resend: ' + rt })
    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) })
  }
}
