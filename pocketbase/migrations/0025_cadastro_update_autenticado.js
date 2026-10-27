// Task "edição de lead direto no detalhe": updateRule autenticado em empresas/pessoas.
// A 0024 já foi aplicada na v0.0.73 só com leitura aberta — migração não re-executa;
// a checagem fina de quem pode editar fica no hook cadastro_editar, que nega 403.
// F2-T01: recuperada do Skip 50182 (fonte executável).
migrate(
  (app) => {
    const regraAutenticado = "@request.auth.id != ''"
    for (const nome of ['empresas', 'pessoas']) {
      const c = app.findCollectionByNameOrId(nome)
      c.updateRule = regraAutenticado
      app.save(c)
    }
  },
  (app) => {
    const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'admin'"
    for (const nome of ['empresas', 'pessoas']) {
      try {
        const c = app.findCollectionByNameOrId(nome)
        c.updateRule = regraAdmin
        app.save(c)
      } catch (_) {}
    }
  },
)
