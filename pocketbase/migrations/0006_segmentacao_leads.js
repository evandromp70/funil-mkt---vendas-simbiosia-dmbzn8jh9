migrate(
  (app) => {
    // ---------- 1. Campos estruturados de segmentação na coleção leads ----------
    const leads = app.findCollectionByNameOrId('leads')
    const addIfMissing = (name, type, opts = {}) => {
      if (!leads.fields.some((f) => f.name === name)) {
        leads.fields.add(new type({ name, required: false, ...opts }))
      }
    }
    addIfMissing('segmento', TextField)
    addIfMissing('uf', TextField)
    addIfMissing('cidade', TextField)
    addIfMissing('lista_origem', TextField)
    app.save(leads)

    // ---------- 2. Backfill: parseia observações existentes (formato da Fábrica) ----------
    const parseObs = (obs) => {
      const res = { segmento: '', uf: '', cidade: '', lista: '' }
      if (!obs) return res
      const setor = obs.match(/Setor:\s*([^|]+)/)
      const uf = obs.match(/UF:\s*([^|]+)/)
      const cidade = obs.match(/Cidade:\s*([^|]+)/)
      const lista = obs.match(/Lista:\s*([^|]+)/)
      if (setor) res.segmento = setor[1].trim()
      if (uf) res.uf = uf[1].trim()
      if (cidade) res.cidade = cidade[1].trim()
      if (lista) res.lista = lista[1].trim()
      return res
    }

    try {
      const todos = $app.findRecordsByFilter('leads', '', '', 0, 0)
      let n = 0
      for (const l of todos) {
        const p = parseObs(l.getString('observacoes'))
        let mudou = false
        if (p.segmento && !l.getString('segmento')) {
          l.set('segmento', p.segmento)
          mudou = true
        }
        if (p.uf && !l.getString('uf')) {
          l.set('uf', p.uf)
          mudou = true
        }
        if (p.cidade && !l.getString('cidade')) {
          l.set('cidade', p.cidade)
          mudou = true
        }
        if (p.lista && !l.getString('lista_origem')) {
          l.set('lista_origem', p.lista)
          mudou = true
        }
        if (mudou) {
          $app.save(l)
          n++
        }
      }
      console.log('backfill segmentacao: ' + n + ' leads atualizados')
    } catch (err) {
      console.log('backfill falhou: ' + String(err))
    }
  },
  (app) => {
    const leads = app.findCollectionByNameOrId('leads')
    for (const f of ['segmento', 'uf', 'cidade', 'lista_origem']) {
      const campo = leads.fields.filter((x) => x.name === f)
      for (const c of campo) leads.fields.remove(c.id)
    }
    app.save(leads)
  },
)
