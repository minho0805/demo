import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const GRID = 112 // 점 격자 해상도 (높을수록 촘촘하고 고급스러움)

// 부드러운 원형 스프라이트 텍스처 — 사각 점 대신 둥글고 빛나는 점
function useDotTexture() {
  return useMemo(() => {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grd.addColorStop(0, 'rgba(255,255,255,1)')
    grd.addColorStop(0.4, 'rgba(255,255,255,0.7)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, size, size)
    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
  }, [])
}

function sampleImage(src, gridSize) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = gridSize
      canvas.height = gridSize
      const ctx = canvas.getContext('2d')
      const scale = Math.max(gridSize / img.width, gridSize / img.height)
      const w = img.width * scale
      const h = img.height * scale
      ctx.drawImage(img, (gridSize - w) / 2, (gridSize - h) / 2, w, h)

      const { data } = ctx.getImageData(0, 0, gridSize, gridSize)
      const positions = []
      const colors = []
      const sizes = []

      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const i = (y * gridSize + x) * 4
          const bright = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255

          // 중심 기준 정규화 좌표 (-1~1), 얼굴 형태의 타원 마스크로 배경/사각틀 제거
          const u = (x / gridSize - 0.5) * 2
          const v = (y / gridSize - 0.5) * 2
          const ellipse = Math.sqrt((u / 0.78) ** 2 + (v / 0.98) ** 2)
          let mask = 1 - ellipse
          if (mask <= 0) continue
          mask = Math.min(1, mask * 2.6) // 가장자리는 부드럽게 옅어지도록

          // 가장자리일수록 점이 듬성듬성 사라지는 입자 느낌(하드 엣지 방지)
          const edgeDither = Math.random()
          if (edgeDither > mask) continue

          const weight = Math.max(0.18, bright) * mask
          if (weight < 0.1) continue

          const jitter = (1 / gridSize) * 0.4
          const px = u * 1.15 + (Math.random() - 0.5) * jitter
          const py = -v * 1.45 + (Math.random() - 0.5) * jitter
          const pz = bright * 0.5 - 0.18 + (Math.random() - 0.5) * 0.01

          positions.push(px, py, pz)

          // 어두운 청록 → 밝은 화이트-시안 (스캔 느낌)
          const t = Math.min(1, bright * 1.3)
          const r = 0.05 + t * 0.85
          const g = 0.55 + t * 0.45
          const b = 0.45 + t * 0.55
          colors.push(r, g, b)
          sizes.push(0.5 + weight * 1.1)
        }
      }
      resolve({
        positions: new Float32Array(positions),
        colors: new Float32Array(colors),
        sizes: new Float32Array(sizes),
      })
    }
    img.onerror = reject
    img.src = src
  })
}

function FacePoints({ src }) {
  const [cloud, setCloud] = useState(null)
  const pointsRef = useRef(null)
  const dotTexture = useDotTexture()

  useEffect(() => {
    let cancelled = false
    setCloud(null)
    sampleImage(src, GRID).then((result) => {
      if (!cancelled) setCloud(result)
    })
    return () => { cancelled = true }
  }, [src])

  useFrame((_, delta) => {
    if (pointsRef.current) pointsRef.current.rotation.y += delta * 0.16
  })

  if (!cloud) return null

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[cloud.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[cloud.colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[cloud.sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{ pointTexture: { value: dotTexture } }}
        vertexShader={`
          attribute float size;
          attribute vec3 color;
          varying vec3 vColor;
          void main() {
            vColor = color;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (10.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `}
        fragmentShader={`
          uniform sampler2D pointTexture;
          varying vec3 vColor;
          void main() {
            vec4 tex = texture2D(pointTexture, gl_PointCoord);
            gl_FragColor = vec4(vColor, 1.0) * tex;
          }
        `}
      />
    </points>
  )
}

export default function PortraitPointCloud({ src }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 2.5], fov: 36 }}
      gl={{ alpha: true, antialias: true }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.9} color="#dffce8" />
      <FacePoints src={src} />
    </Canvas>
  )
}
