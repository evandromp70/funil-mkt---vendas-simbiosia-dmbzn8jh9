// TEMPORÁRIO (28/10/2026): limpeza de fixtures de teste acumuladas no backend TESTE.
// Será REMOVIDO do ar imediatamente após o uso.
//
// ESCOPO ESTRITO — só remove:
//   1. produtos cujo nome começa com "TESTE "
//   2. pessoas cujo nome começa com "TESTE "
//   3. leads cujo nome_empresa começa com "TESTE "
//   4. contextos/transições cujo produto OU pessoa deixou de existir (órfãos) ou cujo produto
//      é o "PRODUTO GENERICO (legado)"
// Preserva: users, sistema_config, metas, réguas, leads/pessoas/produtos reais.
routerAdd(
  'POST',
  '/backend/v1/admin/limpar-fixtures-tmp',
  (e) => {
    if (!e.auth || e.auth.getString('role') !== 'admin')
      return e.forbiddenError('Apenas administradores')

    const relatorio = {}

    // 1. transições órfãs ou de fixture
    let trRemovidas = 0
    try {
      for (const t of $app.findRecordsByFilter(
        'transicoes_comerciais',
        "id != ''",
        '',
        5000,
        0,
        {},
      )) {
        let apagar = false
        try {
          $app.findRecordById('contextos_comerciais', t.getString('contexto'))
        } catch (_) {
          apagar = true // órfã: contexto já não existe
        }
        if (!apagar && /^legado:|^teste-|^e1-|^e2-|^acl-/.test(t.getString('evento_id') || ''))
          apagar = true
        if (apagar) {
          try {
            $app.delete(t)
            trRemovidas++
          } catch (_) {}
        }
      }
    } catch (_) {}
    relatorio.transicoes_removidas = trRemovidas

    // 2. contextos: produto GENERICO (legado), ou pessoa/produto inexistente
    let ctxRemovidos = 0
    try {
      for (const c of $app.findRecordsByFilter(
        'contextos_comerciais',
        "id != ''",
        '',
        5000,
        0,
        {},
      )) {
        let apagar = false
        let nomeProduto = ''
        try {
          nomeProduto = $app.findRecordById('produtos', c.getString('produto')).getString('nome')
        } catch (_) {
          apagar = true
        }
        if (!apagar && /GENERICO \(legado\)/.test(nomeProduto)) apagar = true
        if (!apagar) {
          try {
            $app.findRecordById('pessoas', c.getString('pessoa'))
          } catch (_) {
            apagar = true
          }
        }
        if (apagar) {
          try {
            $app.delete(c)
            ctxRemovidos++
          } catch (_) {}
        }
      }
    } catch (_) {}
    relatorio.contextos_removidos = ctxRemovidos

    // 3. mães: só as com marca "TESTE " no início do nome
    const MARCAS = [
      ['lista_membros', null],
      ['pontuacoes', null],
      ['pessoas_origens', null],
      ['leads', 'nome_empresa'],
      ['pessoas', 'nome'],
      ['produtos', 'nome'],
    ]
    for (const [colecao, campo] of MARCAS) {
      let n = 0
      try {
        const todos = $app.findRecordsByFilter(colecao, "id != ''", '', 5000, 0, {})
        for (const r of todos) {
          let apagar = false
          if (campo) {
            apagar = /^TESTE /i.test(r.getString(campo) || '')
          } else {
            if (colecao === 'pontuacoes') {
              try {
                $app.findRecordById('leads', r.getString('lead'))
              } catch (_) {
                apagar = true
              }
            } else if (colecao === 'pessoas_origens') {
              try {
                $app.findRecordById('pessoas', r.getString('pessoa'))
              } catch (_) {
                apagar = true
              }
            } else if (colecao === 'lista_membros') {
              try {
                $app.findRecordById('leads', r.getString('lead'))
              } catch (_) {
                apagar = true
              }
            }
          }
          if (apagar) {
            try {
              $app.delete(r)
              n++
            } catch (_) {}
          }
        }
      } catch (_) {}
      relatorio[colecao] = n
    }

    return e.json(200, { ok: true, relatorio })
  },
  $apis.requireAuth(),
)
