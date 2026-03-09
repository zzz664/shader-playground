export const defaultVertexShaderSource = `#version 300 es

precision highp float;

layout(location = 0) in vec2 aPosition;
out vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

export const defaultFragmentShaderSource = `#version 300 es

precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform float uTime;
uniform vec2 uResolution;

void main() {
  vec2 uv = vUv;
  vec2 aspectUv = (uv * 2.0 - 1.0) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  float wave = 0.5 + 0.5 * sin(uTime + aspectUv.x * 4.0);
  vec3 color = mix(vec3(0.05, 0.09, 0.16), vec3(0.12, 0.72, 0.94), wave);
  color += 0.08 * vec3(uv, 1.0 - uv.x);
  outColor = vec4(color, 1.0);
}
`
