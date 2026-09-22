// Adapter de persistência: tabelas rastreio_corridas / rastreio_mensagens (ver db/schema.sql).
// As colunas de data são text com ISO 8601 UTC, então ordenar por elas é ordem cronológica.
import pg from 'pg'

export function criarRepo(connectionString) {
  // Sem timeout, um banco inalcançável trava a página e o ciclo sem nenhum erro no log.
  const db = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 10000, query_timeout: 15000 })
  const q = (sql, params) => db.query(sql, params).then(r => r.rows)
  const agora = () => new Date().toISOString()

  return {
    async bookingsExistentes(ids) {
      if (!ids.length) return new Set()
      const rows = await q('select autocab_booking from rastreio_corridas where autocab_booking = any($1)', [ids])
      return new Set(rows.map(r => r.autocab_booking))
    },

    async criarCorrida({ booking, telefone, nome, motoristaId, token }) {
      const rows = await q(
        `insert into rastreio_corridas (autocab_booking, telefone, nome_cliente, motorista_id, token, status, criado_em)
         values ($1, $2, $3, $4, $5, 'ATIVA', $6)
         on conflict (autocab_booking) do nothing returning *`,
        [booking, telefone, nome, motoristaId, token, agora()],
      )
      return rows[0] ?? null
    },

    apagarCorrida: id => q('delete from rastreio_corridas where id = $1', [id]),

    ativas: () => q(`select * from rastreio_corridas where status = 'ATIVA' order by criado_em`),

    finalizar: id =>
      q(`update rastreio_corridas set status = 'FINALIZADA', finalizado_em = $2 where id = $1`, [id, agora()]),

    trocarMotorista: (id, motoristaId) =>
      q('update rastreio_corridas set motorista_id = $2 where id = $1', [id, motoristaId]),

    porToken: async token => (await q('select * from rastreio_corridas where token = $1', [token]))[0] ?? null,

    async salvarMensagem({ corridaId, origem, texto, externoId }) {
      const rows = await q(
        `insert into rastreio_mensagens (corrida_id, origem, texto, externo_id, criado_em)
         values ($1, $2, $3, $4, $5)
         on conflict (externo_id) do nothing returning id`,
        [corridaId, origem, texto, externoId, agora()],
      )
      return rows.length > 0
    },

    apagarMensagem: externoId => q('delete from rastreio_mensagens where externo_id = $1', [externoId]),

    mensagens: (corridaId, depois) =>
      q(`select id, origem, texto, criado_em from rastreio_mensagens
         where corrida_id = $1 and id > $2 order by id`, [corridaId, depois]),
  }
}
