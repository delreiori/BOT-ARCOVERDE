// node --test : despacho pela escala, com Autocab falso em memória.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarEscala } from './application/escala.js'

function montar() {
  const acoes = []
  const reservas = new Map()
  const autocab = {
    fila: [{ veiculoId: '10', motoristaId: '9999' }, { veiculoId: '20', motoristaId: '8888' }],
    zonas: async () => [{ id: 1, name: 'São Bernardo' }, { id: 7, name: 'ESCALA 1' }],
    corridasSeguras: async () => [...reservas.values()].filter(b => b.hold),
    corrida: async id => reservas.get(String(id)),
    filaDaZona: async z => (z === 7 ? autocab.fila : []),
    direcionarAoMotorista: async (id, m) => acoes.push(['direcionar', String(id), m]),
    liberar: async id => { acoes.push(['liberar', String(id)]); reservas.get(String(id)).hold = false },
  }
  const reserva = (id, zonaDestino) => {
    const b = { id, hold: true, rejectedVehicles: [], destination: { address: { zone: { id: zonaDestino } } } }
    reservas.set(String(id), b)
    return b
  }
  const log = { info() {}, error() {} }
  return { autocab, acoes, reserva, reservas, log }
}

test('destino fora da base vai para o primeiro da escala; dentro da base o bot não toca', async () => {
  const t = montar()
  const escala = criarEscala({ autocab: t.autocab, nomeEscala: 'ESCALA 1', nomeBase: 'SAO BERNARDO', log: t.log })

  t.reserva(100, 7)  // destino fora de São Bernardo
  t.reserva(200, 1)  // destino na própria base: não é da escala
  await escala.ciclo()

  assert.deepEqual(t.acoes, [['direcionar', '100', '9999'], ['liberar', '100']])
  assert.equal(t.reservas.get('200').hold, true, 'corrida da base continua segura, sem interferência')
})

test('recusa passa ao próximo; fila esgotada libera para a frota', async () => {
  const t = montar()
  const escala = criarEscala({ autocab: t.autocab, nomeEscala: 'ESCALA 1', nomeBase: 'SAO BERNARDO', log: t.log })
  const b = t.reserva(300, 7)
  await escala.ciclo()
  assert.deepEqual(t.acoes.at(-2), ['direcionar', '300', '9999'])

  b.rejectedVehicles = [10] // o primeiro recusou
  await escala.ciclo()
  assert.deepEqual(t.acoes.at(-2), ['direcionar', '300', '8888'], 'vai para o segundo da escala')

  b.rejectedVehicles = [10, 20] // os dois recusaram
  await escala.ciclo()
  assert.deepEqual(t.acoes.at(-1), ['liberar', '300'], 'sem mais ninguém na escala, solta para a frota')

  const antes = t.acoes.length
  await escala.ciclo()
  assert.equal(t.acoes.length, antes, 'corrida encerrada sai do controle da escala')
})

test('ninguém na escala: solta direto para a frota, sem direcionar', async () => {
  const t = montar()
  t.autocab.fila = []
  const escala = criarEscala({ autocab: t.autocab, nomeEscala: 'ESCALA 1', nomeBase: 'SAO BERNARDO', log: t.log })
  t.reserva(400, 7)
  await escala.ciclo()
  assert.deepEqual(t.acoes, [['liberar', '400']])
})

test('motorista aceitou: a corrida sai do controle e não é reofertada', async () => {
  const t = montar()
  const escala = criarEscala({ autocab: t.autocab, nomeEscala: 'ESCALA 1', nomeBase: 'SAO BERNARDO', ofertaMs: 0, log: t.log })
  const b = t.reserva(500, 7)
  await escala.ciclo()
  b.driver = { id: 9999 }
  const antes = t.acoes.length
  await escala.ciclo()
  await escala.ciclo()
  assert.equal(t.acoes.length, antes)
})

test('zona da escala inexistente: não mexe em nada', async () => {
  const t = montar()
  const escala = criarEscala({ autocab: t.autocab, nomeEscala: 'ESCALA 9', nomeBase: 'SAO BERNARDO', log: t.log })
  t.reserva(600, 7)
  await escala.ciclo()
  assert.deepEqual(t.acoes, [])
})
