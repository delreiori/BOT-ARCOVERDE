// Casos de uso. Só conhecem as portas abaixo; quem as implementa são os adapters (src/adapters).
//
// autocab:  corridasAbertas() -> [{ id }]
//           detalhes(id) -> { nome, telefone, motorista: { id, nome } | null, veiculo, placa, origem, destino, previsao, status }
//           linkRastreio(id) -> url MobilyTrack
//           localizacaoVeiculo(id) -> { lat, lon } | null,  rota(a, b, resumo) -> { pontos, duracao } | null
//           mensagensMotoristas() -> [{ id, motoristaId, texto, recebidaEm: Date }]
//           enviarAoVeiculo(veiculoId, texto), fotoMotorista(motoristaId) -> { bytes, tipo } | null
// whatsapp: enviar(telefone, texto)
// repo:     bookingsExistentes(ids) -> Set, criarCorrida(c) -> corrida | null, apagarCorrida(id), ativas(),
//           finalizar(id), trocarMotorista(id, motoristaId | null), porToken(token),
//           salvarMensagem(m) -> bool (false = duplicada), apagarMensagem(externoId),
//           mensagens(corridaId, depoisDoId) -> [{ id, origem, texto, criado_em }]
import {
  normalizarTelefone, gerarToken, textoBoasVindas, paraMotorista, corridaDoTelefone, statusParaPassageiro,
} from '../domain/corrida.js'

