// SPEC-1-001 (task 20c86bd2): manifesto de versão do ambiente de demonstração.
// Registra versão do Skip, referência publicada, data e contagens das coleções no backup.
// Escreve metadados não sensíveis. Nunca registra segredos, tokens ou hashes de senha.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const evidDir = path.join(root, '..', '..', '06_notas', 'evidencias', 'fase-1', 'spec-1-001')
fs.mkdirSync(evidDir, { recursive: true })

const skipCfgPath = path.join(root, '.skip.config.json')
let deployment = { lastDevBuildRef: null }
try {
  deployment = JSON.parse(fs.readFileSync(skipCfgPath, 'utf8')).deployment ?? deployment
} catch (_) {}

const manifestoPath = process.env.MANIFESTO_PATH || path.join(evidDir, 'manifesto.json')
const anterior = fs.existsSync(manifestoPath)
  ? JSON.parse(fs.readFileSync(manifestoPath, 'utf8'))
  : null

const countsPath = process.env.CONTAGENS_PATH
const contagens = countsPath ? JSON.parse(fs.readFileSync(countsPath, 'utf8')) : null

const agora = new Date().toISOString()
const manifesto = {
  gerado_em: agora,
  versao_skip_aplicada: deployment.lastDevBuildRef ?? null,
  versao_publicada: anterior?.versao_publicada ?? null,
  backup: contagens,
  restauracao: contagens
    ? {
        restaurado_em: agora,
        contagens_iguais: anterior
          ? JSON.stringify(anterior.backup) === JSON.stringify(contagens)
          : null,
      }
    : null,
}

fs.writeFileSync(manifestoPath, JSON.stringify(manifesto, null, 2) + '\n')
console.log(`manifesto: ${manifestoPath}`)
