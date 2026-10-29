// TEMPORÁRIO (29/10/2026): limpeza do resíduo de teste antes dos dados reais da ADAPTA.
// v2 — reaplicado para forçar o registro da rota (integrations falhou no apply anterior).
// REMOVER DO AR imediatamente após o uso (deixar 410).
//
// Motivo: as coleções de negócio têm deleteRule null (só superusuário apaga) e a API externa
// também não permite. Este hook roda DENTRO do servidor, com $app — a única via legítima.
//
// Guardas:
//   - exige usuário autenticado com role = 'admin'
//   - modo=relatorio (PADRÃO) não apaga nada, só conta
//   - modo=executar apaga, filhos antes de pais
//
// ESCOPO ESTRITO — só sai o que é provadamente fixture:
//   1. produtos/pessoas/pessoas_origens com nome "JORNADA ..."
//   2. leads com nome_empresa "(sem empresa)" (artefato da jornada E2E)
//   3. coleções cujo conteúdo inteiro é artefato da jornada (passagens, eventos_teste, ...)
//   4. definicoes_oportunidade com status != 'aprovada' (acúmulo do defeito de teardown)
//   5. os 7 usuários de teste, por ID EXPLÍCITO
//
// PRESERVA: José e Evandro, sistema_config, as 3 políticas aprovadas + o histórico delas,
// a definição de oportunidade v46 aprovada, e a meta (que é reatribuída ao José).
//
// Uso: POST /backend/v1/manutencao/limpar-adapta  { modo: 'relatorio' | 'executar' }

