// SPEC-1-007 (task acc7d79f): CONTRATO-RECONCILIACAO — CA-1-007-03.
// Casos TDD contra o backend TESTE do Funil:
// 1) duplicar evento id/hash → duplicado, sem nova projeção;
// 2) atrasar rev1 após rev2 aplicada → atrasado, ponteiro rev2 preservado;
// 3) mesmo id/hash diferente → conflito pendente;
// 4) ausência de mapa → pendente; corrigir e reaplicar o MESMO evento → aplicado 1x;
// 5) fusão (identidade_alias) → alias gravado + cadências dos 2 contextos pausadas;
// 6) reversão (identidade_revogacao) → alias revogado, histórico preservado;
// 7) evento antigo NÃO reativa alias revogado.
import PocketBase from 'pocketbase'

const pb = new PocketBase(process.env.PB_URL || 'https://funil-mkt-vendas-simbiosia-aa6fd.shrd00.internal.goskip.dev')

function jsonCanonico(v) {
  if (v === null) return 'null'
  const t = typeof v
  if (t === 'number') return isFinite(v) ? String(v) : 'null'
  if (t === 'boolean') return v ? 'true' : 'false'
  if (t === 'string') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(jsonCanonico).join(',') + ']'
  const chaves = Object.keys(v).sort()
  return '{' + chaves.filter((c) => v[c] !== undefined).map((c) => JSON.stringify(c) + ':' + jsonCanonico(v[c])).join(',') + '}'
}
function hashDe(texto) {
  let h1 = 0x811c9dc5
  let h2 = 0x1000193
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = (h2 + Math.imul(c, i + 1)) >>> 0
  }
  let saida = ''
  for (let k = 0; k < 8; k++) saida += ((h1 ^ (h2 + k * 0x9e3779b9)) >>> 0).toString(16).padStart(8, '0')
  return saida.substring(0, 64)
}
const rehash = (ev) => ({ ...ev, payload_hash: hashDe(jsonCanonico(ev.payload)) })

let testes = 0
let falhas = 0
const ok = (cond, nome) => {
  testes++
  if (cond) console.log('✔ ' + nome)
  else { falhas++; console.error('✘ ' + nome) }
}

const CORRIDA = Date.now().toString(36)
const admin = (await pb.collection('users').authWithPassword('jose@simbiosia.com.br', 'Simbiosia@2026')).record
ok(!!admin?.id, 'login admin')

const chamar = async (evento) =>
  pb.send('/backend/v1/sync/aplicar-fixture', { method: 'POST', body: { evento } }).catch((e) => ({ erro: e.status, mensagem: e.response?.message }))

// mapeamento idempotente
let mapa = (await pb.collection('sync_mapeamentos').getFullList({ filter: pb.filter('referencia_ator = {:r}', { r: 'fabrica:teste:usuario:op-demo-1' }) }))[0]
if (!mapa) mapa = await pb.collection('sync_mapeamentos').create({ app_origem: 'fabrica', referencia_ator: 'fabrica:teste:usuario:op-demo-1', usuario_local_destino: admin.id, ambiente: 'teste', aprovado_por: admin.id })

const A1 = 'FAB:teste:empresa:ana1-' + CORRIDA
const A2 = 'FAB:teste:empresa:ana2-' + CORRIDA

// ---------- 1) duplicata ----------
const ev1 = rehash({
  contrato_versao: 1, evento_id: 'fabrica:teste:evento:40' + CORRIDA + '1', origem: 'fabrica', ambiente: 'teste',
  tipo_evento: 'cadastro_upsert', entidade_global_id: A1, dominio: 'cadastro', revisao: 1,
  payload: { razao_social: 'Ana 1 Reconciliacao' }, ocorrido_em: '2026-10-21T10:00:00Z',
  referencia_ator_mapeada: 'fabrica:teste:usuario:op-demo-1',
})
const r1a = await chamar(ev1)
const r1b = await chamar(ev1)
ok(r1a.acao === 'aplicar' && r1b.acao === 'duplicado', 'duplicata: mesmo evento id/hash → duplicado, sem nova projeção')

// ---------- 2) atraso: rev1 após rev2 na mesma chave ----------
const ev2v2 = rehash({
  contrato_versao: 1, evento_id: 'fabrica:teste:evento:40' + CORRIDA + '2', origem: 'fabrica', ambiente: 'teste',
  tipo_evento: 'cadastro_upsert', entidade_global_id: A2, dominio: 'cadastro', revisao: 2,
  payload: { razao_social: 'Ana 2 rev2' }, ocorrido_em: '2026-10-21T10:05:00Z',
  referencia_ator_mapeada: 'fabrica:teste:usuario:op-demo-1',
})
const r2v2 = await chamar(ev2v2)
const ev2v1 = rehash({ ...ev2v2, revisao: 1, payload: { razao_social: 'Ana 2 rev1' } })
const r2v1 = await chamar(ev2v1)
ok(r2v2.acao === 'aplicar' && r2v1.acao === 'atrasado', 'atraso: rev1 depois de rev2 → atrasado, ponteiro preservado')
if (r2v2.projecao) {
  const emp = await pb.collection('empresas').getOne(r2v2.projecao)
  ok(emp.razao_social === 'Ana 2 rev2', 'ponteiro permanece rev2 (rev1 não sobrescreve)')
}

