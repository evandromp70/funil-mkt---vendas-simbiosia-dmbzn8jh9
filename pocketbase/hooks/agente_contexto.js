// SPEC-2-003 (F2-T08): contexto mínimo e decisão determinística do agente — CA-2-003-03.
//
// GET  /backend/v1/agente/contexto?pessoaId=X&produtoId=Y
// POST /backend/v1/agente/decidir  { pessoaId, produtoId?, acao }
// GET  /backend/v1/agente/decisoes?pessoaId=X
//
// CONTEXTO MÍNIMO: só o recorte necessário, por LISTA BRANCA de campos. Fora do recorte:
// e-mail, telefone, linkedin, observações e qualquer conteúdo de mensagem anterior.
//
// DETERMINISMO: nenhuma chamada de LLM. A decisão é uma cadeia fixa de condições, na ordem
// documentada — a primeira que casar vence. O resumo é TEMPLATE com valores literais.
//
// ALLOWLIST no servidor: propor_toque, registrar_decisao, consultar_contexto.
routerAdd(
  'GET',
  '/backend/v1/agente/contexto',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')

    const q = e.requestInfo().query
    const pessoaId = String(q.pessoaId || '').trim()
    const produtoId = String(q.produtoId || '').trim()
    if (!pessoaId) return e.badRequestError('pessoaId é obrigatório')

    let pessoa
    try {
      pessoa = $app.findRecordById('pessoas', pessoaId)
    } catch (_) {
      return e.notFoundError('Pessoa não encontrada')
    }

    const ctx = {
      pessoa: {
        id: pessoa.id,
        nome: String(pessoa.getString('nome') || ''),
        coorte: pessoa.getBool('relacionamento_conhecido') ? 'relacionamento' : 'fria',
      },
      produto: null,
      contexto: null,
      nota: null,
      permissao: { exige_aprovacao: true, nota_minima: 0, politica_versao: 0 },
      historico: { toques_confirmados: 0 },
      template_versao: 'ctx-1',
    }

    if (produtoId) {
      try {
        const p = $app.findRecordById('produtos', produtoId)
        ctx.produto = {
          id: p.id,
          nome: String(p.getString('nome') || ''),
          playbook: String(p.getString('playbook') || ''),
          tom: String(p.getString('tom') || ''),
          versao: String(p.get('updated') || ''),
        }
      } catch (_) {
        ctx.produto = null
      }
    }

    try {
      const filtro = produtoId ? 'pessoa = {:p} && produto = {:pr}' : 'pessoa = {:p}'
      const params = produtoId ? { p: pessoaId, pr: produtoId } : { p: pessoaId }
      const cs = $app.findRecordsByFilter('contextos_comerciais', filtro, '', 1, 0, params)
      if (cs.length > 0) {
        ctx.contexto = {
          id: cs[0].id,
          estado: String(cs[0].getString('estado') || ''),
        }
      }
    } catch (_) {}

    if (produtoId) {
      try {
        const ps = $app.findRecordsByFilter('pontuacoes', 'produto = {:pr}', '-created', 1, 0, {
          pr: produtoId,
        })
        if (ps.length > 0) {
          ctx.nota = {
            valor: Number(ps[0].get('valor') || 0),
            origem: 'fabrica',
            versao: Number(ps[0].get('versao') || 0),
          }
        }
      } catch (_) {}
    }

    const coorte = ctx.pessoa.coorte
    try {
      const pols = $app.findRecordsByFilter(
        'politicas_coorte',
        'coorte = {:c} && status = {:st}',
        '-versao',
        1,
        0,
        { c: coorte, st: 'aprovada' },
      )
      if (pols.length > 0) {
        ctx.permissao = {
          exige_aprovacao: pols[0].getBool('exige_aprovacao_mensagem'),
          nota_minima: Number(pols[0].get('nota_minima') || 0),
          politica_versao: Number(pols[0].get('versao') || 0),
        }
      }
    } catch (_) {}

    try {
      const ts = $app.findRecordsByFilter('toques', 'pessoa = {:p} && estado = {:e}', '', 200, 0, {
        p: pessoaId,
        e: 'confirmado',
      })
      ctx.historico = { toques_confirmados: ts.length }
    } catch (_) {}

    return e.json(200, { contexto: ctx })
  },
  $apis.requireAuth(),
)

