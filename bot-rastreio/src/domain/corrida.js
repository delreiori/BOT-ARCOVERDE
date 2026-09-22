// Regras puras: nada aqui fala com rede ou banco.
import { randomBytes } from 'node:crypto'

// Autocab manda "11 99999-9999", "011...", "+55 ..."; Evolution manda "5511999999999".
export function normalizarTelefone(bruto) {
  let d = String(bruto ?? '').replace(/\D/g, '').replace(/^0+/, '')
  if (d.length === 10 || d.length === 11) d = '55' + d
  return d.length >= 12 ? d : null
}

// O WhatsApp às vezes omite o 9º dígito de celulares BR: compara DDD + últimos 8 dígitos.
export function chaveTelefone(tel) {
  const d = normalizarTelefone(tel)
  if (!d || !d.startsWith('55')) return d
  return d.slice(2, 4) + d.slice(-8)
}

// Token público do link /r/{token}: 10 caracteres base62 aleatórios (~8e17 combinações, não enumerável).
const ABC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
export const gerarToken = () => Array.from(randomBytes(10), b => ABC[b % 62]).join('')

const primeiroNome = nome => String(nome ?? '').trim().split(/\s+/)[0]

export const textoBoasVindas = ({ nome, link }) =>
  `Olá${nome ? ' ' + primeiroNome(nome) : ''}! 🚖 Seu motorista já foi designado.\n\n` +
  `Acompanhe seu link de rastreio em tempo real e fale com o motorista:\n${link}`

export const paraMotorista = texto => `Cliente: "${texto}"`

// Status do Autocab (activeBooking.status) em texto para o passageiro. Sem motorista = buscando.
// ponytail: a doc não lista os valores de status; traduz por palavra-chave e mostra o resto como veio.
// Ajustar a lista quando virmos os valores reais nos logs.
export function statusParaPassageiro(status, temMotorista) {
  if (!temMotorista) return 'Buscando motorista'
  const s = String(status ?? '').trim()
  const t = s.toLowerCase()
  if (/arriv|waiting/.test(t)) return 'Motorista chegou'
  if (/board|pob|picked|passenger/.test(t)) return 'Em viagem'
  if (!t || /dispatch|accept|allocat|route|cover|assign/.test(t)) return 'Motorista indo até você'
  return s
}

// Corrida mais recente cujo telefone bate com o do passageiro (lista vem ordenada por criado_em).
export function corridaDoTelefone(ativas, telefone) {
  const chave = chaveTelefone(telefone)
  return chave ? ativas.filter(c => chaveTelefone(c.telefone) === chave).at(-1) ?? null : null
}
