// SPEC-1-003 (task c7240db4): parser de CSV puro para a prévia — CA-1-003-01/04.
// Sem rede, sem dependência: trata vírgula/ponto-e-vírgula, aspas escapadas (""), BOM,
// CRLF/LF e campo multilinha. Malformado e excedente de limite são recusados SEM linhas.
// Fórmulas (=, +, -, @) são neutralizadas como texto (CSV-SEGURANCA).

export type CsvResultado =
  | { ok: true; separador: string; cabecalho: string[]; linhas: string[][]; totalLinhas: number }
  | { ok: false; motivo: string }

const NEUTRAIS = ['=', '+', '-', '@']

// fórmula → texto puro (prefixo apóstrofo, como planilhas fazem)
export const neutralizarFormula = (valor: string): string => {
  const s = valor ?? ''
  if (NEUTRAIS.some((c) => s.startsWith(c))) return "'" + s
  return s
}

// detecta o separador mais frequente FORA de aspas (vírgula vs ponto-e-vírgula)
export const detectarSeparador = (texto: string): ',' | ';' => {
  let virgulas = 0
  let pontos = 0
  let dentro = false
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (ch === '"') dentro = !dentro
    else if (!dentro) {
      if (ch === ',') virgulas++
      else if (ch === ';') pontos++
    }
  }
  return pontos > virgulas ? ';' : ','
}

export const parseCsv = (
  texto: string,
  opcoes: { separador?: string; limiteLinhas?: number } = {},
): CsvResultado => {
  const limite = opcoes.limiteLinhas ?? 1000
  let conteudo = texto ?? ''
  if (conteudo.charCodeAt(0) === 0xfeff) conteudo = conteudo.slice(1) // BOM
  const separador = opcoes.separador || detectarSeparador(conteudo)

  // tokenização caracter a caracter: aspas, escapes "", separador, \r\n / \n / \r, multilinha
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let dentro = false
  let campoAberto = false
  let citado = false
  let linhasDeDados = 0

  const fecharCampo = () => {
    linha.push(campo)
    campo = ''
    campoAberto = false
    citado = false
  }
  const fecharLinha = () => {
    fecharCampo()
    linhas.push(linha)
    linha = []
    linhasDeDados++
  }

  for (let i = 0; i < conteudo.length; i++) {
    if (linhasDeDados > limite) {
      return { ok: false, motivo: `Arquivo excede o limite de ${limite} linhas (demonstração).` }
    }
    const ch = conteudo[i]
    if (dentro) {
      if (ch === '"') {
        if (conteudo[i + 1] === '"') {
          campo += '"'
          i++
        } else {
          dentro = false
          citado = true
          campoAberto = true
        }
      } else {
        campo += ch
      }
    } else if (ch === '"') {
      if (campo === '' && !campoAberto) {
        dentro = true
        campoAberto = true
      } else {
        return { ok: false, motivo: 'CSV malformado: aspas no meio de campo sem escape.' }
      }
    } else if (ch === separador) {
      fecharCampo()
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && conteudo[i + 1] === '\n') i++
      if (dentro)
        return { ok: false, motivo: 'CSV malformado: quebra dentro de aspas não fechadas.' }
      fecharLinha()
    } else {
      campo += ch
    }
  }
  if (dentro) return { ok: false, motivo: 'CSV malformado: aspas não fechada.' }
  if (campo !== '' || linha.length > 0) fecharLinha()

  if (linhas.length === 0) return { ok: false, motivo: 'Arquivo vazio.' }
  const [cabecalho, ...dados] = linhas
  return { ok: true, separador, cabecalho, linhas: dados, totalLinhas: dados.length }
}
