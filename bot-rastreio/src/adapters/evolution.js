// Adapter WhatsApp: Evolution API v2 (saída = sendText, entrada = webhook messages.upsert).

export function criarEvolution({ url, chave, instancia }) {
  return {
    async enviar(telefone, texto) {
      const r = await fetch(`${url}/message/sendText/${encodeURIComponent(instancia)}`, {
        method: 'POST',
        headers: { apikey: chave, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: telefone, text: texto }),
        signal: AbortSignal.timeout(15000),
      })
      if (!r.ok) throw new Error(`Evolution ${r.status}: ${(await r.text()).slice(0, 200)}`)
    },
  }
}

// Webhook -> { telefone, texto, externoId } ou null (mensagem nossa, grupo, mídia sem texto, outro evento).
export function lerWebhook(body) {
  if (body?.event !== 'messages.upsert') return null
  const d = body.data ?? {}
  const k = d.key ?? {}
  if (k.fromMe) return null
  // WhatsApp novo pode mandar remoteJid como @lid; o telefone real vem em remoteJidAlt/senderPn.
  const jid = [k.remoteJid, k.remoteJidAlt, k.senderPn, d.senderPn].find(j => j?.endsWith('@s.whatsapp.net'))
  const texto = String(d.message?.conversation ?? d.message?.extendedTextMessage?.text ?? '').trim()
  if (!jid || !texto || !k.id) return null
  return { telefone: jid.split('@')[0], texto, externoId: `wa:${k.id}` }
}
