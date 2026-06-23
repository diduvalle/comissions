// Função serverless (Vercel) — envia o email do mês ao diretor via Resend.
// A RESEND_API_KEY vem das variáveis de ambiente do Vercel (secreta).
const SB = 'https://bhurcadussdjohbngekq.supabase.co'
const SB_KEY = 'sb_publishable_eKHXqa4aW7SwV8zx_euepA_ngZ3U5NU'
const ABBR = ['', 'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

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
  try {
    const envio = (await (await fetch(`${SB}/rest/v1/envios?token=eq.${token}&select=*`, { headers: h })).json())[0]
    if (!envio) return res.status(404).json({ error: 'Envio não encontrado' })
    const def = (await (await fetch(`${SB}/rest/v1/definicoes?id=eq.1&select=*`, { headers: h })).json())[0]

    const link = `https://comissions.cr0x.org/validacao/${token}`
    const mes = mrefLabel(envio.mes_referencia)
    const n = String((envio.comissao_ids || []).length)
    const total = eur(envio.total_comissoes)
    const subject = String(def?.email_assunto || 'Comissões para validação').split('{mes}').join(mes)
    const corpo = String(def?.email_corpo || 'Segue o mapa de comissões para validação.')
      .split('{mes}').join(mes).split('{n}').join(n).split('{total}').join(total).split('{link}').join(link)
    const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0F1E2E;font-size:14px;line-height:1.6">
      ${corpo.replace(/\n/g, '<br>')}
      <p style="margin-top:20px"><a href="${link}" style="display:inline-block;background:#1E63FF;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">Abrir mapa de comissões</a></p>
      <p style="color:#9aa4b2;font-size:12px;margin-top:24px">Host Hotel Systems · Move beyond expectations.</p>
    </div>`

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Comissões (Diogo Vale) <diogo.vale@cr0x.org>',
        to: [def?.diretor_email],
        reply_to: 'diogo.vale@hostpms.com',
        subject, html,
      }),
    })
    const out = await r.json()
    if (!r.ok) return res.status(502).json({ error: 'Resend: ' + JSON.stringify(out) })

    await fetch(`${SB}/rest/v1/envios?id=eq.${envio.id}`, {
      method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'enviado', data_envio: new Date().toISOString() }),
    })
    return res.status(200).json({ ok: true, to: def?.diretor_email, id: out.id })
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) })
  }
}
