import {
  defaultFragmentShaderSource,
  defaultVertexShaderSource,
} from '../../core/shader/templates/defaultShaders'

export interface ShaderPreset {
  id: string
  name: string
  description: string
  vertexSource: string
  fragmentSource: string
}

const normalVisualizerFragmentSource = `#version 300 es

precision highp float;
precision highp int;

in vec2 vUv;
in vec3 vNormal;
in vec3 vWorldPos;

out vec4 outColor;

uniform int uSceneMode;
uniform float pulseSpeed; // @ui slider @min 0.0 @max 5.0 @step 0.01 @label Pulse Speed @group Surface
uniform vec3 normalTint;  // @ui color @label Normal Tint @group Surface

void main() {
  vec3 normal = normalize(vNormal);
  vec3 encodedNormal = normal * 0.5 + 0.5;
  float pulse = 0.5 + 0.5 * sin(length(vWorldPos) * 4.0 + pulseSpeed);
  vec3 color = mix(encodedNormal, normalTint, 0.25) * mix(0.7, 1.15, pulse);

  if (uSceneMode == 0) {
    color = vec3(vUv, 0.5 + 0.5 * sin(vUv.x * 12.0));
  }

  outColor = vec4(color, 1.0);
}
`

const scanlineFragmentSource = `#version 300 es

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
uniform vec3 baseTint;      // @ui color @label Base Tint @group Scan
uniform vec3 highlightTint; // @ui color @label Highlight Tint @group Scan
uniform float lineDensity;  // @ui slider @min 1.0 @max 80.0 @step 1.0 @label Line Density @group Scan
uniform float sweepWidth;   // @ui slider @min 0.02 @max 0.4 @step 0.01 @label Sweep Width @group Scan

void main() {
  vec2 uv = vUv;
  vec2 screenUv = (uv * 2.0 - 1.0) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  float scan = 0.5 + 0.5 * sin(screenUv.y * lineDensity + uTime * 4.0);
  float sweep = smoothstep(0.0, sweepWidth, abs(fract(uTime * 0.15 + uv.y) - 0.5));
  vec3 color = mix(baseTint, highlightTint, scan);
  color += (1.0 - sweep) * 0.25;

  if (uSceneMode == 1) {
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(vec3(0.3, 0.8, 0.4));
    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    float lambert = max(dot(normal, lightDir), 0.0);
    float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0);
    color *= 0.2 + lambert;
    color += rim * highlightTint * 0.45;
  }

  outColor = vec4(color, 1.0);
}
`

export const shaderPresets: ShaderPreset[] = [
  {
    id: 'default-surface',
    name: '기본 Surface',
    description: '현재 기본 셰이더 템플릿입니다.',
    vertexSource: defaultVertexShaderSource,
    fragmentSource: defaultFragmentShaderSource,
  },
  {
    id: 'normal-visualizer',
    name: '노멀 시각화',
    description: '법선 방향을 색상으로 확인하는 디버그용 프리셋입니다.',
    vertexSource: defaultVertexShaderSource,
    fragmentSource: normalVisualizerFragmentSource,
  },
  {
    id: 'scanline-surface',
    name: '스캔 라인',
    description: '시간 기반 스캔 라인과 림 하이라이트를 넣은 예제입니다.',
    vertexSource: defaultVertexShaderSource,
    fragmentSource: scanlineFragmentSource,
  },
]