export function criarCasos({ autocab, whatsapp, repo, baseUrl, log = console }) {
  // Estado vivo de cada corrida ativa, atualizado a cada ciclo: status do Autocab e desde quando o motorista atual
  // está nela (mensagens dele anteriores a isso não são desta corrida).
  // ponytail: em memória, vale para 1 instância; após reiniciar, volta em 1 ciclo (e ignora msgs do período parado).
  const estado = new Map() // corrida.id -> { status, desde: Date, rota }
  const inicio = new Date()
  const desdeDe = c => estado.get(c.id)?.desde ?? new Date(Math.max(inicio, new Date(c.criado_em)))

  // Corrida nova com motorista -> grava e manda o link (uma única vez).
  // Corrida ativa -> acompanha motorista e status. Saiu da lista de abertas -> encerra.
  async function sincronizarCorridas() {
    const abertas = (await autocab.corridasAbertas()).map(b => String(b.id))
    const conhecidas = await repo.bookingsExistentes(abertas)

    // ponytail: 1 GET por corrida aberta ainda sem motorista a cada ciclo; ok para ~70 corridas/dia.
    for (const id of abertas.filter(id => !conhecidas.has(id))) {
      await novaCorrida(id).catch(e => log.error(`corrida ${id}:`, e.message)) // uma com erro não trava as outras
    }

    const setAbertas = new Set(abertas)
    for (const c of await repo.ativas()) {
      if (!setAbertas.has(c.autocab_booking)) {
        await repo.finalizar(c.id)
        estado.delete(c.id)
        continue
      }
      // ponytail: 1 GET por corrida ativa por ciclo, para pegar troca de motorista e status.
      await autocab.detalhes(c.autocab_booking)
        .then(d => aplicarDetalhes(c, d))
        .catch(e => log.error(`corrida ${c.autocab_booking}:`, e.message))
    }
  }

  async function novaCorrida(id) {
    const d = await autocab.detalhes(id)
    const telefone = normalizarTelefone(d.telefone)
    if (!d.motorista || !telefone) return // ainda sem motorista (tenta no próximo ciclo) ou sem celular

    const corrida = await repo.criarCorrida({
      booking: id, telefone, nome: d.nome, motoristaId: d.motorista.id, token: gerarToken(),
    })
    if (!corrida) return // outro ciclo já criou
    try {
      await whatsapp.enviar(telefone, textoBoasVindas({ nome: d.nome, link: `${baseUrl}/r/${corrida.token}` }))
      log.info(`corrida ${id}: link enviado`)
    } catch (e) {
      await repo.apagarCorrida(corrida.id) // não perde a corrida: próximo ciclo tenta enviar de novo
      throw e
    }
  }

  // Reatribuição NÃO manda WhatsApp novo: só atualiza a corrida; a página do passageiro percebe e recarrega.
  // Sem motorista (central retirou e ainda não designou outro) = "Buscando motorista".
  async function aplicarDetalhes(c, d) {
    const novo = d.motorista?.id ?? null
    let desde = desdeDe(c)
    if (novo !== (c.motorista_id ?? null)) {
      await repo.trocarMotorista(c.id, novo)
      c.motorista_id = novo
      desde = new Date()
      log.info(`corrida ${c.autocab_booking}: motorista ${novo ?? 'retirado, buscando outro'}`)
    }
    const e = estado.get(c.id) ?? {} // mantém a rota já calculada
    e.status = statusParaPassageiro(d.status, Boolean(novo))
    e.desde = desde
    e.veiculoId = d.veiculoId
    e.origemCoord = d.origemCoord
    e.destinoCoord = d.destinoCoord
    estado.set(c.id, e)
    return e
  }

  // Motorista -> passageiro: o que o motorista manda para a central entra só no chat da página, não no WhatsApp.
  async function repassarMensagensMotoristas() {
    const ativas = await repo.ativas()
    if (!ativas.length) return
    const porMotorista = new Map(ativas.filter(c => c.motorista_id).map(c => [c.motorista_id, c])) // fica a mais recente

    for (const m of await autocab.mensagensMotoristas()) {
      const c = porMotorista.get(String(m.motoristaId))
      if (!c || !m.texto || m.recebidaEm < desdeDe(c)) continue
      await repo.salvarMensagem({ corridaId: c.id, origem: 'MOTORISTA', texto: m.texto, externoId: `autocab:${m.id}` })
    }
  }

  // Passageiro -> motorista: chega no motorista como mensagem da central, "Cliente: ...".
  // A mensagem fica salva mesmo se o envio ao Autocab falhar, e aparece no chat da página.
  async function doCliente(c, texto, externoId) {
    if (!c.motorista_id) return log.info(`corrida ${c.autocab_booking}: mensagem sem motorista designado, ignorada`)
    if (!(await repo.salvarMensagem({ corridaId: c.id, origem: 'CLIENTE', texto, externoId }))) return
    try {
      // o id do veículo vem do ciclo; se a página chegou antes do primeiro ciclo, busca na hora
      const veiculoId = estado.get(c.id)?.veiculoId ?? (await autocab.detalhes(c.autocab_booking)).veiculoId
      if (!veiculoId) throw new Error('corrida sem veículo designado')
      await autocab.enviarAoVeiculo(veiculoId, paraMotorista(texto))
      log.info(`corrida ${c.autocab_booking}: mensagem entregue ao veículo ${veiculoId}`)
    } catch (e) {
      log.error(`corrida ${c.autocab_booking}: falha ao enviar ao veículo:`, e.message)
    }
  }

  // Chat da página. Retorna 'ok' | 'vazia' | 'encerrada' | 'sem-motorista'.
  async function chatEnviar(token, texto) {
    texto = String(texto ?? '').trim().slice(0, 500)
    const c = await ativaPorToken(token)
    if (!c) return 'encerrada'
    if (!texto) return 'vazia'
    if (!c.motorista_id) return 'sem-motorista'
    await doCliente(c, texto, `web:${gerarToken()}`)
    return 'ok'
  }

  // { motoristaId, status, mensagens (id > depois) }; null = corrida encerrada ou token inválido (a página recarrega).
  async function chatListar(token, depois = 0) {
    const c = await ativaPorToken(token)
    if (!c) return null
    return {
      motoristaId: c.motorista_id ?? null,
      status: estado.get(c.id)?.status ?? statusParaPassageiro('', Boolean(c.motorista_id)),
      mensagens: await repo.mensagens(c.id, depois),
    }
  }

  // Se o passageiro responder no próprio WhatsApp, também chega ao motorista.
  async function mensagemPassageiro({ telefone, texto, externoId }) {
    const c = corridaDoTelefone(await repo.ativas(), telefone)
    // ponytail: sem corrida ativa o bot fica calado, para não responder quem fala com o número por outro motivo.
    if (!c) return log.info(`mensagem de ${telefone} sem corrida ativa, ignorada`)
    await doCliente(c, texto, externoId)
  }

  // Posição atual do carro + ETA: { lat, lon, etaSeg } ou null (sem veículo / corrida encerrada).
  // O ETA é o tempo pelas ruas do carro até o embarque (ou até o destino, com o passageiro a bordo).
  async function veiculo(token) {
    const c = await ativaPorToken(token)
    if (!c) return null
    const pos = await autocab.localizacaoVeiculo(c.autocab_booking)
    if (!pos) return null
    return { ...pos, etaSeg: await eta(c, pos) }
  }

  // ponytail: recalcula no máximo a cada 30s por corrida, para não martelar o OSRM a cada consulta da página.
  async function eta(c, pos) {
    const e = estado.get(c.id)
    if (!e) return null
    if (e.eta && Date.now() - e.eta.em < 30000) return e.eta.seg
    const alvo = e.status === 'Em viagem' ? e.destinoCoord : e.origemCoord
    const r = await autocab.rota(pos, alvo, true).catch(erro => (log.error('eta:', erro.message), null))
    e.eta = { seg: r?.duracao ?? null, em: Date.now() }
    return e.eta.seg
  }

  // Trajeto embarque -> destino. Calculado uma vez por corrida: não muda durante a viagem.
  async function rotaDaCorrida(c, d) {
    const e = estado.get(c.id) ?? {}
    if ('rota' in e) return e.rota
    const r = await autocab.rota(d.origemCoord, d.destinoCoord).catch(erro => (log.error('rota:', erro.message), null))
    e.rota = r?.pontos ?? null
    estado.set(c.id, e)
    return e.rota
  }

  // Foto do motorista da corrida: { bytes, tipo } ou null (sem foto / sem motorista / corrida encerrada).
  async function fotoMotorista(token) {
    const c = await ativaPorToken(token)
    return c?.motorista_id ? autocab.fotoMotorista(c.motorista_id) : null
  }

  async function ativaPorToken(token) {
    const c = await repo.porToken(token)
    return c?.status === 'ATIVA' ? c : null
  }

  // Dados da página /r/{token}. null = token inexistente. Busca o Autocab ao vivo e já aplica
  // uma eventual troca de motorista, para a página e o chat nunca discordarem.
  async function paginaRastreio(token) {
    const c = await repo.porToken(token)
    if (!c) return null
    if (c.status !== 'ATIVA') return { encerrada: true, nome: c.nome_cliente }
    const [d, link] = await Promise.all([
      autocab.detalhes(c.autocab_booking),
      autocab.linkRastreio(c.autocab_booking).catch(e => (log.error(e), null)),
    ])
    const { status } = await aplicarDetalhes(c, d)
    return { ...d, link, token, statusTexto: status, rota: await rotaDaCorrida(c, d) }
  }

  return {
    sincronizarCorridas, repassarMensagensMotoristas, mensagemPassageiro, chatEnviar, chatListar, fotoMotorista, veiculo, paginaRastreio,
  }
}
