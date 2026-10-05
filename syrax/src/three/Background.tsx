import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createParticleField } from './particles'
import { micLevel } from '../voice/level'

/** React wrapper around the GPU particle field. */
function ParticleScene({ intensity, color }: { intensity: number; color: string }) {
  const field = useMemo(() => createParticleField(12000), [])
  const colorRef = useRef(color)

  useEffect(() => {
    colorRef.current = color
  }, [color])

  useEffect(() => () => field.dispose(), [field])

  useFrame(({ clock }) => {
    // state intensity OR live mic level — whichever is louder
    field.setIntensity(Math.max(intensity, micLevel.value * 1.4))
    field.setColor(colorRef.current)
    field.update(clock.getElapsedTime())
  })

  return <primitive object={field.points} />
}

export function Background({ intensity, color }: { intensity: number; color: string }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 22], fov: 60 }}
      gl={{ antialias: true, alpha: true }}
      className="!fixed inset-0 z-0"
      onCreated={({ gl }) => gl.setClearColor(new THREE.Color('#05060a'), 1)}
    >
      <ParticleScene intensity={intensity} color={color} />
    </Canvas>
  )
}
