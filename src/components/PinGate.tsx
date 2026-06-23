import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const KEY = 'comissions_pin_ok'
const DAYS = 30

function isUnlocked(): boolean {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return false
    return parseInt(raw, 10) > Date.now()
  } catch {
    return false
  }
}

export default function PinGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(isUnlocked())
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState('')
  const [realPin, setRealPin] = useState('197000')

  useEffect(() => {
    supabase
      .from('definicoes')
      .select('pin')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (data?.pin) setRealPin(String(data.pin))
      })
  }, [])

  if (ok) return <>{children}</>

  const tentar = (e: React.FormEvent) => {
    e.preventDefault()
    if (pin === realPin) {
      localStorage.setItem(KEY, String(Date.now() + DAYS * 864e5))
      setOk(true)
    } else {
      setErro('PIN incorreto.')
      setPin('')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-host-navy px-4">
      <form onSubmit={tentar} className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 text-center">
        <img src="/host-color.png" alt="Host" className="h-9 mx-auto mb-6" />
        <h1 className="text-xl font-bold text-host-navy">Comissões</h1>
        <p className="text-sm text-gray-500 mb-6">Introduz o PIN para entrar.</p>
        <input
          autoFocus inputMode="numeric" type="password" value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full text-center text-2xl tracking-[0.5em] border rounded-lg py-3 mb-3 outline-none focus:border-host-blue"
          placeholder="••••••"
        />
        {erro && <p className="text-sm text-red-600 mb-3">{erro}</p>}
        <button type="submit" className="w-full bg-host-blue text-white font-semibold rounded-lg py-3 hover:opacity-90">
          Entrar
        </button>
      </form>
    </div>
  )
}
