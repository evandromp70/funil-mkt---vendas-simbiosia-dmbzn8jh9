// SPEC-2-004 (F2-T11): suporte à fila dos sócios — CA-2-004-03/04.
//
// 1. `sistema_config.teto_passagens_por_dono` — teto CONFIGURÁVEL (a spec exige configurável;
//    o valor real é decisão de negócio do José, então o default aqui é explicitamente de teste).
// 2. `passagens`: abre list/view para usuário autenticado. A ACL FINA (quem vê o quê) é feita na
//    rota `/backend/v1/passagens/fila`, que decide por dono. Sem isso a tela não consegue listar
//    nada (era 403) e a F2-T11 não teria interface.
//    NÃO abre create/update/delete: escrever em passagem só pelas rotas, que auditam.
migrate(
  (app) => {
    // ---------- 1. teto configurável ----------
    const cfg = app.findCollectionByNameOrId('sistema_config')
    if (!cfg.fields.some((f) => f.name === 'teto_passagens_por_dono')) {
      cfg.fields.add(new NumberField({ name: 'teto_passagens_por_dono', required: false, min: 1 }))
      app.save(cfg)
    }
    // default de TESTE, explícito: 3 por dono. O número real é decisão do José.
    try {
      const atuais = app.findRecordsByFilter('sistema_config', "ambiente = 'teste'", '', 1, 0, {})
      if (atuais.length > 0 && !Number(atuais[0].get('teto_passagens_por_dono') || 0)) {
        atuais[0].set('teto_passagens_por_dono', 3)
        app.save(atuais[0])
      }
    } catch (_) {}

    // ---------- 2. leitura de passagens para a fila ----------
    const pass = app.findCollectionByNameOrId('passagens')
    // autenticado lê; a rota é que filtra por dono
    pass.listRule = '@request.auth.id != ""'
    pass.viewRule = '@request.auth.id != ""'
    // escrita só pelas rotas (create/update/delete seguem fechados)
    app.save(pass)
  },
  (app) => {
    try {
      const pass = app.findCollectionByNameOrId('passagens')
      pass.listRule = null
      pass.viewRule = null
      app.save(pass)
    } catch (_) {}
    try {
      const cfg = app.findCollectionByNameOrId('sistema_config')
      const f = cfg.fields.find((x) => x.name === 'teto_passagens_por_dono')
      if (f) cfg.fields.remove(f.id)
      app.save(cfg)
    } catch (_) {}
  },
)
