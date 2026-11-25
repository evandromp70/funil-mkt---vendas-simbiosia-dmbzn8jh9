// Pontuação automática (23/11/2026): quando um lead é criado (importação, cadastro→lead,
// formulário ou cadastro manual), calcula a nota dele em cada produto ATIVO que tenha régua
// aprovada. É o mesmo motor de scoring_calcular.js (cópia inline: hooks do Skip rodam cada
// callback em VM própria, sem require nem função de topo).
// Falha aqui NUNCA derruba a criação do lead: tudo vai dentro de try/catch e termina em e.next().
// Notas ficam em `pontuacoes` (append-only) e o ponteiro vigente em leads.notas_atuais.
onRecordAfterCreateSuccess((e) => {
  const lead = e.record
  try {
    const avaliarTermo = function (termo, dados) {
      const presente =
        Object.prototype.hasOwnProperty.call(dados, termo.campo) &&
        dados[termo.campo] !== null &&
        dados[termo.campo] !== undefined &&
        dados[termo.campo] !== ''
      if (!presente) return 'ausente'
      const v = dados[termo.campo]
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

    const avaliarCriterio = function (c, dados) {
      if (c.tipo === 'grupo') {
        const resultados = (c.filhos || []).map(function (f) {
          return avaliarTermo(f, dados)
        })
        const ausentes = resultados.filter(function (r) {
          return r === 'ausente'
        })
        const verdades = resultados.filter(function (r) {
          return r === true
        }).length
        if (ausentes.length === resultados.length) return 'ausente'
        if (c.combinacao === 'AND')
          return verdades === resultados.length ? 'satisfeito' : 'nao_satisfeito'
        return verdades > 0 ? 'satisfeito' : 'nao_satisfeito'
      }
      return avaliarTermo(c, dados)
    }

    const faixaDe = function (valor, faixas) {
      for (let i = 0; i < faixas.length; i++) {
        const f = faixas[i]
        const deOk = valor >= f.de
        const ateOk = f.borda_inclusiva ? valor <= f.ate : valor < f.ate
        if (deOk && ateOk) return f.letra
      }
      return null
    }

    const pontuar = function (regua, dados) {
      const motivos = []
      const eliminatorias = regua.regras_eliminatorias || []
      for (let i = 0; i < eliminatorias.length; i++) {
        const el = eliminatorias[i]
        const rE = avaliarCriterio(el, dados)
        if (rE === 'satisfeito' || rE === true) {
          motivos.push({
            id: el.id,
            resultado: 'eliminado',
            descricao:
              'Regra eliminatória satisfeita (' +
              el.campo +
              ' ' +
              el.operador +
              ' ' +
              JSON.stringify(el.valor) +
              ') — lead eliminado antes da soma.',
          })
          return { status: 'eliminada', valor: null, faixa: null, motivos: motivos }
        }
      }

      let somaPesos = 0
      let somaPonderada = 0
      let somaPontos = 0
      const criterios = regua.criterios || []
      for (let j = 0; j < criterios.length; j++) {
        const c = criterios[j]
        let r = avaliarCriterio(c, dados)
        const peso = typeof c.peso === 'number' ? c.peso : 0
        const descricaoCondicao =
          c.tipo === 'grupo'
            ? 'grupo ' + c.combinacao + ' (' + (c.filhos || []).length + ' filhos)'
            : c.campo + ' ' + c.operador + ' ' + JSON.stringify(c.valor)

        if (r === 'ausente' && !!c.obrigatorio) {
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

        if (r === 'satisfeito' || r === true) {
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
        const valor = Math.round(((100 * somaPonderada) / somaPesos) * 100) / 100
        return {
          status: 'calculada',
          valor: valor,
          faixa: faixaDe(valor, regua.faixas || []),
          motivos: motivos,
        }
      }
      return {
        status: 'calculada',
        valor: somaPontos,
        faixa: faixaDe(somaPontos, regua.faixas || []),
        motivos: motivos,
      }
    }

    const hashDe = function (texto) {
      let h1 = 0x811c9dc5
      let h2 = 0x1000193
      for (let i = 0; i < texto.length; i++) {
        const c = texto.charCodeAt(i)
        h1 = (h1 ^ c) >>> 0
        h1 = Math.imul(h1, 0x01000193) >>> 0
        h2 = (h2 + Math.imul(c, i + 1)) >>> 0
      }
      let saida = ''
      for (let k = 0; k < 8; k++) {
        saida += ((h1 ^ (h2 + k * 0x9e3779b9)) >>> 0).toString(16).padStart(8, '0')
      }
      return saida.substring(0, 64)
    }

    // ---- dados do lead (mesma montagem de scoring_calcular.js) ----
    const dados = {}
    const fontes = {}
    try {
      if (lead.getString('empresa')) {
        const emp = $app.findRecordById('empresas', lead.getString('empresa'))
        try {
          const atributos = JSON.parse(emp.getString('atributos') || '{}')
          for (const k of Object.keys(atributos)) dados[k] = atributos[k]
        } catch (_) {}
        fontes['empresa.atributos'] = 'empresas:' + emp.id
        const camposEmp = ['razao_social', 'cnpj_norm', 'setor', 'porte', 'uf', 'cidade']
        for (let c = 0; c < camposEmp.length; c++) {
          const v = emp.getString(camposEmp[c])
          if (v) dados[camposEmp[c]] = v
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
    const camposLead = ['nome_empresa', 'segmento', 'uf', 'cidade']
    for (let c = 0; c < camposLead.length; c++) {
      const v = lead.getString(camposLead[c])
      if (v) {
        dados[camposLead[c]] = v
        fontes['lead.' + camposLead[c]] = 'leads:' + lead.id
      }
    }
    const dadosHash = hashDe(JSON.stringify(dados))

    // ---- um cálculo por produto ativo com régua aprovada ----
    let produtos = []
    try {
      produtos = $app.findRecordsByFilter('produtos', 'ativo = true', '', 50, 0)
    } catch (_) {}

    let mapaPonteiros = {}
    try {
      mapaPonteiros = JSON.parse(lead.getString('notas_atuais') || '{}') || {}
    } catch (_) {}
    let mudouPonteiro = false

    for (let i = 0; i < produtos.length; i++) {
      const produto = produtos[i]
      const ambiente = produto.getString('ambiente') || 'teste'
      let reguaRec = null
      try {
        const aprovadas = $app.findRecordsByFilter(
          'regras_produto',
          "produto = {:p} && status = 'aprovada' && ambiente = {:a}",
          '-versao',
          1,
          0,
          { p: produto.id, a: ambiente },
        )
        if (aprovadas.length > 0) reguaRec = aprovadas[0]
      } catch (_) {}
      if (!reguaRec) continue

      try {
        const regua = {
          metodo: reguaRec.getString('metodo'),
          criterios: JSON.parse(reguaRec.getString('criterios') || '[]'),
          regras_eliminatorias: JSON.parse(reguaRec.getString('regras_eliminatorias') || '[]'),
          faixas: JSON.parse(reguaRec.getString('faixas') || '[]'),
        }
        const resultado = pontuar(regua, dados)

        const nova = new Record($app.findCollectionByNameOrId('pontuacoes'))
        nova.set('owner', lead.getString('owner'))
        nova.set('lead', lead.id)
        nova.set('produto', produto.id)
        nova.set('versao', reguaRec.getInt('versao'))
        nova.set('dados_hash', dadosHash)
        nova.set('status', resultado.status)
        nova.set('valor', resultado.valor)
        nova.set('faixa', resultado.faixa)
        nova.set('motivos', JSON.stringify(resultado.motivos))
        nova.set('fontes', JSON.stringify(fontes))
        nova.set('ambiente', ambiente)
        $app.save(nova)

        mapaPonteiros[produto.id] = nova.id
        mudouPonteiro = true
      } catch (errProduto) {
        $app
          .logger()
          .warn(
            'pontuação automática: falha no produto',
            'produto',
            produto.id,
            'err',
            String(errProduto),
          )
      }
    }

    if (mudouPonteiro) {
      lead.set('notas_atuais', JSON.stringify(mapaPonteiros))
      $app.save(lead)
    }
  } catch (err) {
    $app.logger().warn('pontuação automática falhou', 'lead', lead.id, 'err', String(err))
  }
  return e.next()
}, 'leads')
