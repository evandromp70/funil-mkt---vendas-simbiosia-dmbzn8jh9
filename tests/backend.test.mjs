// SPEC-1-001 (task 20c86bd2): runner de backend — PocketBase SDK contra o backend TESTE.
// Recusa ambiente desconhecido; nunca imprime autenticação. Os casos AMBIENTE-RESTORE e
// SEM-EXTERNO (contador por correlação) precisam do backend de teste com credenciais
// sintéticas em ambiente local seguro (variáveis de ambiente, nunca versionadas).
import { test } from 'node:test'
import assert from 'node:assert/strict'

const TEST_BACKEND_URL = process.env.TEST_BACKEND_URL || ''
const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || ''
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || ''

const SEM_AMBIENTE = !TEST_BACKEND_URL || !TEST_ADMIN_EMAIL || !TEST_ADMIN_PASSWORD

// O backend de teste aplica rate limit (429) na autenticação. Um único ponto de login, com
// backoff: sem isso o teste fica intermitente por motivo que não tem nada a ver com o produto.
const novoPb = async (tentativas = 8) => {
  const { default: PocketBase } = await import('pocketbase')
  const pb = new PocketBase(TEST_BACKEND_URL)
  let espera = 2000
  for (let i = 1; i <= tentativas; i++) {
    try {
      await pb.collection('users').authWithPassword(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD)
      return pb
    } catch (err) {
      const msg = String(err)
      const eh429 = msg.indexOf('429') !== -1 || msg.toLowerCase().indexOf('too many') !== -1
      if (!eh429 || i === tentativas) throw err
      await new Promise((r) => setTimeout(r, espera))
      espera = Math.min(espera * 2, 20000)
    }
  }
  return pb
}

test('RUNNER-REAL: runner de backend executa assertion real (prova de vida)', async () => {
  const { default: PocketBase } = await import('pocketbase')
  assert.equal(typeof PocketBase, 'function')
})

test('AMBIENTE-RESTORE: sistema_config existe com ambiente de teste e controles bloqueados', async (t) => {
  if (SEM_AMBIENTE) {
    t.skip('backend de teste não configurado (TEST_BACKEND_URL/credenciais sintéticas ausentes)')
    return
  }
  const pb = await novoPb()
  const r = await pb.collection('sistema_config').getList(1, 1)
  assert.equal(r.totalItems, 1)
  const cfg = r.items[0]
  assert.equal(cfg.ambiente, 'teste')
  assert.equal(cfg.pausa_geral, true)
  assert.equal(cfg.envio_real_habilitado, false)
  assert.equal(cfg.integracoes_externas_habilitadas, false)
})

test('SEM-EXTERNO: rotas instrumentadas não despacham com pausa ativa (contador por correlação = 0)', async (t) => {
  if (SEM_AMBIENTE) {
    t.skip('backend de teste não configurado (TEST_BACKEND_URL/credenciais sintéticas ausentes)')
    return
  }
  const pb = await novoPb()
  const lead = await pb.collection('leads').create({
    owner: pb.authStore.record.id,
    nome_empresa: 'TESTE Fornecedor Zero ' + Date.now(),
    origem: 'outbound',
    etapa: 'lista',
  })
  try {
    for (const rota of ['gerar-contato', 'sugerir-toque', 'analisar-qualificacao']) {
      const resp = await pb.send(`/backend/v1/funil/${rota}`, {
        method: 'POST',
        body: JSON.stringify({ leadId: lead.id }),
      })
      assert.equal(resp.interceptado, true, `rota ${rota} deveria responder interceptada`)
      assert.match(String(resp[Object.keys(resp)[0]]), /AMBIENTE DE TESTE/)
    }
    const despachos = await pb.collection('teste_despachos').getFullList({
      filter: pb.filter("created > {:quando}", { quando: new Date(Date.now() - 60000).toISOString().replace('T', ' ') }),
    })
    assert.equal(despachos.length, 0, 'nenhuma tentativa deveria ser registrada com o portão ativo')
  } finally {
    await pb.collection('leads').delete(lead.id)
  }
})

test('SEM-EXTERNO (controle positivo interceptado): tentativa deliberada registra contador 1 sem rede', async (t) => {
  if (SEM_AMBIENTE) {
    t.skip('backend de teste não configurado (TEST_BACKEND_URL/credenciais sintéticas ausentes)')
    return
  }
  const pb = await novoPb()
  const lead = await pb.collection('leads').create({
    owner: pb.authStore.record.id,
    nome_empresa: 'TESTE Fornecedor Zero ' + Date.now(),
    origem: 'outbound',
    etapa: 'lista',
  })
  try {
    const resp = await pb.send('/backend/v1/funil/gerar-contato', {
      method: 'POST',
      body: JSON.stringify({ leadId: lead.id, provar_interceptacao: true }),
    })
    assert.equal(resp.interceptado, true)
    assert.ok(resp.correlation_id, 'resposta deve trazer o id de correlação')
    const despachos = await pb.collection('teste_despachos').getFullList({
      filter: pb.filter("correlation_id = {:cid}", { cid: resp.correlation_id }),
    })
    assert.equal(despachos.length, 1)
    assert.equal(despachos[0].tentativas, 1)
  } finally {
    await pb.collection('leads').delete(lead.id)
  }
})

