// SPEC-1-007 (task 0cda0d05): sync_global_id em pessoas, produtos e pontuacoes (Funil) —
// projeção local idempotente. ADITIVA: só acrescenta campo texto se faltar. Nada legado muda.
migrate(
  (app) => {
    for (const nome of ['pessoas', 'produtos', 'pontuacoes']) {
      const c = app.findCollectionByNameOrId(nome)
      if (!c.fields.some((f) => f.name === 'sync_global_id')) {
        c.fields.add(new TextField({ name: 'sync_global_id' }))
        app.save(c)
      }
    }
  },
  (app) => {
    for (const nome of ['pessoas', 'produtos', 'pontuacoes']) {
      try {
        const c = app.findCollectionByNameOrId(nome)
        const f = c.fields.find((x) => x.name === 'sync_global_id')
        if (f) c.fields.remove(f.id)
        app.save(c)
      } catch (_) {}
    }
  },
)
