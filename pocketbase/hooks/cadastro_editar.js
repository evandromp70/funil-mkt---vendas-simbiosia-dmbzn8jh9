// Task "edição de lead direto no detalhe" (decisões do José, 16/10/2026): proteção de
// escrita em empresas/pessoas. Admin edita tudo; vendedor só edita empresa/pessoa usadas
// EXCLUSIVAMENTE por leads dele (compartilhada/sem vínculo → 403). owner imutável.
// REQUEST HOOK (onRecordUpdateRequest): é o único com e.auth — o model hook
// (onRecordUpdate) roda em qualquer $app.save() SEM contexto HTTP (e.auth indefinido).
// Lógica INLINE no callback (VM própria do Skip). Toda via termina em e.next() ou throw.
onRecordUpdateRequest(
  (e) => {
    const papel = e.auth ? e.auth.getString('role') : ''
    const rec = e.record
    const antes = rec.original()

    // owner é imutável para todos (admin inclusive)
    if (antes.getString('owner') && rec.getString('owner') !== antes.getString('owner'))
      throw new BadRequestError('owner é imutável.')

    if (papel === 'admin') return e.next()

    // vendedor: precisa ser dono de TODOS os leads que usam a entidade
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
