// SPEC-1-002 (task ea6db5dc): cadastro único de empresas e contatos — CA-1-002-01.
// Migração ADITIVA: cria empresas/pessoas/pessoas_origens/bloqueios_contato/fusoes_cadastro
// e adiciona relations empresa/pessoa em leads. Nada é apagado; campos legados permanecem.
// F2-T01: recuperada do Skip 50182 (fonte executável).
migrate(
  (app) => {
    const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'admin'"
    const regraDono =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || owner = @request.auth.id)"

    if (!app.hasTable('empresas')) {
      const c = new Collection({
        name: 'empresas',
        type: 'base',
        listRule: regraAdmin,
        viewRule: regraAdmin,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: null,
        fields: [
          { name: 'razao_social', type: 'text', required: true },
          { name: 'cnpj_norm', type: 'text' },
          { name: 'cnae', type: 'text' },
          { name: 'setor', type: 'text' },
          { name: 'porte', type: 'text' },
          { name: 'uf', type: 'text' },
          { name: 'cidade', type: 'text' },
          { name: 'data_inicio', type: 'date' },
          { name: 'atributos', type: 'json' },
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
          'CREATE UNIQUE INDEX idx_empresas_cnpj ON empresas (ambiente, cnpj_norm) WHERE cnpj_norm != ""',
        ],
      })
      app.save(c)
    }

    if (!app.hasTable('pessoas')) {
      const c = new Collection({
        name: 'pessoas',
        type: 'base',
        listRule: regraAdmin,
        viewRule: regraAdmin,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: null,
        fields: [
          { name: 'nome', type: 'text', required: true },
          { name: 'email_norm', type: 'email' },
          { name: 'telefone_norm', type: 'text' },
          { name: 'linkedin_norm', type: 'url' },
          { name: 'relacionamento_conhecido', type: 'bool' },
          {
            name: 'owner_relacao',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'atributos', type: 'json' },
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
      })
      app.save(c)
    }

    if (!app.hasTable('pessoas_origens')) {
      const pessoas = app.findCollectionByNameOrId('pessoas')
      const c = new Collection({
        name: 'pessoas_origens',
        type: 'base',
        listRule: regraAdmin,
        viewRule: regraAdmin,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: null,
        fields: [
          {
            name: 'pessoa',
            type: 'relation',
            required: true,
            collectionId: pessoas.id,
            maxSelect: 1,
          },
          {
            name: 'coorte',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['rede_jose', 'rede_evandro', 'clientes_atendidos', 'inbound', 'fria'],
          },
          { name: 'dono_relacao', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
          { name: 'fonte', type: 'text' },
          { name: 'referencia', type: 'text' },
          { name: 'recebido_em', type: 'date' },
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
      })
      app.save(c)
    }

    if (!app.hasTable('bloqueios_contato')) {
      const c = new Collection({
        name: 'bloqueios_contato',
        type: 'base',
        listRule: regraAdmin,
        viewRule: regraAdmin,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: null,
        fields: [
          {
            name: 'pessoa',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('pessoas').id,
            maxSelect: 1,
          },
          { name: 'identificador_norm', type: 'text' },
          {
            name: 'motivo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['relacionamento', 'pedido_saida'],
          },
          {
            name: 'alcance',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['fria', 'global'],
          },
          { name: 'origem', type: 'text' },
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
      })
      app.save(c)
    }

    if (!app.hasTable('fusoes_cadastro')) {
      const c = new Collection({
        name: 'fusoes_cadastro',
        type: 'base',
        listRule: regraAdmin,
        viewRule: regraAdmin,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: null,
        fields: [
          { name: 'entidade_origem', type: 'text', required: true },
          { name: 'id_origem', type: 'text', required: true },
          { name: 'entidade_destino', type: 'text', required: true },
          { name: 'id_destino', type: 'text', required: true },
          { name: 'snapshot_antes', type: 'json' },
          { name: 'vinculos_antes', type: 'json' },
          { name: 'ator', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
          { name: 'motivo', type: 'text' },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['aplicada', 'revertida', 'revisao_pendente'],
          },
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
      })
      app.save(c)
    }

    const leads = app.findCollectionByNameOrId('leads')
    if (!leads.fields.some((f) => f.name === 'empresa')) {
      leads.fields.add(
        new RelationField({
          name: 'empresa',
          collectionId: app.findCollectionByNameOrId('empresas').id,
          maxSelect: 1,
        }),
      )
    }
    if (!leads.fields.some((f) => f.name === 'pessoa')) {
      leads.fields.add(
        new RelationField({
          name: 'pessoa',
          collectionId: app.findCollectionByNameOrId('pessoas').id,
          maxSelect: 1,
        }),
      )
    }
    if (!leads.fields.some((f) => f.name === 'migracao_origem_id')) {
      leads.fields.add(new TextField({ name: 'migracao_origem_id' }))
    }
    app.save(leads)
  },
  (app) => {
    try {
      const leads = app.findCollectionByNameOrId('leads')
      for (const nome of ['empresa', 'pessoa', 'migracao_origem_id']) {
        const f = leads.fields.find((x) => x.name === nome)
        if (f) leads.fields.remove(f.id)
      }
      app.save(leads)
    } catch (_) {}
    for (const nome of [
      'fusoes_cadastro',
      'bloqueios_contato',
      'pessoas_origens',
      'pessoas',
      'empresas',
    ]) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {}
    }
  },
)
