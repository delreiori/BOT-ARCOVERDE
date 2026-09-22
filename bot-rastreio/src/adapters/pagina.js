// Página /r/{token}: HTML servido direto, sem framework.
// Layout: saudação + miniatura do MobilyTrack (toque = tela cheia) + status no topo; chat ocupa o resto.

const TZ = process.env.TZ || 'America/Sao_Paulo'
const primeiroNome = t => String(t ?? '').split(',')[0].trim()
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
const hora = iso => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso))
function saudacao(agora = new Date()) {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }).format(agora))
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

const ICONE_EXPANDIR = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`
const ICONE_OK = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`
const ICONE_ENVIAR = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>`
const ICONE_COMPARTILHAR = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>`
const ICONE_PINO = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>`

const CSS = `
:root{--bg:#3a3a3a;--card:rgba(16,16,16,.74);--borda:rgba(255,255,255,.12);--acento:#d32f2f;--acento2:#a31515;--acento-texto:#ff6b63;
--texto:#f5f5f5;--suave:#b8b8b8;--brilho:0 0 24px rgba(229,57,53,.35);
--fonte:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{height:100dvh;display:flex;flex-direction:column;overflow:hidden;color:var(--texto);font:15px/1.5 var(--fonte);
background:linear-gradient(rgba(0,0,0,.18),rgba(0,0,0,.42)),url(/fundo.jpg) center/cover no-repeat,var(--bg);
padding:calc(14px + env(safe-area-inset-top)) 16px calc(12px + env(safe-area-inset-bottom))}
main{flex:1;min-height:0;width:100%;max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
.ponto{flex:none;width:8px;height:8px;border-radius:50%;background:var(--acento);animation:pulso 1.8s infinite}
@keyframes pulso{0%{box-shadow:0 0 0 0 rgba(229,57,53,.65)}70%{box-shadow:0 0 0 9px rgba(229,57,53,0)}100%{box-shadow:0 0 0 0 rgba(229,57,53,0)}}
h1{font-size:26px;line-height:1.15;font-weight:800;letter-spacing:-.01em}
h1 em{font-style:normal;color:var(--acento-texto);text-shadow:var(--brilho)}
.ola{color:var(--suave);font-size:14px}
.card{background:var(--card);border:1px solid var(--borda);border-radius:20px;
backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 12px 40px rgba(0,0,0,.35)}
button{font:inherit;color:inherit;cursor:pointer}
a:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid #fff;outline-offset:3px}

/* topo: saudação à esquerda, mapa + status à direita */
.topo{display:grid;grid-template-columns:1fr 124px;gap:14px;align-items:start}
.saudacao{display:grid;gap:6px;padding-top:2px}
.saudacao h1{text-shadow:0 2px 12px rgba(0,0,0,.55)}
.saudacao h1 em{display:block;overflow-wrap:anywhere}
.saudacao h1::after{content:"";display:block;width:min(100%,190px);height:3px;margin-top:12px;border-radius:2px;
background:linear-gradient(90deg,var(--acento),rgba(229,57,53,0));box-shadow:var(--brilho)}
.info{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin-top:6px;font-size:13.5px;line-height:1.35;
text-shadow:0 1px 6px rgba(0,0,0,.6)}
.info dt{color:#d0d0d0;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;padding-top:2px}
.info dd{font-weight:600;overflow-wrap:anywhere}
.compartilhar{display:inline-flex;align-items:center;gap:8px;justify-self:start;margin-top:10px;min-height:40px;padding:0 14px;
border-radius:999px;border:1px solid var(--acento);background:rgba(0,0,0,.45);color:#fff;font-weight:700;font-size:13px}
.compartilhar svg{color:var(--acento-texto)}
.lado{display:grid;gap:8px}
.lado .dica{display:flex;align-items:center;justify-content:center;gap:6px;font-size:11px;font-weight:700;
letter-spacing:.04em;color:var(--acento-texto)}
.mapa{position:relative;width:124px;height:124px;border-radius:18px;overflow:hidden;border:1px solid var(--borda);
background:#1c1c1c;box-shadow:var(--brilho)}
/* miniatura = MobilyTrack renderizado em 320px e reduzido; ao expandir volta ao tamanho real */
.mapa-tela{width:100%;height:100%;background:#0f0f0f}
/* modo noturno do mapa: inverte e dessatura os tiles; o trajeto e os marcadores ficam por cima, sem filtro */
.mapa-tela .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.92) contrast(.95) saturate(.55)}
.mapa-tela .leaflet-control-attribution{font-size:9px;background:rgba(0,0,0,.6);color:var(--suave)}
.mapa-tela .leaflet-control-attribution a{color:var(--suave)}
.carro{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;font-size:15px;
background:var(--acento);box-shadow:0 0 0 3px rgba(0,0,0,.45),var(--brilho)}
.mapa .sem-mapa{height:100%;display:grid;place-items:center;align-content:center;gap:4px;text-align:center;
color:var(--suave);font-size:11px;padding:8px}
.mapa .sem-mapa svg{color:var(--acento-texto)}
.toque{position:absolute;inset:0;border:0;background:transparent}
.vivo{position:absolute;left:6px;top:6px;display:flex;align-items:center;gap:5px;padding:3px 7px;border-radius:999px;
font-size:9px;font-weight:800;letter-spacing:.14em;color:var(--acento-texto);background:rgba(0,0,0,.78);pointer-events:none}
.vivo .ponto{width:6px;height:6px}
.fechar-mapa{display:none}
body.mapa-aberto .mapa{position:fixed;inset:0;z-index:20;width:auto;height:auto;border-radius:0;border:0}
body.mapa-aberto .toque{display:none}
body.mapa-aberto .fechar-mapa{display:flex;align-items:center;gap:8px;position:fixed;z-index:21;
top:calc(12px + env(safe-area-inset-top));right:12px;padding:10px 14px;border-radius:12px;font-weight:700;font-size:14px;
border:1px solid var(--borda);background:rgba(0,0,0,.85);color:var(--acento-texto)}
.status{font-size:12.5px;line-height:1.35;text-shadow:0 1px 6px rgba(0,0,0,.6)}
.status b{display:block;color:#e0e0e0;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase}
.status span{font-weight:700}
.status small{display:block;color:#e0e0e0;font-size:11.5px;margin-top:2px}
.status small em{font:700 12px var(--mono);font-style:normal;color:var(--acento-texto)}
.status small[hidden]{display:none}

/* chat: ocupa o resto da tela */
.chat{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.chat-topo{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--borda)}
.avatar{position:relative;overflow:hidden;flex:none;width:46px;height:46px;border-radius:14px;display:grid;place-items:center;font-weight:800;font-size:17px;
color:#fff;background:linear-gradient(135deg,var(--acento),var(--acento2));box-shadow:var(--brilho)}
.avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.nome{font-size:16px;font-weight:700;line-height:1.2}
.chat-topo small{display:flex;align-items:center;gap:6px;color:var(--acento-texto);font-size:12px}
.chat-topo small .ponto{width:6px;height:6px}
.perfil{border-bottom:1px solid var(--borda);padding:8px 16px}
.perfil summary{list-style:none;width:max-content;margin:0 auto;padding:5px 14px;border-radius:999px;cursor:pointer;
font-size:10.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--acento-texto);
border:1px solid var(--borda);background:rgba(229,57,53,.06)}
.perfil summary::-webkit-details-marker{display:none}
.perfil[open] summary{margin-bottom:12px}
.perfil dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:13.5px;padding-bottom:6px}
.perfil dt{color:var(--suave);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;padding-top:2px}
.placa{font:700 13px var(--mono);letter-spacing:.14em;color:var(--acento-texto)}
.msgs{flex:1;min-height:0;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;overscroll-behavior:contain}
.bolha{max-width:82%;padding:9px 13px 6px;border-radius:18px;font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere}
.bolha.eu{align-self:flex-end;color:#fff;background:linear-gradient(135deg,var(--acento),var(--acento2));border-bottom-right-radius:6px}
.bolha.ele{align-self:flex-start;background:rgba(255,255,255,.08);border:1px solid var(--borda);border-bottom-left-radius:6px}
.bolha time{display:block;text-align:right;font-size:10.5px;opacity:.65;margin-top:2px}
.sem-msgs{margin:auto;text-align:center;color:var(--suave);font-size:14px;max-width:250px}
.aviso{font-size:12px;color:#ff8a8a;padding:0 16px}
.aviso:not(:empty){padding-bottom:8px}
.envio{display:flex;gap:8px;padding:10px;border-top:1px solid var(--borda)}
.envio input{flex:1;min-width:0;min-height:48px;padding:0 16px;border-radius:15px;border:1px solid var(--borda);
background:rgba(0,0,0,.4);color:var(--texto);font:16px var(--fonte)}
.envio input::placeholder{color:var(--suave)}
.envio input:focus{outline:2px solid var(--acento);outline-offset:0;border-color:transparent}
.envio button{flex:none;width:48px;height:48px;border:0;border-radius:15px;display:grid;place-items:center;
color:#fff;background:linear-gradient(135deg,var(--acento),var(--acento2))}
.envio button:disabled,.envio input:disabled{opacity:.5}

/* telas de fim / link inválido */
.fim-corrida{text-align:center;display:grid;gap:12px;justify-items:center;padding:36px 22px;margin-top:12vh}
.selo{width:72px;height:72px;border-radius:22px;display:grid;place-items:center;color:#fff;
background:linear-gradient(135deg,var(--acento),var(--acento2));box-shadow:var(--brilho)}
@media (prefers-reduced-motion:reduce){.ponto{animation:none}}
`

// Chat sempre visível: polling de 5s em /r/{token}/mensagens. Texto sempre via textContent (nunca innerHTML).
const JS = `
const url = location.pathname.replace(/\\/$/, '') + '/mensagens'
const lista = document.getElementById('msgs'), form = document.getElementById('envio')
const campo = form.elements.texto, botao = form.querySelector('button'), aviso = document.getElementById('aviso')
let ultimo = 0
const hora = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function adicionar(m) {
  document.getElementById('sem-msgs')?.remove()
  const b = document.createElement('div')
  b.className = 'bolha ' + (m.origem === '__EU__' ? 'eu' : 'ele')
  b.textContent = m.texto
  const t = document.createElement('time')
  t.textContent = hora(m.criado_em)
  b.append(t)
  lista.append(b)
  ultimo = Math.max(ultimo, m.id)
}

async function carregar() {
  try {
    const r = await fetch(url + '?depois=' + ultimo, { cache: 'no-store' })
    if (r.status === 404) return location.reload() // corrida encerrada
    if (!r.ok) return
    const { motoristaId, status, mensagens } = await r.json()
    if ('__EU__' === 'CLIENTE' && (motoristaId ?? '') !== document.body.dataset.motorista) return location.reload()
    document.getElementById('status-texto').textContent = status
    mensagens.forEach(adicionar)
    if (mensagens.length) lista.scrollTop = lista.scrollHeight
  } catch {}
}

campo.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); form.requestSubmit() }
})
form.onsubmit = async e => {
  e.preventDefault()
  const texto = campo.value.trim()
  if (!texto) return
  botao.disabled = true
  aviso.textContent = ''
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }) })
    if (r.status === 404) return location.reload()
    if (r.status === 409) { aviso.textContent = 'Estamos buscando um motorista. O chat volta assim que ele for designado.'; return }
    if (!r.ok) throw 0
    campo.value = ''
    await carregar()
  } catch {
    aviso.textContent = 'Não foi possível enviar. Verifique sua conexão e tente de novo.'
  } finally {
    botao.disabled = false
    campo.focus()
  }
}

