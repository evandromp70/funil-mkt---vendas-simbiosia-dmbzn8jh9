// CORREÇÃO da 0044 (28/10/2026): o teto do José não foi aplicado.
//
// POR QUÊ: a migração 0044 procurou o e-mail `jose.aquino@simbiosia.com.br`, mas a conta de
// login do app é `jose@simbiosia.com.br` (o endereço `jose.aquino@` é a caixa postal real, não
// o login). Resultado: Evandro pegou teto 1 (correto) e o José ficou com 0, e o
// `dono_padrao_passagem` ficou VAZIO — toda passagem continuaria "sem responsável".
//
// Aqui a busca é pelo NOME (mais estável que e-mail, que muda entre ambientes) e há verificação
// explícita: se não achar exatamente uma pessoa, NÃO inventa — registra e deixa como está.
migrate(
  (app) => {
    const users = app.findRecordsByFilter('users', '', '', 200, 0, {})

    const acharPorNome = (trecho) => {
      const achados = []
      for (let i = 0; i < users.length; i++) {
        const n = String(users[i].getString('name') || '').toLowerCase()
        if (n.indexOf(trecho) !== -1) achados.push(users[i])
      }
      return achados
    }

    // ---------- teto do José = 5 ----------
    let idJose = ''
    const joses = acharPorNome('josé aquino')
    const joses2 = joses.length > 0 ? joses : acharPorNome('jose aquino')
    if (joses2.length === 1) {
      joses2[0].set('teto_passagens', 5)
      app.save(joses2[0])
      idJose = joses2[0].id
      console.log('0045: teto 5 aplicado em ' + joses2[0].id)
    } else {
      console.log(
        '0045: José não identificado de forma única (' + joses2.length + ') — não alterado',
      )
    }

    // ---------- Evandro = 1 (garante, caso a 0044 não tenha rodado) ----------
    const evandros = acharPorNome('evandro')
    if (evandros.length === 1) {
      evandros[0].set('teto_passagens', 1)
      app.save(evandros[0])
      console.log('0045: teto 1 aplicado em ' + evandros[0].id)
    }

    // ---------- dono padrão = José ----------
    if (idJose) {
      try {
        const cfg = app.findRecordsByFilter('sistema_config', "ambiente = 'teste'", '', 1, 0, {})
        if (cfg.length > 0) {
          cfg[0].set('dono_padrao_passagem', idJose)
          app.save(cfg[0])
          console.log('0045: dono padrão de passagem = ' + idJose)
        }
      } catch (err) {
        console.log('0045: falha ao definir dono padrão: ' + String(err))
      }
    }
  },
  (app) => {
    // reversível: limpa o dono padrão (os tetos individuais são dado de negócio, ficam)
    try {
      const cfg = app.findRecordsByFilter('sistema_config', "ambiente = 'teste'", '', 1, 0, {})
      if (cfg.length > 0) {
        cfg[0].set('dono_padrao_passagem', '')
        app.save(cfg[0])
      }
    } catch (_) {}
  },
)
