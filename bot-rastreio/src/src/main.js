// Composition root: liga cada porta ao seu adapter e sobe o servidor + o ciclo de consulta ao Autocab.
import { criarCasos } from './application/casos.js'
import { criarAutocab } from './adapters/autocab.js'
import { criarEvolution } from './adapters/evolution.js'
import { criarRepo } from './adapters/postgres.js'
import { criarServidor } from './adapters/http.js'

const env = nome => {
  const v = process.env[nome]
  if (!v) throw new Error(`variável de ambiente ${nome} não definida (ver .env.example)`)
  return v
}

const casos = criarCasos({
  autocab: criarAutocab({ chave: env('AUTOCAB_KEY') }),
  whatsapp: criarEvolution({ url: env('EVOLUTION_URL'), chave: env('EVOLUTION_KEY'), instancia: env('EVOLUTION_INSTANCIA') }),
  repo: criarRepo(env('DATABASE_URL')),
  baseUrl: env('BASE_URL').replace(/\/$/, ''),
})

criarServidor({
  casos,
  segredo: env('WEBHOOK_SECRET'),
}).listen(process.env.PORT || 3000, () => console.info(`bot no ar na porta ${process.env.PORT || 3000}`))

// Autocab não tem webhook de corrida criada nem de mensagem do motorista: consultamos em ciclo.
// setTimeout encadeado (e não setInterval) para um ciclo lento nunca se sobrepor ao próximo.
const INTERVALO = Number(process.env.INTERVALO_MS) || 15000
async function ciclo() {
  await casos.sincronizarCorridas().catch(e => console.error('sincronizar corridas:', e.message))
  await casos.repassarMensagensMotoristas().catch(e => console.error('mensagens motoristas:', e.message))
  setTimeout(ciclo, INTERVALO)
}
ciclo()
