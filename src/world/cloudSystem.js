import * as THREE from 'three'

const CLOUD_SHADER_VERT = `
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const CLOUD_SHADER_FRAG = `
uniform float uTime;
uniform vec3 uSunColor;
uniform float uDayFactor;
precision highp float;
varying vec2 vUv;
varying vec3 vWorldPos;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1,0)), f.x),
    mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p *= 2.1;
    a *= 0.5;
  }
  return v;
}

void main() {
  float horizon = vWorldPos.y / 8.0;
  if (horizon < 0.05) discard;

  vec2 uv = vWorldPos.xz / max(vWorldPos.y, 0.1) * 3.0;
  vec2 wind = vec2(uTime * 0.012, uTime * 0.003);

  float n1 = fbm(uv + wind);
  float n2 = fbm(uv * 1.8 + wind * 1.3 + vec2(5.2, 1.3));
  float cloud = fbm(vec2(n1, n2) + uv * 0.5 + wind * 0.5);
  cloud = smoothstep(0.48, 0.72, cloud);

  if (cloud < 0.01) discard;

  float horizonFade = smoothstep(0.05, 0.20, horizon);

  vec3 baseColor = mix(vec3(0.6, 0.65, 0.75), vec3(1.0), uDayFactor);
  vec3 litColor = mix(baseColor, uSunColor * 1.15, 0.35 * uDayFactor);
  vec3 shadColor = mix(baseColor * 0.55, baseColor * 0.80, uDayFactor);

  float shadowing = fbm(uv * 1.2 + wind + vec2(0.3, 0.7));
  vec3 color = mix(shadColor, litColor, smoothstep(0.3, 0.75, shadowing));

  float alpha = cloud * mix(0.7, 0.95, uDayFactor) * horizonFade;
  gl_FragColor = vec4(color, alpha);
}
`

export class CloudSystem {
  constructor(skyScene) {
    this.skyScene = skyScene
    this.time = 0

    const geo = new THREE.SphereGeometry(8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)

    this.mat = new THREE.ShaderMaterial({
      vertexShader: CLOUD_SHADER_VERT,
      fragmentShader: CLOUD_SHADER_FRAG,
      uniforms: {
        uTime:      { value: 0 },
        uSunColor:  { value: new THREE.Color(1.0, 0.92, 0.75) },
        uDayFactor: { value: 1.0 }
      },
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide
    })

    this.mesh = new THREE.Mesh(geo, this.mat)
    this.mesh.position.set(0, 0, 0)
    this.mesh.frustumCulled = false
    this.skyScene.add(this.mesh)
  }

  update(dt, dayFactor, dimensionName) {
    this.mesh.visible = dimensionName !== 'nether'
    this.time += dt
    this.mat.uniforms.uTime.value = this.time

    const warmth = Math.max(0, Math.sin(dayFactor * Math.PI))
    this.mat.uniforms.uSunColor.value.setRGB(
      1.0,
      0.75 + 0.25 * warmth,
      0.55 + 0.45 * warmth
    )
    this.mat.uniforms.uDayFactor.value = dayFactor
  }

  dispose() {
    this.skyScene.remove(this.mesh)
    this.mat.dispose()
  }
}