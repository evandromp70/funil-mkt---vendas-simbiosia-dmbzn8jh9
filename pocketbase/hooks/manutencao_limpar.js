// HOOK TEMPORÁRIO DE LIMPEZA — REMOVER DO AR assim que a limpeza terminar.
// Motivo: as coleções de negócio têm deleteRule null (só superusuário apaga) e a API externa
// também não permite. Este hook roda DENTRO do servidor com $app — única via legítima.
//
// Guardas: exige role=admin; modo=relatorio (padrão) não apaga nada; modo=executar apaga.
// Preserva: users, sistema_config, politicas_coorte, metas e os registros de negócio REAL.
//
// Uso: POST /backend/v1/manutencao/limpar { modo: 'relatorio' | 'executar' }

routerAdd(
  'POST',
  '/backend/v1/manutencao/limpar',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    if (String(e.auth.getString('role')) !== 'admin') return e.forbiddenError('Somente admin')

    const body = e.requestInfo().body || {}
    const modo = String(body.modo || 'relatorio')
    const executar = modo === 'executar'

    // ordem: FILHOS antes de PAIS (referência required trava o delete do pai)
    const ORDEM = [
      'pontuacoes',
      'jobs_pontuacao',
      'transicoes_comerciais',
      'contextos_comerciais',
      'decisoes_agente',
      'mensagens',
      'aprovacoes',
      'reservas',
      'toques',
      'cadencias_ativas',
      'cadencias',
      'bloqueios_contato',
      'aliases_identidade',
      'pessoas_origens',
      'contatos',
      'lista_membros',
      'importacao_linhas',
      'importacoes',
      'conflitos_cadastro',
      'fusoes_cadastro',
      'entrevista_produtos',
      'regras_produto',
      'qualificacoes',
      'alinhamentos',
      'sync_inbox',
      'sync_mapeamentos',
      'eventos_teste',
      'adaptadores_teste',
      'teste_despachos',
      'limites_consumo',
      'listas',
      'leads',
      'pessoas',
      'empresas',
      'produtos',
    ]

    // NENHUMA exceção: conferi os 15 leads e as empresas "não-fixture" uma a uma. Todos são
    // resto de teste — inclusive "Demo Comércio" (aponta para pessoa/empresa fictícias) e
    // "Avancorp" (sobra de teste de cadastro; o dogfood real do FAROL vive no app 68997).
    // Preservar qualquer um deles criaria vínculo órfão. A base tem de ficar ZERADA para
    // receber a importação real da ADAPTA. O backup completo está em
    // work/limpeza-fase2-t09/backup-funil-2026-10-28.json (2,6 MB).
    const PRESERVAR = {}

    const ehFixture = (col, rec) => {
      const nome = String(
        rec.getString('nome') ||
          rec.getString('razao_social') ||
          rec.getString('nome_empresa') ||
          rec.getString('titulo') ||
          '',
      )
      const lista = PRESERVAR[col]
      if (lista) {
        for (let i = 0; i < lista.length; i++) {
          if (nome.indexOf(lista[i]) === 0) return false
        }
      }
      return true
    }

    const relatorio = []
    let totalApagado = 0

    for (let i = 0; i < ORDEM.length; i++) {
      const col = ORDEM[i]
      let registros = []
      try {
        registros = $app.findRecordsByFilter(col, '', '', 10000, 0)
      } catch (err) {
        relatorio.push({ colecao: col, erro: String(err) })
        continue
      }

      const apagaveis = []
      for (let j = 0; j < registros.length; j++) {
        if (ehFixture(col, registros[j])) apagaveis.push(registros[j])
      }

      if (executar) {
        let apagados = 0
        let falhas = 0
        for (let j = 0; j < apagaveis.length; j++) {
          try {
            $app.delete(apagaveis[j])
            apagados++
          } catch (_) {
            falhas++
          }
        }
        totalApagado += apagados
        relatorio.push({
          colecao: col,
          encontrados: registros.length,
          apagados: apagados,
          falhas: falhas,
          preservados: registros.length - apagaveis.length,
        })
      } else {
        relatorio.push({
          colecao: col,
          encontrados: registros.length,
          a_apagar: apagaveis.length,
          preservados: registros.length - apagaveis.length,
        })
      }
    }

    return e.json(200, {
      modo: modo,
      executado: executar,
      total_apagado: totalApagado,
      colecoes: relatorio,
      aviso: executar
        ? 'Limpeza executada. REMOVER este hook do ar imediatamente.'
        : 'Modo relatório: nada foi apagado.',
    })
  },
  $apis.requireAuth(),
)
