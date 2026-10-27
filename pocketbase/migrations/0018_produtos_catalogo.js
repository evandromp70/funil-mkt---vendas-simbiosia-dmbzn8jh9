// SPEC-1-004 (task 7183cf59): catálogo de produtos FAROL — CA-1-004-01.
// Migração ADITIVA: coleção produtos. Leitura para autenticados, escrita só admin.
// Produto novo nasce inativo até régua aprovada.
// F2-T01: recuperada do Skip 50182 (fonte executável).
migrate(
  (app) => {
    const regraLeitura = "@request.auth.id != ''"
    const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'admin'"

    if (!app.hasTable('produtos')) {
      const c = new Collection({
        name: 'produtos',
        type: 'base',
        listRule: regraLeitura,
        viewRule: regraLeitura,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: regraAdmin,
        fields: [
          { name: 'nome', type: 'text', required: true },
          {
            name: 'degrau',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['free', 'essencial', 'mapa', 'executivo', 'empresa'],
          },
          { name: 'area', type: 'text' },
          { name: 'dor', type: 'text' },
          { name: 'descricao', type: 'text' },
          {
            name: 'tipo_atendimento',
            type: 'select',
            maxSelect: 1,
            values: ['baixo_valor', 'consultivo'],
          },
          { name: 'preco', type: 'number', min: 0 },
          { name: 'faixa_preco', type: 'text' },
          { name: 'icp', type: 'json' },
          { name: 'playbook', type: 'text' },
          { name: 'tom', type: 'text' },
          { name: 'ativo', type: 'bool' },
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
        indexes: ['CREATE UNIQUE INDEX idx_produtos_nome ON produtos (nome, ambiente)'],
      })
      app.save(c)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('produtos'))
    } catch (_) {}
  },
)
