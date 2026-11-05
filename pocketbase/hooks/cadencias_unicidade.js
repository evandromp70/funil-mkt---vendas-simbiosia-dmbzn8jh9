// SPEC-2-002 (F2-T04): uma cadência ativa por pessoa — CA-2-002-02.
//
// POST /backend/v1/cadencias/ativar
//   { pessoaId, produtoId, contextoId?, motivo }
// POST /backend/v1/cadencias/concluir
//   { cadenciaId, motivo, para?: 'concluida'|'cancelada' }
// GET  /backend/v1/cadencias/identidade?pessoaId=X
//
// IDENTIDADE EFETIVA:
//   - base: pessoas.sync_global_id, ou o id local quando ausente
//   - um alias ATIVO em aliases_identidade liga origem_global → destino_global (mesma pessoa).
//     Alias REVOGADO não liga.
//   A raiz do conjunto é a identidade efetiva; dois registros que resolvem para a mesma raiz
//   são a MESMA pessoa para efeito de cadência.
//
// UNICIDADE: a garantia dura é o índice único parcial idx_cadencia_uma_ativa (WHERE estado='ativa').
// A checagem prévia existe só para dar resposta boa; se duas requisições passarem juntas, o banco
// recusa a segunda e o hook converte o erro de constraint em 'duplicada'.
//
// SEM REGRA DE PRIORIDADE → PENDENTE. Não escolho produto por conta própria.
routerAdd(
  'POST',
  '/backend/v1/cadencias/ativar',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')

    const body = e.requestInfo().body || {}
    const pessoaId = String(body.pessoaId || '').trim()
    const produtoId = String(body.produtoId || '').trim()
    const motivo = String(body.motivo || '').trim()
    if (!pessoaId) return e.badRequestError('pessoaId é obrigatório')
    if (!produtoId) return e.badRequestError('produtoId é obrigatório')
    if (!motivo) return e.badRequestError('motivo é obrigatório')

    let pessoa
    try {
      pessoa = $app.findRecordById('pessoas', pessoaId)
    } catch (_) {
      return e.notFoundError('Pessoa não encontrada')
    }
    let produto
    try {
      produto = $app.findRecordById('produtos', produtoId)
    } catch (_) {
      return e.notFoundError('Produto não encontrado')
    }

    // ---------- 1. identidade efetiva ----------
    const idBase = (p) => {
      const g = p.getString('sync_global_id')
      return g && String(g).trim() ? String(g).trim() : p.id
    }

    // alias ATIVO: origem_global e destino_global são a MESMA pessoa.
    // Grafo NÃO direcionado; raiz canônica = MENOR id do componente conectado.
    // Precisa ser simétrico: mapa de dois sentidos com "seguir ponteiro" cria ciclo e cada
    // pessoa voltaria para si mesma (bug pego pelo teste ALIAS ATIVO). Componente resolve.
    const vizinhos = {}
    try {
      const aliases = $app.findRecordsByFilter(
        'aliases_identidade',
        "status = 'ativo'",
        '',
        500,
        0,
        {},
      )
      for (let i = 0; i < aliases.length; i++) {
        const o = String(aliases[i].getString('origem_global') || '').trim()
        const d = String(aliases[i].getString('destino_global') || '').trim()
        if (!o || !d || o === d) continue
        if (!vizinhos[o]) vizinhos[o] = []
        if (!vizinhos[d]) vizinhos[d] = []
        if (vizinhos[o].indexOf(d) === -1) vizinhos[o].push(d)
        if (vizinhos[d].indexOf(o) === -1) vizinhos[d].push(o)
      }
    } catch (_) {}

    const raiz = (id) => {
      const visto = {}
      const fila = [id]
      visto[id] = true
      let menor = id
      while (fila.length > 0) {
        const atual = fila.shift()
        if (String(atual) < String(menor)) menor = atual
        const vs = vizinhos[atual] || []
        for (let i = 0; i < vs.length; i++) {
          if (!visto[vs[i]]) {
            visto[vs[i]] = true
            fila.push(vs[i])
          }
        }
      }
      return menor
    }

    const identidade = raiz(idBase(pessoa))

    // contexto comercial (opcional): liga a pessoa ao produto, se existir
    let contextoId = String(body.contextoId || '').trim()
    if (!contextoId) {
      try {
        const cs = $app.findRecordsByFilter(
          'contextos_comerciais',
          'pessoa = {:p} && produto = {:pr}',
          '',
          1,
          0,
          { p: pessoaId, pr: produtoId },
        )
        if (cs.length > 0) contextoId = cs[0].id
      } catch (_) {}
    }

    // ---------- 2. cadência ativa existente para a identidade ----------
    let ativas = []
    try {
      ativas = $app.findRecordsByFilter('cadencias_ativas', "estado = 'ativa'", '', 500, 0, {})
    } catch (_) {}

    const ativaDaIdentidade = ativas.filter((a) => {
      const ident = String(a.getString('identidade_efetiva') || '')
      if (ident === identidade) return true
      const pid = String(a.getString('pessoa') || '')
      if (!pid) return false
      try {
        const p = $app.findRecordById('pessoas', pid)
        return raiz(idBase(p)) === identidade
      } catch (_) {
        return false
      }
    })

    if (ativaDaIdentidade.length > 0) {
      const ativa = ativaDaIdentidade[0]
      const mesmoProduto = String(ativa.getString('produto') || '') === produtoId

      if (mesmoProduto) {
        return e.json(200, {
          estado: 'duplicada',
          motivo_codigo: 'ja_ativa_mesmo_produto',
          cadenciaId: ativa.id,
          identidade: identidade,
          detalhe: 'A pessoa já tem cadência ativa neste produto — nenhuma nova foi criada.',
        })
      }

      // ---------- 3. conflito entre produtos: precisa de regra aprovada ----------
      let regra = ''
      let politicaVersao = 0
      try {
        const pols = $app.findRecordsByFilter(
          'politicas_coorte',
          "status = 'aprovada'",
          '-versao',
          1,
          0,
          {},
        )
        if (pols.length > 0) {
          regra = String(pols[0].getString('regra_prioridade_produto') || '')
          politicaVersao = Number(pols[0].get('versao') || 0)
        }
      } catch (_) {}

      if (!regra) {
        return e.json(200, {
          estado: 'pendente',
          motivo_codigo: 'conflito_sem_regra_de_prioridade',
          cadenciaAtivaId: ativa.id,
          produtoAtivoId: String(ativa.getString('produto') || ''),
          identidade: identidade,
          detalhe:
            'A pessoa já tem cadência ativa em outro produto e não há regra de prioridade aprovada. ' +
            'Nada foi alterado — a decisão fica pendente de configuração.',
        })
      }

      // regra existe: decide qual prevalece
      let novoVence = false
      if (regra === 'produto_mais_recente') {
        try {
          const anterior = $app.findRecordById('produtos', String(ativa.getString('produto')))
          novoVence = String(produto.getString('created')) > String(anterior.getString('created'))
        } catch (_) {
          novoVence = true
        }
      } else if (regra === 'ordem_catalogo') {
        const ord = (p) => {
          if (!p) return 9999
          const v = p.get('ordem')
          return v === undefined || v === null || v === '' ? 9999 : Number(v)
        }
        let prodAnterior = null
        try {
          prodAnterior = $app.findRecordById('produtos', String(ativa.getString('produto') || ''))
        } catch (_) {}
        novoVence = ord(produto) < ord(prodAnterior)
      } else {
        return e.json(200, {
          estado: 'pendente',
          motivo_codigo: 'regra_de_prioridade_exige_decisao_humana',
          cadenciaAtivaId: ativa.id,
          identidade: identidade,
          detalhe: 'A regra de prioridade é manual: a escolha precisa ser feita por uma pessoa.',
        })
      }

      if (!novoVence) {
        return e.json(200, {
          estado: 'pendente',
          motivo_codigo: 'outro_produto_prevalece',
          cadenciaAtivaId: ativa.id,
          regra: regra,
          identidade: identidade,
          detalhe: 'Pela regra aprovada, a cadência ativa existente prevalece — nenhuma nova foi criada.',
        })
      }

      // o novo vence: encerra a anterior como 'substituida' e cria a nova
      const colSub = $app.findCollectionByNameOrId('cadencias_ativas')
      try {
        ativa.set('estado', 'substituida')
        ativa.set('motivo_codigo', 'substituida_por_regra')
        ativa.set('motivo', 'Substituída pela regra de prioridade (' + regra + ')')
        $app.save(ativa)
      } catch (err) {
        $app.logger().error('falha ao substituir cadência', 'err', String(err))
        return e.internalServerError('Não foi possível substituir a cadência ativa')
      }

      try {
        const nova = new Record(colSub)
        nova.set('identidade_efetiva', identidade)
        nova.set('pessoa', pessoaId)
        nova.set('produto', produtoId)
        if (contextoId) nova.set('contexto', contextoId)
        nova.set('estado', 'ativa')
        nova.set('motivo', motivo)
        nova.set('motivo_codigo', 'substitui_por_regra')
        nova.set('politica_versao', politicaVersao)
        nova.set('substitui', ativa.id)
        nova.set('owner', e.auth.id)
        nova.set('ambiente', 'teste')
        $app.save(nova)
        return e.json(200, {
          estado: 'ativa',
          cadenciaId: nova.id,
          substituiu: ativa.id,
          regra: regra,
          identidade: identidade,
          detalhe: 'Cadência ativada por regra de prioridade aprovada.',
        })
      } catch (err) {
        return e.internalServerError('Não foi possível criar a cadência: ' + String(err))
      }
    }

    // ---------- 4. nenhuma ativa: cria (o índice único decide a corrida) ----------
    const col = $app.findCollectionByNameOrId('cadencias_ativas')
    try {
      const nova = new Record(col)
      nova.set('identidade_efetiva', identidade)
      nova.set('pessoa', pessoaId)
      nova.set('produto', produtoId)
      if (contextoId) nova.set('contexto', contextoId)
      nova.set('estado', 'ativa')
      nova.set('motivo', motivo)
      nova.set('motivo_codigo', 'primeira_cadencia')
      nova.set('owner', e.auth.id)
      nova.set('ambiente', 'teste')
      $app.save(nova)

      return e.json(200, {
        estado: 'ativa',
        cadenciaId: nova.id,
        identidade: identidade,
        detalhe: 'Cadência ativada.',
      })
    } catch (err) {
      const msg = String(err)
      const ehConflito =
        msg.indexOf('UNIQUE') !== -1 ||
        msg.indexOf('unique') !== -1 ||
        msg.indexOf('constraint') !== -1
      if (ehConflito) {
        let vencedora = null
        try {
          const vs = $app.findRecordsByFilter(
            'cadencias_ativas',
            'identidade_efetiva = {:i} && estado = {:estado}',
            '',
            1,
            0,
            { i: identidade, estado: 'ativa' },
          )
          if (vs.length > 0) vencedora = vs[0]
        } catch (_) {}
        return e.json(200, {
          estado: 'duplicada',
          motivo_codigo: 'corrida_perdida_indice_unico',
          cadenciaId: vencedora ? vencedora.id : null,
          identidade: identidade,
          detalhe:
            'Outra requisição ativou a cadência no mesmo instante. O banco garantiu uma única ativa — ' +
            'esta tentativa não criou nada.',
        })
      }
      $app.logger().error('falha ao criar cadência', 'err', msg)
      return e.internalServerError('Não foi possível criar a cadência')
    }
  },
  $apis.requireAuth(),
)

