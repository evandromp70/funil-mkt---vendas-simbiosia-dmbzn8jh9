routerAdd(
  'POST',
  '/backend/v1/funil/atribuir-lote',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação necessária')
    // apenas admin (José/Evandro) pode atribuir leads em lote
    if (auth.getString('role') !== 'admin') {
      return e.forbiddenError('Apenas administradores podem atribuir leads em lote')
    }

    const body = e.requestInfo().body || {}
    const leadIds = Array.isArray(body.leadIds) ? body.leadIds : []
    const vendedorId = body.vendedorId || ''
    if (leadIds.length === 0) return e.badRequestError('leadIds é obrigatório')
    if (!vendedorId) return e.badRequestError('vendedorId é obrigatório')

    // valida que o vendedor existe e não é admin (evita atribuir a outro admin por engano)
    let vendedor
    try {
      vendedor = $app.findRecordById('_pb_users_auth_', vendedorId)
    } catch (err) {
      return e.notFoundError('Vendedor não encontrado')
    }
    if (vendedor.getString('role') !== 'vendedor') {
      return e.badRequestError('O destino deve ser um usuário com perfil vendedor')
    }

    let atribuidos = 0
    let erros = 0
    for (const id of leadIds) {
      try {
        const lead = $app.findRecordById('leads', id)
        lead.set('owner', vendedorId)
        $app.save(lead)
        atribuidos++
      } catch (err) {
        erros++
      }
    }

    return e.json(200, { atribuidos, erros, vendedorId })
  },
  $apis.requireAuth(),
)
