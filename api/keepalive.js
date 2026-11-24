// Keep-alive do Supabase, 2.ª origem (a 1.ª é o GitHub Actions, .github/workflows/keepalive.yml).
// Chamado pelo Vercel Cron todos os dias (ver vercel.json).
// Faz o que a app faz: uma leitura real (comissões com cliente e produto) e uma ESCRITA
// na tabela "keepalive" - o Supabase pausou o projeto em 23/11/2026 mesmo com leituras diárias.
const SB = 'https://bhurcadussdjohbngekq.supabase.co/rest/v1'
const KEY = 'sb_publishable_eKHXqa4aW7SwV8zx_euepA_ngZ3U5NU' // chave pública (já está no frontend)
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

export default async function handler(req, res) {
  const ok = req.headers['x-vercel-cron'] || (process.env.CRON_SECRET && req.query.key === process.env.CRON_SECRET)
  if (!ok) return res.status(401).json({ error: 'não autorizado' })
  try {
    const leitura = await fetch(`${SB}/comissoes?select=id,valor_venda,cliente:clientes(nome),produto:produtos(tipo)&order=updated_at.desc&limit=20`, { headers: H })
    const escrita = await fetch(`${SB}/keepalive?origem=eq.vercel`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify({ ultimo: new Date().toISOString() }),
    })
    const linhas = escrita.ok ? await escrita.json() : []
    const out = { leitura: leitura.status, escrita: escrita.status, escreveu: linhas.length }
    console.log('keep-alive', out)
    return res.status(leitura.ok && escrita.ok && linhas.length ? 200 : 502).json(out)
  } catch (e) {
    console.error('keep-alive falhou', e)
    return res.status(502).json({ error: String(e) })
  }
}
