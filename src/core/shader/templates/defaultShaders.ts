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
uniform float edgePower;   // @ui slider @min 0 @max 5 @step 0.01 @label Edge Power @group Surface
uniform vec2 uvOffset;     // @label UV Offset @group Surface
uniform vec3 tintColor;    // @ui color @label Tint Color @group Surface
uniform bool useTint;      // @ui checkbox @label Use Tint @group Surface
uniform int bandCount;     // @label Band Count @group Noise
uniform sampler2D detailTex; // @ui texture @label Detail Texture @group Noise

void main() {
  vec2 uv = vUv + uvOffset;
  vec2 aspectUv = (uv * 2.0 - 1.0) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  float bands = max(float(bandCount), 1.0);
  float wave = 0.5 + 0.5 * sin(uTime + aspectUv.x * (4.0 + edgePower * bands));
  vec3 baseColor = mix(vec3(0.05, 0.09, 0.16), vec3(0.12, 0.72, 0.94), wave);
  baseColor += 0.08 * vec3(uv, 1.0 - uv.x);
  vec3 color = baseColor;

  if (uSceneMode == 1) {
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(vec3(0.4, 0.7, 0.5));
    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    float lambert = max(dot(normal, lightDir), 0.0);
    vec3 ambient = baseColor * 0.22;
    vec3 diffuse = baseColor * lambert;
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
    color = ambient + diffuse;
    color += fresnel * vec3(0.08, 0.18, 0.28);
  }

  if (useTint) {
    color *= max(tintColor, vec3(0.001));
  }
  color *= mix(vec3(1.0), texture(detailTex, uv).rgb, 0.35);
  outColor = vec4(color, 1.0);
}
`

export const defaultPostProcessVertexShaderSource = `#version 300 es

precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 2) in vec2 aUv;

out vec2 vUv;

void main() {
  vUv = aUv;
  gl_Position = vec4(aPosition.xy, 0.0, 1.0);
}
`

export const defaultPostProcessFragmentShaderSource = `#version 300 es

precision highp float;

in vec2 vUv;

uniform sampler2D uSceneColor;
uniform sampler2D uPrevPassColor;
uniform vec2 uResolution;
uniform float uTime;

out vec4 outColor;

void main() {
  vec2 uv = vUv;
  vec4 sceneColor = texture(uSceneColor, uv);
  vec4 prevPassColor = texture(uPrevPassColor, uv);
  // 이전 pass를 직접 참조하려면 uniform sampler2D uPass1Color; 같은 형태를 선언한다.
  vec2 centeredUv = uv * 2.0 - 1.0;
  float vignette = smoothstep(1.25, 0.15, length(centeredUv));
  vec3 color = mix(sceneColor.rgb, prevPassColor.rgb, 0.85);
  color *= vignette;
  outColor = vec4(color, prevPassColor.a);
}
`