// Mapa próprio: trajeto pelas ruas + carro, com a posição que o Autocab informa a cada 10s.
const abrir = document.getElementById('abrir-mapa'), fechar = document.getElementById('fechar-mapa')
const dados = document.getElementById('dados-mapa')
if (abrir && dados && window.L) {
  const { rota, origem, destino } = JSON.parse(dados.textContent)
  const mapa = L.map('mapa', { zoomControl: false, attributionControl: true })
  // OpenStreetMap (sem chave) escurecido por filtro CSS, para combinar com a página
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa)

  const pontos = []
  if (rota && rota.length > 1) {
    L.polyline(rota, { color: '#ff3b30', weight: 5, opacity: .95 }).addTo(mapa)
    pontos.push(...rota)
  } else if (origem && destino) { // OSRM fora do ar: liga os dois pontos em linha tracejada
    L.polyline([[origem.lat, origem.lon], [destino.lat, destino.lon]], { color: '#ff3b30', weight: 3, dashArray: '6 8' }).addTo(mapa)
  }
  const ponta = (p, cor, titulo) => {
    if (!p) return
    L.circleMarker([p.lat, p.lon], { radius: 7, color: '#fff', weight: 2, fillColor: cor, fillOpacity: 1 })
      .addTo(mapa).bindPopup(titulo)
    pontos.push([p.lat, p.lon])
  }
  ponta(origem, '#fff', 'Embarque')
  ponta(destino, '#ff3b30', 'Destino')
  if (pontos.length) mapa.fitBounds(L.latLngBounds(pontos).pad(.25))
  else mapa.setView([-14.24, -51.93], 3)

  const eta = document.getElementById('eta'), etaHora = document.getElementById('eta-hora'), etaMin = document.getElementById('eta-min')
  let carro = null
  async function posicao() {
    try {
      const r = await fetch(location.pathname.replace(/\\/$/, '') + '/veiculo', { cache: 'no-store' })
      if (!r.ok) return
      const { lat, lon, etaSeg } = await r.json()
      if (etaSeg > 0) {
        const min = Math.max(1, Math.round(etaSeg / 60))
        const chegada = new Date(Date.now() + etaSeg * 1000)
        eta.hidden = false
        etaHora.textContent = chegada.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        etaMin.textContent = ' · ' + min + ' min'
      }
      const primeira = !carro
      if (!carro) {
        carro = L.marker([lat, lon], { icon: L.divIcon({ className: '', html: '<div class="carro">🚗</div>', iconSize: [26, 26] }) }).addTo(mapa)
      } else carro.setLatLng([lat, lon])
      if (primeira) mapa.fitBounds(L.latLngBounds([...pontos, [lat, lon]]).pad(.25))
    } catch {}
  }
  posicao()
  setInterval(posicao, 10000)

  // o mapa só sabe o novo tamanho depois que o navegador aplica o layout: por isso o requestAnimationFrame
  const reenquadrar = () => requestAnimationFrame(() => {
    mapa.invalidateSize()
    const tudo = carro ? [...pontos, carro.getLatLng()] : pontos
    if (tudo.length) mapa.fitBounds(L.latLngBounds(tudo).pad(.15))
  })
  abrir.onclick = () => { document.body.classList.add('mapa-aberto'); reenquadrar(); fechar.focus() }
  fechar.onclick = () => { document.body.classList.remove('mapa-aberto'); reenquadrar(); abrir.focus() }
  addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('mapa-aberto')) fechar.click() })
}

