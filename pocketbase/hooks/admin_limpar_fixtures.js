// HOOK TEMPORÁRIO de limpeza pós-SPEC-1-007 — remover após uso.
// POST /backend/v1/admin/limpar-fixtures — só admin; apaga resíduo de fixtures/demo.
// Preserva: users, sistema_config, metas. Apaga: todo dado de negócio (100% sintético em 22/10/2026).
// v3: ordem filhos→pais (referências) para esvaziar em 1 passada.
routerAdd(
  'POST',
  '/backend/v1/admin/limpar-fixtures',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação necessária')
    if (auth.getString('role') !== 'admin') return e.forbiddenError('Só admin executa limpeza')

    const body = e.requestInfo().body || {}
    const modo = body.modo || 'relatorio'

    // Funil: filhos antes de pais (pessoas_origens→pessoas; entrevista_produtos/regras→produtos)
    const alvo = [
      'pessoas_origens',
      'entrevista_produtos',
      'regras_produto',
      'qualificacoes',
      'contatos',
      'cadencias',
      'alinhamentos',
      'lista_membros',
      'importacao_linhas',
      'jobs_pontuacao',
      'pontuacoes',
      'bloqueios_contato',
      'conflitos_cadastro',
      'fusoes_cadastro',
      'sync_inbox',
      'sync_mapeamentos',
      'aliases_identidade',
      'teste_despachos',
      'leads',
      'pessoas',
      'produtos',
      'empresas',
      'importacoes',
      'listas',
    ]

    const relatorio = {}
    let total = 0
    for (const col of alvo) {
      let n = 0
      try {
        if (modo === 'executar') {
          var seg = 0
          while (true) {
            const lote = $app.findRecordsByFilter(col, '', '', 500, 0)
            if (lote.length === 0) break
            for (const r of lote) {
              $app.delete(r)
              n++
            }
            if (++seg > 40) break
          }
        } else {
          n = $app.findRecordsByFilter(col, '', '', 10000, 0).length
        }
      } catch (err) {
        relatorio[col] = 'ERRO: ' + err.message
        continue
      }
      relatorio[col] = n
      total += n
    }

    return e.json(200, { modo: modo, total: total, relatorio: relatorio })
  },
  $apis.requireAuth(),
)
