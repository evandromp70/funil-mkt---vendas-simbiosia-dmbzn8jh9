// SPEC-1-007 (task 199009b0): coleções do contrato v1 no Funil — CA-1-007-01.
// sync_inbox, sync_mapeamentos, aliases_identidade — mesmas definições da Fábrica.
migrate(
  (app) => {
    const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'admin'"
    const regraLeitura = "@request.auth.id != ''"

    if (!app.hasTable('sync_inbox')) {
      const c = new Collection({
        name: 'sync_inbox',
        type: 'base',
        listRule: regraLeitura,
        viewRule: regraLeitura,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: null,
        fields: [
          { name: 'evento_id', type: 'text', required: true },
          { name: 'origem', type: 'select', required: true, maxSelect: 1, values: ['fabrica', 'funil'] },
          { name: 'ambiente', type: 'select', required: true, maxSelect: 1, values: ['teste', 'real'] },
          { name: 'tipo_evento', type: 'text', required: true },
          { name: 'dominio', type: 'select', required: true, maxSelect: 1, values: ['cadastro', 'catalogo', 'pontuacao', 'comercial', 'protecao', 'alias'] },
          { name: 'entidade_global_id', type: 'text' },
          { name: 'revisao', type: 'number', required: true, onlyInt: true },
          { name: 'payload_hash', type: 'text', required: true },
          {
            name: 'estado',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['aplicado', 'duplicado', 'atrasado', 'pendente', 'conflito', 'rejeitado'],
          },
          { name: 'resultado', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_sync_inbox_evento ON sync_inbox (evento_id, origem, ambiente)',
        ],
      })
      app.save(c)
    }

    if (!app.hasTable('sync_mapeamentos')) {
      const c = new Collection({
        name: 'sync_mapeamentos',
        type: 'base',
        listRule: regraAdmin,
        viewRule: regraAdmin,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: null,
        fields: [
          {
            name: 'app_origem',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['fabrica', 'funil'],
          },
          { name: 'referencia_ator', type: 'text', required: true },
          {
            name: 'usuario_local_destino',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'ambiente', type: 'select', required: true, maxSelect: 1, values: ['teste', 'real'] },
          {
            name: 'aprovado_por',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'aprovado_em', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_sync_mapeamento ON sync_mapeamentos (app_origem, referencia_ator, ambiente)',
        ],
      })
      app.save(c)
    }

    if (!app.hasTable('aliases_identidade')) {
      const c = new Collection({
        name: 'aliases_identidade',
        type: 'base',
        listRule: regraLeitura,
        viewRule: regraLeitura,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: null,
        fields: [
          { name: 'origem_global', type: 'text', required: true },
          { name: 'destino_global', type: 'text', required: true },
          { name: 'rev', type: 'number', required: true, onlyInt: true },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['ativo', 'revogado'],
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_alias_origem_rev ON aliases_identidade (origem_global, rev)',
        ],
      })
      app.save(c)
    }
  },
  (app) => {
    for (const nome of ['aliases_identidade', 'sync_mapeamentos', 'sync_inbox']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {}
    }
  },
)
