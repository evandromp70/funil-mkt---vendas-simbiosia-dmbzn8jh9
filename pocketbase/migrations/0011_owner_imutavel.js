// SPEC-1-001 (task d3e7d6da): ajuste da regra de owner imutável em leads.
// A sintaxe `@request.body.owner = owner` não bloqueia a troca (compara valor ENVIADO com o
// atual depois de aplicado). A forma suportada pelo PocketBase para "campo não mudou" é
// `@request.body.owner:changed = false`. Migração ADITIVA: só ajusta a updateRule de leads.
// F2-T01: recuperada do Skip 50182 (fonte executável).
migrate(
  (app) => {
    const leads = app.findCollectionByNameOrId('leads')
    leads.updateRule =
      '@request.auth.id != "" && (@request.auth.role = "admin" || ' +
      '(owner = @request.auth.id && @request.body.owner:changed = false))'
    app.save(leads)
  },
  (app) => {
    const leads = app.findCollectionByNameOrId('leads')
    leads.updateRule =
      '@request.auth.id != "" && (@request.auth.role = "admin" || ' +
      '(owner = @request.auth.id && @request.body.owner = owner))'
    app.save(leads)
  },
)
