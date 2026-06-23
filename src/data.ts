import { supabase } from './supabase'
import type { Comissao } from './types'

const TRACK: (keyof Comissao)[] = ['valor_pago', 'comissao_calculada', 'percentagem', 'estado', 'observacoes', 'valor_venda']

// Atualiza uma comissão e regista no histórico cada campo alterado.
export async function updateComissao(
  atual: Comissao,
  patch: Partial<Comissao>,
  por: 'gestor' | 'diretor',
) {
  const { error } = await supabase.from('comissoes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', atual.id)
  if (error) throw error

  const linhas = TRACK.filter((c) => c in patch && String((patch as any)[c] ?? '') !== String((atual as any)[c] ?? ''))
    .map((c) => ({
      comissao_id: atual.id,
      campo_alterado: c as string,
      valor_antigo: (atual as any)[c] == null ? null : String((atual as any)[c]),
      valor_novo: (patch as any)[c] == null ? null : String((patch as any)[c]),
      alterado_por: por,
    }))
  if (linhas.length) await supabase.from('historico').insert(linhas)
}

export async function getOrCreateCliente(nome: string): Promise<string> {
  nome = nome.trim()
  const { data: ex } = await supabase.from('clientes').select('id').eq('nome', nome).maybeSingle()
  if (ex?.id) return ex.id
  const { data, error } = await supabase.from('clientes').insert({ nome }).select('id').single()
  if (error) throw error
  return data.id
}
