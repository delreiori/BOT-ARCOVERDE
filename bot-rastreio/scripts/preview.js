// Servidor real do bot (http.js + pagina.js) com casos falsos, só para ver o chat no navegador.
import { criarServidor } from '../src/adapters/http.js'
const msgs = [{ id: 1, origem: 'MOTORISTA', texto: 'Boa tarde! Estou saindo do posto, chego em 8 minutos.', criado_em: new Date(Date.now()-120e3).toISOString() }]
const dados = { nome: 'Ana Souza', motorista: { id: '1', nome: 'Carlos' }, veiculo: 'Toyota · Corolla · Preto', placa: 'ABC1D23', origem: 'Aeroporto de Guarulhos (GRU), Terminal 3', destino: 'Av. Paulista, 1578 - Bela Vista, São Paulo', previsao: new Date(Date.now()+8*60e3).toISOString(), link: 'https://tr.ac.cab/NzAwMDAyMg:342bngw_Wk6k7-nKegSLtg' }
// foto de exemplo (silhueta); em produção vem de GET /drivers/{id}/picture do Autocab
const FOTO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8d6e63"/><stop offset="1" stop-color="#4e342e"/></linearGradient></defs><rect width="100" height="100" fill="#cfd8dc"/><circle cx="50" cy="38" r="20" fill="url(#g)"/><path d="M14 100c2-22 17-34 36-34s34 12 36 34z" fill="#37474f"/></svg>`
// trajeto e carro de exemplo (Guarulhos -> Paulista); em produção vêm do Autocab/OSRM
const ROTA = Array.from({ length: 40 }, (_, i) => [-23.4356 + (-23.5613 + 23.4356) * i / 39, -46.4731 + (-46.6565 + 46.4731) * i / 39])
let passo = 0
const casos = {
  paginaMotorista: async t => t === 'MOTORISTA99' ? { ...dados, paraMotorista: true, token: 'DEMO123456', tokenMotorista: t, statusTexto: 'Motorista indo até você' } : null,
  chatMotoristaListar: async (t, depois) => t === 'MOTORISTA99' ? { motoristaId: '1', status: 'Motorista indo até você', mensagens: msgs.filter(m => m.id > depois) } : null,
  chatMotoristaEnviar: async (t, texto) => { msgs.push({ id: msgs.length + 1, origem: 'MOTORISTA', texto: String(texto).trim(), criado_em: new Date().toISOString() }); return 'ok' },
  paginaRastreio: async t => t === 'DEMO123456' ? { ...dados, token: t, statusTexto: 'Motorista indo até você' }
    : t === 'BUSCA12345' ? { ...dados, motorista: null, token: t, statusTexto: 'Buscando motorista' } : null,
  fotoMotorista: async t => t === 'DEMO123456' ? { tipo: 'image/svg+xml', bytes: Buffer.from(FOTO) } : null,
  chatListar: async (t, depois) => t === 'BUSCA12345' ? { motoristaId: null, status: 'Buscando motorista', mensagens: [] } : t === 'DEMO123456' ? { motoristaId: '1', status: 'Motorista indo até você', mensagens: msgs.filter(m => m.id > depois) } : null,
  chatEnviar: async (t, texto) => { msgs.push({ id: msgs.length+1, origem: 'CLIENTE', texto: String(texto).trim(), criado_em: new Date().toISOString() });
    setTimeout(() => msgs.push({ id: msgs.length+1, origem: 'MOTORISTA', texto: 'Ok, te vejo aí!', criado_em: new Date().toISOString() }), 3000); return 'ok' },
}
criarServidor({ casos, segredo: 'x' }).listen(process.env.PORT || 4777, () => console.info('preview: http://localhost:' + (process.env.PORT || 4777) + '/r/DEMO123456  (sem motorista: /r/BUSCA12345)'))
