import { Routes, Route } from 'react-router-dom'
import PinGate from './components/PinGate'
import Layout from './components/Layout'
import Painel from './pages/Painel'
import Definicoes from './pages/Definicoes'
import Validacao from './pages/Validacao'

export default function App() {
  return (
    <Routes>
      <Route path="/validacao/:token" element={<Validacao />} />
      <Route
        path="/"
        element={
          <PinGate>
            <Layout>
              <Painel />
            </Layout>
          </PinGate>
        }
      />
      <Route
        path="/definicoes"
        element={
          <PinGate>
            <Layout>
              <Definicoes />
            </Layout>
          </PinGate>
        }
      />
    </Routes>
  )
}
