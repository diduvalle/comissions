// Backup automático mensal: exporta todas as comissões para CSV e envia por email
// ao gestor. Chamado pelo Vercel Cron (ver vercel.json) no dia 1 de cada mês.
import { logEmail } from './_emaillog.js'
const SB = 'https://bhurcadussdjohbngekq.supabase.co'
const SB_KEY = 'sb_publishable_eKHXqa4aW7SwV8zx_euepA_ngZ3U5NU'
const GESTOR_EMAIL = 'diogo.vale@hostpms.com'

async function all(t, h) {
  let out = [], off = 0
  while (true) {
    const r = await fetch(`${SB}/rest/v1/${t}&limit=1000&offset=${off}`, { headers: h })
    const d = await r.json()
    out = out.concat(d)
    if (!Array.isArray(d) || d.length < 1000) break
    off += 1000
  }
  return out
}
const csvCell = (v) => {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export default async function handler(req, res) {
  // só permite via Cron do Vercel ou com a chave secreta (evita abuso do endpoint público)
  const ok = req.headers['x-vercel-cron'] || (process.env.CRON_SECRET && req.query.key === process.env.CRON_SECRET)
  if (!ok) return res.status(401).json({ error: 'não autorizado' })
  const RESEND = process.env.RESEND_API_KEY
  if (!RESEND) return res.status(500).json({ error: 'RESEND_API_KEY em falta' })
  const h = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  try {
    const rows = await all('comissoes?select=numero_projeto,data_adjudicacao,valor_venda,percentagem,comissao_calculada,valor_pago,estado,is_saas,valor_mensal_saas,mes_referencia,observacoes,cliente:clientes(nome),produto:produtos(tipo)&order=mes_referencia', h)
    const cols = ['numero_projeto', 'data_adjudicacao', 'cliente', 'produto', 'valor_venda', 'percentagem', 'comissao_calculada', 'valor_pago', 'estado', 'is_saas', 'valor_mensal_saas', 'mes_referencia', 'observacoes']
    const head = cols.join(';')
    const body = rows.map((r) => [
      r.numero_projeto, r.data_adjudicacao, r.cliente?.nome, r.produto?.tipo, r.valor_venda, r.percentagem,
      r.comissao_calculada, r.valor_pago, r.estado, r.is_saas, r.valor_mensal_saas, r.mes_referencia, r.observacoes,
    ].map(csvCell).join(';')).join('\n')
    const csv = '﻿' + head + '\n' + body // BOM p/ acentos no Excel
    const b64 = Buffer.from(csv, 'utf8').toString('base64')
    const hoje = new Date().toISOString().slice(0, 10)

    const totCom = rows.reduce((s, r) => s + Number(r.comissao_calculada || 0), 0)
    const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0F1E2E;font-size:14px">
      <h2>Backup mensal de comissões — ${hoje}</h2>
      <p>Em anexo o ficheiro com <b>${rows.length}</b> comissões (total ${new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(totCom)}).</p>
      <p style="color:#9aa4b2;font-size:12px;margin-top:24px">Host Hotel Systems · Move beyond expectations.</p>
    </div>`
    const assunto = `💾 Backup comissões — ${hoje} (${rows.length} linhas)`
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Comissões <diogo.vale@cr0x.org>', to: [GESTOR_EMAIL],
        subject: assunto,
        html, attachments: [{ filename: `comissoes-${hoje}.csv`, content: b64 }],
      }),
    })
    const rt = r.ok ? null : await r.text()
    await logEmail({ tipo: 'backup', para: GESTOR_EMAIL, assunto, corpo: html, estado: r.ok ? 'enviado' : 'erro', erro: rt })
    if (!r.ok) return res.status(502).json({ error: 'Resend: ' + rt })
    return res.status(200).json({ ok: true, linhas: rows.length })
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) })
  }
}
