export const defaultVertexShaderSource = `#version 300 es

precision highp float;
precision highp int;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;

out vec2 vUv;
out vec3 vNormal;
out vec3 vWorldPos;

uniform int uSceneMode;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;

void main() {
  vUv = aUv;

  if (uSceneMode == 0) {
    vNormal = vec3(0.0, 0.0, 1.0);
    vWorldPos = vec3(aPosition.xy, 0.0);
    gl_Position = vec4(aPosition.xy, 0.0, 1.0);
    return;
  }

  vec4 worldPosition = uModel * vec4(aPosition, 1.0);
  vWorldPos = worldPosition.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  gl_Position = uProj * uView * worldPosition;
}
`

export const defaultFragmentShaderSource = `#version 300 es

precision highp float;
precision highp int;

in vec2 vUv;
in vec3 vNormal;
in vec3 vWorldPos;

out vec4 outColor;

uniform float uTime;
uniform vec2 uResolution;
uniform int uSceneMode;
uniform vec3 uCameraPos;
uniform float edgePower;
uniform vec2 uvOffset;
uniform vec3 tintColor;
uniform bool useTint;
uniform int bandCount;
uniform sampler2D detailTex;

void main() {
  vec2 uv = vUv + uvOffset;
  vec2 aspectUv = (uv * 2.0 - 1.0) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  float bands = max(float(bandCount), 1.0);
  float wave = 0.5 + 0.5 * sin(uTime + aspectUv.x * (4.0 + edgePower * bands));
  vec3 color = mix(vec3(0.05, 0.09, 0.16), vec3(0.12, 0.72, 0.94), wave);
  color += 0.08 * vec3(uv, 1.0 - uv.x);

  if (uSceneMode == 1) {
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(vec3(0.4, 0.7, 0.5));
    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    float diffuse = max(dot(normal, lightDir), 0.0);
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
    color *= 0.35 + diffuse * 0.9;
    color += fresnel * vec3(0.08, 0.18, 0.28);
  }

  if (useTint) {
    color *= max(tintColor, vec3(0.001));
  }
  color *= mix(vec3(1.0), texture(detailTex, uv).rgb, 0.35);
  outColor = vec4(color, 1.0);
}
`
