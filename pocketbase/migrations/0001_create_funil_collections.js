migrate(
  (app) => {
    // ---------- leads ----------
    const leads = new Collection({
      name: 'leads',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && owner = @request.auth.id",
      deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
      fields: [
        {
          name: 'owner',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'nome_empresa', type: 'text', required: true },
        { name: 'contato_nome', type: 'text', required: false },
        { name: 'contato_email', type: 'email', required: false },
        { name: 'contato_telefone', type: 'text', required: false },
        {
          name: 'origem',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['inbound', 'outbound'],
        },
        {
          name: 'etapa',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: [
            'lista',
            'qualificacao',
            'contato',
            'cadencia',
            'alinhamento',
            'conversao',
            'ganho',
            'perdido',
          ],
        },
        { name: 'score', type: 'number', required: false, min: 0, max: 100, onlyInt: true },
        { name: 'observacoes', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_leads_owner_etapa ON leads (owner, etapa)',
        'CREATE INDEX idx_leads_origem ON leads (origem)',
      ],
    })
    app.save(leads)

    // ---------- listas ----------
    const listas = new Collection({
      name: 'listas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && owner = @request.auth.id",
      deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
      fields: [
        {
          name: 'owner',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'nome', type: 'text', required: true },
        {
          name: 'origem',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['inbound', 'outbound'],
        },
        { name: 'segmento', type: 'text', required: false },
        { name: 'descricao', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_listas_owner ON listas (owner)'],
    })
    app.save(listas)

    // ---------- qualificacoes ----------
    const qualificacoes = new Collection({
      name: 'qualificacoes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && owner = @request.auth.id",
      deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
      fields: [
        {
          name: 'owner',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'lead',
          type: 'relation',
          required: true,
          collectionId: leads.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'fit', type: 'number', required: false, min: 0, max: 10, onlyInt: true },
        { name: 'dor', type: 'number', required: false, min: 0, max: 10, onlyInt: true },
        { name: 'orcamento', type: 'number', required: false, min: 0, max: 10, onlyInt: true },
        { name: 'timing', type: 'number', required: false, min: 0, max: 10, onlyInt: true },
        { name: 'acesso', type: 'number', required: false, min: 0, max: 10, onlyInt: true },
        { name: 'score_total', type: 'number', required: false, min: 0, max: 100, onlyInt: true },
        {
          name: 'decisao',
          type: 'select',
          required: false,
          maxSelect: 1,
          values: ['qualificado', 'nao_qualificado', 'revisar'],
        },
        { name: 'notas', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_qualificacoes_lead ON qualificacoes (lead)'],
    })
    app.save(qualificacoes)

    // ---------- contatos ----------
    const contatos = new Collection({
      name: 'contatos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && owner = @request.auth.id",
      deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
      fields: [
        {
          name: 'owner',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'lead',
          type: 'relation',
          required: true,
          collectionId: leads.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'canal',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['email', 'linkedin', 'whatsapp', 'telefone', 'evento'],
        },
        {
          name: 'direcao',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['inbound', 'outbound'],
        },
        { name: 'mensagem', type: 'text', required: false },
        { name: 'resposta', type: 'text', required: false },
        { name: 'data_contato', type: 'date', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_contatos_lead ON contatos (lead)'],
    })
    app.save(contatos)

    // ---------- cadencias ----------
    const cadencias = new Collection({
      name: 'cadencias',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && owner = @request.auth.id",
      deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
      fields: [
        {
          name: 'owner',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'lead',
          type: 'relation',
          required: true,
          collectionId: leads.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'toque', type: 'number', required: true, min: 1, max: 99, onlyInt: true },
        {
          name: 'canal',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['email', 'linkedin', 'whatsapp', 'telefone'],
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['agendado', 'enviado', 'respondido', 'ignorado', 'cancelado'],
        },
        { name: 'rascunho_ia', type: 'text', required: false },
        { name: 'data_envio', type: 'date', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_cadencias_lead ON cadencias (lead)'],
    })
    app.save(cadencias)

    // ---------- alinhamentos ----------
    const alinhamentos = new Collection({
      name: 'alinhamentos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && owner = @request.auth.id",
      deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
      fields: [
        {
          name: 'owner',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'lead',
          type: 'relation',
          required: true,
          collectionId: leads.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'data_reuniao', type: 'date', required: false },
        { name: 'pauta', type: 'text', required: false },
        { name: 'decisoes', type: 'text', required: false },
        { name: 'proximo_passo', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_alinhamentos_lead ON alinhamentos (lead)'],
    })
    app.save(alinhamentos)
  },
  (app) => {
    const names = ['alinhamentos', 'cadencias', 'contatos', 'qualificacoes', 'listas', 'leads']
    for (const name of names) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
  },
)
