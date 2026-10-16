// SPEC-1-005 (task 2faac03b): job de repontuação dos não abordados — CA-1-005-04.
// POST /backend/v1/scoring/repontuar { jobId, acao: 'executar'|'reverter', maxLotes? }
// O motor abaixo é CÓPIA INLINE de scripts/domain/scoring-core.js (fonte única; o gerador
// scripts/gerar-scoring-core.mjs mantém a correspondência — teste SCORE-FONTE confere).
// Só admin. executar: lotes de 100 por cursor; por lead: pula abordado (primeira_abordagem_em
// OU contato outbound), calcula com a régua FIXADA no job, grava linha idempotente
// (owner = dono do lead), revalida régua vigente + não abordado antes de publicar o ponteiro
// (defesa em profundidade), checkpoint por lote. reverter: restaura os ponteiros do snapshot
// (só onde o ponteiro atual ainda é o publicado — sem clobber de cálculo manual posterior) e
// marca revertido; linhas permanecem (pontuacoes é append-only). Job obsoleto/revertido/
// concluido: recusado. maxLotes por chamada (1–20) para retomada controlada.
routerAdd(
  'POST',
  '/backend/v1/scoring/repontuar',
  (e) => {
    // SPEC-1-005 (task 3b93879f): motor de pontuação por produto — CA-1-005-01/02.
    // FONTE ÚNICA do cálculo (SPEC regra 4): função pura, sem rede/estado/Node API.
    // O hook scoring_calcular.js embute esta fonte inline (VM própria do Skip, sem require).
    // Regras: ponderado = 100×soma(peso×resultado)/soma(pesos), 2 casas; pontos = soma dos
    // pontos; eliminatória ANTES da soma; obrigatório ausente → pendente nomeado; opcional
    // ausente → falso com peso no denominador; faixas aprovadas com borda registrada.
    //
    // (O gerador remove os "export " antes de embutir no hook; os exports abaixo são para o
    // runner de regras. Ver SCORE-FONTE nos testes.)

    var OPERADORES_VALIDOS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'exists']

    var avaliarTermo = function (termo, dados) {
      var presente =
        Object.prototype.hasOwnProperty.call(dados, termo.campo) &&
        dados[termo.campo] !== null &&
        dados[termo.campo] !== undefined &&
        dados[termo.campo] !== ''
      if (!presente) return 'ausente'
      var v = dados[termo.campo]
      switch (termo.operador) {
        case 'eq':
          return v === termo.valor
        case 'neq':
          return v !== termo.valor
        case 'gt':
          return v > termo.valor
        case 'gte':
          return v >= termo.valor
        case 'lt':
          return v < termo.valor
        case 'lte':
          return v <= termo.valor
        case 'in':
          return Array.isArray(termo.valor) && termo.valor.indexOf(v) !== -1
        case 'contains':
          if (Array.isArray(v)) return v.indexOf(termo.valor) !== -1
          return String(v).indexOf(String(termo.valor)) !== -1
        case 'exists':
          return true
        default:
          return false
      }
    }

    // avalia um critério (termo ou grupo): 'satisfeito' | 'nao_satisfeito' | 'ausente'
    var avaliarCriterio = function (c, dados) {
      if (c.tipo === 'grupo') {
        var resultados = (c.filhos || []).map(function (f) {
          return avaliarTermo(f, dados)
        })
        var ausentes = resultados.filter(function (r) {
          return r === 'ausente'
        })
        var verdades = resultados.filter(function (r) {
          return r === true
        }).length
        if (ausentes.length === resultados.length) return 'ausente'
        if (c.combinacao === 'AND')
          return verdades === resultados.length ? 'satisfeito' : 'nao_satisfeito'
        return verdades > 0 ? 'satisfeito' : 'nao_satisfeito'
      }
      return avaliarTermo(c, dados)
    }

    // faixa pela régua (borda registrada): de inclusiva; ate inclusiva só se borda_inclusiva
    var faixaDe = function (valor, faixas) {
      for (var i = 0; i < faixas.length; i++) {
        var f = faixas[i]
        var deOk = valor >= f.de
        var ateOk = f.borda_inclusiva ? valor <= f.ate : valor < f.ate
        if (deOk && ateOk) return f.letra
      }
      return null
    }

    // motor principal: entrada { regua, dados } → { status, valor, faixa, motivos }
    var pontuar = function (entrada) {
      var regua = entrada.regua
      var dados = entrada.dados || {}
      var motivos = []

      // 1. eliminatórias ANTES da soma
      var eliminatórias = regua.regras_eliminatorias || []
      for (var i = 0; i < eliminatórias.length; i++) {
        var e = eliminatórias[i]
        var rE = avaliarCriterio(e, dados)
        var eSatisfeito = rE === 'satisfeito' || rE === true
        if (eSatisfeito) {
          motivos.push({
            id: e.id,
            resultado: 'eliminado',
            descricao:
              'Regra eliminatória satisfeita (' +
              e.campo +
              ' ' +
              e.operador +
              ' ' +
              JSON.stringify(e.valor) +
              ') — lead eliminado antes da soma.',
          })
          return { status: 'eliminada', valor: null, faixa: null, motivos: motivos }
        }
      }

      // 2. soma ponderada/pontos; obrigatório ausente → pendente (nomeado)
      var somaPesos = 0
      var somaPonderada = 0
      var somaPontos = 0
      var criterios = regua.criterios || []
      for (var j = 0; j < criterios.length; j++) {
        var c = criterios[j]
        var r = avaliarCriterio(c, dados)
        var peso = typeof c.peso === 'number' ? c.peso : 0
        var obrigatorio = !!c.obrigatorio
        var descricaoCondicao =
          c.tipo === 'grupo'
            ? 'grupo ' + c.combinacao + ' (' + (c.filhos || []).length + ' filhos)'
            : c.campo + ' ' + c.operador + ' ' + JSON.stringify(c.valor)

        if (r === 'ausente' && obrigatorio) {
          motivos.push({
            id: c.id,
            resultado: 'pendente',
            descricao:
              'Dado obrigatório ausente: ' +
              (c.tipo === 'grupo' ? 'filhos do grupo' : c.campo) +
              ' — pontuação pendente, sem nota inventada.',
          })
          return { status: 'pendente', valor: null, faixa: null, motivos: motivos }
        }
        if (r === 'ausente') r = false // opcional ausente → falso; peso fica no denominador

        var satisfeito = r === 'satisfeito' || r === true
        if (satisfeito) {
          somaPonderada += peso
          if (typeof c.pontos === 'number') somaPontos += c.pontos
          motivos.push({
            id: c.id,
            resultado: 'satisfeito',
            descricao:
              descricaoCondicao +
              ' — satisfeito (' +
              (regua.metodo === 'ponderado' ? 'peso ' + peso : 'pontos ' + (c.pontos || 0)) +
              ').',
          })
        } else {
          motivos.push({
            id: c.id,
            resultado: 'nao_satisfeito',
            descricao: descricaoCondicao + ' — não satisfeito.',
          })
        }
        somaPesos += peso
      }

      if (regua.metodo === 'ponderado') {
        if (somaPesos <= 0) {
          return {
            status: 'pendente',
            valor: null,
            faixa: null,
            motivos: [
              {
                id: 'soma',
                resultado: 'pendente',
                descricao: 'Soma dos pesos inválida — régua sem soma positiva.',
              },
            ],
          }
        }
        var valor = Math.round(((100 * somaPonderada) / somaPesos) * 100) / 100
        var faixa = faixaDe(valor, regua.faixas || [])
        return { status: 'calculada', valor: valor, faixa: faixa, motivos: motivos }
      }
      // pontos: domínio definido na própria régua
      var faixaPontos = faixaDe(somaPontos, regua.faixas || [])
      return { status: 'calculada', valor: somaPontos, faixa: faixaPontos, motivos: motivos }
    }

    // exports para o runner (o gerador remove "export " ao embutir no hook)

    if (!e.auth) return e.forbiddenError('Autenticação obrigatória')
    if (e.auth.getString('role') !== 'admin') return e.forbiddenError('Só admin opera o job')
    const body = e.requestInfo().body || {}
    const jobId = String(body.jobId || '')
    const acao = String(body.acao || '')
    const maxLotes = Math.max(1, Math.min(20, Number(body.maxLotes) || 1))
    if (!jobId || (acao !== 'executar' && acao !== 'reverter'))
      return e.badRequestError('jobId e acao (executar|reverter) são obrigatórios')

    // hash determinístico dos dados (mesmo algoritmo do gerador/regua) — INLINE no callback
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

    let job
    try {
      job = $app.findRecordById('jobs_pontuacao', jobId)
    } catch (_) {
      return e.notFoundError('Job não encontrado')
    }

    // ---- reverter: restaura ponteiros do snapshot; linhas permanecem (append-only) ----
    if (acao === 'reverter') {
      if (job.getString('status') !== 'concluido')
        return e.badRequestError(
          'Só job concluido pode ser revertido (atual: ' + job.getString('status') + ')',
        )
      const antes = JSON.parse(job.getString('ponteiros_antes') || '{}') || {}
      const publicados = JSON.parse(job.getString('publicados') || '{}') || {}
      const produtoId = job.getString('produto')
      let restaurados = 0
      for (const leadId of Object.keys(publicados)) {
        try {
          const lead = $app.findRecordById('leads', leadId)
          const mapaAtual = JSON.parse(lead.getString('notas_atuais') || '{}') || {}
          // só restaura se o ponteiro atual ainda é o que o job publicou (não clobber manual)
          if (mapaAtual[produtoId] === publicados[leadId]) {
            const alvo = antes[leadId] || ''
            if (alvo) mapaAtual[produtoId] = alvo
            else delete mapaAtual[produtoId]
            lead.set('notas_atuais', JSON.stringify(mapaAtual))
            $app.save(lead)
            restaurados++
          }
        } catch (_) {}
      }
      job.set('status', 'revertido')
      $app.save(job)
      return e.json(200, { jobId, acao, status: 'revertido', restaurados })
    }

    // ---- executar ----
    if (job.getString('status') === 'concluido')
      return e.badRequestError('Job já concluido — nada a executar (use reverter para desfazer).')
    if (job.getString('status') === 'obsoleto')
      return e.badRequestError(
        'Job obsoleto — uma versão mais nova da régua foi aprovada; execute o job dela.',
      )
    if (job.getString('status') === 'revertido')
      return e.badRequestError('Job revertido — crie um novo job aprovando a régua novamente.')

    const produtoId = job.getString('produto')
    const ambiente = job.getString('ambiente') || 'teste'
    let produto
    try {
      produto = $app.findRecordById('produtos', produtoId)
    } catch (_) {
      return e.notFoundError('Produto do job não encontrado')
    }
    if ((produto.getString('ambiente') || 'teste') !== ambiente)
      return e.badRequestError('Ambiente do produto mudou desde a criação do job')

    // régua FIXADA no job (nunca "a mais recente" no meio da execução)
    let reguaRec
    try {
      reguaRec = $app.findRecordById('regras_produto', job.getString('regua'))
    } catch (_) {
      return e.badRequestError('Régua do job não encontrada')
    }
    if (reguaRec.getString('status') !== 'aprovada')
      return e.badRequestError('Régua do job não está aprovada')
    if (reguaRec.getInt('versao') !== job.getInt('versao'))
      return e.badRequestError('Versão da régua diverge do job')

    // defesa em profundidade: a régua aprovada VIGENTE do produto ainda é a do job
    try {
      const vigentes = $app.findRecordsByFilter(
        'regras_produto',
        "produto = {:p} && status = 'aprovada' && ambiente = {:a}",
        '-versao',
        1,
        0,
        { p: produtoId, a: ambiente },
      )
      if (vigentes.length === 0 || vigentes[0].id !== reguaRec.id)
        return e.badRequestError(
          'A régua vigente do produto não é mais a versão do job — job obsoleto',
        )
    } catch (_) {}

    const regua = {
      metodo: reguaRec.getString('metodo'),
      criterios: JSON.parse(reguaRec.getString('criterios') || '[]'),
      regras_eliminatorias: JSON.parse(reguaRec.getString('regras_eliminatorias') || '[]'),
      faixas: JSON.parse(reguaRec.getString('faixas') || '[]'),
    }

    if (job.getString('status') === 'pendente') job.set('status', 'executando')

    let processados = job.getInt('processados')
    let ignorados = job.getInt('ignorados')
    let erros = job.getInt('erros')
    let cursor = job.getString('cursor') || ''
    const antesMapa = JSON.parse(job.getString('ponteiros_antes') || '{}') || {}
    const publicadosMapa = JSON.parse(job.getString('publicados') || '{}') || {}
    const TAM_LOTE = 100

    for (let lote = 0; lote < maxLotes; lote++) {
      let leads = []
      try {
        leads = $app.findRecordsByFilter('leads', 'id > {:c}', 'id', TAM_LOTE, 0, { c: cursor })
      } catch (errL) {
        $app.logger().warn('repontuar: falha ao buscar lote', 'err', String(errL))
        break
      }
      if (leads.length === 0) {
        job.set('status', 'concluido')
        break
      }
      for (const lead of leads) {
        cursor = lead.id
        // só não abordados: primeira_abordagem_em preenchida OU contato outbound registrado
        let abordado = lead.getString('primeira_abordagem_em') !== ''
        if (!abordado) {
          try {
            const out = $app.findRecordsByFilter(
              'contatos',
              "lead = {:l} && direcao = 'outbound'",
              '',
              1,
              0,
              { l: lead.id },
            )
            abordado = out.length > 0
          } catch (_) {}
        }
        if (abordado) {
          ignorados++
          continue
        }
        try {
          // dados do lead (mesma coleta do calcular)
          let dados = {}
          let fontes = {}
          try {
            if (lead.getString('empresa')) {
              const emp = $app.findRecordById('empresas', lead.getString('empresa'))
              try {
                const atributos = JSON.parse(emp.getString('atributos') || '{}')
                for (const k of Object.keys(atributos)) dados[k] = atributos[k]
              } catch (_) {}
              fontes['empresa.atributos'] = 'empresas:' + emp.id
              for (const campo of ['razao_social', 'cnpj_norm', 'setor', 'porte', 'uf', 'cidade']) {
                const v = emp.getString(campo)
                if (v) dados[campo] = v
              }
            }
          } catch (_) {}
          try {
            if (lead.getString('pessoa')) {
              const pes = $app.findRecordById('pessoas', lead.getString('pessoa'))
              fontes['pessoa'] = 'pessoas:' + pes.id
              try {
                const atributos = JSON.parse(pes.getString('atributos') || '{}')
                for (const k of Object.keys(atributos)) dados[k] = atributos[k]
              } catch (_) {}
            }
          } catch (_) {}
          for (const campo of ['nome_empresa', 'segmento', 'uf', 'cidade']) {
            const v = lead.getString(campo)
            if (v) {
              dados[campo] = v
              fontes['lead.' + campo] = 'leads:' + lead.id
            }
          }

          const resultado = pontuar({ regua, dados })
          const dadosHash = hashDe(JSON.stringify(dados))

          // grava a linha (idempotente; owner = dono do lead)
          let linhaId = ''
          const existentes = $app.findRecordsByFilter(
            'pontuacoes',
            'lead = {:l} && produto = {:p} && versao = {:v} && dados_hash = {:h}',
            '',
            1,
            0,
            { l: lead.id, p: produtoId, v: job.getInt('versao'), h: dadosHash },
          )
          if (existentes.length > 0) {
            const p = existentes[0]
            p.set('status', resultado.status)
            p.set('valor', resultado.valor)
            p.set('faixa', resultado.faixa)
            p.set('motivos', JSON.stringify(resultado.motivos))
            p.set('fontes', JSON.stringify(fontes))
            $app.save(p)
            linhaId = p.id
          } else {
            const colP = $app.findCollectionByNameOrId('pontuacoes')
            const nova = new Record(colP)
            nova.set('owner', lead.getString('owner'))
            nova.set('lead', lead.id)
            nova.set('produto', produtoId)
            nova.set('versao', job.getInt('versao'))
            nova.set('dados_hash', dadosHash)
            nova.set('status', resultado.status)
            nova.set('valor', resultado.valor)
            nova.set('faixa', resultado.faixa)
            nova.set('motivos', JSON.stringify(resultado.motivos))
            nova.set('fontes', JSON.stringify(fontes))
            nova.set('ambiente', ambiente)
            $app.save(nova)
            linhaId = nova.id
          }
          processados++

          // guarda por lead: régua vigente ainda é a do job E lead continua não abordado
          let vigenteOk = false
          try {
            const vigentes = $app.findRecordsByFilter(
              'regras_produto',
              "produto = {:p} && status = 'aprovada' && ambiente = {:a}",
              '-versao',
              1,
              0,
              { p: produtoId, a: ambiente },
            )
            vigenteOk = vigentes.length > 0 && vigentes[0].id === reguaRec.id
          } catch (_) {}
          let aindaNaoAbordado = lead.getString('primeira_abordagem_em') === ''
          if (aindaNaoAbordado) {
            try {
              const out = $app.findRecordsByFilter(
                'contatos',
                "lead = {:l} && direcao = 'outbound'",
                '',
                1,
                0,
                { l: lead.id },
              )
              aindaNaoAbordado = out.length === 0
            } catch (_) {}
          }

          // publica o ponteiro (snapshot do anterior preservado para a reversão)
          if (vigenteOk && aindaNaoAbordado) {
            let mapa = {}
            try {
              mapa = JSON.parse(lead.getString('notas_atuais') || '{}') || {}
            } catch (_) {}
            if (mapa[produtoId] && !antesMapa[lead.id]) antesMapa[lead.id] = mapa[produtoId]
            mapa[produtoId] = linhaId
            publicadosMapa[lead.id] = linhaId
            lead.set('notas_atuais', JSON.stringify(mapa))
            $app.save(lead)
          } else {
            // linha fica como histórico; ponteiro não é trocado
            ignorados++
          }
        } catch (errL2) {
          erros++
          $app.logger().warn('repontuar: erro no lead', 'lead', lead.id, 'err', String(errL2))
        }
      }
      // checkpoint por lote (cursor + contadores + snapshots)
      job.set('cursor', cursor)
      job.set('processados', processados)
      job.set('ignorados', ignorados)
      job.set('erros', erros)
      job.set('ponteiros_antes', JSON.stringify(antesMapa))
      job.set('publicados', JSON.stringify(publicadosMapa))
      $app.save(job)
      if (job.getString('status') === 'concluido') break
    }
    if (job.getString('status') !== 'concluido') job.set('status', 'executando')
    $app.save(job)

    return e.json(200, {
      jobId,
      acao,
      status: job.getString('status'),
      processados,
      ignorados,
      erros,
      cursor,
    })
  },
  $apis.requireAuth(),
)
