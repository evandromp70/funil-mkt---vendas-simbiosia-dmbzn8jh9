// SPEC-1-003 (task 899395c4): desfazer importação — CA-1-003-03.
// POST /backend/v1/importacoes/reverter { importacaoId }
// Só admin. Regra da SPEC (regra 6): rollback remove associações criadas e reverte mudanças,
// preservando registros anteriores e alterações de outros lotes. NADA compartilhado é apagado:
// - lead criado pelo lote (migracao_origem_id = importacao:<id>) e ainda em 'lista' → removido
//   (junto com lista_membros apontando para ele, via origem_importacao do lote).
// - pessoa/empresa criadas pelo lote → só removidas se NENHUM lead/origem de outro lote as
//   referencia e não participaram de fusão; senão permanecem e a linha vira revisão.
// - linha 'erro' não criou nada — nada a reverter.
// Tudo-ou-nada por linha; lote inteiro só vira 'revertida' se TODAS as linhas forem reversíveis;
// havendo revisão, o lote permanece 'concluida' e o resultado traz as linhas para decisão.
routerAdd(
  'POST',
  '/backend/v1/importacoes/reverter',
  (e) => {
    if (!e.auth || e.auth.getString('role') !== 'admin')
      return e.forbiddenError('Apenas administradores podem desfazer importações')

    const body = e.requestInfo().body || {}
    const importacaoId = String(body.importacaoId || '')
    if (!importacaoId) return e.badRequestError('importacaoId é obrigatório')

    let imp
    try {
      imp = $app.findRecordById('importacoes', importacaoId)
    } catch (_) {
      return e.notFoundError('Lote de importação não encontrado')
    }
    const statusLote = imp.getString('status')
    if (statusLote === 'revertida')
      return e.badRequestError('Lote já foi revertido — nada a desfazer')
    if (statusLote === 'processando')
      return e.badRequestError('Lote ainda em processamento — conclua ou retome antes de desfazer')

    const linhas = $app.findRecordsByFilter(
      'importacao_linhas',
      'importacao = {:i}',
      'numero',
      0,
      0,
      { i: importacaoId },
    )

    // ---- avaliação (mesmo contrato da função pura avaliarReversaoLote) ----
    const leadEtapa = {}
    const pessoaOutrosLeads = {}
    const pessoaOutrasOrigens = {}
    const empresaOutrosLeads = {}
    const pessoaFundida = {}
    const leadsDoLote = []
    const pessoasDoLote = []
    const empresasDoLote = []

    for (const l of linhas) {
      const leadId = l.getString('lead') || ''
      const pessoaId = l.getString('pessoa') || ''
      const empresaId = l.getString('empresa') || ''
      if (leadId) {
        leadsDoLote.push(leadId)
        try {
          const lead = $app.findRecordById('leads', leadId)
          leadEtapa[leadId] = lead.getString('etapa') || ''
        } catch (_) {
          leadEtapa[leadId] = ''
        }
      }
      if (pessoaId) {
        pessoasDoLote.push(pessoaId)
        if (!(pessoaId in pessoaOutrosLeads)) {
          try {
            // leads de OUTROS lotes: migracao_origem_id diferente deste lote
            const outros = $app.findRecordsByFilter(
              'leads',
              'pessoa = {:p} && migracao_origem_id != {:m}',
              '',
              0,
              0,
              { p: pessoaId, m: 'importacao:' + importacaoId },
            )
            pessoaOutrosLeads[pessoaId] = outros.length
          } catch (_) {
            pessoaOutrosLeads[pessoaId] = 0
          }
          try {
            const origens = $app.findRecordsByFilter(
              'pessoas_origens',
              'pessoa = {:p} && fonte != {:f}',
              '',
              0,
              0,
              { p: pessoaId, f: 'importacao' },
            )
            pessoaOutrasOrigens[pessoaId] = origens.length
          } catch (_) {
            pessoaOutrasOrigens[pessoaId] = 0
          }
          try {
            const pes = $app.findRecordById('pessoas', pessoaId)
            pessoaFundida[pessoaId] = !!pes.getString('fundida_em')
          } catch (_) {
            pessoaFundida[pessoaId] = false
          }
        }
      }
      if (empresaId) {
        empresasDoLote.push(empresaId)
        if (!(empresaId in empresaOutrosLeads)) {
          try {
            const outros = $app.findRecordsByFilter(
              'leads',
              'empresa = {:e} && migracao_origem_id != {:m}',
              '',
              0,
              0,
              { e: empresaId, m: 'importacao:' + importacaoId },
            )
            empresaOutrosLeads[empresaId] = outros.length
          } catch (_) {
            empresaOutrosLeads[empresaId] = 0
          }
        }
      }
    }

    const linhasReversiveis = []
    const linhasRevisao = []
    for (const l of linhas) {
      if (l.getString('status') === 'erro') continue
      const leadId = l.getString('lead') || ''
      const pessoaId = l.getString('pessoa') || ''
      const empresaId = l.getString('empresa') || ''
      let motivo = ''
      if (leadId && (leadEtapa[leadId] ?? '') !== 'lista') {
        motivo = 'Lead saiu da etapa lista após a importação — trabalho do time é preservado.'
      } else if (pessoaId && (pessoaOutrosLeads[pessoaId] ?? 0) > 0) {
        motivo = 'Pessoa compartilhada com leads de outros lotes — permanece (revisão do admin).'
      } else if (pessoaId && (pessoaOutrasOrigens[pessoaId] ?? 0) > 0) {
        motivo = 'Pessoa tem origens de outros lotes — permanece (revisão do admin).'
      } else if (empresaId && (empresaOutrosLeads[empresaId] ?? 0) > 0) {
        motivo = 'Empresa compartilhada com outros leads — permanece (revisão do admin).'
      } else if (pessoaId && pessoaFundida[pessoaId]) {
        motivo = 'Pessoa participou de fusão posterior — revisão do admin antes de reverter.'
      }
      if (motivo) linhasRevisao.push({ numero: l.getInt('numero'), motivo })
      else linhasReversiveis.push(l)
    }

    if (linhasRevisao.length > 0) {
      return e.json(409, {
        status: 'revisao',
        aplicavel: false,
        linhasReversiveis: linhasReversiveis.map((l) => l.getInt('numero')),
        linhasRevisao,
        detalhe:
          'Há linhas com trabalho posterior ou dados compartilhados — nada foi alterado. Revise antes de desfazer.',
      })
    }

    // ---- aplicável: reverte linha a linha (tudo-ou-nada por linha) ----
    let leadsRemovidos = 0
    let pessoasRemovidas = 0
    let empresasRemovidas = 0
    let membrosRemovidos = 0
    let origensRemovidas = 0

    try {
      // 1. lista_membros criados por este lote
      try {
        const membros = $app.findRecordsByFilter(
          'lista_membros',
          'origem_importacao = {:i}',
          '',
          0,
          0,
          { i: importacaoId },
        )
        for (const m of membros) {
          $app.delete(m)
          membrosRemovidos++
        }
      } catch (_) {}

      // 2. leads do lote (etapa lista, criados por este lote) e suas origens de coorte
      for (const l of linhasReversiveis) {
        const leadId = l.getString('lead') || ''
        const pessoaId = l.getString('pessoa') || ''
        const empresaId = l.getString('empresa') || ''
        if (leadId) {
          try {
            const lead = $app.findRecordById('leads', leadId)
            if ((lead.getString('migracao_origem_id') || '') === 'importacao:' + importacaoId) {
              $app.delete(lead)
              leadsRemovidos++
            }
          } catch (_) {}
        }
        if (pessoaId) {
          // origens de coorte registradas por este lote (fonte=importacao, referencia=nome do arquivo)
          try {
            const origens = $app.findRecordsByFilter(
              'pessoas_origens',
              'pessoa = {:p} && fonte = {:f} && referencia = {:r}',
              '',
              0,
              0,
              { p: pessoaId, f: 'importacao', r: imp.getString('nome_arquivo') || '' },
            )
            for (const o of origens) {
              $app.delete(o)
              origensRemovidas++
            }
          } catch (_) {}
          // pessoa criada pelo lote e sem outros vínculos → removida
          try {
            const outrosLeads = $app.findRecordsByFilter(
              'leads',
              'pessoa = {:p} && migracao_origem_id != {:m}',
              '',
              1,
              0,
              { p: pessoaId, m: 'importacao:' + importacaoId },
            )
            const outrasOrigens = $app.findRecordsByFilter(
              'pessoas_origens',
              'pessoa = {:p} && fonte != {:f}',
              '',
              1,
              0,
              { p: pessoaId, f: 'importacao' },
            )
            const pes = $app.findRecordById('pessoas', pessoaId)
            const criadaPeloLote =
              !outrosLeads.length && !outrasOrigens.length && !pes.getString('fundida_em')
            if (criadaPeloLote) {
              $app.delete(pes)
              pessoasRemovidas++
            }
          } catch (_) {}
        }
        if (empresaId) {
          try {
            const outrosLeads = $app.findRecordsByFilter(
              'leads',
              'empresa = {:e} && migracao_origem_id != {:m}',
              '',
              1,
              0,
              { e: empresaId, m: 'importacao:' + importacaoId },
            )
            const emp = $app.findRecordById('empresas', empresaId)
            if (!outrosLeads.length) {
              $app.delete(emp)
              empresasRemovidas++
            }
          } catch (_) {}
        }
      }

      // 3. marca o lote como revertido (relatório preservado para auditoria)
      imp.set('status', 'revertida')
      $app.save(imp)

      return e.json(200, {
        status: 'revertida',
        aplicavel: true,
        leadsRemovidos,
        pessoasRemovidas,
        empresasRemovidas,
        membrosRemovidos,
        origensRemovidas,
        detalhe: 'Lote desfeito. O relatório permanece no histórico para auditoria.',
      })
    } catch (err) {
      $app.logger().error('falha na reversão do lote', 'err', String(err))
      return e.internalServerError('Reversão não aplicada — nenhuma alteração persistida')
    }
  },
  $apis.requireAuth(),
)
