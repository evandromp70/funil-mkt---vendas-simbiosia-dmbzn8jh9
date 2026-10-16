// Task "edição de lead direto no detalhe" (decisões do José, 16/10/2026): proteção de
// escrita em empresas/pessoas. Admin edita tudo. Vendedor só edita empresa/pessoa usadas
// EXCLUSIVAMENTE por leads dele (empresa compartilhada → negado, 403). owner imutável.
// Lógica INLINE no callback (VM própria do Skip). Toda via termina em e.next() ou throw.
onRecordUpdate(
  (e) => {
    const rec = e.record
    const antes = rec.original()

    // admin passa sem restrição de dono (owner continua imutável)
    const papel = e.auth ? e.auth.getString('role') : ''
    if (papel === 'admin') {
      if (antes.getString('owner') && rec.getString('owner') !== antes.getString('owner'))
        throw new BadRequestError('owner é imutável.')
      return e.next()
    }

    // vendedor: precisa ser dono de TODOS os leads que usam a entidade
    const colecao = rec.collection().name
    const campoLead = colecao === 'empresas' ? 'empresa' : 'pessoa'
    let leads = []
    try {
      leads = $app.findRecordsByFilter('leads', campoLead + ' = {:id}', '', 0, 0, { id: rec.id })
    } catch (_) {
      leads = []
    }
    const ehDonoDeTodos = leads.length > 0 && leads.every((l) => l.getString('owner') === e.auth.id)
    // entidade sem lead vinculado: só admin edita (evita edição fora de contexto)
    if (!ehDonoDeTodos)
      throw new ForbiddenError(
        'Vendedor só edita empresa/pessoa usadas exclusivamente por leads dele — entidade compartilhada ou sem vínculo pede admin.',
      )

    if (antes.getString('owner') && rec.getString('owner') !== antes.getString('owner'))
      throw new BadRequestError('owner é imutável.')
    return e.next()
  },
  'empresas',
  'pessoas',
)
