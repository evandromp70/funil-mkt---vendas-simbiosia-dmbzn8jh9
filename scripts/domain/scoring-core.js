// SPEC-1-005 (task 3b93879f): motor de pontuação por produto — CA-1-005-01/02.
// FONTE ÚNICA do cálculo (SPEC regra 4): função pura, sem rede/estado/Node API.
// O hook scoring_calcular.js embute esta fonte inline (VM própria do Skip, sem require).
// Regras: ponderado = 100×soma(peso×resultado)/soma(pesos), 2 casas; pontos = soma dos
// pontos; eliminatória ANTES da soma; obrigatório ausente → pendente nomeado; opcional
// ausente → falso com peso no denominador; faixas aprovadas com borda registrada.
//
// (O gerador remove os "export " antes de embutir no hook; os exports abaixo são para o
// runner de regras. Ver SCORE-FONTE nos testes.)

var OPERADORES_VALIDOS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'exists']

var avaliarTermo = function (termo, dados) {
  var presente = Object.prototype.hasOwnProperty.call(dados, termo.campo) && dados[termo.campo] !== null && dados[termo.campo] !== undefined && dados[termo.campo] !== ''
  if (!presente) return 'ausente'
  var v = dados[termo.campo]
  switch (termo.operador) {
    case 'eq': return v === termo.valor
    case 'neq': return v !== termo.valor
    case 'gt': return v > termo.valor
    case 'gte': return v >= termo.valor
    case 'lt': return v < termo.valor
    case 'lte': return v <= termo.valor
    case 'in': return Array.isArray(termo.valor) && termo.valor.indexOf(v) !== -1
    case 'contains':
      if (Array.isArray(v)) return v.indexOf(termo.valor) !== -1
      return String(v).indexOf(String(termo.valor)) !== -1
    case 'exists': return true
    default: return false
  }
}

// avalia um critério (termo ou grupo): 'satisfeito' | 'nao_satisfeito' | 'ausente'
var avaliarCriterio = function (c, dados) {
  if (c.tipo === 'grupo') {
    var resultados = (c.filhos || []).map(function (f) { return avaliarTermo(f, dados) })
    var ausentes = resultados.filter(function (r) { return r === 'ausente' })
    var verdades = resultados.filter(function (r) { return r === true }).length
    if (ausentes.length === resultados.length) return 'ausente'
    if (c.combinacao === 'AND') return verdades === resultados.length ? 'satisfeito' : 'nao_satisfeito'
    return verdades > 0 ? 'satisfeito' : 'nao_satisfeito'
  }
  return avaliarTermo(c, dados)
}

// faixa pela régua (borda registrada): de inclusiva; ate inclusiva só se borda_inclusiva
var faixaDe = function (valor, faixas) {
  for (var i = 0; i < faixas.length; i++) {
    var f = faixas[i]
    var deOk = valor >= f.de
    var ateOk = f.borda_inclusiva ? valor <= f.ate : valor < f.ate
    if (deOk && ateOk) return f.letra
  }
  return null
}

// motor principal: entrada { regua, dados } → { status, valor, faixa, motivos }
var pontuar = function (entrada) {
  var regua = entrada.regua
  var dados = entrada.dados || {}
  var motivos = []

  // 1. eliminatórias ANTES da soma
  var eliminatorias = regua.regras_eliminatorias || []
  for (var i = 0; i < eliminatorias.length; i++) {
    var e = eliminatorias[i]
    var rE = avaliarCriterio(e, dados)
    var eSatisfeito = rE === 'satisfeito' || rE === true
    if (eSatisfeito) {
      motivos.push({ id: e.id, resultado: 'eliminado', descricao: 'Regra eliminatória satisfeita (' + e.campo + ' ' + e.operador + ' ' + JSON.stringify(e.valor) + ') — lead eliminado antes da soma.' })
      return { status: 'eliminada', valor: null, faixa: null, motivos: motivos }
    }
  }

  // 2. soma ponderada/pontos; obrigatório ausente → pendente (nomeado)
  var somaPesos = 0
  var somaPonderada = 0
  var somaPontos = 0
  var criterios = regua.criterios || []
  for (var j = 0; j < criterios.length; j++) {
    var c = criterios[j]
    var r = avaliarCriterio(c, dados)
    var peso = typeof c.peso === 'number' ? c.peso : 0
    var obrigatorio = !!c.obrigatorio
    var descricaoCondicao = c.tipo === 'grupo'
      ? 'grupo ' + c.combinacao + ' (' + (c.filhos || []).length + ' filhos)'
      : c.campo + ' ' + c.operador + ' ' + JSON.stringify(c.valor)

    if (r === 'ausente' && obrigatorio) {
      motivos.push({ id: c.id, resultado: 'pendente', descricao: 'Dado obrigatório ausente: ' + (c.tipo === 'grupo' ? 'filhos do grupo' : c.campo) + ' — pontuação pendente, sem nota inventada.' })
      return { status: 'pendente', valor: null, faixa: null, motivos: motivos }
    }
    if (r === 'ausente') r = false // opcional ausente → falso; peso fica no denominador

    var satisfeito = r === 'satisfeito' || r === true
    if (satisfeito) {
      somaPonderada += peso
      if (typeof c.pontos === 'number') somaPontos += c.pontos
      motivos.push({ id: c.id, resultado: 'satisfeito', descricao: descricaoCondicao + ' — satisfeito (' + (regua.metodo === 'ponderado' ? 'peso ' + peso : 'pontos ' + (c.pontos || 0)) + ').' })
    } else {
      motivos.push({ id: c.id, resultado: 'nao_satisfeito', descricao: descricaoCondicao + ' — não satisfeito.' })
    }
    somaPesos += peso
  }

  if (regua.metodo === 'ponderado') {
    if (somaPesos <= 0) {
      return { status: 'pendente', valor: null, faixa: null, motivos: [{ id: 'soma', resultado: 'pendente', descricao: 'Soma dos pesos inválida — régua sem soma positiva.' }] }
    }
    var valor = Math.round((100 * somaPonderada) / somaPesos * 100) / 100
    var faixa = faixaDe(valor, regua.faixas || [])
    return { status: 'calculada', valor: valor, faixa: faixa, motivos: motivos }
  }
  // pontos: domínio definido na própria régua
  var faixaPontos = faixaDe(somaPontos, regua.faixas || [])
  return { status: 'calculada', valor: somaPontos, faixa: faixaPontos, motivos: motivos }
}

// exports para o runner (o gerador remove "export " ao embutir no hook)
export { pontuar, faixaDe, avaliarTermo, avaliarCriterio }
