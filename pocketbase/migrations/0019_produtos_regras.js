// SPEC-1-004 (task 7183cf59, correção): alinhar as regras da coleção produtos JÁ criada.
// A 0018 só criava a coleção se ela não existisse — o deleteRule novo nunca foi aplicado.
// F2-T01: recuperada do Skip 50182 (fonte executável).
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId('produtos')
    c.listRule = "@request.auth.id != ''"
    c.viewRule = "@request.auth.id != ''"
    c.createRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    c.updateRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    c.deleteRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
    app.save(c)
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId('produtos')
      c.deleteRule = null
      app.save(c)
    } catch (_) {}
  },
)
