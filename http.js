// Adapter de entrada HTTP: webhook da Evolution + página de rastreio. Só node:http, sem framework.
import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { lerWebhook } from './evolution.js'
import { renderPagina } from './pagina.js'

const FUNDO = readFileSync(new URL('../../public/fundo.jpg', import.meta.url)) // textura cinza da página

function segredoOk(recebido, esperado) {
  const a = Buffer.from(String(recebido ?? '')), b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function lerJson(req, limite) {
  let tamanho = 0
  const partes = []
  for await (const p of req) {
    if ((tamanho += p.length) > limite) throw Object.assign(new Error('corpo grande demais'), { status: 413 })
    partes.push(p)
  }
  try {
    return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}')
  } catch {
    throw Object.assign(new Error('JSON inválido'), { status: 400 })
  }
}

export function criarServidor({ casos, segredo, log = console }) {
  return http.createServer(async (req, res) => {
    const responder = (status, corpo = '', tipo = 'text/plain; charset=utf-8') =>
      res.writeHead(status, { 'Content-Type': tipo, 'Cache-Control': 'no-store' }).end(corpo)
    const json = (status, dados) => responder(status, JSON.stringify(dados), 'application/json; charset=utf-8')
    try {
      const url = new URL(req.url, 'http://local')

      if (req.method === 'POST' && url.pathname === '/webhooks/evolution') {
        if (!segredoOk(url.searchParams.get('s'), segredo)) return responder(401)
        const msg = lerWebhook(await lerJson(req, 5 * 1024 * 1024))
        responder(200) // responde logo; a Evolution não precisa esperar o Autocab
        if (msg) await casos.mensagemPassageiro(msg).catch(e => log.error('mensagem passageiro:', e.message))
        return
      }

      // Token de 10 caracteres aleatórios é a própria credencial da página e do chat.
      const foto = url.pathname.match(/^\/r\/([0-9A-Za-z]{6,32})\/foto$/)
      if (foto && req.method === 'GET') {
        const f = await casos.fotoMotorista(foto[1])
        if (!f) return responder(404)
        return res.writeHead(200, { 'Content-Type': f.tipo, 'Cache-Control': 'private, max-age=3600' }).end(f.bytes)
      }

      const rota = url.pathname.match(/^\/r\/([0-9A-Za-z]{6,32})(\/mensagens)?$/)
      if (rota && !rota[2] && req.method === 'GET') {
        const dados = await casos.paginaRastreio(rota[1])
        return responder(dados ? 200 : 404, renderPagina(dados), 'text/html; charset=utf-8')
      }
      if (rota?.[2] && req.method === 'GET') {
        const lista = await casos.chatListar(rota[1], Number(url.searchParams.get('depois')) || 0)
        return lista ? json(200, lista) : json(404, { erro: 'corrida encerrada' })
      }
      if (rota?.[2] && req.method === 'POST') {
        const { texto } = await lerJson(req, 4096)
        const r = await casos.chatEnviar(rota[1], texto)
        return json({ ok: 201, vazia: 400, encerrada: 404, 'sem-motorista': 409 }[r], { resultado: r })
      }

      if (url.pathname === '/fundo.jpg') {
        return res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=604800' }).end(FUNDO)
      }
      if (url.pathname === '/health') return responder(200, 'ok')
      responder(404)
    } catch (e) {
      log.error(e)
      if (!res.headersSent) responder(e.status ?? 500)
    }
  })
}
