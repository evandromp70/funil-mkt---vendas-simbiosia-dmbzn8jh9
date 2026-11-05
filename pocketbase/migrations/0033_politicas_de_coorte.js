// SPEC-2-002 (F2-T03): políticas de coorte, limites e pausa — CA-2-002-01.
// Migração ADITIVA: cria politicas_coorte versionada por ambiente.
// Nada existente é alterado. A pausa geral e o fuso continuam em sistema_config (reuso).
//
// Regra dura da SPEC (item 1): ausência de política aprovada = PENDENTE, nunca "pode".
// Por isso `elegivel_sem_politica` existe mas o hook força sempre false.
migrate(
  (app) => {
    const regraLeitura = "@request.auth.id != ''"
    const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'admin'"

    if (!app.hasTable('politicas_coorte')) {
      const c = new Collection({
        name: 'politicas_coorte',
        type: 'base',
        listRule: regraLeitura,
        viewRule: regraLeitura,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: regraAdmin,
        fields: [
          {
            name: 'coorte',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['rede_jose', 'rede_evandro', 'clientes_atendidos', 'inbound', 'fria'],
          },
          { name: 'versao', type: 'number', required: true, onlyInt: true, min: 1 },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['rascunho', 'aprovada', 'arquivada'],
          },
          { name: 'rotulo', type: 'text' },
          // exige aprovação individual da mensagem antes do toque
          { name: 'exige_aprovacao_mensagem', type: 'bool' },
          // aprovação por lote/amostra: SEMPRE false nesta fase (fria não tem lote)
          { name: 'exige_aprovacao_lote', type: 'bool' },
          // ausência de política nunca vira permissão: o hook força false
          { name: 'elegivel_sem_politica', type: 'bool' },
          // janela de horário (HH:MM) no fuso abaixo
          { name: 'janela_inicio', type: 'text' },
          { name: 'janela_fim', type: 'text' },
          { name: 'timezone', type: 'text' },
          { name: 'intervalo_min_minutos', type: 'number', onlyInt: true, min: 0 },
          { name: 'limite_dia_por_pessoa', type: 'number', onlyInt: true, min: 0 },
          { name: 'limite_dia_por_canal', type: 'number', onlyInt: true, min: 0 },
          { name: 'limite_dia_por_dono', type: 'number', onlyInt: true, min: 0 },
          // nota mínima para elegibilidade (null = sem mínimo)
          { name: 'nota_minima', type: 'number', min: 0, max: 100 },
          {
            name: 'aprovado_por',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'aprovado_em', type: 'date' },
          {
            name: 'ambiente',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['teste', 'producao'],
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_politica_versao ON politicas_coorte (coorte, versao, ambiente)',
          // uma única versão APROVADA por coorte e ambiente — o avaliador não fica na dúvida
          "CREATE UNIQUE INDEX idx_politica_aprovada ON politicas_coorte (coorte, ambiente) WHERE status = 'aprovada'",
        ],
      })
      app.save(c)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('politicas_coorte'))
    } catch (_) {}
  },
)