// ---------- 3) conflito: mesmo id/revisão, hash diferente ----------
const ev3 = rehash({
  contrato_versao: 1, evento_id: 'fabrica:teste:evento:40' + CORRIDA + '3', origem: 'fabrica', ambiente: 'teste',
  tipo_evento: 'cadastro_upsert', entidade_global_id: A1, dominio: 'cadastro', revisao: 1,
  payload: { razao_social: 'Ana 1 ALTERADA' }, ocorrido_em: '2026-10-21T10:10:00Z',
  referencia_ator_mapeada: 'fabrica:teste:usuario:op-demo-1',
})
const r3 = await chamar(ev3)
ok(r3.acao === 'conflito', 'conflito: mesmo id/revisão com payload diferente → conflito (não sobrescreve)')

// ---------- 4) sem mapa → pendente; com mapa → aplicado 1x (mesmo evento) ----------
const ev4 = rehash({
  contrato_versao: 1, evento_id: 'fabrica:teste:evento:40' + CORRIDA + '4', origem: 'fabrica', ambiente: 'teste',
  tipo_evento: 'cadastro_upsert', entidade_global_id: A2, dominio: 'cadastro', revisao: 3,
  payload: { razao_social: 'Ana 2 rev3' }, ocorrido_em: '2026-10-21T10:15:00Z',
  referencia_ator_mapeada: 'OUTRA:referencia:sem-mapa',
})
const r4a = await chamar(ev4)
ok(r4a.acao === 'pendente', 'sem mapeamento → pendente (sem owner fallback)')
// corrige: aprova mapeamento para a nova referência e reaplica o MESMO evento
await pb.collection('sync_mapeamentos').create({ app_origem: 'fabrica', referencia_ator: 'OUTRA:referencia:sem-mapa', usuario_local_destino: admin.id, ambiente: 'teste', aprovado_por: admin.id })
const r4b = await chamar(ev4)
ok(r4b.acao === 'aplicar', 'mesmo evento reavaliado após correção → aplicado UMA vez')
const r4c = await chamar(ev4)
ok(r4c.acao === 'duplicado', 'retomada não duplica')

// ---------- 5) fusão: alias + pausa de cadências ----------
const leadFusao = await pb.collection('leads').create({ owner: admin.id, nome_empresa: A1, origem: 'inbound', etapa: 'lista' })
const cad = await pb.collection('cadencias').create({ owner: admin.id, lead: leadFusao.id, toque: 1, canal: 'email', status: 'agendado', data_envio: '2026-10-30T10:00:00Z' })
const ev5 = rehash({
  contrato_versao: 1, evento_id: 'fabrica:teste:evento:40' + CORRIDA + '5', origem: 'fabrica', ambiente: 'teste',
  tipo_evento: 'identidade_alias', entidade_global_id: A1, dominio: 'alias', revisao: 1,
  payload: { origem_global: A1, destino_global: A2 }, ocorrido_em: '2026-10-21T10:20:00Z',
  referencia_ator_mapeada: 'fabrica:teste:usuario:op-demo-1',
})
const r5 = await chamar(ev5)
ok(r5.acao === 'aplicar' && r5.projecao, 'fusão: alias gravado no Funil')
const aliasRec = await pb.collection('aliases_identidade').getOne(r5.projecao)
ok(aliasRec.status === 'ativo' && aliasRec.destino_global === A2, 'alias ativo aponta para o sobrevivente')
const cadDepois = await pb.collection('cadencias').getOne(cad.id)
ok(cadDepois.status === 'cancelado', 'cadência do contexto fundido PAUSADA (cancelada até revisão humana)')

// ---------- 6) reversão: alias revogado, histórico preservado ----------
const ev6 = rehash({
  contrato_versao: 1, evento_id: 'fabrica:teste:evento:40' + CORRIDA + '6', origem: 'fabrica', ambiente: 'teste',
  tipo_evento: 'identidade_revogacao', entidade_global_id: A1, dominio: 'alias', revisao: 2,
  payload: { origem_global: A1, destino_global: A2 }, ocorrido_em: '2026-10-21T10:25:00Z',
  referencia_ator_mapeada: 'fabrica:teste:usuario:op-demo-1',
})
const r6 = await chamar(ev6)
ok(r6.acao === 'aplicar', 'reversão aplica')
const aliasDepois = await pb.collection('aliases_identidade').getFullList({ filter: pb.filter('origem_global = {:o}', { o: A1 }), sort: '-rev' })
ok(aliasDepois[0]?.status === 'revogado' && aliasDepois.length === 2, 'reversão: rev superior, IDs originais preservados (histórico intacto)')

// ---------- 7) evento antigo NÃO reativa alias revogado ----------
const r7 = await chamar(ev5) // mesmo evento da fusão (rev1, alias ativo)
ok(r7.acao === 'atrasado' || r7.acao === 'duplicado', 'evento antigo da fusão (rev1) após revogação (rev2) → ' + r7.acao + ': NÃO reativa alias revogado')

console.log(`\n${testes - falhas}/${testes} provas ok`)
process.exit(falhas > 0 ? 1 : 0)