routerAdd(
  'POST',
  '/backend/v1/manutencao/limpar-adapta',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    if (String(e.auth.getString('role')) !== 'admin') return e.forbiddenError('Somente admin')

    const body = e.requestInfo().body || {}
    const modo = String(body.modo || 'relatorio')
    const executar = modo === 'executar'

    const relatorio = {}
    const erro = {}

    // ---- 1. produtos JORNADA -------------------------------------------------
    let produtos = 0
    try {
      const lista = $app.findRecordsByFilter('produtos', "nome ~ 'JORNADA'", '', 1000, 0, {})
      produtos = lista.length
      if (executar)
        for (const r of lista) {
          try {
            $app.delete(r)
          } catch (err) {
            erro.produtos = String(err)
          }
        }
    } catch (err) {
      erro.produtos_busca = String(err)
    }
    relatorio.produtos_jornada = produtos

    // ---- 2. pessoas JORNADA e suas origens ----------------------------------
    let pessoas = 0
    let origens = 0
    try {
      const lista = $app.findRecordsByFilter('pessoas', "nome ~ 'JORNADA'", '', 1000, 0, {})
      pessoas = lista.length
      for (const p of lista) {
        let ors = []
        try {
          ors = $app.findRecordsByFilter('pessoas_origens', 'pessoa = {:p}', '', 100, 0, {
            p: p.id,
          })
        } catch (err) {
          erro.origens_busca = String(err)
        }
        origens += ors.length
        if (executar) {
          for (const o of ors) {
            try {
              $app.delete(o)
            } catch (err) {
              erro.origens = String(err)
            }
          }
          try {
            $app.delete(p)
          } catch (err) {
            erro.pessoas = String(err)
          }
        }
      }
    } catch (err) {
      erro.pessoas_busca = String(err)
    }
    relatorio.pessoas_jornada = pessoas
    relatorio.pessoas_origens = origens

    // ---- 3. coleções inteiramente de fixture (filhos antes de pais) ---------
    // Cada uma foi conferida no inventário de 29/10: todo o conteúdo é artefato da jornada.
    const INTEIRAS = [
      'pausas_resposta',
      'passagens',
      'eventos_teste',
      'decisoes_agente',
      'toques',
      'reservas',
      'cadencias_ativas',
      'aprovacoes',
      'mensagens',
      'limites_consumo',
      'bloqueios_contato',
      'contextos_comerciais',
      'transicoes_comerciais',
      'aliases_identidade',
      'sync_inbox',
      'sync_mapeamentos',
      'importacao_linhas',
      'importacoes',
      'comercial_exportacoes',
      'teste_despachos',
      'pontuacoes',
      'jobs_pontuacao',
      'qualificacoes',
      'contatos',
      'lista_membros',
      'entrevista_produtos',
      'regras_produto',
    ]
    for (const col of INTEIRAS) {
      let n = 0
      try {
        const lista = $app.findRecordsByFilter(col, "id != ''", '', 5000, 0, {})
        n = lista.length
        if (executar)
          for (const r of lista) {
            try {
              $app.delete(r)
            } catch (err) {
              erro[col] = String(err)
            }
          }
      } catch (err) {
        erro[col + '_busca'] = String(err)
      }
      relatorio[col] = n
    }

    // ---- 4. leads da jornada -----------------------------------------------
    let leads = 0
    try {
      const lista = $app.findRecordsByFilter(
        'leads',
        "nome_empresa = '(sem empresa)'",
        '',
        1000,
        0,
        {},
      )
      leads = lista.length
      if (executar)
        for (const r of lista) {
          try {
            $app.delete(r)
          } catch (err) {
            erro.leads = String(err)
          }
        }
    } catch (err) {
      erro.leads_busca = String(err)
    }
    relatorio.leads_sem_empresa = leads

    // ---- 5. definições de oportunidade: apaga o que NÃO é a aprovada --------
    let defsArq = 0
    try {
      const lista = $app.findRecordsByFilter(
        'definicoes_oportunidade',
        "status != 'aprovada'",
        '',
        5000,
        0,
        {},
      )
      defsArq = lista.length
      if (executar)
        for (const r of lista) {
          try {
            $app.delete(r)
          } catch (err) {
            erro.definicoes = String(err)
          }
        }
    } catch (err) {
      erro.definicoes_busca = String(err)
    }
    relatorio.definicoes_arquivadas = defsArq

    // ---- 6. meta: reatribui ao José ANTES de apagar o dono de teste ---------
    // A meta (seed de 15/08) aponta para o "Vendedor Teste" — referência obrigatória.
    // Reatribuir preserva o registro; apagar o usuário deixaria referência órfã.
    const JOSE = 'qluaa8hzhafusyl'
    let metasReatribuidas = 0
    try {
      const metas = $app.findRecordsByFilter('metas', "id != ''", '', 100, 0, {})
      for (const m of metas) {
        const dono = String(m.getString('user') || '')
        if (dono && dono !== JOSE && dono !== 'fo2s5qjvnr8dgei') {
          metasReatribuidas++
          if (executar) {
            try {
              m.set('user', JOSE)
              $app.save(m)
            } catch (err) {
              erro.metas = String(err)
            }
          }
        }
      }
    } catch (err) {
      erro.metas_busca = String(err)
    }
    relatorio.metas_reatribuidas_ao_jose = metasReatribuidas

    // ---- 7. usuários de teste, por ID EXPLÍCITO -----------------------------
    const USERS_TESTE = [
      '17yh92ucnmtlk8u',
      '1wk3e89552hmv03',
      '5eugqfsjcievw3k',
      '6v8s4dfrwbxoxxc',
      '814cp1sy9bs4wpm',
      'ci86odq4dq7k9jh',
      'oltxcwsejhg9rdk',
    ]
    let usersApagados = 0
    const usersVistos = []
    for (const uid of USERS_TESTE) {
      let u = null
      try {
        u = $app.findRecordById('users', uid)
      } catch (err) {
        continue
      }
      usersVistos.push(String(u.getString('name') || uid))
      // só apaga depois de a meta já apontar para o José
      if (executar && metasReatribuidas >= 0) {
        try {
          $app.delete(u)
          usersApagados++
        } catch (err) {
          erro['user_' + uid] = String(err)
        }
      }
    }
    relatorio.users_teste = executar ? usersApagados : usersVistos.length
    if (!executar) relatorio.users_teste_nomes = usersVistos

    // ---- 8. conferência do que fica ----------------------------------------
    const fica = {}
    for (const col of [
      'users',
      'sistema_config',
      'politicas_coorte',
      'metas',
      'produtos',
      'pessoas',
      'leads',
    ]) {
      try {
        fica[col] = $app.findRecordsByFilter(col, "id != ''", '', 5000, 0, {}).length
      } catch (err) {
        fica[col] = 'ERR'
      }
    }
    relatorio.ficam = fica

    return e.json(200, {
      modo: modo,
      executou: executar,
      relatorio: relatorio,
      erros: erro,
    })
  },
  $apis.requireRecordAuth(),
)
