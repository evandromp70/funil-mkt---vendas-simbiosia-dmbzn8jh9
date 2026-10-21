// SPEC-1-006 (task 2e26d650): vínculo único lista×lead — mensagem amigável ao admin.
// O índice único (lista, lead, ambiente) já protege; este hook só torna o erro legível
// (o PocketBase devolve 400 genérico "Failed to create record." em violação de índice).
// Toda via termina em e.next() ou throw (lição v0.0.39 do pessoas_identidade).
onRecordCreate((e) => {
  const novo = e.record
  const lista = novo.getString('lista')
  const lead = novo.getString('lead')
  if (lista && lead) {
    try {
      const duplicados = $app.findRecordsByFilter(
        'lista_membros',
        'lista = {:l} && lead = {:d}',
        '',
        1,
        0,
        { l: lista, d: lead },
      )
      const outros = duplicados.filter((m) => m.id !== novo.id)
      if (outros.length > 0) {
        throw new BadRequestError('Este lead já está na lista.')
      }
    } catch (err) {
      if (err instanceof BadRequestError) throw err
      // falha ao consultar: deixa o índice único decidir (comportamento anterior)
    }
  }
  return e.next()
}, 'lista_membros')
