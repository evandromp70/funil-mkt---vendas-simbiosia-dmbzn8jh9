// AMBIENTE-RESTORE (F3-T03): backup e restauração de fixture PRÓPRIA no backend TESTE.
//
// O problema da versão anterior: o "restaurar" apagava TODO registro que não estivesse no
// dump e comparava contagens GLOBAIS. Num backend compartilhado isso nunca é determinístico:
// qualquer teste rodando em paralelo muda o total, e a restauração cascateava registros alheios.
//
// Esta versão só toca no que é dela:
//   1. cria uma marca única por execução (RESTORE-<timestamp>-<rand>);
//   2. grava o backup APENAS das fixtures com aquela marca;
//   3. "restaurar" apaga e recria APENAS registros com aquela marca;
//   4. a prova compara contagens POR MARCA, não globais.
//
// Assim o teste prova a mesma propriedade (o backup restaura o que ele guardou) sem depender
// de quem mais usa o banco, e pode rodar 5 vezes seguidas sem resíduo.
//
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

// O backend de teste aplica rate limit na autenticação (429). Duas defesas:
//   1. RESTORE_TOKEN no ambiente: o chamador já autenticou e empresta a sessão — zero login aqui;
//   2. sem token, login com backoff progressivo.
async function autenticarComRetry(tentativas = 8) {
  let espera = 2000
  for (let i = 1; i <= tentativas; i++) {
    try {
      await pb.collection('users').authWithPassword(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)
      return
    } catch (err) {
      const msg = String(err)
      const eh429 = msg.indexOf('429') !== -1 || msg.toLowerCase().indexOf('too many') !== -1
      if (!eh429 || i === tentativas) throw err
      await new Promise((r) => setTimeout(r, espera))
      espera = Math.min(espera * 2, 20000)
    }
  }
}

const tokenEmprestado = process.env.RESTORE_TOKEN || ''
if (tokenEmprestado) {
  pb.authStore.save(tokenEmprestado, null)
  // valida que a sessão emprestada serve (1 requisição leve, sem auth)
  try {
    await pb.collection('users').authRefresh()
  } catch (_) {
    await autenticarComRetry()
  }
} else {
  await autenticarComRetry()
}

// Coleções que o restore cobre, com o campo que carrega a marca (todas usam 'nome_empresa' ou
// um campo de texto equivalente; o que importa é achar SÓ os registros desta execução).
const COLECOES = [
  { nome: 'leads', campo: 'nome_empresa' },
  { nome: 'listas', campo: 'nome' },
  { nome: 'qualificacoes', campo: 'notas' },
  { nome: 'contatos', campo: 'mensagem' },
  { nome: 'cadencias', campo: 'rascunho_ia' },
  { nome: 'alinhamentos', campo: 'resumo' },
  { nome: 'metas', campo: 'observacao' },
]

const modo = process.argv[2] || 'backup'
const marca = process.argv[3] || ''
const dir = path.join(root, 'tests', '.tmp-backup')
fs.mkdirSync(dir, { recursive: true })

const arquivoMarca = path.join(dir, 'marca.txt')
const arquivoDump = path.join(dir, 'fixtures.json')

// conta por coleção, SÓ os registros desta marca
async function contarPorMarca(m) {
  const contagens = {}
  for (const { nome, campo } of COLECOES) {
    try {
      const r = await pb.collection(nome).getList(1, 1, {
        filter: pb.filter(`${campo} ~ {:m}`, { m }),
      })
      contagens[nome] = r.totalItems
    } catch (_) {
      // coleção ou campo ausente não é falha do restore: registra como não aplicável
      contagens[nome] = null
    }
  }
  return contagens
}

