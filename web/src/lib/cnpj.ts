// Aceita CNPJ numérico e o novo CNPJ alfanumérico (em vigor desde jul/2026).

export function limparCnpj(valor: string): string {
  return valor.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

function digitoVerificador(base: string): number {
  let peso = 2;
  let soma = 0;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += (base.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(valor: string): boolean {
  const c = limparCnpj(valor);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c)) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;
  const d1 = digitoVerificador(c.slice(0, 12));
  const d2 = digitoVerificador(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

export function formatarCnpj(valor: string): string {
  const c = limparCnpj(valor);
  if (c.length !== 14) return valor;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
