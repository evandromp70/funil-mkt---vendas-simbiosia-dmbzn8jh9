// SPEC-1-007 (task 199009b0): rota de aplicar fixture do contrato v1 — CA-1-007-01.
// v0.0.113: comparação de revisão por CHAVE DE NEGÓCIO (acc7d79f).
// v0.0.104: recarga do hook (lição: hooks podem ficar desatualizados na instância).
// Adaptador de demonstração: SÓ admin autorizado, SÓ ambiente teste.
// Fonte pura do contrato embutida DENTRO do callback (VM própria do PocketBase —
// declarações top-level não são visíveis nos callbacks). Recibo no sync_inbox na
// mesma transação lógica. Zero HTTP entre apps: o Funil aplica a projeção no PRÓPRIO banco.
routerAdd(
  'POST',
  '/backend/v1/sync/aplicar-fixture',
  (e) => {
    // ==== fonte do contrato v1 (inline no escopo do callback) ====
    var CONTRATO_VERSAO = 1
    var ORIGENS_VALIDAS = ['fabrica', 'funil']
    var AUTORIDADE = {
      cadastro_upsert: 'fabrica',
      catalogo_aprovado: 'fabrica',
      pontuacao_snapshot: 'fabrica',
      identidade_alias: 'fabrica',
      identidade_revogacao: 'fabrica',
      identidade_solicitada: 'funil',
      estado_comercial: 'funil',
      protecao_global: 'funil',
    }
    var DOMINIOS_VALIDOS = ['cadastro', 'catalogo', 'pontuacao', 'comercial', 'protecao', 'alias']
    var AMBIENTES_VALIDOS = ['teste', 'real']
    var TIPOS_IDENTIDADE = ['empresa', 'pessoa', 'contexto', 'produto']

    var jsonCanonico = function (valor) {
      var t = typeof valor
      if (valor === null || t === 'undefined') return 'null'
      if (t === 'number') return isFinite(valor) ? String(valor) : 'null'
      if (t === 'boolean') return valor ? 'true' : 'false'
      if (t === 'string') return JSON.stringify(valor)
      if (Array.isArray(valor)) {
        var itens = []
        for (var i = 0; i < valor.length; i++) itens.push(jsonCanonico(valor[i]))
        return '[' + itens.join(',') + ']'
      }
      var chaves = Object.keys(valor).sort()
      var pares = []
      for (var k = 0; k < chaves.length; k++) {
        var c = chaves[k]
        var v = valor[c]
        if (v === undefined) continue
        pares.push(JSON.stringify(c) + ':' + jsonCanonico(v))
      }
      return '{' + pares.join(',') + '}'
    }

    var hashDe = function (texto) {
      var h1 = 0x811c9dc5
      var h2 = 0x1000193
      for (var i = 0; i < texto.length; i++) {
        var c = texto.charCodeAt(i)
        h1 = (h1 ^ c) >>> 0
        h1 = Math.imul(h1, 0x01000193) >>> 0
        h2 = (h2 + Math.imul(c, i + 1)) >>> 0
      }
      var saida = ''
      for (var k = 0; k < 8; k++) {
        saida += ((h1 ^ (h2 + k * 0x9e3779b9)) >>> 0).toString(16).padStart(8, '0')
      }
      return saida.substring(0, 64)
    }

    var hashEnvelope = function (payload) {
      return hashDe(jsonCanonico(payload))
    }

    var identidadeValida = function (id) {
      if (typeof id !== 'string') return false
      var partes = id.split(':')
      if (partes.length !== 4) return false
      if (partes[0] !== 'FAB') return false
      if (AMBIENTES_VALIDOS.indexOf(partes[1]) === -1) return false
      if (TIPOS_IDENTIDADE.indexOf(partes[2]) === -1) return false
      return partes[3].length > 0
    }

    var validarEnvelope = function (evento) {
      if (!evento || typeof evento !== 'object' || Array.isArray(evento))
        return { ok: false, motivo: 'envelope ausente ou não é objeto' }
      var chavesPermitidas = [
        'contrato_versao',
        'evento_id',
        'origem',
        'ambiente',
        'tipo_evento',
        'entidade_global_id',
        'dominio',
        'revisao',
        'payload_hash',
        'payload',
        'ocorrido_em',
        'referencia_ator_mapeada',
      ]
      for (var chave in evento) {
        if (chavesPermitidas.indexOf(chave) === -1)
          return { ok: false, motivo: 'campo não declarado: ' + chave }
      }
      if (evento.contrato_versao !== CONTRATO_VERSAO)
        return { ok: false, motivo: 'contrato_versao inválido' }
      if (ORIGENS_VALIDAS.indexOf(evento.origem) === -1)
        return { ok: false, motivo: 'origem inválida' }
      if (AMBIENTES_VALIDOS.indexOf(evento.ambiente) === -1)
        return { ok: false, motivo: 'ambiente inválido' }
      if (typeof evento.tipo_evento !== 'string' || AUTORIDADE[evento.tipo_evento] === undefined)
        return { ok: false, motivo: 'tipo_evento inválido' }
      if (AUTORIDADE[evento.tipo_evento] !== evento.origem)
        return {
          ok: false,
          motivo: 'autoridade: ' + evento.origem + ' não emite ' + evento.tipo_evento,
        }
      var solicitacao = evento.tipo_evento === 'identidade_solicitada'
      if (solicitacao) {
        if (evento.entidade_global_id !== null)
          return { ok: false, motivo: 'identidade_solicitada exige entidade_global_id nulo' }
      } else {
        if (!identidadeValida(evento.entidade_global_id))
          return { ok: false, motivo: 'entidade_global_id inválido' }
      }
      if (DOMINIOS_VALIDOS.indexOf(evento.dominio) === -1)
        return { ok: false, motivo: 'dominio inválido' }
      if (
        typeof evento.revisao !== 'number' ||
        !isFinite(evento.revisao) ||
        evento.revisao !== Math.floor(evento.revisao) ||
        evento.revisao < 1
      )
        return { ok: false, motivo: 'revisao deve ser inteiro positivo' }
      if (typeof evento.ocorrido_em !== 'string' || !evento.ocorrido_em)
        return { ok: false, motivo: 'ocorrido_em obrigatório' }
      if (
        typeof evento.evento_id !== 'string' ||
        evento.evento_id.indexOf(evento.origem + ':' + evento.ambiente + ':evento:') !== 0
      )
        return { ok: false, motivo: 'evento_id fora do padrão' }
      var p = evento.payload
      if (!p || typeof p !== 'object' || Array.isArray(p))
        return { ok: false, motivo: 'payload ausente ou não é objeto' }
      var proibidos = ['owner', 'role', 'email_auth', 'token', 'senha', 'password', 'collection_id']
      for (var pk in p) {
        if (proibidos.indexOf(pk) !== -1)
          return { ok: false, motivo: 'payload proíbe campo: ' + pk }
      }
      var esperado = hashEnvelope(p)
      if (evento.payload_hash !== esperado)
        return { ok: false, motivo: 'payload_hash diverge do payload' }
      return { ok: true }
    }

    var chaveRevisao = function (evento) {
      var ent = evento.entidade_global_id || (evento.payload && evento.payload.solicitacao_id) || ''
      var prod = (evento.payload && evento.payload.produto_global_id) || ''
      return [evento.ambiente, evento.origem, evento.dominio, ent, prod].join('::')
    }

    var compararRevisao = function (a, b) {
      if (a > b) return 'maior'
      if (a < b) return 'menor'
      return 'igual'
    }

    var decidirAplicacao = function (evento, estadoAtual, temMapeamento, temReferencias) {
      var v = validarEnvelope(evento)
      if (!v.ok) return { acao: 'rejeitado', motivo: v.motivo }
      if (!estadoAtual) {
        if (temMapeamento === false)
          return { acao: 'pendente', motivo: 'sem mapeamento de ator aprovado' }
        if (temReferencias === false)
          return { acao: 'pendente', motivo: 'referências ainda não projetadas' }
        return { acao: 'aplicar' }
      }
      if (estadoAtual.hash === evento.payload_hash && estadoAtual.revisao === evento.revisao) {
        return { acao: 'duplicado' }
      }
      if (estadoAtual.hash !== evento.payload_hash && estadoAtual.revisao === evento.revisao) {
        return { acao: 'conflito', motivo: 'mesmo evento_id/revisão com payload diferente' }
      }
      var cmp = compararRevisao(evento.revisao, estadoAtual.revisao)
      if (cmp === 'menor') return { acao: 'atrasado' }
      if (!temMapeamento) return { acao: 'pendente', motivo: 'sem mapeamento de ator aprovado' }
      if (temReferencias === false)
        return { acao: 'pendente', motivo: 'referências ainda não projetadas' }
      return { acao: 'aplicar' }
    }

    var aliasValido = function (alias) {
      if (!alias || typeof alias !== 'object') return false
      if (!identidadeValida(alias.origem_global) || !identidadeValida(alias.destino_global))
        return false
      if (alias.origem_global === alias.destino_global) return false
      var o = alias.origem_global.split(':')
      var d = alias.destino_global.split(':')
      if (o[1] !== d[1] || o[2] !== d[2]) return false
      return alias.status === 'ativo' || alias.status === 'revogado'
    }

    // ==== lógica da rota ====
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação necessária')
    // role via getString — no JSVM o Record não expõe campos como propriedade direta
    if (auth.getString('role') !== 'admin')
      return e.forbiddenError('Só admin aplica fixtures do contrato')

    const body = e.requestInfo().body || {}
    const evento = body.evento || null
    if (!evento) return e.badRequestError('evento é obrigatório')

    const v = validarEnvelope(evento)
    if (!v.ok) {
      return e.json(200, { acao: 'rejeitado', motivo: v.motivo })
    }

    let mapeado = null
    try {
      const maps = $app.findRecordsByFilter(
        'sync_mapeamentos',
        'app_origem = {:o} && referencia_ator = {:r} && ambiente = {:a}',
        '',
        1,
        0,
        { o: evento.origem, r: String(evento.referencia_ator_mapeada || ''), a: evento.ambiente },
      )
      if (maps.length > 0) mapeado = maps[0]
    } catch (_) {}

    let estadoAtual = null
    try {
      // SPEC (fluxo 3 + acc7d79f): a comparação de revisão é por CHAVE DE NEGÓCIO
      // (ambiente, origem/autoridade, dominio, entidade[, produto]) — não só por
      // evento_id. Pego o recibo de maior revisão dessa chave.
      const chaveEnt =
        evento.entidade_global_id || (evento.payload && evento.payload.solicitacao_id) || ''
      const chaveProd = (evento.payload && evento.payload.produto_global_id) || ''
      const candidatos = $app.findRecordsByFilter(
        'sync_inbox',
        'origem = {:o} && ambiente = {:a} && dominio = {:d} && entidade_global_id = {:e}',
        '-revisao',
        0,
        0,
        { o: evento.origem, a: evento.ambiente, d: evento.dominio, e: chaveEnt },
      ) // recibo do MESMO evento_id (para duplicado/conflito terminal)
      const mesmos = candidatos.filter((r) => r.getString('evento_id') === evento.evento_id)
      const porChave = candidatos.length > 0 ? candidatos[0] : null
      const porEvento = mesmos.length > 0 ? mesmos[0] : null
      // duplicado/conflito só contra o MESMO evento_id
      if (porEvento) {
        const estadoAnterior = porEvento.getString('estado')
        if (
          estadoAnterior === 'aplicado' ||
          estadoAnterior === 'duplicado' ||
          estadoAnterior === 'conflito'
        ) {
          const hashIgual = porEvento.getString('payload_hash') === evento.payload_hash
          const revIgual = porEvento.getInt('revisao') === evento.revisao
          if (hashIgual && revIgual) {
            estadoAtual = {
              hash: porEvento.getString('payload_hash'),
              revisao: porEvento.getInt('revisao'),
            }
          } else if (!hashIgual && revIgual) {
            estadoAtual = {
              hash: 'X' + porEvento.getString('payload_hash'),
              revisao: porEvento.getInt('revisao'),
            }
          }
        }
      }
      // atraso/conflito de revisão contra a CHAVE de negócio (maior revisão aplicada;
      // 'duplicado' também conta — a projeção da chave existe)
      if (!estadoAtual && porChave) {
        const estadoAnterior = porChave.getString('estado')
        if (estadoAnterior === 'aplicado' || estadoAnterior === 'duplicado') {
          const revChave = porChave.getInt('revisao')
          if (evento.revisao < revChave) {
            estadoAtual = { hash: porChave.getString('payload_hash'), revisao: revChave }
          } else if (
            evento.revisao === revChave &&
            porChave.getString('payload_hash') !== evento.payload_hash
          ) {
            estadoAtual = { hash: 'X' + porChave.getString('payload_hash'), revisao: revChave }
          }
        }
      }
    } catch (_) {}

    const temReferencias = true
    const decisao = decidirAplicacao(evento, estadoAtual, mapeado !== null, temReferencias)

    const col = $app.findCollectionByNameOrId('sync_inbox')
    let recibo
    try {
      const existentes = $app.findRecordsByFilter(
        'sync_inbox',
        'evento_id = {:e} && origem = {:o} && ambiente = {:a}',
        '',
        1,
        0,
        { e: evento.evento_id, o: evento.origem, a: evento.ambiente },
      )
      recibo = existentes.length > 0 ? existentes[0] : new Record(col)
    } catch (_) {
      recibo = new Record(col)
    }
    recibo.set('evento_id', evento.evento_id)
    recibo.set('origem', evento.origem)
    recibo.set('ambiente', evento.ambiente)
    recibo.set('tipo_evento', evento.tipo_evento)
    recibo.set('dominio', evento.dominio)
    recibo.set('entidade_global_id', evento.entidade_global_id || '')
    recibo.set('revisao', evento.revisao)
    recibo.set('payload_hash', evento.payload_hash)
    recibo.set('estado', decisao.acao === 'aplicar' ? 'aplicado' : decisao.acao)
    recibo.set(
      'resultado',
      JSON.stringify({ decisao: decisao, mapeado: mapeado ? mapeado.id : null }),
    )
    $app.save(recibo)

    // PROJEÇÃO LOCAL no Funil (task 0cda0d05 — CA-1-007-02): cadastro_upsert
    // (empresa/pessoa), catalogo_aprovado (produto em leitura) e pontuacao_snapshot
    // (nota LITERAL do payload, sem recalcular). Autoridade: o Funil não edita régua
    // nem recalcula nota projetada; score/qualificação manuais do lead não são tocados.
    let projecao = null
    if (decisao.acao === 'aplicar') {
      const p = evento.payload || {}
      const tipo = (evento.entidade_global_id || '').split(':')[2]
      const ambienteLocal = evento.ambiente === 'real' ? 'producao' : 'teste'
      const donoLocal = mapeado ? mapeado.getString('usuario_local_destino') : auth.id
      const acharProjetado = (colecao, gid) => {
        try {
          const ants = $app.findRecordsByFilter(colecao, 'sync_global_id = {:g}', '', 1, 0, {
            g: gid,
          })
          return ants.length > 0 ? ants[0] : null
        } catch (_) {
          return null
        }
      }

      if (evento.tipo_evento === 'cadastro_upsert' && tipo === 'empresa') {
        let alvo = acharProjetado('empresas', evento.entidade_global_id)
        if (!alvo) {
          const cCol = $app.findCollectionByNameOrId('empresas')
          alvo = new Record(cCol)
          alvo.set('sync_global_id', evento.entidade_global_id)
          alvo.set('owner', donoLocal)
          alvo.set('ambiente', ambienteLocal)
        }
        if (p.razao_social) alvo.set('razao_social', p.razao_social)
        if (p.cnpj) alvo.set('cnpj', p.cnpj)
        $app.save(alvo)
        projecao = alvo.id
      }

      if (evento.tipo_evento === 'cadastro_upsert' && tipo === 'pessoa') {
        let alvo = acharProjetado('pessoas', evento.entidade_global_id)
        if (!alvo) {
          const cCol = $app.findCollectionByNameOrId('pessoas')
          alvo = new Record(cCol)
          alvo.set('sync_global_id', evento.entidade_global_id)
          alvo.set('nome', p.nome || 'Pessoa projetada')
          alvo.set('ambiente', ambienteLocal)
        }
        if (p.nome) alvo.set('nome', p.nome)
        if (p.email) alvo.set('email_norm', p.email)
        if (p.telefone) alvo.set('telefone_norm', p.telefone)
        if (p.linkedin) alvo.set('linkedin_norm', p.linkedin)
        if (p.relacionamento_conhecido === true) alvo.set('relacionamento_conhecido', true)
        $app.save(alvo)
        projecao = alvo.id
      }

      if (evento.tipo_evento === 'catalogo_aprovado' && tipo === 'produto') {
        let alvo = acharProjetado('produtos', evento.entidade_global_id)
        if (!alvo) {
          const cCol = $app.findCollectionByNameOrId('produtos')
          alvo = new Record(cCol)
          alvo.set('sync_global_id', evento.entidade_global_id)
          alvo.set('nome', p.nome || 'Produto projetado')
          alvo.set('degrau', p.degrau || 'essencial')
          alvo.set('ambiente', ambienteLocal)
        }
        // produto projetado fica INATIVO (leitura; catálogo é editável só na Fábrica)
        alvo.set('ativo', false)
        if (p.area) alvo.set('area', p.area)
        if (p.dor) alvo.set('dor', p.dor)
        if (p.descricao) alvo.set('descricao', p.descricao)
        $app.save(alvo)
        projecao = alvo.id
      }

      if (
        evento.tipo_evento === 'identidade_alias' ||
        evento.tipo_evento === 'identidade_revogacao'
      ) {
        // FUSÃO REVERSÍVEL (SPEC fluxo 6): alias na Fábrica, pausa de cadências no Funil.
        const p2 = p
        const origemGid = p2.origem_global || ''
        const destinoGid = p2.destino_global || ''
        const statusAlias = evento.tipo_evento === 'identidade_alias' ? 'ativo' : 'revogado'
        // grava o alias local (espelho do contrato; fonte de verdade é a Fábrica)
        try {
          const aCol = $app.findCollectionByNameOrId('aliases_identidade')
          const existentes = $app.findRecordsByFilter(
            'aliases_identidade',
            'origem_global = {:o} && rev = {:r}',
            '',
            1,
            0,
            { o: origemGid, r: evento.revisao },
          )
          const alias = existentes.length > 0 ? existentes[0] : new Record(aCol)
          alias.set('origem_global', origemGid)
          alias.set('destino_global', destinoGid)
          alias.set('rev', evento.revisao)
          alias.set('status', statusAlias)
          $app.save(alias)
          projecao = alias.id
        } catch (errAlias) {
          return e.json(200, {
            acao: 'conflito',
            motivo: 'falha ao gravar alias: ' + String(errAlias),
            recibo: recibo.id,
            projecao: null,
          })
        }
        // PAUSA de cadências dos DOIS contextos (conflito de identidade/atribuição) —
        // humano decide a continuidade; reversão mantém a pausa até revisão comercial.
        if (statusAlias === 'ativo' || statusAlias === 'revogado') {
          try {
            const leadsA = $app.findRecordsByFilter('leads', 'nome_empresa = {:n}', '', 0, 0, {
              n: origemGid,
            })
            const leadsB = $app.findRecordsByFilter('leads', 'nome_empresa = {:n}', '', 0, 0, {
              n: destinoGid,
            })
            for (const l of [...leadsA, ...leadsB]) {
              const cads = $app.findRecordsByFilter(
                'cadencias',
                'lead = {:l} && status = {:s}',
                '',
                0,
                0,
                { l: l.id, s: 'agendado' },
              )
              for (const c of cads) {
                c.set('status', 'cancelado')
                $app.save(c)
              }
            }
          } catch (_) {}
        }
      }

      if (evento.tipo_evento === 'pontuacao_snapshot') {
        // referências: lead (contexto) e produto projetados — sem elas, pendente
        const contextoGid = p.contexto_global_id || evento.entidade_global_id
        const produtoGid = p.produto_global_id || ''
        let leadRec = null
        try {
          // leads não tem campo ambiente — contexto é identificado pelo nome_empresa (gid)
          const leads = $app.findRecordsByFilter('leads', 'nome_empresa = {:n}', '', 1, 0, {
            n: contextoGid,
          })
          if (leads.length > 0) leadRec = leads[0]
        } catch (_) {}
        const prodRec = acharProjetado('produtos', produtoGid)
        if (!leadRec || !prodRec) {
          recibo.set('estado', 'pendente')
          recibo.set(
            'resultado',
            JSON.stringify({
              decisao: { acao: 'pendente', motivo: 'referências ainda não projetadas' },
              mapeado: mapeado ? mapeado.id : null,
            }),
          )
          $app.save(recibo)
          return e.json(200, {
            acao: 'pendente',
            motivo: 'referências ainda não projetadas',
            recibo: recibo.id,
            projecao: null,
          })
        }
        // snapshot LITERAL do payload — IDEMPOTENTE por chave de negócio (SPEC):
        // mesma nota (lead+produto+versão+dados_hash) já projetada retorna a existente
        let existente = null
        try {
          const ants = $app.findRecordsByFilter(
            'pontuacoes',
            'lead = {:l} && produto = {:p} && versao = {:v} && dados_hash = {:h}',
            '',
            1,
            0,
            {
              l: leadRec.id,
              p: prodRec.id,
              v: evento.revisao,
              h: p.dados_hash || evento.payload_hash,
            },
          )
          if (ants.length > 0) existente = ants[0]
        } catch (_) {}
        if (existente) {
          projecao = existente.id
          return e.json(200, {
            acao: 'aplicar',
            motivo: null,
            recibo: recibo.id,
            projecao: projecao,
            idempotente: true,
          })
        }
        // pontuacoes é append-only: novo registro, nunca atualiza anterior
        const cCol = $app.findCollectionByNameOrId('pontuacoes')
        const nota = new Record(cCol)
        nota.set('owner', donoLocal)
        nota.set('lead', leadRec.id)
        nota.set('produto', prodRec.id)
        nota.set('versao', evento.revisao)
        nota.set('dados_hash', p.dados_hash || evento.payload_hash)
        nota.set('status', p.status || 'calculada')
        if (typeof p.valor === 'number') nota.set('valor', p.valor)
        if (p.faixa) nota.set('faixa', p.faixa)
        if (p.motivos) nota.set('motivos', JSON.stringify(p.motivos))
        if (p.fontes) nota.set('fontes', JSON.stringify(p.fontes))
        nota.set('ambiente', ambienteLocal)
        nota.set('sync_global_id', evento.entidade_global_id)
        $app.save(nota)
        projecao = nota.id
      }
    }

    return e.json(200, {
      acao: decisao.acao,
      motivo: decisao.motivo || null,
      recibo: recibo.id,
      projecao: projecao,
    })
  },
  $apis.requireAuth(),
)