test('SEM-EXTERNO: alteração de flags do sistema_config é negada a não-admin', async (t) => {
 if (SEM_AMBIENTE) {
   t.skip('backend de teste não configurado (TEST_BACKEND_URL/credenciais sintéticas ausentes)')
   return
 }
 const pb = await novoPb()
 const cfg = (await pb.collection('sistema_config').getList(1, 1)).items[0]
 // vendedor não-admin tenta ligar as integrações externas — tem de ser negado
 const vendedor = new PocketBase(TEST_BACKEND_URL)
 await vendedor.collection('users').authWithPassword(
   process.env.TEST_VENDEDOR_EMAIL || '',
   process.env.TEST_VENDEDOR_PASSWORD || '',
 )
 await assert.rejects(
   vendedor.collection('sistema_config').update(cfg.id, { integracoes_externas_habilitadas: true }),
   (err) => err.status === 403 || err.status === 404,
   'não-admin não pode alterar flags do sistema',
 )
 // estado persistido conferido: flag continua desligada
 const depois = await pb.collection('sistema_config').getOne(cfg.id)
 assert.equal(depois.integracoes_externas_habilitadas, false)
})

test('SEM-EXTERNO: contador por correlação nas 3 rotas (admin autorizado, pausa ativa)', async (t) => {
 if (SEM_AMBIENTE) {
   t.skip('backend de teste não configurado (TEST_BACKEND_URL/credenciais sintéticas ausentes)')
   return
 }
 const pb = await novoPb()
 const lead = await pb.collection('leads').create({
   owner: pb.authStore.record.id,
   nome_empresa: 'TESTE Fornecedor Zero ' + Date.now(),
   origem: 'outbound',
   etapa: 'lista',
 })
 try {
   for (const rota of ['gerar-contato', 'sugerir-toque', 'analisar-qualificacao']) {
     const resp = await pb.send(`/backend/v1/funil/${rota}`, {
       method: 'POST',
       body: JSON.stringify({ leadId: lead.id }),
     })
     assert.equal(resp.interceptado, true, `rota ${rota} deveria responder interceptada`)
   }
   const despachos = await pb.collection('teste_despachos').getFullList({
     filter: pb.filter("created > {:quando}", { quando: new Date(Date.now() - 60000).toISOString().replace('T', ' ') }),
   })
   assert.equal(despachos.length, 0, 'contador deve permanecer 0 com o portão ativo')
 } finally {
   await pb.collection('leads').delete(lead.id)
 }
})

test('AMBIENTE-RESTORE: backup restaura a fixture própria (contagem por marca)', async (t) => {
  if (SEM_AMBIENTE) {
    t.skip('backend de teste não configurado (TEST_BACKEND_URL/credenciais sintéticas ausentes)')
    return
  }
  const execFileSync = (await import('node:child_process')).execFileSync
  const path = await import('node:path')
  const fs = await import('node:fs')
  const root = path.resolve('.')
  const script = path.join(root, 'scripts', 'backup-restauracao.mjs')
  const dir = path.join(root, 'tests', '.tmp-backup')

  // Marca única desta execução: o teste só enxerga e só apaga o que ele mesmo criou.
  const marca = 'RESTORE-T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  // 1 login por rodada: o token é emprestado ao script (o backend limita autenticação).
  let pb
  try {
    pb = await novoPb()
    const token = pb.authStore.token
    const rodarComToken = (modo) =>
      execFileSync('node', [script, modo, marca], {
        cwd: root,
        env: { ...process.env, RESTORE_TOKEN: token },
        stdio: 'pipe',
      })

    rodarComToken('backup')
    const pre = JSON.parse(fs.readFileSync(path.join(dir, 'contagens-backup.json'), 'utf8'))
    const totalPre = Object.values(pre).reduce((a, b) => a + (b || 0), 0)
    assert.ok(totalPre > 0, 'o backup deve conter ao menos uma fixture da marca')

    // Altera o estado: apaga o lead da marca. A restauração tem de trazê-lo de volta.
    const daMarca = await pb.collection('leads').getFullList({
      filter: pb.filter('nome_empresa ~ {:m}', { m: marca }),
    })
    assert.equal(daMarca.length, 1, 'deve existir exatamente 1 lead da marca')
    await pb.collection('leads').delete(daMarca[0].id)

    rodarComToken('restaurar')
    const pos = JSON.parse(fs.readFileSync(path.join(dir, 'contagens-pos-restauracao.json'), 'utf8'))
    assert.deepEqual(pos, pre, 'contagens POR MARCA após restaurar devem ser iguais às do backup')

    // E o lead voltou de fato, não só a contagem (mesma sessão, sem novo login).
    const depois = await pb.collection('leads').getFullList({
      filter: pb.filter('nome_empresa ~ {:m}', { m: marca }),
    })
    assert.equal(depois.length, 1, 'o lead da marca deve existir depois da restauração')
  } finally {
    // Limpeza: nada da marca fica no banco, mesmo se o teste falhar no meio.
    try {
      execFileSync('node', [script, 'limpar', marca], {
        cwd: root,
        env: { ...process.env, RESTORE_TOKEN: pb?.authStore.token || '' },
        stdio: 'pipe',
      })
    } catch (_) {
      // a limpeza falhar não invalida a prova acima; o resíduo aparece no relatório
    }
  }
})
