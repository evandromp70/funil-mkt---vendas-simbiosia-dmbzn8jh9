// SPEC-2-005 (F2-T12): suporte ao retorno comercial — CA-2-005-01.
//
// 1. `sistema_config.comercial_revisao_seq` — contador de revisão comercial, incrementado a cada
//    fato novo. Fica em config para ser auditável e sobreviver ao reprocessamento.
//
// 2. `leads.primeira_abordagem_em` já existe (migração 0022). Nada a criar aqui.
//
// 3. `comercial_exportacoes` — registro do que foi exportado, para provar que a aplicação na
//    Fábrica é única e rastreável (duplicata não substitui fato válido). Guarda o hash do
//    documento exportado e quantas vezes aquele conteúdo foi emitido.
migrate(
  (app) => {
    // ---------- 1. contador de revisão ----------
    const cfg = app.findCollectionByNameOrId('sistema_config')
    if (!cfg.fields.some((f) => f.name === 'comercial_revisao_seq')) {
      cfg.fields.add(new NumberField({ name: 'comercial_revisao_seq', required: false, min: 0 }))
      app.save(cfg)
    }

    // ---------- 2. log de exportação ----------
    if (!app.hasTable('comercial_exportacoes')) {
      const c = new Collection({
        name: 'comercial_exportacoes',
        type: 'base',
        listRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        viewRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'documento_hash', type: 'text', required: true },
          { name: 'total_eventos', type: 'number', onlyInt: true },
          { name: 'pessoa_filtro', type: 'text' },
          { name: 'aplicado_em', type: 'date' },
          { name: 'aplicado_por', type: 'text' },
          { name: 'observacao', type: 'text' },
          {
            name: 'owner',
            type: 'relation',
            maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('users').id,
          },
          { name: 'ambiente', type: 'select', required: true, maxSelect: 1, values: ['teste'] },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_exportacao_hash ON comercial_exportacoes (documento_hash, ambiente)',
        ],
      })
      app.save(c)
    }
  },
  (app) => {
    try {
      if (app.hasTable('comercial_exportacoes'))
        app.delete(app.findCollectionByNameOrId('comercial_exportacoes'))
    } catch (_) {}
    try {
      const cfg = app.findCollectionByNameOrId('sistema_config')
      const f = cfg.fields.find((x) => x.name === 'comercial_revisao_seq')
      if (f) cfg.fields.remove(f.id)
      app.save(cfg)
    } catch (_) {}
  },
)
