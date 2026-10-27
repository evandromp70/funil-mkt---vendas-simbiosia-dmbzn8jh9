// SPEC-1-004 (task b0c25923): régua de produto versionada — CA-1-004-02/04.
// Migração ADITIVA: regras_produto (uma versão por linha). RLS admin.
// Versão aprovada é imutável (imposto pelo hook).
// F2-T01: recuperada do Skip 50182 (fonte executável).
migrate(
  (app) => {
    const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'admin'"

    if (!app.hasTable('regras_produto')) {
      const c = new Collection({
        name: 'regras_produto',
        type: 'base',
        listRule: regraAdmin,
        viewRule: regraAdmin,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: regraAdmin,
        fields: [
          {
            name: 'produto',
            type: 'relation',
            required: true,
            collectionId: app.findCollectionByNameOrId('produtos').id,
            maxSelect: 1,
          },
          {
            name: 'owner',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'versao', type: 'number', required: true, onlyInt: true },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['rascunho', 'aprovada', 'arquivada'],
          },
          {
            name: 'metodo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['ponderado', 'pontos'],
          },
          { name: 'criterios', type: 'json' },
          { name: 'regras_eliminatorias', type: 'json' },
          { name: 'faixas', type: 'json' },
          { name: 'hash', type: 'text' },
          { name: 'aprovado_por', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
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
          'CREATE UNIQUE INDEX idx_regras_produto_versao ON regras_produto (produto, versao, ambiente)',
        ],
      })
      app.save(c)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('regras_produto'))
    } catch (_) {}
  },
)
