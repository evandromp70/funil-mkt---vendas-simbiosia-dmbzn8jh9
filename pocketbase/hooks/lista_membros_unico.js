// SPEC-1-006 (task 2e26d650): vínculo único lista×lead — mensagem amigável ao admin.
// F2-T01: recuperado do Skip 50182 (fonte executável) para o repositório.
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
    }
  }
  return e.next()
}, 'lista_membros')
