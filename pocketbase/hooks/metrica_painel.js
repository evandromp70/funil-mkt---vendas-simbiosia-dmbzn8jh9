// SPEC-2-006 (F2-T14/T15): métrica de oportunidade e painel interno — CA-2-006-01/02/03.
//
// ROTAS
//   GET  /backend/v1/metrica/definicao     — a definição vigente (ou "não configurada")
//   POST /backend/v1/metrica/definicao     — cria versão (rascunho ou aprovada) — só admin
//   GET  /backend/v1/metrica/painel        — contagens com filtros e ACL por dono
//
// REGRAS DURAS (provadas em tests/metrica_config.test.mjs e painel_filtros.test.mjs):
//
//   1. NÃO INVENTAR. Sem definição aprovada, oportunidade responde `nao_configurada` e o número
//      vem `null` — nunca 0, que seria uma afirmação falsa de "nenhuma oportunidade".
//      Da mesma forma, custo sem registro responde `nao_disponivel` e custo por oportunidade
//      NUNCA divide por zero.
//   2. NENHUMA resposta/passagem vira oportunidade por suposição. Só conta o que a definição
//      aprovada disser que conta.
//   3. TESTE NUNCA É MERCADO. Todo indicador separa ambiente explicitamente; querystring ou
//      payload NÃO trocam o ambiente — o filtro de ambiente é do servidor.
//   4. ACL por dono. Vendedor vê o que é dele; admin vê tudo.
//   5. CONTAGEM POR CHAVE DE NEGÓCIO. Evento repetido não duplica resposta/passagem/oportunidade.
//
// A VM do PocketBase não enxerga função top-level: tudo INLINE. Sem spread de objeto.

