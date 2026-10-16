// Task "edição de lead direto no detalhe" (decisões do José, 16/10/2026): admin edita
// tudo; vendedor edita lead próprio e empresa/pessoa usadas EXCLUSIVAMENTE por leads
// dele (hook cadastro_editar nega o resto). Empresas/pessoas: leitura aberta p/
// autenticados (o editor precisa ver); updateRule autenticado (a checagem fina é do
// hook — empresas/pessoas não têm campo owner; o vínculo é via leads). Migração SEMPRE
// aplica (coleções podem já existir da 0012).
migrate(
  (app) => {
    const regraAutenticado = "@request.auth.id != ''"
    for (const nome of ['empresas', 'pessoas']) {
      const c = app.findCollectionByNameOrId(nome)
      c.listRule = regraAutenticado
      c.viewRule = regraAutenticado
      c.updateRule = regraAutenticado
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
        c.updateRule = regraAdmin
        app.save(c)
      } catch (_) {}
    }
  },
)
