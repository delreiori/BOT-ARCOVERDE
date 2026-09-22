// node --test : regras + fluxo completo com Autocab/WhatsApp/banco falsos em memória.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarTelefone, chaveTelefone, gerarToken, statusParaPassageiro } from './domain/corrida.js'
import { lerWebhook } from './adapters/evolution.js'
import { criarCasos } from './application/casos.js'
import { renderPagina } from './adapters/pagina.js'

test('telefone', () => {
  assert.equal(normalizarTelefone('(11) 99999-8888'), '5511999998888')
  assert.equal(normalizarTelefone('011 99999-8888'), '5511999998888')
  assert.equal(normalizarTelefone('+55 11 99999-8888'), '5511999998888')
  assert.equal(normalizarTelefone('123'), null)
  // WhatsApp sem o 9º dígito ainda casa com o número da reserva
  assert.equal(chaveTelefone('551199998888'), chaveTelefone('5511999998888'))
  assert.match(gerarToken(), /^[0-9A-Za-z]{10}$/)
})

test('status do Autocab para o passageiro', () => {
  assert.equal(statusParaPassageiro('Dispatched', false), 'Buscando motorista') // sem motorista manda
  assert.equal(statusParaPassageiro('', true), 'Motorista indo até você')
  assert.equal(statusParaPassageiro('Dispatched', true), 'Motorista indo até você')
  assert.equal(statusParaPassageiro('DriverArrived', true), 'Motorista chegou')
  assert.equal(statusParaPassageiro('PassengerOnBoard', true), 'Em viagem')
  assert.equal(statusParaPassageiro('Algo Novo', true), 'Algo Novo') // desconhecido aparece como veio
})

test('webhook evolution', () => {
  const base = { event: 'messages.upsert', data: { key: { id: 'X1', remoteJid: '5511999998888@s.whatsapp.net' }, message: { conversation: ' oi ' } } }
  assert.deepEqual(lerWebhook(base), { telefone: '5511999998888', texto: 'oi', externoId: 'wa:X1' })
  assert.equal(lerWebhook({ ...base, data: { ...base.data, key: { ...base.data.key, fromMe: true } } }), null)
  assert.equal(lerWebhook({ ...base, data: { ...base.data, key: { id: 'G', remoteJid: '123@g.us' } } }), null)
  const lid = { ...base, data: { ...base.data, key: { id: 'L', remoteJid: '999@lid', remoteJidAlt: '5511999998888@s.whatsapp.net' } } }
  assert.equal(lerWebhook(lid).telefone, '5511999998888')
})

