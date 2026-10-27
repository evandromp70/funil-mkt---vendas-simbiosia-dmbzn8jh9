// SPEC-1-002 (task 1b7f6fc7): fusão reversível — CA-1-002-04.
// Migração ADITIVA: campo fundida_em em pessoas/empresas (marca a origem fundida, sem apagar
// o registro — histórico preservado e reversível).
// F2-T01: recuperada do Skip 50182 (fonte executável).
migrate(
  (app) => {
    const pessoas = app.findCollectionByNameOrId('pessoas')
    if (!pessoas.fields.some((f) => f.name === 'fundida_em')) {
      pessoas.fields.add(
        new RelationField({ name: 'fundida_em', collectionId: pessoas.id, maxSelect: 1 }),
      )
      app.save(pessoas)
    }

    const empresas = app.findCollectionByNameOrId('empresas')
    if (!empresas.fields.some((f) => f.name === 'fundida_em')) {
      empresas.fields.add(
        new RelationField({ name: 'fundida_em', collectionId: empresas.id, maxSelect: 1 }),
      )
      app.save(empresas)
    }
  },
  (app) => {
    for (const nome of ['pessoas', 'empresas']) {
      try {
        const col = app.findCollectionByNameOrId(nome)
        const f = col.fields.find((x) => x.name === 'fundida_em')
        if (f) col.fields.remove(f.id)
        app.save(col)
      } catch (_) {}
    }
  },
)
