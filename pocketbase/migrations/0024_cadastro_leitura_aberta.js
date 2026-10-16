// Task "edição de lead direto no detalhe" (decisões do José, 16/10/2026): admin edita
// tudo; vendedor edita lead próprio e empresa/pessoa usadas EXCLUSIVAMENTE por leads
// dele. Empresas/pessoas: leitura aberta para autenticados (o editor precisa ver os
// dados); escrita continua fechada pela regra + hook (empresa compartilhada → negado).
// Migração SEMPRE aplica (coleções podem já existir da 0012).
migrate(
  (app) => {
    const regraAutenticado = "@request.auth.id != ''"
    for (const nome of ['empresas', 'pessoas']) {
      const c = app.findCollectionByNameOrId(nome)
      c.listRule = regraAutenticado
      c.viewRule = regraAutenticado
      app.save(c)
    }
  },
  (app) => {
    const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'admin'"
    for (const nome of ['empresas', 'pessoas']) {
      try {
        const c = app.findCollectionByNameOrId(nome)
        c.listRule = regraAdmin
        c.viewRule = regraAdmin
        app.save(c)
      } catch (_) {}
    }
  },
)
