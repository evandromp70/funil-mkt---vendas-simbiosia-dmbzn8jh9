// SPEC-1-007 (task 199009b0): campo sync_global_id em empresas (Funil) — projeção idempotente.
migrate(
  (app) => {
    const empresas = app.findCollectionByNameOrId('empresas')
    if (!empresas.fields.some((f) => f.name === 'sync_global_id')) {
      empresas.fields.add(new TextField({ name: 'sync_global_id' }))
      app.save(empresas)
    }
  },
  (app) => {
    try {
      const empresas = app.findCollectionByNameOrId('empresas')
      const f = empresas.fields.find((x) => x.name === 'sync_global_id')
      if (f) empresas.fields.remove(f.id)
      app.save(empresas)
    } catch (_) {}
  },
)