// ------------------------------------------------------------------ concluir / cancelar
routerAdd(
  'POST',
  '/backend/v1/cadencias/concluir',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const body = e.requestInfo().body || {}
    const cadenciaId = String(body.cadenciaId || '').trim()
    if (!cadenciaId) return e.badRequestError('cadenciaId é obrigatório')

    const para = String(body.para || 'concluida')
    if (para !== 'concluida' && para !== 'cancelada')
      return e.badRequestError('para deve ser concluida ou cancelada')

    let cad
    try {
      cad = $app.findRecordById('cadencias_ativas', cadenciaId)
    } catch (_) {
      return e.notFoundError('Cadência não encontrada')
    }

    if (cad.getString('estado') !== 'ativa') {
      return e.json(200, {
        estado: cad.getString('estado'),
        motivo_codigo: 'ja_encerrada',
        detalhe: 'A cadência já estava encerrada — nada foi alterado.',
      })
    }

    try {
      cad.set('estado', para)
      cad.set('motivo', String(body.motivo || ''))
      cad.set('motivo_codigo', para === 'concluida' ? 'concluida' : 'cancelada')
      $app.save(cad)
    } catch (err) {
      return e.internalServerError('Não foi possível encerrar a cadência')
    }

    return e.json(200, {
      estado: para,
      cadenciaId: cad.id,
      identidade: String(cad.getString('identidade_efetiva') || ''),
      detalhe: 'Cadência encerrada — a identidade fica livre para uma nova cadência.',
    })
  },
  $apis.requireAuth(),
)

