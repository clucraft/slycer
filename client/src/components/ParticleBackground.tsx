import { useMemo } from 'react'

function generateParticles(count: number, spacing: number, color: string): string {
  const shadows: string[] = []
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * spacing)
    const y = Math.floor(Math.random() * spacing)
    shadows.push(`${x}px ${y}px ${color}`)
  }
  return shadows.join(', ')
}

interface ParticleLayerProps {
  count: number
  size: number
  duration: number
  color: string
  spacing: number
}

function ParticleLayer({ count, size, duration, color, spacing }: ParticleLayerProps) {
  const boxShadow = useMemo(() => generateParticles(count, spacing, color), [count, spacing, color])
  const boxShadowAfter = useMemo(() => generateParticles(Math.floor(count * 0.8), spacing, color), [count, spacing, color])

  return (
    <div
      className="particle-layer"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${size}px`,
        height: `${size}px`,
        background: 'transparent',
        boxShadow,
        borderRadius: '50%',
        animation: `particleFloat ${duration}s linear infinite`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: `${spacing}px`,
          left: 0,
          width: `${size}px`,
          height: `${size}px`,
          background: 'transparent',
          boxShadow: boxShadowAfter,
          borderRadius: '50%',
        }}
      />
    </div>
  )
}

export default function ParticleBackground() {
  const spacing = 2000

  return (
    <div className="particle-background">
      <style>{`
        .particle-background {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
          pointer-events: none;
          overflow: hidden;
          opacity: 0.6;
        }

        @keyframes particleFloat {
          from {
            transform: translateY(0px);
          }
          to {
            transform: translateY(-${spacing}px);
          }
        }
      `}</style>

      <ParticleLayer count={250} size={1} duration={90} color="#06b6d4" spacing={spacing} />
      <ParticleLayer count={150} size={1} duration={130} color="#22d3ee" spacing={spacing} />
      <ParticleLayer count={80} size={2} duration={170} color="#67e8f9" spacing={spacing} />
    </div>
  )
}
