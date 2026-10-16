// SPEC-1-005 (task 3b93879f): calcular pontuação por produto — CA-1-005-01/02.
// POST /backend/v1/scoring/calcular { leadId, produtoId }
// O motor abaixo é CÓPIA INLINE de scripts/domain/scoring-core.js (fonte única; o gerador
// scripts/gerar-scoring-core.mjs mantém a correspondência — teste SCORE-FONTE confere).
// Verifica auth/papel/dono/ambiente/produto; usa a régua APROVADA mais recente (sem régua
// → pendente, sem régua genérica); persiste pontuacoes (idempotente por chave); a UI
// NUNCA envia valor/faixa — o servidor deriva tudo.
routerAdd(
  'POST',
  '/backend/v1/scoring/calcular',
  (e) => {
    // ponteiro da nota vigente por produto (notas_atuais em leads) — usado pelo histórico
    // "(atual)" e pela reversão do job de repontuação (task 2faac03b).
    // INLINE no callback: hooks Skip executam callbacks em VM própria (sem top-level).
    var publicarPonteiro = function (lead, produtoId, pontuacaoId) {
      let mapa = {}
      try {
        mapa = JSON.parse(lead.getString('notas_atuais') || '{}') || {}
      } catch (_) {}
      mapa[produtoId] = pontuacaoId
      lead.set('notas_atuais', JSON.stringify(mapa))
      $app.save(lead)
    }
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

    var faixaDe = function (valor, faixas) {
      for (var i = 0; i < faixas.length; i++) {
        var f = faixas[i]
        var deOk = valor >= f.de
        var ateOk = f.borda_inclusiva ? valor <= f.ate : valor < f.ate
        if (deOk && ateOk) return f.letra
      }
      return null
    }

    var pontuar = function (entrada) {
      var regua = entrada.regua
      var dados = entrada.dados || {}
      var motivos = []

      var eliminatorias = regua.regras_eliminatorias || []
      for (var i = 0; i < eliminatorias.length; i++) {
        var e = eliminatorias[i]
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
        if (r === 'ausente') r = false

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
      var faixaPontos = faixaDe(somaPontos, regua.faixas || [])
      return { status: 'calculada', valor: somaPontos, faixa: faixaPontos, motivos: motivos }
    }

    // hash determinístico dos dados (mesmo algoritmo do gerador/regua)
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

    if (!e.auth) return e.forbiddenError('Autenticação obrigatória')
    const body = e.requestInfo().body || {}
    const leadId = String(body.leadId || '')
    const produtoId = String(body.produtoId || '')
    if (!leadId || !produtoId) return e.badRequestError('leadId e produtoId são obrigatórios')

    let lead
    try {
      lead = $app.findRecordById('leads', leadId)
    } catch (_) {
      return e.notFoundError('Lead não encontrado')
    }
    const ehAdmin = e.auth.getString('role') === 'admin'
    if (!ehAdmin && lead.getString('owner') !== e.auth.id)
      return e.forbiddenError('Operador só calcula o próprio lead')

    let produto
    try {
      produto = $app.findRecordById('produtos', produtoId)
    } catch (_) {
      return e.notFoundError('Produto não encontrado')
    }
    const ambiente = produto.getString('ambiente') || 'teste'

    let reguaRec
    try {
      const aprovadas = $app.findRecordsByFilter(
        'regras_produto',
        "produto = {:p} && status = 'aprovada' && ambiente = {:a}",
        '-versao',
        1,
        0,
        { p: produtoId, a: ambiente },
      )
      if (aprovadas.length > 0) reguaRec = aprovadas[0]
    } catch (_) {}
    if (!reguaRec)
      return e.json(200, {
        status: 'pendente',
        valor: null,
        faixa: null,
        motivos: [
          {
            id: 'regua',
            resultado: 'pendente',
            descricao: 'Produto sem régua aprovada — pontuação pendente (sem régua genérica).',
          },
        ],
      })

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

    const regua = {
      metodo: reguaRec.getString('metodo'),
      criterios: JSON.parse(reguaRec.getString('criterios') || '[]'),
      regras_eliminatorias: JSON.parse(reguaRec.getString('regras_eliminatorias') || '[]'),
      faixas: JSON.parse(reguaRec.getString('faixas') || '[]'),
    }

    const resultado = pontuar({ regua, dados })

    const dadosHash = hashDe(JSON.stringify(dados))
    try {
      const existentes = $app.findRecordsByFilter(
        'pontuacoes',
        'lead = {:l} && produto = {:p} && versao = {:v} && dados_hash = {:h}',
        '',
        1,
        0,
        { l: leadId, p: produtoId, v: reguaRec.getInt('versao'), h: dadosHash },
      )
      if (existentes.length > 0) {
        const p = existentes[0]
        p.set('status', resultado.status)
        p.set('valor', resultado.valor)
        p.set('faixa', resultado.faixa)
        p.set('motivos', JSON.stringify(resultado.motivos))
        p.set('fontes', JSON.stringify(fontes))
        $app.save(p)
        publicarPonteiro(lead, produtoId, p.id)
      } else {
        const colP = $app.findCollectionByNameOrId('pontuacoes')
        const nova = new Record(colP)
        nova.set('owner', e.auth.id)
        nova.set('lead', leadId)
        nova.set('produto', produtoId)
        nova.set('versao', reguaRec.getInt('versao'))
        nova.set('dados_hash', dadosHash)
        nova.set('status', resultado.status)
        nova.set('valor', resultado.valor)
        nova.set('faixa', resultado.faixa)
        nova.set('motivos', JSON.stringify(resultado.motivos))
        nova.set('fontes', JSON.stringify(fontes))
        nova.set('ambiente', ambiente)
        $app.save(nova)
        publicarPonteiro(lead, produtoId, nova.id)
      }
    } catch (errP) {
      $app.logger().warn('falha ao persistir pontuação', 'err', String(errP))
    }

    return e.json(200, {
      leadId,
      produtoId,
      produtoNome: produto.getString('nome'),
      versao: reguaRec.getInt('versao'),
      status: resultado.status,
      valor: resultado.valor,
      faixa: resultado.faixa,
      motivos: resultado.motivos,
      fontes,
    })
  },
  $apis.requireAuth(),
)