function montar() {
  const corridas = [], mensagens = [], enviados = [], aoMotorista = []
  let seq = 0, falharWhats = false
  const booking = { id: 700, nome: 'Ana Souza', telefone: '11 99999-8888', motorista: null, veiculo: 'Corolla', placa: 'ABC1D23', status: '',
    origemCoord: { lat: -23.43, lon: -46.47 }, destinoCoord: { lat: -23.56, lon: -46.65 } }
  const autocab = {
    abertas: [{ id: 700 }],
    corridasAbertas: async () => autocab.abertas,
    detalhes: async () => ({ ...booking }),
    linkRastreio: async () => 'https://tr.ac.cab/x',
    rotas: 0,
    rota: async (a, b, resumo) => { autocab.rotas++; return { pontos: resumo ? null : [[a.lat, a.lon], [-23.5, -46.5], [b.lat, b.lon]], duracao: 780 } },
    localizacaoVeiculo: async () => ({ lat: -23.5, lon: -46.6 }),
    msgs: [],
    mensagensMotoristas: async () => autocab.msgs,
    enviarAoMotorista: async (id, t) => aoMotorista.push([id, t]),
  }
  const repo = {
    bookingsExistentes: async ids => new Set(corridas.filter(c => ids.includes(c.autocab_booking)).map(c => c.autocab_booking)),
    criarCorrida: async c => {
      if (corridas.some(x => x.autocab_booking === c.booking)) return null
      const r = { id: ++seq, autocab_booking: c.booking, telefone: c.telefone, nome_cliente: c.nome, motorista_id: c.motoristaId, token: c.token, status: 'ATIVA', criado_em: new Date(Date.now() - 1000).toISOString() }
      corridas.push(r); return r
    },
    apagarCorrida: async id => corridas.splice(corridas.findIndex(c => c.id === id), 1),
    ativas: async () => corridas.filter(c => c.status === 'ATIVA'),
    finalizar: async id => { corridas.find(c => c.id === id).status = 'FINALIZADA' },
    trocarMotorista: async (id, m) => { corridas.find(c => c.id === id).motorista_id = m },
    porToken: async t => corridas.find(c => c.token === t) ?? null,
    salvarMensagem: async m => mensagens.some(x => x.externoId === m.externoId) ? false : (mensagens.push({ ...m, id: mensagens.length + 1, criado_em: new Date().toISOString() }), true),
    mensagens: async (corridaId, depois) => mensagens.filter(m => m.corridaId === corridaId && m.id > depois).map(({ id, origem, texto, criado_em }) => ({ id, origem, texto, criado_em })),
    apagarMensagem: async e => mensagens.splice(mensagens.findIndex(m => m.externoId === e), 1),
  }
  const whatsapp = { enviar: async (tel, txt) => { if (falharWhats) throw new Error('offline'); enviados.push([tel, txt]) } }
  const log = { info() {}, error() {} }
  const casos = criarCasos({ autocab, whatsapp, repo, baseUrl: 'https://bot', log })
  return { casos, autocab, booking, corridas, mensagens, enviados, aoMotorista, falhar: v => { falharWhats = v } }
}

