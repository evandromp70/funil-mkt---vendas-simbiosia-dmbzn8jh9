// SPEC-1-002 (task f5668cd8): índices de integridade das origens e bloqueios — CA-1-002-03.
// Migração ADITIVA: evita duplicata de origem (mesma pessoa+coorte+fonte) e de bloqueio
// (mesma pessoa+motivo+alcance).
// F2-T01: recuperada do Skip 50182 (fonte executável).
migrate(
  (app) => {
    const origens = app.findCollectionByNameOrId('pessoas_origens')
    if (!origens.indexes.some((i) => i.includes('idx_origens_unicas'))) {
      origens.indexes.push(
        'CREATE UNIQUE INDEX idx_origens_unicas ON pessoas_origens (pessoa, coorte, fonte) WHERE fonte != ""',
      )
      app.save(origens)
    }

    const bloqueios = app.findCollectionByNameOrId('bloqueios_contato')
    if (!bloqueios.indexes.some((i) => i.includes('idx_bloqueios_unicos'))) {
      bloqueios.indexes.push(
        'CREATE UNIQUE INDEX idx_bloqueios_unicos ON bloqueios_contato (pessoa, motivo, alcance) WHERE pessoa != ""',
      )
      app.save(bloqueios)
    }
  },
  (app) => {
    try {
      const origens = app.findCollectionByNameOrId('pessoas_origens')
      origens.indexes = origens.indexes.filter((i) => !i.includes('idx_origens_unicas'))
      app.save(origens)
    } catch (_) {}
    try {
      const bloqueios = app.findCollectionByNameOrId('bloqueios_contato')
      bloqueios.indexes = bloqueios.indexes.filter((i) => !i.includes('idx_bloqueios_unicos'))
      app.save(bloqueios)
    } catch (_) {}
  },
)
