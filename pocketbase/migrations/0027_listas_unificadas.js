// SPEC-1-006 (task 2e26d650): listas unificadas — CA-1-006-01.
// Migração ADITIVA: expande listas (coorte, produto_alvo, filtros, fonte, status, ambiente)
// e libera delete de lista_membros para admin (desvincular não apaga lead/histórico).
migrate(
  (app) => {
    const listas = app.findCollectionByNameOrId('listas')
    const tem = (nome) => listas.fields.some((f) => f.name === nome)
    if (!tem('coorte')) {
      listas.fields.add(
        new SelectField({
          name: 'coorte',
          maxSelect: 1,
          values: ['rede_jose', 'rede_evandro', 'clientes_atendidos', 'inbound', 'fria'],
        }),
      )
    }
    if (!tem('produto_alvo')) {
      listas.fields.add(
        new RelationField({
          name: 'produto_alvo',
          collectionId: app.findCollectionByNameOrId('produtos').id,
          maxSelect: 1,
        }),
      )
    }
    if (!tem('filtros')) {
      listas.fields.add(new JSONField({ name: 'filtros' }))
    }
    if (!tem('fonte')) {
      listas.fields.add(
        new SelectField({
          name: 'fonte',
          maxSelect: 1,
          values: ['rfb', 'planilha', 'api', 'misto', 'legado'],
        }),
      )
    }
    if (!tem('status')) {
      listas.fields.add(
        new SelectField({
          name: 'status',
          maxSelect: 1,
          values: ['rascunho', 'em_preparacao', 'pronta'],
        }),
      )
    }
    if (!tem('ambiente')) {
      listas.fields.add(
        new SelectField({
          name: 'ambiente',
          maxSelect: 1,
          values: ['teste', 'producao'],
        }),
      )
    }
    app.save(listas)

    const antigas = app.findRecordsByFilter('listas', 'fonte = "" || ambiente = ""', '', 0, 0)
    for (const l of antigas) {
      if (!l.getString('fonte')) l.set('fonte', 'legado')
      if (!l.getString('ambiente')) l.set('ambiente', 'producao')
      if (!l.getString('status')) l.set('status', 'rascunho')
      app.save(l)
    }

    const membros = app.findCollectionByNameOrId('lista_membros')
    membros.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(membros)
  },
  (app) => {
    try {
      const membros = app.findCollectionByNameOrId('lista_membros')
      membros.deleteRule = null
      app.save(membros)
    } catch (_) {}
    try {
      const listas = app.findCollectionByNameOrId('listas')
      for (const nome of ['coorte', 'produto_alvo', 'filtros', 'fonte', 'status', 'ambiente']) {
        const f = listas.fields.find((x) => x.name === nome)
        if (f) listas.fields.remove(f.id)
      }
      app.save(listas)
    } catch (_) {}
  },
)
