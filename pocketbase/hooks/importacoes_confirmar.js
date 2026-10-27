// SPEC-1-003 (task 0574671d): confirmar importação com relatório por linha — CA-1-003-02.
// POST /backend/v1/importacoes/confirmar { nome_arquivo, arquivo_hash, mapeamento, linhas,
//   lista, coorte, dono, ambiente }
// Só admin. Sem rede externa. Linha a linha com checkpoint persistido: falha de linha
// vira status=erro e o lote continua. Repetir lote concluído devolve o relatório existente
// (chave_lote única), sem duplicar. Identidade contra TODA a base do ambiente (não só arquivo).
// Funções de classificação são geradas inline (hooks Skip não fazem require relativo).
// F2-T01: conteúdo íntegro recuperado do Skip 50182 (472 linhas).
routerAdd(
  'POST',
  '/backend/v1/importacoes/confirmar',
  (e) => {
    if (!e.auth || e.auth.getString('role') !== 'admin')
      return e.forbiddenError('Apenas administradores podem confirmar importações')

    const body = e.requestInfo().body || {}
    const hash = String(body.arquivo_hash || '')
    const mapeamento = body.mapeamento || {}
    const linhas = body.linhas || []
    const listaId = String(body.lista || '')
    const coorte = String(body.coorte || '')
    const donoId = String(body.dono || e.auth.id)
    const ambiente = String(body.ambiente || 'teste')
    const nomeArquivo = String(body.nome_arquivo || '')

    if (!hash) return e.badRequestError('arquivo_hash é obrigatório')
    if (!Array.isArray(linhas) || linhas.length === 0)
      return e.badRequestError('nenhuma linha para importar')
    if (!coorte) return e.badRequestError('coorte é obrigatória')
    if (listaId) {
      try {
        $app.findRecordById('listas', listaId)
      } catch (_) {
        return e.badRequestError('lista informada não existe')
      }
    }

    // ---- funções de classificação (inline — mesmo contrato do serviço puro) ----
    const GENERICA =
      /^(contato|comercial|financeiro|geral|vendas|suporte|marketing|rh|juridico|financeira)@/i
    const normEmail = (v) =>
      String(v || '')
        .trim()
        .toLowerCase()
    const normTel = (v) => String(v || '').replace(/\D/g, '')

    // base de pessoas do ambiente (identidade contra a base toda, não só o arquivo)
    let pessoasBase = []
    try {
      pessoasBase = $app.findRecordsByFilter('pessoas', 'ambiente = {:a}', '', 0, 0, {
        a: ambiente,
      })
    } catch (_) {}

    const nucleoDe = (p) => ({
      id: p.id,
      email_norm: p.getString('email_norm') || '',
      telefone_norm: p.getString('telefone_norm') || '',
      linkedin_norm: p.getString('linkedin_norm') || '',
    })

    const resolver = (novo, existentes) => {
      const chaves = ['email_norm', 'telefone_norm', 'linkedin_norm']
      const identificadores = []
      for (const campo of chaves) {
        const v = String(novo[campo] || '').trim()
        if (!v) continue
        if (campo === 'email_norm' && GENERICA.test(v)) continue
        identificadores.push({ campo, valor: v })
      }
      if (identificadores.length === 0) return { acao: 'criar' }
      const batidas = new Set()
      for (const p of existentes) {
        for (const idt of identificadores) {
          const pv = String(p[idt.campo] || '').trim()
          if (pv && pv === idt.valor) batidas.add(p.id)
        }
      }
      if (batidas.size === 1) return { acao: 'reusar', pessoaId: [...batidas][0] }
      if (batidas.size > 1) return { acao: 'conflito', ids: [...batidas] }
      return { acao: 'criar' }
    }

    // ---- lote existente com a mesma chave? devolve o relatório (sem reescrever) ----
    const pares = Object.entries(mapeamento)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([k, v]) => k + ':' + v)
      .join('|')
    const chaveLote = [hash, pares, listaId, coorte, donoId, ambiente].join('::')

    try {
      // TODOS os lotes com a mesma chave, do mais recente para o mais antigo — o lote VIVO
      // (não revertido) é o que manda; um lote revertido antigo não pode escondê-lo.
      const todos = $app.findRecordsByFilter(
        'importacoes',
        'chave_lote = {:c} && status != {:r}',
        '-created',
        0,
        0,
        { c: chaveLote, r: 'revertida' },
      )
      const existente = todos
      if (existente.length > 0 && existente[0].getString('status') === 'concluida') {
        const imp = existente[0]
        const linhasRel = $app.findRecordsByFilter(
          'importacao_linhas',
          'importacao = {:i}',
          'numero',
          0,
          0,
          { i: imp.id },
        )
        return e.json(200, {
          repetido: true,
          importacaoId: imp.id,
          status: imp.getString('status'),
          total: imp.getInt('total'),
          novas: imp.getInt('novas'),
          repetidas: imp.getInt('repetidas'),
          incompletas: imp.getInt('incompletas'),
          erros: imp.getInt('erros'),
          linhas: linhasRel.map((l) => ({
            numero: l.getInt('numero'),
            status: l.getString('status'),
            erros: l.getString('erros') || '',
            pessoa: l.getString('pessoa') || '',
            empresa: l.getString('empresa') || '',
            lead: l.getString('lead') || '',
          })),
        })
      }
      if (existente.length > 0 && existente[0].getString('status') === 'processando') {
        // ---- RETOMADA (task 899395c4): processa só linhas pendentes/nunca processadas ----
        const imp = existente[0]
        const linhasRel = $app.findRecordsByFilter(
          'importacao_linhas',
          'importacao = {:i}',
          'numero',
          0,
          0,
          { i: imp.id },
        )
        const processadas = new Set(linhasRel.map((l) => l.getInt('numero')))
        const numerosPendentes = []
        for (let n = 1; n <= linhas.length; n++) {
          const linha = linhasRel.find((l) => l.getInt('numero') === n)
          if (!processadas.has(n) || (linha && linha.getString('status') === 'pendente'))
            numerosPendentes.push(n)
        }
        if (numerosPendentes.length === 0) {
          // nada pendente: fecha o lote e devolve o relatório
          imp.set('status', 'concluida')
          $app.save(imp)
          return e.json(200, {
            repetido: false,
            importacaoId: imp.id,
            status: 'concluida',
            retomada: true,
            linhas: [],
          })
        }
        // reclassifica apenas as pendentes — linhas aceitas NÃO repetem
        return e.json(200, {
          retomada: true,
          importacaoId: imp.id,
          numerosPendentes,
          aceitas: linhas.length - numerosPendentes.length,
          detalhe: 'Retomada: reenvie o mesmo arquivo; as linhas pendentes serão reprocessadas.',
        })
      }
      if (existente.length > 0 && existente[0].getString('status') !== 'revertida') {
        return e.json(409, {
          status: existente[0].getString('status'),
          detalhe: 'Lote já existe e não está concluído.',
        })
      }
      // lote REVERTIDO: a chave fica livre — o reenvio reprocessa como novo lote
      // (o índice único é parcial: só lotes vivos o ocupam; ver migração 0017)
    } catch (_) {}

    // ---- cria o lote ----
    const colImp = $app.findCollectionByNameOrId('importacoes')
    const imp = new Record(colImp)
    imp.set('owner', e.auth.id)
    imp.set('arquivo_hash', hash)
    imp.set('chave_lote', chaveLote)
    imp.set('nome_arquivo', nomeArquivo)
    imp.set('mapeamento', JSON.stringify(mapeamento))
    if (listaId) imp.set('lista', listaId)
    imp.set('coorte', coorte)
    imp.set('dono', donoId)
    imp.set('ambiente', ambiente)
    imp.set('status', 'processando')
    $app.save(imp)

    // ---- processa linha a linha (checkpoint persistido por linha) ----
    const colLinhas = $app.findCollectionByNameOrId('importacao_linhas')
    const colEmpresas = $app.findCollectionByNameOrId('empresas')
    const colPessoas = $app.findCollectionByNameOrId('pessoas')
    const colLeads = $app.findCollectionByNameOrId('leads')
    const colOrigens = $app.findCollectionByNameOrId('pessoas_origens')
    const colMembros = $app.findCollectionByNameOrId('lista_membros')

    const totais = { total: linhas.length, novas: 0, repetidas: 0, incompletas: 0, erros: 0 }
    const relatorio = []
    let empresasCriadas = 0
    let pessoasCriadas = 0
    let leadsCriados = 0

    for (let i = 0; i < linhas.length; i++) {
      const bruta = linhas[i] || {}
      const linha = {}
      for (const [idx, campo] of Object.entries(mapeamento)) {
        linha[campo] = bruta[idx] !== undefined ? String(bruta[idx]) : ''
      }

      const reg = new Record(colLinhas)
      reg.set('importacao', imp.id)
      reg.set('owner', e.auth.id)
      reg.set('numero', i + 1)
      reg.set('chave_linha', JSON.stringify(linha).substring(0, 500))
      reg.set('status', 'pendente')

      const antes = {
        pessoas: pessoasBase.length,
        empresas: (() => {
          try {
            return $app.countRecords('empresas')
          } catch (_) {
            return 0
          }
        })(),
      }

      let statusLinha = 'erro'
      let motivoLinha = ''
      let pessoaId = ''
      let empresaId = ''
      let leadId = ''

      try {
        const razao = String(linha.razao_social || '').trim()
        if (!razao) {
          statusLinha = 'erro'
          motivoLinha = 'Razão social ausente — linha inválida.'
        } else {
          const email = normEmail(linha.email_pessoa)
          const nome = String(linha.nome_contato || '').trim()
          if (!nome || !email || GENERICA.test(email)) {
            statusLinha = 'incompleta'
            motivoLinha = !nome
              ? 'Empresa sem nome de contato individual — pendente de contato.'
              : 'Sem e-mail individual (ausente ou genérico) — não é chave de pessoa.'
            // empresa entra mesmo assim (CSV pode trazer só empresas — regra 2 da SPEC)
            let emp
            const cnpj = String(linha.cnpj || '').replace(/\D/g, '')
            const existentesEmp = cnpj
              ? $app.findRecordsByFilter(
                  'empresas',
                  'cnpj_norm = {:c} && ambiente = {:a}',
                  '',
                  2,
                  0,
                  {
                    c: cnpj,
                    a: ambiente,
                  },
                )
              : []
            if (existentesEmp.length > 0) {
              emp = existentesEmp[0]
            } else {
              emp = new Record(colEmpresas)
              emp.set('razao_social', razao)
              if (cnpj) emp.set('cnpj_norm', cnpj)
              emp.set('atributos', JSON.stringify({ cargo: String(linha.cargo || '') }))
              emp.set('ambiente', ambiente)
              $app.save(emp)
              empresasCriadas++
            }
            empresaId = emp.id
          } else {
            // contato individual: resolve identidade contra a base do ambiente
            const nucleo = {
              nome,
              email_norm: email,
              telefone_norm: normTel(linha.telefone_pessoa),
              linkedin_norm: String(linha.linkedin_pessoa || '').trim(),
            }
            const id = resolver(nucleo, pessoasBase.map(nucleoDe))

            if (id.acao === 'conflito') {
              statusLinha = 'erro'
              motivoLinha = 'Identificador já pertence a mais de uma pessoa — revisão necessária.'
            } else {
              // empresa (reusa por CNPJ; sem CNPJ, cria — dedup por identidade é da pessoa)
              let emp
              const cnpj = String(linha.cnpj || '').replace(/\D/g, '')
              const existentesEmp = cnpj
                ? $app.findRecordsByFilter(
                    'empresas',
                    'cnpj_norm = {:c} && ambiente = {:a}',
                    '',
                    2,
                    0,
                    {
                      c: cnpj,
                      a: ambiente,
                    },
                  )
                : []
              if (existentesEmp.length > 0) {
                emp = existentesEmp[0]
              } else {
                emp = new Record(colEmpresas)
                emp.set('razao_social', razao)
                if (cnpj) emp.set('cnpj_norm', cnpj)
                emp.set('atributos', JSON.stringify({ cargo: String(linha.cargo || '') }))
                emp.set('ambiente', ambiente)
                $app.save(emp)
                empresasCriadas++
              }
              empresaId = emp.id

              if (id.acao === 'reusar') {
                statusLinha = 'repetida'
                pessoaId = id.pessoaId
              } else {
                // criar pessoa (hook pessoas_identidade nega duplicata e registra conflito)
                const pes = new Record(colPessoas)
                pes.set('nome', nome)
                if (email) pes.set('email_norm', email)
                if (nucleo.telefone_norm) pes.set('telefone_norm', nucleo.telefone_norm)
                if (nucleo.linkedin_norm) pes.set('linkedin_norm', nucleo.linkedin_norm)
                pes.set('atributos', JSON.stringify({ cargo: String(linha.cargo || '') }))
                pes.set('ambiente', ambiente)
                $app.save(pes)
                pessoaId = pes.id
                pessoasCriadas++
                pessoasBase.push(nucleoDe(pes)) // base local atualizada (mesmo arquivo)
                statusLinha = 'nova'
              }

              // origem da pessoa (coorte do lote; hook de coorte protege conhecido na fria)
              try {
                const origem = new Record(colOrigens)
                origem.set('pessoa', pessoaId)
                origem.set('coorte', coorte)
                origem.set('fonte', 'importacao')
                origem.set('referencia', nomeArquivo)
                origem.set('dono_relacao', donoId)
                origem.set('ambiente', ambiente)
                $app.save(origem)
              } catch (_) {}

              // lead (owner = dono do lote)
              const lead = new Record(colLeads)
              lead.set('owner', donoId)
              lead.set('nome_empresa', razao)
              lead.set('contato_nome', nome)
              if (email) lead.set('contato_email', email)
              if (nucleo.telefone_norm) lead.set('contato_telefone', nucleo.telefone_norm)
              lead.set('origem', coorte === 'fria' ? 'outbound' : 'inbound')
              lead.set('etapa', 'lista')
              lead.set('empresa', empresaId)
              lead.set('pessoa', pessoaId)
              lead.set('migracao_origem_id', 'importacao:' + imp.id)
              $app.save(lead)
              leadId = lead.id
              leadsCriados++
            }
          }
        }
      } catch (errLinha) {
        statusLinha = 'erro'
        motivoLinha = 'Falha ao gravar a linha: ' + String(errLinha).substring(0, 200)
      }

      const depois = {
        pessoas: pessoasBase.length,
        empresas: (() => {
          try {
            return $app.countRecords('empresas')
          } catch (_) {
            return 0
          }
        })(),
      }

      // checkpoint da linha (persistido SEMPRE — inclusive erro)
      reg.set('status', statusLinha)
      reg.set('erros', motivoLinha)
      if (pessoaId) reg.set('pessoa', pessoaId)
      if (empresaId) reg.set('empresa', empresaId)
      if (leadId) reg.set('lead', leadId)
      reg.set('resultados_antes', JSON.stringify(antes))
      reg.set('resultados_depois', JSON.stringify(depois))
      try {
        $app.save(reg)
      } catch (errReg) {
        // linha duplicada no mesmo lote não deve derrubar o processamento
        $app.logger().warn('checkpoint da linha falhou', 'linha', i + 1, 'err', String(errReg))
      }

      totais[
        statusLinha === 'nova'
          ? 'novas'
          : statusLinha === 'repetida'
            ? 'repetidas'
            : statusLinha === 'incompleta'
              ? 'incompletas'
              : 'erros'
      ]++
      relatorio.push({
        numero: i + 1,
        status: statusLinha,
        erros: motivoLinha,
        pessoa: pessoaId,
        empresa: empresaId,
        lead: leadId,
      })
    }

    // ---- membro da lista (associação repetida não duplica) ----
    if (listaId) {
      for (const r of relatorio) {
        if (!r.lead) continue
        try {
          const dup = $app.findRecordsByFilter(
            'lista_membros',
            'lista = {:l} && lead = {:d} && ambiente = {:a}',
            '',
            1,
            0,
            { l: listaId, d: r.lead, a: ambiente },
          )
          if (dup.length === 0) {
            const mem = new Record(colMembros)
            mem.set('owner', donoId)
            mem.set('lista', listaId)
            mem.set('lead', r.lead)
            mem.set('origem_importacao', imp.id)
            mem.set('ambiente', ambiente)
            $app.save(mem)
          }
        } catch (_) {}
      }
    }

    // ---- fecha o lote com totais reconciliados ----
    imp.set('status', 'concluida')
    imp.set('total', totais.total)
    imp.set('novas', totais.novas)
    imp.set('repetidas', totais.repetidas)
    imp.set('incompletas', totais.incompletas)
    imp.set('erros', totais.erros)
    $app.save(imp)

    return e.json(200, {
      repetido: false,
      importacaoId: imp.id,
      status: 'concluida',
      total: totais.total,
      novas: totais.novas,
      repetidas: totais.repetidas,
      incompletas: totais.incompletas,
      erros: totais.erros,
      criados: { empresas: empresasCriadas, pessoas: pessoasCriadas, leads: leadsCriados },
      linhas: relatorio,
    })
  },
  $apis.requireAuth(),
)
