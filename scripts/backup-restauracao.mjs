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
  console.error(
    'AMBIENTE-RESTORE: configure TEST_BACKEND_URL, TEST_ADMIN_EMAIL e TEST_ADMIN_PASSWORD (contas sintéticas, ambiente local seguro).',
  )
  process.exit(2)
}

if (!/^(https?:\/\/)(localhost|127\.0\.0\.1|.*\.internal\.goskip\.dev)/.test(TEST_BACKEND_URL)) {
  console.error(
    'AMBIENTE-RESTORE: recusa backend de operação real não autorizado (URL fora do padrão de teste).',
  )
  process.exit(2)
}

const pb = new PocketBase(TEST_BACKEND_URL)
await pb.collection('users').authWithPassword(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)

const COLECOES = [
  'leads',
  'listas',
  'qualificacoes',
  'contatos',
  'cadencias',
  'alinhamentos',
  'metas',
]
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
  fs.writeFileSync(path.join(dir, 'contagens-backup.json'), JSON.stringify(contagens, null, 2))
  console.log('backup concluído:', JSON.stringify(contagens))
} else if (modo === 'restaurar') {
  const fixtures = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures.json'), 'utf8'))
  for (const c of COLECOES) {
    const atuais = await pb.collection(c).getFullList()
    const idsDump = new Set(fixtures[c].map((r) => r.id))
    for (const atual of atuais) {
      if (!idsDump.has(atual.id)) {
        await pb.collection(c).delete(atual.id)
      }
    }
    const idsAtuais = new Set(atuais.map((r) => r.id))
    for (const rec of fixtures[c]) {
      if (!idsAtuais.has(rec.id)) {
        const { id, created, updated, collectionId, collectionName, expand, ...campos } = rec
        await pb.collection(c).create(campos)
      }
    }
  }
  const contagens = await contarColecoes()
  fs.writeFileSync(
    path.join(dir, 'contagens-pos-restauracao.json'),
    JSON.stringify(contagens, null, 2),
  )
  console.log('restauração concluída:', JSON.stringify(contagens))
} else {
  console.error('uso: node scripts/backup-restauracao.mjs [backup|restaurar]')
  process.exit(2)
}
