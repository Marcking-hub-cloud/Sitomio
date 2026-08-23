import { Routes, Route, useLocation } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import MolecularCanvas from './components/MolecularCanvas'
import Home from './pages/Home'
import Resume from './pages/Resume'
import Games from './pages/Games'
import Motorbike from './pages/Motorbike'
import Barba from './pages/Barba'

function AppInner() {
  const location = useLocation()
  // Show particle canvas on all pages except Motorbike and Barba (self-contained pages)
  const showCanvas = location.pathname !== '/motorbike' && location.pathname !== '/barba'

  return (
    <>
      {showCanvas && <MolecularCanvas />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/resume" element={<Resume />} />
        <Route path="/games" element={<Games />} />
        <Route path="/motorbike" element={<Motorbike />} />
        {/* Hidden route — not linked from anywhere. Access via /barba */}
        <Route path="/barba" element={<Barba />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  )
}
