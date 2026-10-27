// Task "edição de lead direto no detalhe" — rota própria de edição (16/10/2026).
// POST /backend/v1/leads/editar — admin edita tudo; vendedor só lead próprio e
// empresa/pessoa EXCLUSIVA dele. owner imutável; etapa/score NUNCA mudam aqui.
// F2-T01: recuperado do Skip 50182 (fonte executável) para o repositório.
routerAdd(
  'POST',
  '/backend/v1/leads/editar',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    const body = e.requestInfo().body || {}
    const leadId = String(body.leadId || '')
    const dados = body.dados && typeof body.dados === 'object' ? body.dados : null
    const empresa = body.empresa && typeof body.empresa === 'object' ? body.empresa : null
    if (!leadId || !dados) return e.badRequestError('leadId e dados são obrigatórios')

    let lead
    try {
      lead = $app.findRecordById('leads', leadId)
    } catch (_) {
      return e.notFoundError('Lead não encontrado')
    }
    const ehAdmin = e.auth.getString('role') === 'admin'
    if (!ehAdmin && lead.getString('owner') !== e.auth.id)
      return e.forbiddenError('Operador só edita o próprio lead')

    const CAMPOS_LEAD = [
      'nome_empresa',
      'segmento',
      'uf',
      'cidade',
      'contato_nome',
      'contato_email',
      'contato_telefone',
      'observacoes',
    ]
    const patchLead = {}
    for (const campo of CAMPOS_LEAD) {
      if (Object.prototype.hasOwnProperty.call(dados, campo)) {
        const v = dados[campo]
        if (v === null) continue
        patchLead[campo] = String(v)
      }
    }

    let patchEmpresa = null
    let empresaRec = null
    if (empresa) {
      const empresaId = lead.getString('empresa')
      if (!empresaId) return e.badRequestError('Lead sem empresa vinculada')
      try {
        empresaRec = $app.findRecordById('empresas', empresaId)
      } catch (_) {
        return e.notFoundError('Empresa vinculada não encontrada')
      }
      if (!ehAdmin) {
        let leadsDaEmpresa = []
        try {
          leadsDaEmpresa = $app.findRecordsByFilter('leads', 'empresa = {:id}', '', 0, 0, {
            id: empresaId,
          })
        } catch (_) {
          leadsDaEmpresa = []
        }
        const exclusiva =
          leadsDaEmpresa.length > 0 &&
          leadsDaEmpresa.every((l) => l.getString('owner') === e.auth.id)
        if (!exclusiva)
          return e.forbiddenError(
            'Vendedor só edita empresa usada exclusivamente por leads dele — compartilhada pede admin.',
          )
      }
      const CAMPOS_EMP = ['setor', 'porte']
      patchEmpresa = {}
      for (const campo of CAMPOS_EMP) {
        if (Object.prototype.hasOwnProperty.call(empresa, campo)) {
          const v = empresa[campo]
          if (v === null) continue
          patchEmpresa[campo] = String(v)
        }
      }
      if (Object.keys(patchEmpresa).length === 0) patchEmpresa = null
    }

    if (Object.keys(patchLead).length === 0 && !patchEmpresa)
      return e.badRequestError('Nada para atualizar')

    if (Object.keys(patchLead).length > 0) {
      for (const k of Object.keys(patchLead)) lead.set(k, patchLead[k])
      try {
        $app.save(lead)
      } catch (err) {
        return e.badRequestError('Lead inválido: ' + String(err))
      }
    }
    if (patchEmpresa && empresaRec) {
      for (const k of Object.keys(patchEmpresa)) empresaRec.set(k, patchEmpresa[k])
      try {
        $app.save(empresaRec)
      } catch (err) {
        return e.badRequestError('Empresa inválida: ' + String(err))
      }
    }

    return e.json(200, {
      ok: true,
      leadId: leadId,
      camposLead: Object.keys(patchLead),
      camposEmpresa: patchEmpresa ? Object.keys(patchEmpresa) : [],
    })
  },
  $apis.requireAuth(),
)
