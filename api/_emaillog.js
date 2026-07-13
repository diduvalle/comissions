// Regista um email enviado na tabela "emails" (best-effort, não falha o envio).
const SB = 'https://bhurcadussdjohbngekq.supabase.co'
const SB_KEY = 'sb_publishable_eKHXqa4aW7SwV8zx_euepA_ngZ3U5NU'

export async function logEmail(row) {
  try {
    await fetch(`${SB}/rest/v1/emails`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    })
  } catch { /* ignora — o registo não pode quebrar o envio */ }
}