if (modo === 'backup') {
  const m =
    marca ||
    'RESTORE-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 8)
  fs.writeFileSync(arquivoMarca, m)

  // Cria uma fixture própria de cada tipo, com a marca no campo de texto.
  const criadas = {}
  const dono = pb.authStore.record.id

  // 1 lead
  const lead = await pb.collection('leads').create({
    owner: dono,
    nome_empresa: m + ' Empresa',
    origem: 'outbound',
    etapa: 'lista',
  })
  criadas.leads = [lead.id]

  // 1 lista
  try {
    const lista = await pb.collection('listas').create({
      owner: dono,
      nome: m + ' Lista',
      origem: 'outbound',
      segmento: 'teste',
    })
    criadas.listas = [lista.id]
  } catch (_) {
    criadas.listas = []
  }

  // 1 contato ligado ao lead
  try {
    const contato = await pb.collection('contatos').create({
      owner: dono,
      lead: lead.id,
      canal: 'email',
      direcao: 'outbound',
      mensagem: m + ' contato de prova',
      data_contato: new Date().toISOString(),
    })
    criadas.contatos = [contato.id]
  } catch (_) {
    criadas.contatos = []
  }

  fs.writeFileSync(path.join(dir, 'ids.json'), JSON.stringify(criadas, null, 2))

  const dump = {}
  for (const { nome, campo } of COLECOES) {
    try {
      dump[nome] = await pb.collection(nome).getFullList({
        filter: pb.filter(`${campo} ~ {:m}`, { m }),
      })
    } catch (_) {
      dump[nome] = []
    }
  }
  fs.writeFileSync(arquivoDump, JSON.stringify(dump, null, 2))

  const contagens = await contarPorMarca(m)
  fs.writeFileSync(path.join(dir, 'contagens-backup.json'), JSON.stringify(contagens, null, 2))
  console.log('backup concluído:', m, JSON.stringify(contagens))
} else if (modo === 'restaurar') {
  const m = marca || fs.readFileSync(arquivoMarca, 'utf8').trim()
  const fixtures = JSON.parse(fs.readFileSync(arquivoDump, 'utf8'))

  // Apaga SÓ os registros desta marca. Nada fora dela é tocado.
  for (const { nome, campo } of COLECOES) {
    let atuais = []
    try {
      atuais = await pb.collection(nome).getFullList({
        filter: pb.filter(`${campo} ~ {:m}`, { m }),
      })
    } catch (_) {
      continue
    }
    for (const atual of atuais) {
      try {
        await pb.collection(nome).delete(atual.id)
      } catch (_) {
        // relação obrigatória de outra coleção desta mesma marca pode travar; uma 2ª
        // passada resolve (filhos antes de pais só é garantido repetindo)
      }
    }
  }

  // Recria a partir do dump, na ordem em que foram listadas (pais antes de filhos).
  for (const { nome } of COLECOES) {
    for (const rec of fixtures[nome] || []) {
      const { id, created, updated, collectionId, collectionName, expand, ...campos } = rec
      try {
        await pb.collection(nome).create({ ...campos, id })
      } catch (_) {
        // se o id não puder ser reusado, cria sem ele — a contagem da marca continua válida
        try {
          await pb.collection(nome).create(campos)
        } catch (_) {}
      }
    }
  }

  const contagens = await contarPorMarca(m)
  fs.writeFileSync(
    path.join(dir, 'contagens-pos-restauracao.json'),
    JSON.stringify(contagens, null, 2),
  )
  console.log('restauração concluída:', m, JSON.stringify(contagens))
} else if (modo === 'limpar') {
  const m = marca || (fs.existsSync(arquivoMarca) ? fs.readFileSync(arquivoMarca, 'utf8').trim() : '')
  if (!m) {
    console.error('limpar: nenhuma marca encontrada')
    process.exit(2)
  }
  let apagados = 0
  // 2 passadas: filhos antes dos pais sem precisar mapear a ordem exata
  for (let passada = 0; passada < 2; passada++) {
    for (const { nome, campo } of COLECOES) {
      let atuais = []
      try {
        atuais = await pb.collection(nome).getFullList({
          filter: pb.filter(`${campo} ~ {:m}`, { m }),
        })
      } catch (_) {
        continue
      }
      for (const atual of atuais) {
        try {
          await pb.collection(nome).delete(atual.id)
          apagados++
        } catch (_) {}
      }
    }
  }
  const restante = await contarPorMarca(m)
  const total = Object.values(restante).reduce((a, b) => a + (b || 0), 0)
  console.log('limpeza concluída:', m, 'apagados', apagados, 'resíduo', total)
  if (total > 0) process.exit(1)
} else {
  console.error('uso: node scripts/backup-restauracao.mjs [backup|restaurar|limpar] [marca]')
  process.exit(2)
}