// ------------------------------------------------------------------ consulta de identidade
routerAdd(
  'GET',
  '/backend/v1/cadencias/identidade',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const pessoaId = String(e.requestInfo().query.pessoaId || '').trim()
    if (!pessoaId) return e.badRequestError('pessoaId é obrigatório')

    let pessoa
    try {
      pessoa = $app.findRecordById('pessoas', pessoaId)
    } catch (_) {
      return e.notFoundError('Pessoa não encontrada')
    }

    const idBase = (p) => {
      const g = p.getString('sync_global_id')
      return g && String(g).trim() ? String(g).trim() : p.id
    }

    const vizinhos = {}
    try {
      const aliases = $app.findRecordsByFilter(
        'aliases_identidade',
        "status = 'ativo'",
        '',
        500,
        0,
        {},
      )
      for (let i = 0; i < aliases.length; i++) {
        const o = String(aliases[i].getString('origem_global') || '').trim()
        const d = String(aliases[i].getString('destino_global') || '').trim()
        if (!o || !d || o === d) continue
        if (!vizinhos[o]) vizinhos[o] = []
        if (!vizinhos[d]) vizinhos[d] = []
        if (vizinhos[o].indexOf(d) === -1) vizinhos[o].push(d)
        if (vizinhos[d].indexOf(o) === -1) vizinhos[d].push(o)
      }
    } catch (_) {}

    const raiz = (id) => {
      const visto = {}
      const fila = [id]
      visto[id] = true
      let menor = id
      while (fila.length > 0) {
        const atual = fila.shift()
        if (String(atual) < String(menor)) menor = atual
        const vs = vizinhos[atual] || []
        for (let i = 0; i < vs.length; i++) {
          if (!visto[vs[i]]) {
            visto[vs[i]] = true
            fila.push(vs[i])
          }
        }
      }
      return menor
    }

    const identidade = raiz(idBase(pessoa))
    let ativa = null
    try {
      const vs = $app.findRecordsByFilter(
        'cadencias_ativas',
        'identidade_efetiva = {:i} && estado = {:estado}',
        '',
        1,
        0,
        { i: identidade, estado: 'ativa' },
      )
      if (vs.length > 0)
        ativa = { id: vs[0].id, produto: String(vs[0].getString('produto') || '') }
    } catch (_) {}

    return e.json(200, {
      pessoaId: pessoaId,
      identidadeEfetiva: identidade,
      temAlias: Object.keys(vizinhos).length > 0,
      cadenciaAtiva: ativa,
    })
  },
  $apis.requireAuth(),
)
