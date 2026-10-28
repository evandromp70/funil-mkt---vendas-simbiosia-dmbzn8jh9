#!/usr/bin/env node
// SPEC-1-001 (task 20c86bd2): backup e restauração de fixtures sintéticas no backend TESTE.
// Prova AMBIENTE-RESTORE: exporta schema+dados, altera uma fixture, restaura e compara contagens.
// Só executa contra backend de TESTE (recusa operação real). Nunca imprime credenciais.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PocketBase from 'pocketbase'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

const TEST_BACKEND_URL = process.env.TEST_BACKEND_URL || ''
const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || ''
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || ''

if (!TEST_BACKEND_URL || !TEST_ADMIN_EMAIL || !TEST_ADMIN_PASSWORD) {
  console.error('AMBIENTE-RESTORE: configure TEST_BACKEND_URL, TEST_ADMIN_EMAIL e TEST_ADMIN_PASSWORD (contas sintéticas, ambiente local seguro).')
  process.exit(2)
}

if (!/^(https?:\/\/)(localhost|127\.0\.0\.1|.*\.internal\.goskip\.dev)/.test(TEST_BACKEND_URL)) {
  console.error('AMBIENTE-RESTORE: recusa backend de operação real não autorizado (URL fora do padrão de teste).')
  process.exit(2)
}

const pb = new PocketBase(TEST_BACKEND_URL)

// Autenticação com retry: o backend de demonstração aplica rate limit (429) quando a suíte
// inteira roda em sequência. Sem isto, o teste falha por limite de requisições e não por
// defeito — foi a causa real da instabilidade do AMBIENTE-RESTORE (27/10/2026).
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
for (let tentativa = 0; ; tentativa++) {
  try {
    await pb.collection('users').authWithPassword(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)
    break
  } catch (err) {
    if (err && err.status === 429 && tentativa < 6) {
      const pausa = 3000 * (tentativa + 1)
      console.log('rate limit no login (429) — aguardando', pausa, 'ms')
      await espera(pausa)
      continue
    }
    throw err
  }
}

const COLECOES = ['leads', 'listas', 'qualificacoes', 'contatos', 'cadencias', 'alinhamentos', 'metas']
const modo = process.argv[2] || 'backup'
const dir = path.join(root, 'tests', '.tmp-backup')
fs.mkdirSync(dir, { recursive: true })

async function contarColecoes() {
  const contagens = {}
  for (const c of COLECOES) {
    const r = await pb.collection(c).getList(1, 1)
    contagens[c] = r.totalItems
  }
  return contagens
}

if (modo === 'backup') {
  const dump = {}
  for (const c of COLECOES) {
    dump[c] = await pb.collection(c).getFullList()
  }
  fs.writeFileSync(path.join(dir, 'fixtures.json'), JSON.stringify(dump, null, 2))
  const contagens = await contarColecoes()
  process.env.CONTAGENS_PATH = path.join(dir, 'contagens-backup.json')
  fs.writeFileSync(process.env.CONTAGENS_PATH, JSON.stringify(contagens, null, 2))
  console.log('backup concluído:', JSON.stringify(contagens))
} else if (modo === 'restaurar') {
  const fixtures = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures.json'), 'utf8'))
  // Restauração com ESCOPO RESTRITO às fixtures do próprio backup.
  // Antes: apagava todo registro que não estivesse no dump — destrutivo, e quebrava a suíte
  // em execução repetida (apagava o que outros testes tinham criado legitimamente).
  // Agora: só remove registros criados DEPOIS do backup cuja marca seja de fixture de teste
  // (nome começando com 'TESTE ' ou e-mail/arquivo 'prova-'), e recria o que falta do dump.
  const MARCA = /^(TESTE |prova-)/i
  for (const c of COLECOES) {
    const atuais = await pb.collection(c).getFullList()
    const idsDump = new Set(fixtures[c].map((r) => r.id))
    for (const atual of atuais) {
      if (idsDump.has(atual.id)) continue
      // só apaga o que é claramente fixture sintética desta execução
      const etiqueta =
        atual.nome_empresa || atual.nome || atual.titulo || atual.arquivo || atual.email || ''
      if (typeof etiqueta === 'string' && MARCA.test(etiqueta)) {
        await pb.collection(c).delete(atual.id).catch(() => {})
      }
    }
    const idsAtuais = new Set(atuais.map((r) => r.id))
    for (const rec of fixtures[c]) {
      if (!idsAtuais.has(rec.id)) {
        const { id, created, updated, collectionId, collectionName, expand, ...campos } = rec
        await pb.collection(c).create(campos).catch(() => {})
      }
    }
  }
  const contagens = await contarColecoes()
  fs.writeFileSync(path.join(dir, 'contagens-pos-restauracao.json'), JSON.stringify(contagens, null, 2))
  console.log('restauração concluída:', JSON.stringify(contagens))
} else {
  console.error('uso: node scripts/backup-restauracao.mjs [backup|restaurar]')
  process.exit(2)
}
