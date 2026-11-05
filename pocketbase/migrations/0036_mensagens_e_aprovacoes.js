// SPEC-2-002 (F2-T06): mensagens e aprovações vinculadas — CA-2-002-03.
// Migração ADITIVA. Cria mensagens e aprovacoes.
//
// A aprovação vincula um HASH do conteúdo, não um booleano. Mudou o conteúdo, o hash muda e a
// aprovação deixa de valer. A verificação real é recalculada na hora de usar (rota pode-executar),
// porque marcar "invalidada" no momento da edição não cobre edição por outro caminho.
migrate(
  (app) => {
    if (!app.hasTable('mensagens')) {
      const c = new Collection({
        name: 'mensagens',
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
            required: true,
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
          {
            name: 'cadencia',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('cadencias_ativas').id,
            maxSelect: 1,
          },
          {
            name: 'canal',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['email', 'whatsapp', 'linkedin', 'telefone'],
          },
          { name: 'remetente', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
          { name: 'conteudo', type: 'text', required: true },
          // recalculado pelo servidor a cada gravação — nunca vem do cliente
          { name: 'conteudo_hash', type: 'text', required: true },
          { name: 'versao_config', type: 'number' },
          {
            name: 'coorte',
            type: 'select',
            maxSelect: 1,
            values: ['relacionamento', 'cliente', 'fria', 'inbound'],
          },
          {
            name: 'estado',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['rascunho', 'pendente_aprovacao', 'aprovada', 'rejeitada', 'invalidada'],
          },
          { name: 'motivo_codigo', type: 'text' },
          {
            name: 'owner',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          {
            name: 'ambiente',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['teste'],
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_mensagem_pessoa ON mensagens (pessoa)',
          'CREATE INDEX idx_mensagem_estado ON mensagens (estado)',
        ],
      })
      app.save(c)
    }

    if (!app.hasTable('aprovacoes')) {
      const c = new Collection({
        name: 'aprovacoes',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'mensagem',
            type: 'relation',
            required: true,
            collectionId: app.findCollectionByNameOrId('mensagens').id,
            maxSelect: 1,
          },
          { name: 'aprovador', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
          // O HASH APROVADO. É contra ele que o conteúdo atual é comparado.
          { name: 'conteudo_hash', type: 'text', required: true },
          { name: 'canal', type: 'text' },
          { name: 'remetente', type: 'text' },
          { name: 'versao_config', type: 'number' },
          {
            name: 'estado',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['valida', 'invalidada', 'revogada'],
          },
          { name: 'motivo_codigo', type: 'text' },
          { name: 'revogada_em', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          // uma aprovação VÁLIDA por mensagem — mesmo raciocínio da cadência única
          "CREATE UNIQUE INDEX idx_aprovacao_valida_unica ON aprovacoes (mensagem) WHERE estado = 'valida'",
          'CREATE INDEX idx_aprovacao_mensagem ON aprovacoes (mensagem)',
        ],
      })
      app.save(c)
    }
  },
  (app) => {
    for (const nome of ['aprovacoes', 'mensagens']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {}
    }
  },
)
