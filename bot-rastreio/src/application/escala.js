// Despacho pela ESCALA: corrida com destino FORA da zona base fica segura e só vai para quem
// está na zona da escala, na ordem da fila. Recusou, passa para o próximo. Fila vazia, solta para a frota.
//
// autocab: zonas() -> [{ id, name }], corridasSeguras() -> [reserva], corrida(id) -> reserva,
//          filaDaZona(zonaId) -> [{ veiculoId, motoristaId }], direcionarAoMotorista(id, motoristaId), liberar(id)

const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()

export function criarEscala({ autocab, nomeEscala, nomeBase, ofertaMs = 45000, log = console }) {
  const emCurso = new Map() // bookingId -> { tentados: [veiculoId], em: ms }
  let zonas = null // { escala: id, base: id }

  async function ids() {
    if (zonas) return zonas
    const lista = await autocab.zonas()
    const achar = nome => lista.find(z => semAcento(z.name) === semAcento(nome))?.id ?? null
    zonas = { escala: achar(nomeEscala), base: achar(nomeBase) }
    if (zonas.escala == null) log.error(`zona "${nomeEscala}" não existe no Autocab: a escala fica desligada`)
    if (zonas.base == null) log.error(`zona "${nomeBase}" não existe no Autocab: a escala fica desligada`)
    return zonas
  }

  const destinoForaDaBase = (b, baseId) => {
    const zona = b.destination?.address?.zone?.id ?? b.destination?.address?.zoneId
    return zona != null && zona !== baseId // sem destino informado, não é corrida da escala
  }

  async function ciclo() {
    const { escala, base } = await ids()
    if (escala == null || base == null) return

    for (const b of await autocab.corridasSeguras()) {
      if (emCurso.has(String(b.id)) || !destinoForaDaBase(b, base)) continue
      await oferecer(b, escala, []).catch(e => log.error(`escala: corrida ${b.id}:`, e.message))
    }
    await acompanhar(escala)
  }

  // Direciona a corrida ao primeiro da fila ainda não tentado e solta. Sem ninguém, solta para a frota.
  async function oferecer(b, escalaId, tentados) {
    const id = String(b.id)
    const fila = await autocab.filaDaZona(escalaId)
    const recusaram = (b.rejectedVehicles ?? []).map(String)
    const vez = fila.find(v => !tentados.includes(v.veiculoId) && !recusaram.includes(v.veiculoId))

    if (!vez) {
      await autocab.liberar(id)
      emCurso.delete(id)
      log.info(`escala: corrida ${id} sem ninguém na escala, liberada para a frota`)
      return
    }
    await autocab.direcionarAoMotorista(id, vez.motoristaId)
    await autocab.liberar(id)
    emCurso.set(id, { tentados: [...tentados, vez.veiculoId], em: Date.now() })
    log.info(`escala: corrida ${id} oferecida ao motorista ${vez.motoristaId} (veículo ${vez.veiculoId})`)
  }

  // Aceitou -> sai do nosso controle. Recusou ou estourou o tempo -> próximo da fila.
  async function acompanhar(escalaId) {
    for (const [id, estado] of [...emCurso]) {
      try {
        const b = await autocab.corrida(id)
        const veiculo = estado.tentados.at(-1)
        if (b.driver?.id || b.vehicle?.id) { // alguém assumiu
          emCurso.delete(id)
          continue
        }
        const recusou = (b.rejectedVehicles ?? []).map(String).includes(veiculo)
        if (recusou || Date.now() - estado.em > ofertaMs) {
          log.info(`escala: corrida ${id} ${recusou ? 'recusada pelo veículo ' + veiculo : 'sem resposta'}, próximo da fila`)
          await oferecer(b, escalaId, estado.tentados)
        }
      } catch (e) {
        log.error(`escala: acompanhando a corrida ${id}:`, e.message)
      }
    }
  }

  return { ciclo }
}
