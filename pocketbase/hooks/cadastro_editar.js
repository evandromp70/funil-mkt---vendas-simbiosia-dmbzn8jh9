// Task "edição de lead direto no detalhe" (decisões do José, 16/10/2026): proteção de
// escrita em empresas/pessoas. Admin edita tudo; vendedor só edita empresa/pessoa usadas
// EXCLUSIVAMENTE por leads dele (compartilhada/sem vínculo → 403). owner imutável.
// F2-T01: recuperado do Skip 50182 (fonte executável) para o repositório.
onRecordUpdateRequest(
  (e) => {
    const papel = e.auth ? e.auth.getString('role') : ''
    const rec = e.record
    const antes = rec.original()

    if (antes.getString('owner') && rec.getString('owner') !== antes.getString('owner'))
      throw new BadRequestError('owner é imutável.')

    if (papel === 'admin') return e.next()

    const campoLead = rec.collection().name === 'empresas' ? 'empresa' : 'pessoa'
    let leads = []
    try {
      leads = $app.findRecordsByFilter('leads', campoLead + ' = {:id}', '', 0, 0, { id: rec.id })
    } catch (_) {
      leads = []
    }
    const ehDonoDeTodos = leads.length > 0 && leads.every((l) => l.getString('owner') === e.auth.id)
    if (!ehDonoDeTodos)
      throw new ForbiddenError(
        'Vendedor só edita empresa/pessoa usadas exclusivamente por leads dele — entidade compartilhada ou sem vínculo pede admin.',
      )
    return e.next()
  },
  'empresas',
  'pessoas',
)