test('fluxo completo', async () => {
  const t = montar()

  await t.casos.sincronizarCorridas() // sem motorista ainda: não envia
  assert.equal(t.enviados.length, 0)

  t.booking.motorista = { id: '42', nome: 'Carlos' }
  t.falhar(true)
  await t.casos.sincronizarCorridas() // WhatsApp caiu: corrida desfeita para tentar de novo
  assert.equal(t.corridas.length, 0)

  t.falhar(false)
  await t.casos.sincronizarCorridas()
  await t.casos.sincronizarCorridas() // segundo ciclo não duplica
  assert.equal(t.enviados.length, 1)
  const [tel, txt] = t.enviados[0]
  assert.equal(tel, '5511999998888')
  assert.match(txt, /^Olá Ana!/)
  assert.match(txt, new RegExp(`https://bot/r/${t.corridas[0].token}`))

  // passageiro -> motorista (mesmo sem o 9º dígito), duplicado ignorado
  const msg = { telefone: '551199998888', texto: 'estou no portão 2', externoId: 'wa:1' }
  await t.casos.mensagemPassageiro(msg)
  await t.casos.mensagemPassageiro(msg)
  assert.deepEqual(t.aoMotorista, [['42', 'Cliente: "estou no portão 2"']])

  // motorista -> passageiro; mensagem antiga (antes da corrida) e de outro motorista ignoradas
  t.autocab.msgs = [
    { id: 1, motoristaId: 42, texto: 'chego em 3 min', recebidaEm: new Date() },
    { id: 2, motoristaId: 42, texto: 'velha', recebidaEm: new Date(0) },
    { id: 3, motoristaId: 99, texto: 'outro', recebidaEm: new Date() },
  ]
  await t.casos.repassarMensagensMotoristas()
  await t.casos.repassarMensagensMotoristas()
  assert.deepEqual(t.enviados.slice(1), [['5511999998888', '🚗 Motorista: chego em 3 min']])

  // página
  const dados = await t.casos.paginaRastreio(t.corridas[0].token)
  const html = renderPagina(dados)
  assert.match(html, /Carlos/)
  assert.match(html, /ABC1D23/)
  assert.match(html, /Rastreio do veículo/)
  assert.doesNotMatch(html, /Safety Transfers/)
  assert.match(html, new RegExp(`/r/${t.corridas[0].token}/foto`))
  // mapa próprio: trajeto embutido na página, calculado uma vez só por corrida
  assert.match(html, /id="dados-mapa"/)
  assert.match(html, /\[\[-23.43,-46.47\],\[-23.5,-46.5\],\[-23.56,-46.65\]\]/)
  assert.equal(t.autocab.rotas, 1)
  await t.casos.paginaRastreio(t.corridas[0].token)
  assert.equal(t.autocab.rotas, 1, 'rota não é recalculada a cada abertura da página')
  assert.deepEqual(await t.casos.veiculo(t.corridas[0].token), { lat: -23.5, lon: -46.6, etaSeg: 780 })
  const chamadas = t.autocab.rotas
  await t.casos.veiculo(t.corridas[0].token)
  assert.equal(t.autocab.rotas, chamadas, 'ETA reaproveitado por 30s, não recalcula a cada consulta')
  // o script que vai para o navegador precisa ser JS válido (quebra de linha perdida num '\n' já quebrou isso)
  assert.doesNotThrow(() => new Function(html.match(/<script>([\s\S]*)<\/script>/)[1]))
  // compartilhar envia o MobilyTrack (só mapa), nunca o link do chat
  assert.match(html, /id="compartilhar"[^>]*data-url="https:\/\/tr\.ac\.cab\/x"/)
  assert.doesNotMatch(html.match(/id="compartilhar"[^>]*>/)[0], /\/r\//)
  assert.match(html, /tr\.ac\.cab/)
  assert.equal(await t.casos.paginaRastreio('naoexiste'), null)
  assert.doesNotMatch(html, /wa\.me/)

  // chat da página: envia ao motorista e lista a conversa inteira em ordem
  const token = t.corridas[0].token
  assert.equal(await t.casos.chatEnviar(token, '  já desci  '), 'ok')
  assert.equal(await t.casos.chatEnviar(token, '   '), 'vazia')
  assert.equal(await t.casos.chatEnviar('naoexiste', 'oi'), 'encerrada')
  assert.deepEqual(t.aoMotorista.at(-1), ['42', 'Cliente: "já desci"'])
  const conversa = (await t.casos.chatListar(token)).mensagens
  assert.deepEqual(conversa.map(m => [m.origem, m.texto]), [
    ['CLIENTE', 'estou no portão 2'], ['MOTORISTA', 'chego em 3 min'], ['CLIENTE', 'já desci'],
  ])
  assert.equal((await t.casos.chatListar(token, conversa[1].id)).mensagens.length, 1)

  // status vem do Autocab e muda sem mensagem nova no WhatsApp
  const whatsAntes = t.enviados.length
  t.booking.status = 'DriverArrived'
  await t.casos.sincronizarCorridas()
  assert.equal((await t.casos.chatListar(token)).status, 'Motorista chegou')

  // central retira o motorista: nada de WhatsApp novo, página mostra "buscando", chat bloqueado
  t.booking.motorista = null
  await t.casos.sincronizarCorridas()
  assert.equal(t.corridas[0].motorista_id, null)
  let estado = await t.casos.chatListar(token)
  assert.equal(estado.status, 'Buscando motorista')
  assert.equal(estado.motoristaId, null)
  assert.equal(await t.casos.chatEnviar(token, 'cadê?'), 'sem-motorista')
  assert.match(renderPagina(await t.casos.paginaRastreio(token)), /Buscando motorista/)

  // designa outro motorista (77): msgs dele de ANTES da troca e do motorista antigo (42) não entram
  t.autocab.msgs = [{ id: 10, motoristaId: 77, texto: 'assunto de outra corrida', recebidaEm: new Date() }]
  await new Promise(r => setTimeout(r, 5))
  t.booking.motorista = { id: '77', nome: 'Bruno' }
  t.booking.status = 'Dispatched'
  await t.casos.sincronizarCorridas()
  assert.equal(t.corridas[0].motorista_id, '77')
  estado = await t.casos.chatListar(token)
  assert.equal(estado.motoristaId, '77')
  assert.equal(estado.status, 'Motorista indo até você')
  const depois = new Date(Date.now() + 1000)
  t.autocab.msgs.push(
    { id: 11, motoristaId: 77, texto: 'sou o Bruno, a caminho', recebidaEm: depois },
    { id: 12, motoristaId: 42, texto: 'do antigo', recebidaEm: depois },
  )
  await t.casos.repassarMensagensMotoristas()
  assert.deepEqual(t.enviados.slice(whatsAntes).map(e => e[1]), ['🚗 Motorista: sou o Bruno, a caminho'])
  assert.equal(await t.casos.chatEnviar(token, 'oi Bruno'), 'ok')
  assert.deepEqual(t.aoMotorista.at(-1), ['77', 'Cliente: "oi Bruno"'])

  // envio ao PDA falhando (endpoint pendente) não perde a mensagem
  t.autocab.enviarAoMotorista = async () => { throw new Error('pendente') }
  assert.equal(await t.casos.chatEnviar(token, 'alô'), 'ok')
  assert.equal((await t.casos.chatListar(token)).mensagens.at(-1).texto, 'alô')

  // corrida sai da lista de abertas -> encerrada, link expira
  t.autocab.abertas = []
  await t.casos.sincronizarCorridas()
  assert.equal((await t.casos.paginaRastreio(t.corridas[0].token)).encerrada, true)
  assert.equal(await t.casos.chatListar(t.corridas[0].token), null)
  assert.equal(await t.casos.veiculo(t.corridas[0].token), null) // encerrada não expõe a posição
  assert.equal(await t.casos.fotoMotorista(t.corridas[0].token), null) // corrida encerrada não expõe a foto
})

test('envio ao motorista usa o celular do cadastro e /textmessage', async () => {
  const { criarAutocab } = await import('./adapters/autocab.js')
  const chamadas = [], original = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    chamadas.push([opts.method ?? 'GET', url, opts.body, opts.headers['Ocp-Apim-Subscription-Key']])
    const corpo = url.includes('/drivers/42') ? { id: 42, mobile: '11988887777' } : url.includes('/drivers/7') ? { id: 7, mobile: '' } : {}
    return new Response(JSON.stringify(corpo), { status: 200 })
  }
  try {
    const autocab = criarAutocab({ chave: 'K' })
    await autocab.enviarAoMotorista('42', 'Cliente: "oi"')
    assert.deepEqual(chamadas, [
      ['GET', 'https://autocab-api.azure-api.net/booking/v1/drivers/42', undefined, 'K'],
      ['POST', 'https://autocab-api.azure-api.net/driver/v1/textmessage', '{"Recipients":["11988887777"],"Message":"Cliente: \\"oi\\""}', 'K'],
    ])
    await assert.rejects(autocab.enviarAoMotorista('7', 'x'), /sem celular/)

    // foto: string JSON base64 -> bytes JPEG; 404 -> null
    globalThis.fetch = async url => url.endsWith('/drivers/42/picture')
      ? new Response(JSON.stringify(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]).toString('base64')), { status: 200 })
      : new Response('', { status: 404 })
    const foto = await autocab.fotoMotorista('42')
    assert.equal(foto.tipo, 'image/jpeg')
    assert.deepEqual([...foto.bytes], [0xff, 0xd8, 0xff, 0xe0, 1, 2])
    assert.equal(await autocab.fotoMotorista('7'), null)

    // busca: descarta corrida sem telefone; erro de rede diz qual rota foi
    globalThis.fetch = async () => new Response(JSON.stringify({ bookings: [
      { id: 1, telephoneNumber: '11 99999-8888' }, { id: 2, telephoneNumber: '' }, { id: 3 },
    ] }), { status: 200 })
    assert.deepEqual((await autocab.corridasAbertas()).map(b => b.id), [1])
    globalThis.fetch = async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError') }
    await assert.rejects(autocab.corridasAbertas(), /Autocab sem resposta em \d+s .*\/1\.2\/search: The operation was aborted/)
  } finally {
    globalThis.fetch = original
  }
})

test('página escapa HTML vindo do Autocab', () => {
  const html = renderPagina({ nome: '<script>x</script>', motorista: { nome: '"><img>' }, origem: '<b onmouseover=x>' })
  assert.doesNotMatch(html, /<script>x|<img>|<b onmouseover/)
})
