// SPEC-1-001 (task 20c86bd2): transpila o serviço de regras (TypeScript) para o runner.
// Usa ts.transpileModule (typescript já no repositório — sem dependência nova). O cliente do
// PocketBase vira stub: o runner testa funções puras; tipos e build reais ficam no QA do Skip.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const outDir = path.join(root, 'tests', '.tmp-transpiled')

fs.rmSync(outDir, { recursive: true, force: true })
const destDir = path.join(outDir, 'src', 'services')
const libDir = path.join(outDir, 'src', 'lib', 'pocketbase')
fs.mkdirSync(destDir, { recursive: true })
fs.mkdirSync(libDir, { recursive: true })

// stub do cliente pb: nenhuma chamada de rede no runner de regras
fs.writeFileSync(
  path.join(libDir, 'client.mjs'),
  "const pb = new Proxy({}, { get: () => () => { throw new Error('pb indisponível no runner de regras') } })\nexport default pb\n",
)

const fonte = path.join(root, 'src', 'services', 'leads.ts')
const saida = ts.transpileModule(fs.readFileSync(fonte, 'utf8'), {
  fileName: 'leads.ts',
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText

// aponta o import do cliente para o stub local (caminho relativo services → lib/pocketbase)
const final = saida.replace(
  /from\s+'@\/lib\/pocketbase\/client'/,
  "from '../lib/pocketbase/client.mjs'",
)
const alvo = path.join(destDir, 'leads.mjs')
fs.writeFileSync(alvo, final)
console.log(`transpilado: ${alvo}`)