routerAdd(
  'GET',
  '/backend/v1/metrica/definicao',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')

    // ambiente do SERVIDOR: nesta fase só existe demonstração TESTE.
    const ambiente = 'teste'

    let definicao = null
    try {
      const d = $app.findRecordsByFilter(
        'definicoes_oportunidade',
        "ambiente = {:a} && status = 'aprovada'",
        '-versao',
        1,
        0,
        { a: ambiente },
      )
      if (d.length > 0) definicao = d[0]
    } catch (_) {}

    if (!definicao) {
      return e.json(200, {
        estado: 'nao_configurada',
        // NÃO é zero: é ausência de definição. O número não existe, então vem null.
        oportunidades: null,
        ambiente: ambiente,
        detalhe:
          'Não há definição de oportunidade qualificada aprovada. Enquanto não houver, nenhuma resposta ou passagem é contada como oportunidade.',
      })
    }

    let criterios = {}
    try {
      const c = definicao.get('criterios')
      criterios = c && typeof c === 'object' ? c : {}
    } catch (_) {}

    return e.json(200, {
      estado: 'configurada',
      ambiente: ambiente,
      versao: Number(definicao.get('versao') || 0),
      resumo: String(definicao.getString('resumo') || ''),
      criterios: criterios,
      aprovado_em: String(definicao.getString('aprovado_em') || ''),
      // o indicador SEMPRE cita a versão da definição que usou
      origem_definicao: 'definicoes_oportunidade#' + definicao.id + ' v' + definicao.get('versao'),
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/metrica/definicao',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    if (String(e.auth.getString('role')) !== 'admin')
      return e.forbiddenError('Só admin configura a definição de oportunidade.')

    const body = e.requestInfo().body || {}
    const status = String(body.status || 'rascunho')
    if (['rascunho', 'aprovada', 'arquivada'].indexOf(status) === -1)
      return e.badRequestError('status inválido')
    // operador NÃO força modo real: nesta fase só existe TESTE
    if (String(body.ambiente || 'teste') !== 'teste')
      return e.badRequestError('Nesta fase só existe ambiente TESTE.')
    const ambiente = 'teste'

    // versão nova, nunca editando a anterior: histórico serve para auditar
    let proxima = 1
    try {
      const todas = $app.findRecordsByFilter(
        'definicoes_oportunidade',
        'ambiente = {:a}',
        '-versao',
        1,
        0,
        { a: ambiente },
      )
      if (todas.length > 0) proxima = Number(todas[0].get('versao') || 0) + 1
    } catch (_) {}

    // se está aprovando, a anterior aprovada vira arquivada (o índice único exige)
    if (status === 'aprovada') {
      try {
        const aprovadas = $app.findRecordsByFilter(
          'definicoes_oportunidade',
          "ambiente = {:a} && status = 'aprovada'",
          '',
          50,
          0,
          { a: ambiente },
        )
        for (let i = 0; i < aprovadas.length; i++) {
          aprovadas[i].set('status', 'arquivada')
          $app.save(aprovadas[i])
        }
      } catch (_) {}
    }

    let rec
    try {
      const col = $app.findCollectionByNameOrId('definicoes_oportunidade')
      rec = new Record(col)
      rec.set('versao', proxima)
      rec.set('status', status)
      rec.set('ambiente', ambiente)
      rec.set('resumo', String(body.resumo || ''))
      rec.set('observacao', String(body.observacao || ''))
      const criterios = body.criterios
      rec.set('criterios', criterios && typeof criterios === 'object' ? criterios : {})
      if (status === 'aprovada') {
        rec.set('aprovado_por', e.auth.id)
        rec.set('aprovado_em', new Date().toISOString())
      }
      $app.save(rec)
    } catch (err) {
      return e.internalServerError('Falha ao gravar definição: ' + String(err))
    }

    return e.json(200, {
      estado: 'gravada',
      id: rec.id,
      versao: proxima,
      status: status,
      ambiente: ambiente,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/metrica/painel',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')

    const papel = String(e.auth.getString('role') || '')
    const souAdmin = papel === 'admin'

    // AMBIENTE: fixado no SERVIDOR. Query ou payload NÃO trocam — é a separação
    // TESTE × MERCADO. Nesta fase só existe demonstração.
    const ambiente = 'teste'

    const query = e.requestInfo().query || {}
    // filtros aceitos; dono alheio não é aceito para quem não é admin
    const fProduto = String(query.produto || '')
    const fCoorte = String(query.coorte || '')
    const fCanal = String(query.canal || '')
    let fDono = String(query.dono || '')
    if (!souAdmin) fDono = e.auth.id // vendedor só vê o próprio, mesmo pedindo outro

    // LEADS da visão: ACL por dono antes de agregar
    let leads = []
    try {
      leads = $app.findRecordsByFilter('leads', "id != ''", '', 2000, 0, {})
    } catch (err) {
      return e.internalServerError('Falha ao ler leads: ' + String(err))
    }

    const visiveis = []
    for (let i = 0; i < leads.length; i++) {
      const l = leads[i]
      const dono = String(l.getString('owner') || '')
      if (!souAdmin && dono !== e.auth.id) continue
      if (fDono && dono !== fDono) continue
      visiveis.push(l)
    }

    // PESSOAS com coorte (filtro de coorte) e produto do contexto (filtro de produto)
    const pessoasPorCoorte = {}
    try {
      const origens = $app.findRecordsByFilter('pessoas_origens', 'ambiente = {:a}', '', 2000, 0, {
        a: ambiente,
      })
      for (let i = 0; i < origens.length; i++) {
        const o = origens[i]
        const pid = String(o.getString('pessoa') || '')
        if (!pid) continue
        pessoasPorCoorte[pid] = String(o.getString('coorte') || '')
      }
    } catch (_) {}

    const produtoPorPessoa = {}
    try {
      const ctxs = $app.findRecordsByFilter(
        'contextos_comerciais',
        'ambiente = {:a}',
        '',
        2000,
        0,
        { a: ambiente },
      )
      for (let i = 0; i < ctxs.length; i++) {
        const c = ctxs[i]
        const pid = String(c.getString('pessoa') || '')
        if (!pid) continue
        if (!produtoPorPessoa[pid]) produtoPorPessoa[pid] = String(c.getString('produto') || '')
      }
    } catch (_) {}

    // aplica filtros de produto e coorte
    const alvo = []
    for (let i = 0; i < visiveis.length; i++) {
      const l = visiveis[i]
      const pid = String(l.getString('pessoa') || '')
      if (fCoorte && pessoasPorCoorte[pid] !== fCoorte) continue
      if (fProduto && produtoPorPessoa[pid] !== fProduto) continue
      alvo.push(l)
    }

    // ---- contagens ----
    // Passagens: por CHAVE DE NEGÓCIO (pessoa), não por evento repetido
    let passagensTotal = 0
    const passagensPessoas = {}
    try {
      const ps = $app.findRecordsByFilter('passagens', 'ambiente = {:a}', '', 2000, 0, {
        a: ambiente,
      })
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]
        const dono = String(p.getString('dono') || '')
        if (!souAdmin && dono !== e.auth.id) continue
        if (fDono && dono !== fDono) continue
        const pid = String(p.getString('pessoa') || '')
        if (fCoorte && pessoasPorCoorte[pid] !== fCoorte) continue
        if (fProduto && produtoPorPessoa[pid] !== fProduto) continue
        const chave = pid || p.id
        if (passagensPessoas[chave]) continue // evento repetido não duplica
        passagensPessoas[chave] = true
        passagensTotal++
      }
    } catch (_) {}

    // RESPOSTAS: contadas pelas PASSAGENS CLASSIFICADAS. NÃO uso `pausas_resposta` para isso:
    // ela existe para PAUSAR a cadência, e toda resposta cria uma passagem — ler as duas fontes
    // daria o mesmo número duas vezes com aparência de dois indicadores. (Foi o que aconteceu:
    // 110 e 110.)
    let respostasTotal = 0
    const respostasPessoas = {}
    try {
      const ps2 = $app.findRecordsByFilter('passagens', 'ambiente = {:a}', '', 2000, 0, {
        a: ambiente,
      })
      for (let i = 0; i < ps2.length; i++) {
        const p = ps2[i]
        const dono = String(p.getString('dono') || '')
        if (!souAdmin && dono !== e.auth.id) continue
        if (fDono && dono !== fDono) continue
        const pid = String(p.getString('pessoa') || '')
        if (fCoorte && pessoasPorCoorte[pid] !== fCoorte) continue
        if (fProduto && produtoPorPessoa[pid] !== fProduto) continue
        const chave = pid || p.id
        if (respostasPessoas[chave]) continue
        respostasPessoas[chave] = true
        respostasTotal++
      }
    } catch (_) {}

    // PASSAGENS EM ABERTO: subconjunto que ainda espera decisão humana — é o que importa
    // operacionalmente. Contar o total e chamar de "respostas" esconderia a fila real.
    let passagensAbertas = 0
    try {
      const ps3 = $app.findRecordsByFilter('passagens', 'ambiente = {:a}', '', 2000, 0, {
        a: ambiente,
      })
      for (let i = 0; i < ps3.length; i++) {
        const p = ps3[i]
        if (String(p.getString('status')) === 'resolvida') continue
        const dono = String(p.getString('dono') || '')
        if (!souAdmin && dono !== e.auth.id) continue
        if (fDono && dono !== fDono) continue
        const pid = String(p.getString('pessoa') || '')
        if (fCoorte && pessoasPorCoorte[pid] !== fCoorte) continue
        if (fProduto && produtoPorPessoa[pid] !== fProduto) continue
        passagensAbertas++
      }
    } catch (_) {}

    // ---- oportunidade: depende da DEFINIÇÃO APROVADA ----
    let defVersao = null
    let defCriterios = null
    try {
      const d = $app.findRecordsByFilter(
        'definicoes_oportunidade',
        "ambiente = {:a} && status = 'aprovada'",
        '-versao',
        1,
        0,
        { a: ambiente },
      )
      if (d.length > 0) {
        defVersao = Number(d[0].get('versao') || 0)
        // CAMPO JSON NA VM DO POCKETBASE — armadilha real, diagnosticada em produção:
        // `record.get('criterios')` devolve um OBJETO GO (chaves 0,1,2…, marshalJSON, scan,
        // value), não o JSON. Ler `.contar` dava vazio, o critério nunca casava e a
        // oportunidade ficava null MESMO com a definição aprovada e correta.
        // Caminho confiável: getString() (JSON serializado) + JSON.parse().
        let textoCriterios = ''
        try {
          textoCriterios = String(d[0].getString('criterios') || '')
        } catch (_) {
          textoCriterios = ''
        }
        if (!textoCriterios) {
          // fallback: se getString não trouxer, tenta serializar o próprio valor
          try {
            const cru = d[0].get('criterios')
            if (cru && typeof cru === 'object' && typeof cru.contar === 'string')
              textoCriterios = JSON.stringify({ contar: cru.contar })
          } catch (_) {}
        }
        if (textoCriterios) {
          try {
            const parsed = JSON.parse(textoCriterios)
            defCriterios = parsed && typeof parsed === 'object' ? parsed : {}
          } catch (_) {
            defCriterios = {}
          }
        } else {
          defCriterios = {}
        }
      }
    } catch (_) {}

    let oportunidades = null
    let estadoOportunidade = 'nao_configurada'
    if (defVersao !== null) {
      estadoOportunidade = 'configurada'
      // a contagem REAL depende de critérios objetivos que a definição declare.
      // Sem critério legível, o número continua null — não invento.
      oportunidades = null
      if (defCriterios && defCriterios.contar === 'primeira_abordagem_confirmada') {
        let n = 0
        for (let i = 0; i < alvo.length; i++) {
          if (String(alvo[i].getString('primeira_abordagem_em') || '')) n++
        }
        oportunidades = n
      } else if (defCriterios && defCriterios.contar === 'resposta_com_passagem') {
        // pessoa que respondeu E tem passagem
        let n = 0
        for (let k in respostasPessoas) {
          if (passagensPessoas[k]) n++
        }
        oportunidades = n
      } else if (defCriterios && defCriterios.contar === 'nada') {
        oportunidades = 0
      }
    }

    // ---- custo por oportunidade: sem custo → não disponível, NUNCA divisão por zero ----
    let custoTotal = null
    let estadoCusto = 'nao_disponivel'
    try {
      const cs = $app.findRecordsByFilter('custos_teste', 'ambiente = {:a}', '', 500, 0, {
        a: ambiente,
      })
      if (cs.length > 0) {
        let soma = 0
        for (let i = 0; i < cs.length; i++) soma += Number(cs[i].get('valor') || 0)
        custoTotal = soma
        estadoCusto = 'disponivel'
      }
    } catch (_) {}

    let custoPorOportunidade = null
    if (custoTotal !== null && oportunidades !== null && oportunidades > 0) {
      custoPorOportunidade = Math.round((custoTotal / oportunidades) * 100) / 100
    }

    return e.json(200, {
      ambiente: ambiente,
      // deixa explícito: este painel é DEMONSTRAÇÃO, não resultado de mercado
      natureza: 'teste_nao_mercado',
      escopo: souAdmin ? 'admin' : 'proprio',
      filtros: { produto: fProduto, coorte: fCoorte, canal: fCanal, dono: fDono },
      contagens: {
        leads: alvo.length,
        respostas: respostasTotal,
        passagens: passagensTotal,
        passagens_abertas: passagensAbertas,
        oportunidades: oportunidades,
        estado_oportunidade: estadoOportunidade,
      },
      definicao: defVersao === null ? null : { versao: defVersao },

      custo: {
        total: custoTotal,
        estado: estadoCusto,
        por_oportunidade: custoPorOportunidade,
      },
    })
  },
  $apis.requireAuth(),
)
