// SPEC-1-001 (task 20c86bd2): runner de regras — funções puras do serviço, transpiladas do
// código real (sem cópia). RED documentado: antes da correção, o runner falha pelo motivo
// esperado (arquivo inexistente / comportamento divergente do aceite).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const transpiled = path.join(root, 'tests', '.tmp-transpiled', 'src', 'services', 'leads.mjs')

// gera a transpilação antes de importar (o arquivo só existe depois dela)
execFileSync('node', [path.join(root, 'scripts', 'transpilar-regras.mjs')], { cwd: root, stdio: 'pipe' })
const { progressoMetas } = await import('file://' + transpiled)

test('RUNNER-REAL: runner executa assertion real e falha com saída não zero quando o comportamento diverge', () => {
  assert.equal(typeof progressoMetas, 'function')
})

test('AMBIENTE-RESTORE (regra): progressoMetas classifica as etapas conforme o mapeamento da SPEC', () => {
  const lead = (etapa) => ({ etapa })
  const r = progressoMetas([lead('lista'), lead('contato'), lead('ganho')])
  assert.equal(r.contatos, 2) // contato + ganho
  assert.equal(r.oportunidades, 1) // só ganho
  assert.equal(r.propostas, 1)
  assert.equal(r.forecast, 1)
  assert.equal(r.fechados, 1)
})

test('AMBIENTE-RESTORE (borda): lista vazia e etapas terminais', () => {
  assert.deepEqual(progressoMetas([]), {
    contatos: 0,
    oportunidades: 0,
    propostas: 0,
    forecast: 0,
    fechados: 0,
  })
  const r = progressoMetas([{ etapa: 'perdido' }])
  assert.equal(r.contatos, 1)
  assert.equal(r.fechados, 0)
})

test('AMBIENTE-RESTORE (erro): entrada inválida não passa em silêncio', () => {
  assert.throws(() => progressoMetas(null))
  assert.throws(() => progressoMetas(undefined))
})

// ---- SEM-EXTERNO (task 490ec843): gate de UI por função pura ----
const { recursoHabilitado } = await import('file://' + transpiled.replace('leads.mjs', 'sistema.mjs'))

test('SEM-EXTERNO (regra): recursoHabilitado bloqueia ações de IA com pausa ativa', () => {
 const cfg = { ambiente: 'teste', pausa_geral: true, envio_real_habilitado: false, integracoes_externas_habilitadas: false }
 assert.equal(recursoHabilitado(cfg, 'ia'), false)
 assert.equal(recursoHabilitado(cfg, 'envio'), false)
 assert.equal(recursoHabilitado(cfg, 'sincronizacao'), false)
})

test('SEM-EXTERNO (borda): config ausente/inválida assume pausa (falha fechada)', () => {
 assert.equal(recursoHabilitado(null, 'ia'), false)
 assert.equal(recursoHabilitado(undefined, 'ia'), false)
 assert.equal(recursoHabilitado({}, 'ia'), false)
})

test('SEM-EXTERNO (controle): com pausa desligada e integrações habilitadas, recurso abre', () => {
 const cfg = { ambiente: 'teste', pausa_geral: false, envio_real_habilitado: true, integracoes_externas_habilitadas: true }
 assert.equal(recursoHabilitado(cfg, 'ia'), true)
 assert.equal(recursoHabilitado(cfg, 'envio'), true)
})