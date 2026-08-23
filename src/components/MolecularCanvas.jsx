import { useRef } from 'react'
import { useMolecularCanvas } from '../hooks/useMolecularCanvas'

export default function MolecularCanvas() {
  const canvasRef = useRef(null)
  useMolecularCanvas(canvasRef)
  return <canvas id="molecules-canvas" ref={canvasRef} />
}
