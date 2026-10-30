'use client';

import { useActionState, type ReactNode } from 'react';
import type { EstadoForm } from './actions';

type Props = {
  acao: (estado: EstadoForm, form: FormData) => Promise<EstadoForm>;
  botao: string;
  children: ReactNode;
};

export function FormAcesso({ acao, botao, children }: Props) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  return (
    <form action={enviar} className="form-acesso">
      {children}
      {estado.erro && <p className="aviso aviso-erro" role="alert">{estado.erro}</p>}
      <button type="submit" className="btn btn-primario btn-bloco" disabled={pendente}>
        {pendente ? 'Aguarde…' : botao}
      </button>
    </form>
  );
}

export function CampoCodigo() {
  return (
    <label className="campo">
      <span>Código do autenticador</span>
      <input
        name="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        placeholder="000000"
        className="input-codigo"
        required
      />
    </label>
  );
}
