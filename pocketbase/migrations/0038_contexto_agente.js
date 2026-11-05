// SPEC-2-003 (F2-T08): registro de decisões do agente — CA-2-003-03.
// Migração ADITIVA. Uma coleção: decisoes_agente.
//
// Guarda o que o agente VIU (entradas referenciadas), com que versão de template, o que decidiu,
// por quê e qual ação efetivamente ocorreu. Sem isto, a decisão de um agente autônomo seria
// irreproduzível — e a SPEC exige justamente o contrário: decisão auditável.
migrate(
  (app) => {
    if (!app.hasTable('decisoes_agente')) {
      const c = new Collection({
        name: 'decisoes_agente',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'pessoa',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('pessoas').id,
            maxSelect: 1,
          },
          {
            name: 'produto',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('produtos').id,
            maxSelect: 1,
          },
          {
            name: 'contexto',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('contextos_comerciais').id,
            maxSelect: 1,
          },
          // decisão determinística (nunca gerada por LLM nesta fase)
          {
            name: 'decisao',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: [
              'propor_toque',
              'aguardar_aprovacao',
              'ja_em_cadencia',
              'aguardar_limite',
              'nao_elegivel',
              'revisao_humana',
              'pendente_contexto',
            ],
          },
          { name: 'motivo_codigo', type: 'text' },
          // o resumo é template com valores literais — comparável à risca
          { name: 'resumo', type: 'text' },
          { name: 'template_versao', type: 'text' },
          // o que o agente viu, exatamente (campos do recorte mínimo)
          { name: 'entradas', type: 'json' },
          // ação solicitada e se foi permitida pela allowlist
          { name: 'acao_solicitada', type: 'text' },
          { name: 'acao_permitida', type: 'bool' },
          { name: 'acao_efetiva', type: 'text' },
          { name: 'correlation_id', type: 'text' },
          {
            name: 'owner',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'ambiente', type: 'select', required: true, maxSelect: 1, values: ['teste'] },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_decisao_pessoa ON decisoes_agente (pessoa)',
          'CREATE INDEX idx_decisao_decisao ON decisoes_agente (decisao)',
        ],
      })
      app.save(c)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('decisoes_agente'))
    } catch (_) {}
  },
)
