import { Routes, Route } from 'react-router-dom'
import PinGate from './components/PinGate'
import Layout from './components/Layout'
import Painel from './pages/Painel'
import Resumo from './pages/Resumo'
import Definicoes from './pages/Definicoes'
import Envios from './pages/Envios'
import Validacao from './pages/Validacao'
import VerEnvio from './pages/VerEnvio'

export default function App() {
  return (
    <Routes>
      <Route path="/validacao/:token" element={<Validacao />} />
      <Route path="/ver/:token" element={<VerEnvio />} />
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
        path="/resumo"
        element={
          <PinGate>
            <Layout>
              <Resumo />
            </Layout>
          </PinGate>
        }
      />
      <Route
        path="/envios"
        element={
          <PinGate>
            <Layout>
              <Envios />
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
