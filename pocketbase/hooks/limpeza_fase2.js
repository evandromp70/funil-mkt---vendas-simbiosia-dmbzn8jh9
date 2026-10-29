// LIMPEZA DA BASE — Fase 2 (29/10/2026). HOOK TEMPORÁRIO.
//
// Contexto: a base do Funil ficou com ~1.211 registros de FIXTURE das suítes da Fase 2
// (pessoas, passagens, eventos, definições versionadas pelos testes). A ADAPTA começa em
// novembro e o primeiro número que o José olhar não pode estar contaminado.
//
// REGRAS DURAS:
//   1. SÓ ADMIN. Guarda de papel antes de qualquer coisa.
//   2. SÓ AMBIENTE TESTE. Nada de produção.
//   3. RELATÓRIO PRIMEIRO. Sem `executar: true` a rota só CONTA — quem apaga é decisão humana.
//   4. PRESERVA o que é decisão de negócio: users, sistema_config, metas, a política aprovada
//      e a definição de oportunidade aprovada.
//   5. ORDEM: filhos antes de pais, e PASSADAS REPETIDAS (referência obrigatória trava o pai).
//   6. A rota é NEUTRALIZADA (410) depois do uso e o arquivo é removido num estado consistente.
//
// Backup completo antes: 06_notas/evidencias/fase-2/backup-funil-antes-limpeza-2026-10-29.json

routerAdd(
  'POST',
  '/backend/v1/admin/limpeza-fase-2',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    if (String(e.auth.getString('role')) !== 'admin') return e.forbiddenError('Somente admin.')

    const body = e.requestInfo().body || {}
    const executar = body.executar === true

    // ordem importa: filhos antes dos pais
    const alvos = [
      'pessoas_origens',
      'conflitos_cadastro',
      'fusoes_cadastro',
      'bloqueios_contato',
      'pontuacoes',
      'entrevista_produtos',
      'regras_produto',
      'transicoes_comerciais',
      'contextos_comerciais',
      'cadencias_ativas',
      'aprovacoes',
      'mensagens',
      'decisoes_agente',
      'passagens',
      'adaptadores_teste',
      'eventos_teste',
      'leads',
      'pessoas',
      'lista_membros',
      'listas',
      'produtos',
      'empresas',
    ]

    const relatorio = []
    let totalApagado = 0

    for (let a = 0; a < alvos.length; a++) {
      const nome = alvos[a]
      let col
      try {
        col = $app.findCollectionByNameOrId(nome)
      } catch (_) {
        relatorio.push({ colecao: nome, estado: 'inexistente', apagados: 0 })
        continue
      }

      let registros = []
      try {
        registros = $app.findRecordsByFilter(nome, "id != ''", '', 1000, 0, {})
      } catch (_) {
        try {
          registros = $app.findRecordsByFilter(nome, '', '', 1000, 0, {})
        } catch (_) {
          relatorio.push({ colecao: nome, estado: 'erro_leitura', apagados: 0 })
          continue
        }
      }

      if (!executar) {
        relatorio.push({
          colecao: nome,
          estado: 'contado',
          apagados: 0,
          encontrados: registros.length,
        })
        continue
      }

      let apagados = 0
      for (let i = 0; i < registros.length; i++) {
        try {
          $app.delete(registros[i])
          apagados++
        } catch (_) {
          // referência obrigatória ou guarda de negócio: fica para a próxima passada
        }
      }
      totalApagado += apagados
      relatorio.push({ colecao: nome, estado: 'executado', apagados })
    }

    // ---------- PRESERVADOS: conferência explícita ----------
    const preservados = {}
    try {
      preservados.users = $app.findRecordsByFilter('users', '', '', 200, 0, {}).length
    } catch (_) {
      preservados.users = -1
    }
    try {
      preservados.sistema_config = $app.findRecordsByFilter(
        'sistema_config',
        '',
        '',
        50,
        0,
        {},
      ).length
    } catch (_) {
      preservados.sistema_config = -1
    }
    try {
      preservados.metas = $app.findRecordsByFilter('metas', '', '', 50, 0, {}).length
    } catch (_) {
      preservados.metas = -1
    }
    try {
      preservados.politicas_aprovadas = $app.findRecordsByFilter(
        'politicas_coorte',
        "status = 'aprovada'",
        '',
        50,
        0,
        {},
      ).length
    } catch (_) {
      preservados.politicas_aprovadas = -1
    }
    try {
      preservados.definicoes_aprovadas = $app.findRecordsByFilter(
        'definicoes_oportunidade',
        "status = 'aprovada'",
        '',
        50,
        0,
        {},
      ).length
    } catch (_) {
      preservados.definicoes_aprovadas = -1
    }

    return e.json(200, {
      modo: executar ? 'EXECUTADO' : 'RELATORIO (nada foi apagado)',
      total_apagado: totalApagado,
      por_colecao: relatorio,
      preservados: preservados,
      aviso: executar
        ? 'Limpeza executada. Rode de novo até total_apagado = 0 (referências cruzadas).'
        : 'Nada foi apagado. Envie {"executar": true} para executar.',
    })
  },
  $apis.requireAuth(),
)
