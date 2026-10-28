// REATIVADO TEMPORARIAMENTE (28/10) para limpar o resíduo que as suítes da F2-T09..T11
// deixaram. Volta a 410 logo em seguida.
// Preserva: users, sistema_config, politicas_coorte, metas. Apaga o resto (fixtures TESTE).
// Uso: POST /backend/v1/manutencao/limpar { modo: 'executar' }

routerAdd(
  'POST',
  '/backend/v1/manutencao/limpar',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    if (String(e.auth.getString('role')) !== 'admin') return e.forbiddenError('Somente admin')

    const body = e.requestInfo().body || {}
    const executar = String(body.modo || 'relatorio') === 'executar'

    const ORDEM = [
      'passagens',
      'pausas_resposta',
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

    const relatorio = []
    let total = 0
    for (let i = 0; i < ORDEM.length; i++) {
      const col = ORDEM[i]
      let regs = []
      try {
        regs = $app.findRecordsByFilter(col, '', '', 10000, 0)
      } catch (err) {
        relatorio.push({ colecao: col, erro: String(err) })
        continue
      }
      if (!executar) {
        if (regs.length > 0) relatorio.push({ colecao: col, encontrados: regs.length })
        continue
      }
      let ok = 0
      let falhas = 0
      for (let j = 0; j < regs.length; j++) {
        try {
          $app.delete(regs[j])
          ok++
        } catch (_) {
          falhas++
        }
      }
      total += ok
      if (ok > 0 || falhas > 0) relatorio.push({ colecao: col, apagados: ok, falhas: falhas })
    }

    return e.json(200, { executado: executar, total_apagado: total, colecoes: relatorio })
  },
  $apis.requireAuth(),
)
