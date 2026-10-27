// SPEC-1-002 (task 3b736d7d): fila de conflitos de identidade — CA-1-002-02.
// Migração ADITIVA: cria conflitos_cadastro (revisão do admin; nunca funde por conta própria).
// F2-T01: recuperada do Skip 50182 (fonte executável).
migrate(
  (app) => {
    if (!app.hasTable('conflitos_cadastro')) {
      const c = new Collection({
        name: 'conflitos_cadastro',
        type: 'base',
        listRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        viewRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: null,
        fields: [
          {
            name: 'entidade',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['pessoas', 'empresas'],
          },
          {
            name: 'identificador_tipo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['email', 'telefone', 'linkedin'],
          },
          { name: 'identificador_norm', type: 'text', required: true },
          { name: 'ids_envolvidos', type: 'json' },
          { name: 'detalhe', type: 'text' },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['pendente', 'distintos', 'fundidos'],
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
        indexes: ['CREATE INDEX idx_conflitos_ident ON conflitos_cadastro (identificador_norm)'],
      })
      app.save(c)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('conflitos_cadastro'))
    } catch (_) {}
  },
)
