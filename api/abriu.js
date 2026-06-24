// Avisa o gestor (Diogo) por email quando o diretor ABRE o mapa pela 1ª vez.
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
  if (!token) return res.status(400).json({ error: 'token em falta' })
  const h = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  try {
    const envio = (await (await fetch(`${SB}/rest/v1/envios?token=eq.${token}&select=mes_referencia`, { headers: h })).json())[0]
    if (!envio) return res.status(404).json({ error: 'Envio não encontrado' })
    const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0F1E2E;font-size:14px">
      <p>👀 Boa notícia — o <b>Marco Arroz</b> acabou de <b>abrir</b> o mapa de comissões de <b>${mrefLabel(envio.mes_referencia)}</b>.</p>
      <p style="color:#667">Está a rever os valores. Quando concluir, recebes o mapa revisto.</p>
      <p style="color:#9aa4b2;font-size:12px;margin-top:24px">Host Hotel Systems · Move beyond expectations.</p>
    </div>`
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Comissões <diogo.vale@cr0x.org>', to: [GESTOR_EMAIL], subject: `👀 O Marco abriu o mapa — ${mrefLabel(envio.mes_referencia)}`, html }),
    })
    if (!r.ok) return res.status(502).json({ error: 'Resend: ' + (await r.text()) })
    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) })
  }
}
