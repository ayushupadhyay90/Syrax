import * as THREE from 'three'

/**
 * GPU particle field — 12,000 particles rendered as points.
 * `intensity` 0..1 drives how much the particles react:
 *   0 = idle slow drift, 0.5 = swirling while thinking, 1 = pulsing with voice
 * `color` changes by agent state (idle blue → listening green → thinking purple → speaking cyan)
 */
export function createParticleField(count = 12000) {
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    // sphere-ish cloud
    const r = 6 + Math.random() * 10
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
    seeds[i] = Math.random() * 100
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1))

  const uniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 0 },
    uColor: { value: new THREE.Color('#3b82f6') },
    uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uPixelRatio;
      attribute float seed;
      varying float vAlpha;

      void main() {
        vec3 p = position;

        // idle drift
        float drift = uTime * 0.15 + seed;
        p.x += sin(drift) * 0.4;
        p.y += cos(drift * 0.9) * 0.4;
        p.z += sin(drift * 1.1) * 0.4;

        // intensity: swirl around Y axis + radial pulse (voice reactive)
        float angle = uTime * (0.2 + uIntensity * 1.5) + seed * 0.01;
        float s = sin(angle), c = cos(angle);
        p.xz = mat2(c, -s, s, c) * p.xz;

        float pulse = 1.0 + uIntensity * 0.35 * sin(uTime * 6.0 + seed);
        p *= pulse;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;

        float size = (1.5 + uIntensity * 2.5) * uPixelRatio;
        gl_PointSize = size * (12.0 / -mv.z);
        vAlpha = 0.35 + uIntensity * 0.65;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;

      void main() {
        float d = distance(gl_PointCoord, vec2(0.5));
        if (d > 0.5) discard;
        float glow = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor, glow * vAlpha);
      }
    `,
  })

  const points = new THREE.Points(geometry, material)

  return {
    points,
    setIntensity(v: number) {
      uniforms.uIntensity.value = THREE.MathUtils.lerp(uniforms.uIntensity.value, v, 0.1)
    },
    setColor(hex: string) {
      uniforms.uColor.value.set(hex)
    },
    update(t: number) {
      uniforms.uTime.value = t
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