// ------------------------------------------------------------------ decidir
routerAdd(
  'POST',
  '/backend/v1/agente/decidir',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const body = e.requestInfo().body || {}

    const pessoaId = String(body.pessoaId || '').trim()
    const produtoId = String(body.produtoId || '').trim()
    const acao = String(body.acao || '').trim()
    if (!pessoaId) return e.badRequestError('pessoaId é obrigatório')
    if (!acao) return e.badRequestError('acao é obrigatória')

    // ALLOWLIST no SERVIDOR — o cliente nunca decide permissão
    const ALLOWLIST = ['propor_toque', 'registrar_decisao', 'consultar_contexto']
    const permitida = ALLOWLIST.indexOf(acao) !== -1

    let pessoa
    try {
      pessoa = $app.findRecordById('pessoas', pessoaId)
    } catch (_) {
      return e.notFoundError('Pessoa não encontrada')
    }

    const coorte = pessoa.getBool('relacionamento_conhecido') ? 'relacionamento' : 'fria'

    // ação fora da allowlist: registra a negativa e NÃO decide nada
    if (!permitida) {
      const resumoNeg = 'Ação negada: ' + acao + ' não está na allowlist do agente.'
      try {
        const colN = $app.findCollectionByNameOrId('decisoes_agente')
        const d = new Record(colN)
        d.set('pessoa', pessoaId)
        if (produtoId) d.set('produto', produtoId)
        d.set('decisao', 'revisao_humana')
        d.set('motivo_codigo', 'acao_fora_da_allowlist')
        d.set('resumo', resumoNeg)
        d.set('template_versao', 'ctx-1')
        d.set('entradas', JSON.stringify({ pessoa: pessoaId, acao: acao }))
        d.set('acao_solicitada', acao)
        d.set('acao_permitida', false)
        d.set('acao_efetiva', 'nenhuma')
        d.set('owner', e.auth.id)
        d.set('ambiente', 'teste')
        $app.save(d)
      } catch (_) {}

      return e.json(200, {
        decisao: 'revisao_humana',
        motivo_codigo: 'acao_fora_da_allowlist',
        acao_permitida: false,
        acao_efetiva: 'nenhuma',
        enviado: false,
        resumo: resumoNeg,
        detalhe: 'A allowlist é validada no servidor. Nenhuma ação foi executada.',
      })
    }

    // produto + estado do contexto + nota + política + cadência
    let produto = null
    if (produtoId) {
      try {
        const p = $app.findRecordById('produtos', produtoId)
        produto = {
          id: p.id,
          nome: String(p.getString('nome') || ''),
          versao: String(p.get('updated') || ''),
        }
      } catch (_) {}
    }

    let estadoContexto = ''
    let contextoId = ''
    try {
      const filtro = produtoId ? 'pessoa = {:p} && produto = {:pr}' : 'pessoa = {:p}'
      const params = produtoId ? { p: pessoaId, pr: produtoId } : { p: pessoaId }
      const cs = $app.findRecordsByFilter('contextos_comerciais', filtro, '', 1, 0, params)
      if (cs.length > 0) {
        estadoContexto = String(cs[0].getString('estado') || '')
        contextoId = cs[0].id
      }
    } catch (_) {}

    let notaValor = null
    let letraValor = ''
    if (produtoId) {
      try {
        const ps = $app.findRecordsByFilter('pontuacoes', 'produto = {:pr}', '-created', 1, 0, {
          pr: produtoId,
        })
        if (ps.length > 0) {
          notaValor = Number(ps[0].get('valor') || 0)
          const fa = ps[0].get('faixa')
          if (fa && typeof fa === 'object') letraValor = String(fa.letra || '')
        }
      } catch (_) {}
    }

    let exigeAprovacao = true
    let notaMinima = 0
    let politicaVersao = 0
    let temPolitica = false
    let faixaMinimaPolitica = ''
    let notaPisoPolitica = 0
    try {
      const pols = $app.findRecordsByFilter(
        'politicas_coorte',
        'coorte = {:c} && status = {:st}',
        '-versao',
        1,
        0,
        { c: coorte, st: 'aprovada' },
      )
      if (pols.length > 0) {
        temPolitica = true
        exigeAprovacao = pols[0].getBool('exige_aprovacao_mensagem')
        notaMinima = Number(pols[0].get('nota_minima') || 0)
        politicaVersao = Number(pols[0].get('versao') || 0)
        faixaMinimaPolitica = String(pols[0].getString('faixa_minima') || '').trim()
        notaPisoPolitica = Number(pols[0].get('nota_minima_piso') || 0)
      }
    } catch (_) {}

    let temCadencia = false
    try {
      const cs = $app.findRecordsByFilter(
        'cadencias_ativas',
        'pessoa = {:p} && estado = {:at}',
        '',
        1,
        0,
        { p: pessoaId, at: 'ativa' },
      )
      temCadencia = cs.length > 0
    } catch (_) {}

    // ---- CADEIA DETERMINÍSTICA (ordem FIXA: a primeira que casar vence) ----
    let decisao = ''
    let motivo = ''
    let resumo = ''
    const nomePessoa = String(pessoa.getString('nome') || pessoa.id)
    const TEMPLATE = 'ctx-1'

    if (acao === 'propor_toque') {
      if (!produtoId || !produto) {
        decisao = 'pendente_contexto'
        motivo = 'produto_ausente'
        resumo = 'Pendente: falta o produto para propor toque de ' + nomePessoa + '.'
      } else if (!temPolitica) {
        decisao = 'aguardar_aprovacao'
        motivo = 'sem_politica_aprovada_para_coorte'
        resumo = 'Aguardando aprovação: não há política aprovada para a coorte ' + coorte + '.'
      } else if (exigeAprovacao) {
        decisao = 'aguardar_aprovacao'
        motivo = 'coorte_exige_aprovacao_por_mensagem'
        resumo =
          'Aguardando aprovação: a coorte ' +
          coorte +
          ' exige aprovação individual da mensagem (política v' +
          String(politicaVersao) +
          ').'
      } else if (temCadencia) {
        decisao = 'ja_em_cadencia'
        motivo = 'cadencia_ativa_existente'
        resumo = 'Já em cadência: a pessoa tem uma cadência ativa.'
      } else if (faixaMinimaPolitica) {
        // portão por LETRA (decisão do José, 28/10) + piso absoluto
        const ORDEM_F = { A: 4, B: 3, C: 2, D: 1 }
        const letraObtida = String(letraValor || '')
        if (!letraObtida) {
          decisao = 'aguardar_aprovacao'
          motivo = 'sem_faixa_calculada'
          resumo = 'Aguardando: não há faixa calculada para esta pessoa.'
        } else if ((ORDEM_F[letraObtida] || 0) < (ORDEM_F[faixaMinimaPolitica] || 0)) {
          decisao = 'nao_elegivel'
          motivo = 'faixa_abaixo_do_minimo'
          resumo =
            'Não elegível: faixa ' + letraObtida + ' abaixo da mínima ' + faixaMinimaPolitica + '.'
        } else if (notaPisoPolitica > 0 && notaValor !== null && notaValor < notaPisoPolitica) {
          decisao = 'nao_elegivel'
          motivo = 'nota_abaixo_do_piso'
          resumo =
            'Não elegível: faixa ' +
            letraObtida +
            ' mas nota ' +
            String(notaValor) +
            ' abaixo do piso ' +
            String(notaPisoPolitica) +
            '.'
        } else {
          decisao = 'propor_toque'
          motivo = 'condicoes_atendidas'
          resumo =
            'Propor toque para ' +
            nomePessoa +
            ' no produto ' +
            String(produto.nome) +
            ' (faixa ' +
            letraObtida +
            ', coorte ' +
            coorte +
            ').'
        }
      } else if (notaValor !== null && notaValor < notaMinima) {
        decisao = 'nao_elegivel'
        motivo = 'nota_abaixo_do_minimo'
        resumo =
          'Não elegível: nota ' +
          String(notaValor) +
          ' abaixo do mínimo ' +
          String(notaMinima) +
          '.'
      } else {
        decisao = 'propor_toque'
        motivo = 'condicoes_atendidas'
        resumo =
          'Propor toque para ' +
          nomePessoa +
          ' no produto ' +
          String(produto.nome) +
          ' (coorte ' +
          coorte +
          ').'
      }
    } else {
      decisao = 'propor_toque'
      motivo = 'acao_informativa'
      resumo = 'Ação ' + acao + ' registrada para ' + nomePessoa + '.'
    }

    // ---- registra SEMPRE ----
    try {
      const col = $app.findCollectionByNameOrId('decisoes_agente')
      const d = new Record(col)
      d.set('pessoa', pessoaId)
      if (produtoId) d.set('produto', produtoId)
      if (contextoId) d.set('contexto', contextoId)
      d.set('decisao', decisao)
      d.set('motivo_codigo', motivo)
      d.set('resumo', resumo)
      d.set('template_versao', TEMPLATE)
      d.set(
        'entradas',
        JSON.stringify({
          pessoa: { id: pessoaId, coorte: coorte },
          produto: produto ? { id: produto.id, versao: produto.versao } : null,
          contexto_estado: estadoContexto,
          nota: notaValor,
          politica_versao: politicaVersao,
          tem_cadencia: temCadencia,
          acao: acao,
        }),
      )
      d.set('acao_solicitada', acao)
      d.set('acao_permitida', true)
      d.set('acao_efetiva', decisao === 'propor_toque' ? 'propor_toque' : 'nenhuma')
      if (body.correlationId) d.set('correlation_id', String(body.correlationId))
      d.set('owner', e.auth.id)
      d.set('ambiente', 'teste')
      $app.save(d)
    } catch (err) {
      $app.logger().error('falha ao registrar decisão', 'err', String(err))
    }

    return e.json(200, {
      decisao: decisao,
      motivo_codigo: motivo,
      resumo: resumo,
      template_versao: TEMPLATE,
      acao_permitida: true,
      acao_efetiva: decisao === 'propor_toque' ? 'propor_toque' : 'nenhuma',
      enviado: false,
    })
  },
  $apis.requireAuth(),
)

// ------------------------------------------------------------------ listar decisões
routerAdd(
  'GET',
  '/backend/v1/agente/decisoes',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const q = e.requestInfo().query
    const pessoaId = String(q.pessoaId || '').trim()

    let lista = []
    try {
      lista = pessoaId
        ? $app.findRecordsByFilter('decisoes_agente', 'pessoa = {:p}', '-created', 50, 0, {
            p: pessoaId,
          })
        : $app.findRecordsByFilter('decisoes_agente', '', '-created', 50, 0, {})
    } catch (_) {}

    const itens = []
    for (let i = 0; i < lista.length; i++) {
      const d = lista[i]
      itens.push({
        id: d.id,
        decisao: String(d.getString('decisao') || ''),
        motivo_codigo: String(d.getString('motivo_codigo') || ''),
        resumo: String(d.getString('resumo') || ''),
        acao_solicitada: String(d.getString('acao_solicitada') || ''),
        acao_permitida: d.getBool('acao_permitida'),
        acao_efetiva: String(d.getString('acao_efetiva') || ''),
        template_versao: String(d.getString('template_versao') || ''),
      })
    }

    return e.json(200, { total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)
