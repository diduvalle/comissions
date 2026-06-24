export type Estado = 'pendente' | 'parcial' | 'paga'

export interface Produto {
  id: string
  tipo: string
  percentagem_comissao: number
  ativo: boolean
  ordem: number
}

export interface Cliente {
  id: string
  nome: string
  cidade?: string | null
  grupo?: string | null
}

export interface Comissao {
  id: string
  numero_projeto: string
  data_adjudicacao: string
  cliente_id: string
  produto_id: string
  valor_venda: number
  percentagem: number
  comissao_calculada: number
  is_saas: boolean
  valor_mensal_saas: number | null
  estado: Estado
  valor_pago: number | null
  partilhada: boolean
  observacoes: string | null
  mes_referencia: string
  created_at?: string
  updated_at?: string
  // joins
  cliente?: Cliente
  produto?: Produto
}

export interface Definicoes {
  id: number
  gestor_nome: string
  gestor_cargo: string
  diretor_nome: string
  diretor_email: string
  email_assunto: string
  email_corpo: string
  email_saudacao: string
  email_assinatura: string
  email_mostrar_resumo: boolean
  email_botao_label: string
  email_botao_posicao: 'antes' | 'depois'
  pin: string
  msg_dir_confirma: string | null
  msg_dir_bonus: string | null
  msg_dir_sem_bonus: string | null
}

export interface Historico {
  id: string
  comissao_id: string
  campo_alterado: string
  valor_antigo: string | null
  valor_novo: string | null
  alterado_por: string
  criado_em: string
}

export interface Envio {
  id: string
  mes_referencia: string
  token: string
  data_envio: string
  estado: string
  total_comissoes: number
  comissao_ids: string[]
  bonus: number
  bonus_descricao: string | null
  enviado_por: string | null
  enviado_para: string | null
  aberto_em: string | null
  aberto_contagem: number
}
