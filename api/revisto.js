// Função serverless — o diretor submete "Revisto": envia ao gestor (Diogo) o ponto
// de situação do mês e marca o envio como concluído.
const SB = 'https://bhurcadussdjohbngekq.supabase.co'
const SB_KEY = 'sb_publishable_eKHXqa4aW7SwV8zx_euepA_ngZ3U5NU'
const GESTOR_EMAIL = 'diogo.vale@hostpms.com'
const ABBR = ['', 'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const mrefLabel = (m) => `${MESES[ABBR.indexOf(String(m).slice(0, 3).toUpperCase()) - 1] || m} ${2000 + parseInt(String(m).slice(3), 10)}`
const eur = (n) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(n || 0))

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })
  const RESEND = process.env.RESEND_API_KEY
  if (!RESEND) return res.status(500).json({ error: 'RESEND_API_KEY em falta' })
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const token = body.token
  if (!token) return res.status(400).json({ error: 'token em falta' })
  const h = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  try {
    const envio = (await (await fetch(`${SB}/rest/v1/envios?token=eq.${token}&select=*`, { headers: h })).json())[0]
    if (!envio) return res.status(404).json({ error: 'Envio não encontrado' })
    const ids = (envio.comissao_ids || [])
    const linhas = ids.length
      ? await (await fetch(`${SB}/rest/v1/comissoes?id=in.(${ids.join(',')})&select=numero_projeto,comissao_calculada,valor_pago,estado,observacoes,cliente:clientes(nome),produto:produtos(tipo)`, { headers: h })).json()
      : []

    const totCom = linhas.reduce((s, c) => s + Number(c.comissao_calculada || 0), 0)
    const totPago = linhas.reduce((s, c) => s + Number(c.valor_pago || 0), 0)
    const aPagar = totPago + Number(envio.bonus || 0)
    const rows = linhas.map((c) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${c.numero_projeto}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${c.cliente?.nome || ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${c.produto?.tipo || ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${eur(c.comissao_calculada)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${c.valor_pago == null ? '—' : eur(c.valor_pago)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${c.estado}</td>
      </tr>`).join('')

    const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0F1E2E;font-size:14px">
      <h2 style="color:#0F1E2E">Mapa revisto — ${mrefLabel(envio.mes_referencia)}</h2>
      <p>O Marco Arroz reviu as comissões. Ponto de situação:</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead><tr style="text-align:left;color:#667">
          <th style="padding:6px 8px">Nº</th><th style="padding:6px 8px">Cliente</th><th style="padding:6px 8px">Produto</th>
          <th style="padding:6px 8px;text-align:right">Comissão</th><th style="padding:6px 8px;text-align:right">Pago</th><th style="padding:6px 8px">Estado</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:16px;font-size:15px">
        Total comissões: <b>${eur(totCom)}</b><br>
        Marcado para pagar: <b>${eur(totPago)}</b><br>
        Bónus: <b>${eur(envio.bonus)}</b><br>
        <span style="font-size:17px">A pagar (${mrefLabel(envio.mes_referencia)}): <b>${eur(aPagar)}</b></span>
      </p>
      ${envio.bonus_descricao ? `<p style="color:#667">Nota do bónus: ${envio.bonus_descricao}</p>` : ''}
      <p style="color:#9aa4b2;font-size:12px;margin-top:24px">Host Hotel Systems · Move beyond expectations.</p>
    </div>`

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Comissões <diogo.vale@cr0x.org>', to: [GESTOR_EMAIL], reply_to: 'marco.arroz@hostpms.com', subject: `✓ Revisto — ${mrefLabel(envio.mes_referencia)} — a pagar ${eur(aPagar)}`, html }),
    })
    const out = await r.json()
    if (!r.ok) return res.status(502).json({ error: 'Resend: ' + JSON.stringify(out) })

    await fetch(`${SB}/rest/v1/envios?id=eq.${envio.id}`, { method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: 'concluido' }) })
    return res.status(200).json({ ok: true, aPagar })
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) })
  }
}
