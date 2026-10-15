// SPEC-1-005 (task 77a1aa6e): proteger o cálculo e preservar o histórico — CA-1-005-03/05.
// pontuacoes vira APPEND-ONLY para a API: createRule/updateRule = null (só hooks internos
// com $app.save escrevem — regras de API não se aplicam a hooks); list/view = dono ou
// admin. Score legado do lead e qualificações manuais não são tocados. Migração SEMPRE
// aplica (coleção pode já existir da 0022).
migrate(
  (app) => {
    const regraDono =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || owner = @request.auth.id)"
    const c = app.findCollectionByNameOrId('pontuacoes')
    c.createRule = null
    c.updateRule = null
    c.deleteRule = null
    c.listRule = regraDono
    c.viewRule = regraDono
    app.save(c)
  },
  (app) => {
    try {
      const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'admin'"
      const regraDono =
        "@request.auth.id != '' && (@request.auth.role = 'admin' || owner = @request.auth.id)"
      const c = app.findCollectionByNameOrId('pontuacoes')
      c.createRule = regraAdmin
      c.updateRule = regraAdmin
      c.deleteRule = null
      c.listRule = regraDono
      c.viewRule = regraDono
      app.save(c)
    } catch (_) {}
  },
)
