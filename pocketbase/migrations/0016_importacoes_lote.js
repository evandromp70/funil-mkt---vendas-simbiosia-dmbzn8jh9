// SPEC-1-003 (task 0574671d): lote de importação com relatório por linha — CA-1-003-02.
// Migração ADITIVA: importacoes (lote), importacao_linhas (relatório por linha, checkpoint)
// e lista_membros (associação lista×lead, sem duplicar membro). Nada legado é alterado.
// F2-T01: recuperada do Skip 50182 (fonte executável).
migrate(
  (app) => {
    const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'admin'"
    const regraDono =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || owner = @request.auth.id)"

    if (!app.hasTable('importacoes')) {
      const c = new Collection({
        name: 'importacoes',
        type: 'base',
        listRule: regraAdmin,
        viewRule: regraAdmin,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: null,
        fields: [
          {
            name: 'owner',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'arquivo_hash', type: 'text', required: true },
          { name: 'chave_lote', type: 'text', required: true },
          { name: 'nome_arquivo', type: 'text' },
          { name: 'mapeamento', type: 'json' },
          {
            name: 'lista',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('listas').id,
            maxSelect: 1,
          },
          {
            name: 'coorte',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['rede_jose', 'rede_evandro', 'clientes_atendidos', 'inbound', 'fria'],
          },
          { name: 'dono', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
          {
            name: 'ambiente',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['teste', 'producao'],
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['previa', 'processando', 'concluida', 'falha', 'revertida'],
          },
          { name: 'total', type: 'number', onlyInt: true },
          { name: 'novas', type: 'number', onlyInt: true },
          { name: 'repetidas', type: 'number', onlyInt: true },
          { name: 'incompletas', type: 'number', onlyInt: true },
          { name: 'erros', type: 'number', onlyInt: true },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_importacoes_chave ON importacoes (chave_lote)'],
      })
      app.save(c)
    }

    if (!app.hasTable('importacao_linhas')) {
      const c = new Collection({
        name: 'importacao_linhas',
        type: 'base',
        listRule: regraAdmin,
        viewRule: regraAdmin,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: null,
        fields: [
          {
            name: 'importacao',
            type: 'relation',
            required: true,
            collectionId: app.findCollectionByNameOrId('importacoes').id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'owner',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'numero', type: 'number', required: true, onlyInt: true },
          { name: 'chave_linha', type: 'text' },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['nova', 'repetida', 'incompleta', 'erro', 'pendente'],
          },
          { name: 'erros', type: 'text' },
          {
            name: 'pessoa',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('pessoas').id,
            maxSelect: 1,
          },
          {
            name: 'empresa',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('empresas').id,
            maxSelect: 1,
          },
          {
            name: 'lead',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('leads').id,
            maxSelect: 1,
          },
          { name: 'resultados_antes', type: 'json' },
          { name: 'resultados_depois', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_importacao_linha ON importacao_linhas (importacao, numero)',
        ],
      })
      app.save(c)
    }

    if (!app.hasTable('lista_membros')) {
      const c = new Collection({
        name: 'lista_membros',
        type: 'base',
        listRule: regraDono,
        viewRule: regraDono,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: null,
        fields: [
          {
            name: 'owner',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          {
            name: 'lista',
            type: 'relation',
            required: true,
            collectionId: app.findCollectionByNameOrId('listas').id,
            maxSelect: 1,
          },
          {
            name: 'lead',
            type: 'relation',
            required: true,
            collectionId: app.findCollectionByNameOrId('leads').id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'origem_importacao',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('importacoes').id,
            maxSelect: 1,
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
        indexes: ['CREATE UNIQUE INDEX idx_lista_membro ON lista_membros (lista, lead, ambiente)'],
      })
      app.save(c)
    }
  },
  (app) => {
    for (const nome of ['lista_membros', 'importacao_linhas', 'importacoes']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {}
    }
  },
)
