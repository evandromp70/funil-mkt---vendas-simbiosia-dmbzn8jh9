// Decisão do José (28/10/2026): teto POR PESSOA e responsável padrão.
//
// 1. `users.teto_passagens` — teto individual. José = 5, Evandro = 1 (transbordo do processo).
//    Antes o teto era um número único em sistema_config, o que não permitia diferenciar
//    responsáveis com papéis diferentes no processo.
// 2. `sistema_config.dono_padrao_passagem` — quem recebe a passagem por padrão. José agora;
//    quando houver mapeamento por produto/coorte, esta decisão muda de lugar.
// 3. `sistema_config.teto_passagens_por_dono` continua como PADRÃO para quem não tem teto
//    próprio — nenhuma pessoa fica sem limite por falta de configuração.
//
// Regra dura preservada: se não houver dono_padrao configurado, a passagem nasce
// `dono_pendente` (revisão administrativa). NUNCA chuta sócio por fallback.
migrate(
  (app) => {
    // ---------- 1. teto individual ----------
    const users = app.findCollectionByNameOrId('users')
    if (!users.fields.some((f) => f.name === 'teto_passagens')) {
      users.fields.add(new NumberField({ name: 'teto_passagens', required: false, min: 0 }))
      app.save(users)
    }

    // ---------- 2. responsável padrão ----------
    const cfg = app.findCollectionByNameOrId('sistema_config')
    if (!cfg.fields.some((f) => f.name === 'dono_padrao_passagem')) {
      cfg.fields.add(new TextField({ name: 'dono_padrao_passagem' }))
      app.save(cfg)
    }

    // ---------- 3. aplica os valores decididos ----------
    // tetos individuais
    try {
      const todos = app.findRecordsByFilter('users', '', '', 200, 0, {})
      for (let i = 0; i < todos.length; i++) {
        const u = todos[i]
        const email = String(u.getString('email') || '').toLowerCase()
        if (email === 'jose.aquino@simbiosia.com.br') u.set('teto_passagens', 5)
        else if (email === 'evandro@simbiosia.com.br') u.set('teto_passagens', 1)
        // demais: sem teto próprio → usa o padrão
        if (email === 'jose.aquino@simbiosia.com.br' || email === 'evandro@simbiosia.com.br')
          app.save(u)
      }
    } catch (err) {
      console.log('0044: falha ao aplicar tetos: ' + String(err))
    }

    // dono padrão = José
    try {
      const atuais = app.findRecordsByFilter('sistema_config', "ambiente = 'teste'", '', 1, 0, {})
      if (atuais.length > 0) {
        let idJose = ''
        const users = app.findRecordsByFilter('users', '', '', 200, 0, {})
        for (let i = 0; i < users.length; i++) {
          if (
            String(users[i].getString('email') || '').toLowerCase() ===
            'jose.aquino@simbiosia.com.br'
          ) {
            idJose = users[i].id
            break
          }
        }
        if (idJose) {
          atuais[0].set('dono_padrao_passagem', idJose)
          app.save(atuais[0])
        }
      }
    } catch (err) {
      console.log('0044: falha ao definir dono padrão: ' + String(err))
    }
  },
  (app) => {
    try {
      const users = app.findCollectionByNameOrId('users')
      const ft = users.fields.find((x) => x.name === 'teto_passagens')
      if (ft) users.fields.remove(ft.id)
      app.save(users)
    } catch (_) {}
    try {
      const cfg = app.findCollectionByNameOrId('sistema_config')
      const fd = cfg.fields.find((x) => x.name === 'dono_padrao_passagem')
      if (fd) cfg.fields.remove(fd.id)
      app.save(cfg)
    } catch (_) {}
  },
)
