// Adapter de saída: Autocab Ghost API (booking.json + driver.yaml).
const BOOKING = 'https://autocab-api.azure-api.net/booking/v1'
const DRIVER = 'https://autocab-api.azure-api.net/driver/v1'
const VEHICLE = 'https://autocab-api.azure-api.net/vehicle/v1'
const HORA = 3600e3

export function criarAutocab({ chave }) {
  async function req(url, opts = {}) {
    const inicio = Date.now()
    let r
    try {
      r = await fetch(url, {
        ...opts,
        headers: { 'Ocp-Apim-Subscription-Key': chave, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
      })
    } catch (e) {
      // o erro do fetch não diz qual rota foi; sem isso o log só mostra "aborted due to timeout"
      throw new Error(`Autocab sem resposta em ${Math.round((Date.now() - inicio) / 1000)}s ${url}: ${e.message}`)
    }
    if (!r.ok) throw new Error(`Autocab ${r.status} ${url}: ${(await r.text()).slice(0, 200)}`)
    return r.json()
  }

  return {
    // ponytail: janela de ±12h no horário de busca; corrida aberta fora disso é tratada como encerrada.
    async corridasAbertas() {
      const agora = Date.now()
      const { bookings = [] } = await req(`${BOOKING}/1.2/search`, {
        method: 'POST',
        body: JSON.stringify({
          from: new Date(agora - 12 * HORA).toISOString(),
          to: new Date(agora + 12 * HORA).toISOString(),
          types: ['Active', 'Dispatched', 'Mobile', 'ExchangedActive', 'ExchangedMobile'],
          companyIds: [], capabilities: [], capabilityMatchType: 'Any',
          exactMatch: false, ignorePostcode: true, ignoreTown: true,
        }),
      })
      // sem telefone não há para quem mandar o link: nem busca os detalhes a cada ciclo
      return bookings.filter(b => String(b.telephoneNumber ?? '').replace(/\D/g, '').length >= 10)
    },

    async detalhes(id) {
      const b = await req(`${BOOKING}/booking/${encodeURIComponent(id)}`)
      const m = b.driver ?? {}, v = b.vehicle ?? {}
      const previsao = b.activeBooking?.estimatedPickupTime
      return {
        nome: b.name ?? '',
        telefone: b.telephoneNumber ?? '',
        motorista: m.id ? { id: String(m.id), nome: m.forename || m.fullName || '' } : null,
        veiculo: [v.make, v.model, v.colour].filter(Boolean).join(' · '),
        veiculoId: v.id ? String(v.id) : null,
        placa: v.registration || v.plateNumber || '',
        origem: b.pickup?.address?.text ?? '',
        destino: b.destination?.address?.text ?? '',
        previsao: previsao && !previsao.startsWith('0001') ? previsao : null,
        status: b.activeBooking?.status ?? '',
      }
    },

    async linkRastreio(id) {
      const { url } = await req(`${BOOKING}/trackingLink/${encodeURIComponent(id)}`)
      return url.startsWith('http') ? url : `https://${url}`
    },

    // ponytail: repassa toda mensagem com texto; filtrar por `type` quando virmos os tipos reais (ex.: MsgClear "Start").
    async mensagensMotoristas() {
      const lista = await req(`${DRIVER}/drivermessages`)
      return lista.map(m => ({
        id: m.id,
        motoristaId: m.driverId,
        texto: String(m.messageText ?? '').trim(),
        recebidaEm: new Date(m.timeReceived),
      }))
    },

    // "Get Driver Picture by Id" (driver.yaml): corpo é uma string JSON com a imagem em base64; 404 = sem foto.
    async fotoMotorista(motoristaId) {
      const r = await fetch(`${DRIVER}/drivers/${encodeURIComponent(motoristaId)}/picture`, {
        headers: { 'Ocp-Apim-Subscription-Key': chave },
        signal: AbortSignal.timeout(15000),
      })
      if (r.status === 404) return null
      if (!r.ok) throw new Error(`Autocab ${r.status} foto do motorista ${motoristaId}`)
      const bytes = Buffer.from((await r.text()).trim().replace(/^"|"$/g, ''), 'base64')
      if (bytes.length < 4) return null
      return { bytes, tipo: bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg' }
    },

    // "Send Message to Vehicle(s)" (vehicle.yaml): cai na caixa de mensagens da central dentro do PDA.
    // (O /driver/v1/textmessage manda SMS para o celular do motorista, não serve aqui.)
    async enviarAoVeiculo(veiculoId, texto) {
      const r = await req(`${VEHICLE}/vehicles/message`, {
        method: 'POST',
        body: JSON.stringify({ text: texto, vehicles: [Number(veiculoId)], companies: [], capabilities: [], zones: [] }),
      })
      const fora = r?.vehicles?.nonWorkingVehicles ?? []
      if (fora.length && !(r?.vehicles?.workingVehicles ?? []).length) {
        throw new Error(`veículo ${veiculoId} fora de turno: mensagem não entregue`)
      }
    },
  }
}