// Compartilhar: menu nativo do celular; sem ele (computador), copia o link.
const comp = document.getElementById('compartilhar')
if (comp) comp.onclick = async () => {
  const { url, texto } = comp.dataset, rotulo = comp.querySelector('span')
  if (navigator.share) {
    try { await navigator.share({ title: 'Minha viagem', text: texto, url }) } catch {} // cancelar não é erro
    return
  }
  try {
    await navigator.clipboard.writeText(texto + '\\n' + url)
    rotulo.textContent = 'Link copiado!'
    setTimeout(() => { rotulo.textContent = 'Compartilhar viagem' }, 2500)
  } catch {
    prompt('Copie o link da viagem:', url)
  }
}

carregar()
setInterval(carregar, 5000)
`

// Compartilha só o MobilyTrack (mapa, sem chat): quem recebe vê o carro, mas não fala com o motorista.
const textoCompartilhar = (d, motorista) =>
  ['Acompanhe minha viagem em tempo real.', `Motorista: ${motorista}`,
    d.veiculo && `Veículo: ${d.veiculo}`, d.placa && `Placa: ${d.placa}`].filter(Boolean).join('\n')

function layout({ corpo, script = '', motorista = '' }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">
<meta name="theme-color" content="#2e2e2e"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer">
<title>Rastreio do veículo</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>${CSS}</style></head><body data-motorista="${esc(motorista)}"><main>
${corpo}</main>${script ? `<script>${script}</script>` : ''}</body></html>`
}

