const MESES_GUARDADOS = 6;

/** Os meses guardados no formato AAAA-MM (horário de Brasília), do mais antigo ao atual. */
export function ultimosMeses() {
  const [ano, mes] = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).split('-').map(Number);
  return Array.from({ length: MESES_GUARDADOS }, (_, i) =>
    new Date(Date.UTC(ano, mes - MESES_GUARDADOS + i, 1)).toISOString().slice(0, 7),
  );
}

export function nomeArquivoCertidao(nome: string, cnpj: string, emitidaEm: string | Date) {
  const limpo = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w .&-]/g, '').trim();
  const dia = new Date(emitidaEm).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return `CND - ${limpo} - ${cnpj} - ${dia}.pdf`;
}