export function renderPagina(d, { agora } = {}) {
  if (!d) {
    return layout({ corpo: `<section class="card fim-corrida"><h1>Link inválido</h1>
<p class="ola">Confira o link recebido no WhatsApp ou fale com a central.</p></section>` })
  }

  const primeiro = String(d.nome ?? '').trim().split(/\s+/)[0]
  if (d.encerrada) {
    return layout({ corpo: `<section class="card fim-corrida"><div class="selo">${ICONE_OK}</div>
<h1>Corrida <em>encerrada</em></h1>
<p class="ola">${primeiro ? `Obrigado, ${esc(primeiro)}! ` : 'Obrigado! '}Esperamos você na próxima viagem.</p></section>` })
  }

  const paraMotorista = Boolean(d.paraMotorista)
  const m = d.motorista ?? {}
  const buscando = !paraMotorista && !m.id // central retirou o motorista e ainda não designou outro
  const nomeMotorista = buscando ? 'Buscando motorista' : m.nome || 'Motorista'
  // no lado do motorista, o "outro lado" da conversa é o passageiro
  const outro = paraMotorista ? (String(d.nome ?? '').trim() || 'Passageiro') : nomeMotorista
  const base = paraMotorista ? `/m/${esc(d.tokenMotorista)}` : `/r/${esc(d.token)}`
  const temMapa = Boolean(d.origemCoord || d.destinoCoord)
  const dadosMapa = { rota: d.rota, origem: d.origemCoord, destino: d.destinoCoord }
  const mapa = temMapa
    ? `<p class="dica" aria-hidden="true">${ICONE_EXPANDIR}Rastreio do veículo</p>
<div class="mapa">
  <div class="mapa-tela" id="mapa"></div>
  <span class="vivo"><i class="ponto"></i>AO VIVO</span>
  <button class="toque" id="abrir-mapa" type="button" aria-label="Abrir rastreio do veículo em tela cheia"></button>
</div>
<button class="fechar-mapa" id="fechar-mapa" type="button">✕ Fechar mapa</button>
<script type="application/json" id="dados-mapa">${JSON.stringify(dadosMapa).replace(/</g, '\u003c')}</script>`
    : `<p class="dica">Rastreio do veículo</p>
<div class="mapa"><div class="sem-mapa">${ICONE_PINO}Disponível em instantes</div></div>`

  const info = [
    paraMotorista
      ? `<dt>Passageiro</dt><dd>${esc(outro)}</dd>`
      : `<dt>Motorista</dt><dd>${buscando ? 'Buscando motorista…' : esc(nomeMotorista)}</dd>`,
    !paraMotorista && !buscando && d.veiculo && `<dt>Veículo</dt><dd>${esc(d.veiculo)}</dd>`,
    !paraMotorista && !buscando && d.placa && `<dt>Placa</dt><dd class="placa">${esc(d.placa)}</dd>`,
    paraMotorista && d.origem && `<dt>Embarque</dt><dd>${esc(d.origem)}</dd>`,
  ].filter(Boolean).join('')

  const trajeto = [
    d.origem && `<dt>Embarque</dt><dd>${esc(d.origem)}</dd>`,
    d.destino && `<dt>Destino</dt><dd>${esc(d.destino)}</dd>`,
  ].filter(Boolean).join('')

  const corpo = `
<section class="topo">
  <div class="saudacao">
    <h1>${paraMotorista ? `Corrida <em>${esc(d.origem ? primeiroNome(d.origem) : 'em andamento')}</em>`
      : `${saudacao(agora)},${primeiro ? `<em>${esc(primeiro)}</em>` : ''}`}</h1>
    <dl class="info">${info}</dl>
    ${d.link && !buscando && !paraMotorista ? `<button class="compartilhar" id="compartilhar" type="button" data-url="${esc(d.link)}"
      data-texto="${esc(textoCompartilhar(d, nomeMotorista))}">${ICONE_COMPARTILHAR}<span>Compartilhar viagem</span></button>` : ''}
  </div>
  <div class="lado">
    ${mapa}
    <p class="status" aria-live="polite"><b>Status</b><span id="status-texto">${esc(d.statusTexto ?? 'Motorista indo até você')}</span>
      <small id="eta"${d.previsao && !buscando ? '' : ' hidden'}>Chega às <em id="eta-hora">${d.previsao && !buscando ? esc(hora(d.previsao)) : ''}</em><span id="eta-min"></span></small></p>
  </div>
</section>
<section class="card chat" aria-label="Chat com o motorista">
  <div class="chat-topo">
    <div class="avatar">
      <span aria-hidden="true">${buscando ? '…' : esc(outro[0].toUpperCase())}</span>
      ${d.token && !buscando && !paraMotorista ? `<img src="/r/${esc(d.token)}/foto" alt="Foto de ${esc(nomeMotorista)}" onerror="this.remove()">` : ''}
    </div>
    <div><div class="nome">${esc(outro)}</div><small><i class="ponto"></i>${
      buscando ? 'A central está designando um motorista' : paraMotorista ? 'Chat da corrida' : 'Mensagens via central'}</small></div>
  </div>
  ${trajeto ? `<details class="perfil"><summary>Ver trajeto</summary><dl>${trajeto}</dl></details>` : ''}
  <div class="msgs" id="msgs" aria-live="polite">
    <p class="sem-msgs" id="sem-msgs">${buscando ? 'O chat fica disponível assim que o motorista for designado.'
      : paraMotorista ? 'Fale com o passageiro por aqui. Ele acompanha pelo link de rastreio.'
      : 'Envie uma mensagem para o motorista. Ela chega no aparelho dele pela central.'}</p>
  </div>
  <p class="aviso" id="aviso" role="alert"></p>
  <form class="envio" id="envio" autocomplete="off">
    <input name="texto" maxlength="500" placeholder="${buscando ? 'Aguardando motorista…' : paraMotorista ? 'Mensagem ao passageiro…' : 'Digite sua mensagem…'}"
      aria-label="Mensagem para o motorista" enterkeyhint="send"${buscando ? ' disabled' : ''}>
    <button type="submit" aria-label="Enviar"${buscando ? ' disabled' : ''}>${ICONE_ENVIAR}</button>
  </form>
</section>`

  return layout({ corpo, script: JS.replace('__EU__', paraMotorista ? 'MOTORISTA' : 'CLIENTE'), motorista: m.id ?? '' })
}
