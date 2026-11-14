// The Martian ground drawn over the real floor.
//
// It is a large flat sheet at floor level whose pattern is computed from world
// position, so it never repeats, never needs a texture file, and stays fixed to the
// floor while the sheet itself follows the rover. Real things standing on the floor
// still hide it through the depth pass, exactly as they hide the models.

import * as THREE from 'three';
import { CAMERA } from './config';

const SIZE = 80; // metres; the camera's far plane is 50 m

export function makeGround() {
	const material = new THREE.ShaderMaterial({
		// Sit a hair behind floor-level decals (model shadows, the trail) so they never flicker.
		polygonOffset: true,
		polygonOffsetFactor: 1,
		polygonOffsetUnits: 4,
		uniforms: { eye: { value: new THREE.Vector3(0, CAMERA.heightM, 0) } },
		vertexShader: `varying vec3 vWorld;
void main(){ vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz;
 gl_Position = projectionMatrix * viewMatrix * world; }`,
		fragmentShader: `varying vec3 vWorld; uniform vec3 eye;
// Colours shared with the landing-site model (tools/make_models.mjs).
const vec3 SOIL_A = vec3(0.690, 0.416, 0.235); // #b06a3c
const vec3 SOIL_B = vec3(0.788, 0.545, 0.345); // #c98b58
const vec3 SOIL_DARK = vec3(0.553, 0.337, 0.200); // #8d5633
const vec3 SKY = vec3(0.851, 0.702, 0.549); // #d9b38c
vec2 hash2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
 return fract(sin(p) * 43758.5453) * 2.0 - 1.0; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
// Gradient noise: smooth blobs with no visible squares, roughly -1 to 1.
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
 return 1.4 * mix(mix(dot(hash2(i), f), dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
  mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y); }
// Each layer is turned a little so the layers never line up into a pattern.
const mat2 TURN = mat2(0.8, 0.6, -0.6, 0.8);
float fbm(vec2 p){ float sum = 0.0, gain = 0.5; for (int i = 0; i < 4; i++) { sum += gain * noise(p); p = TURN * p * 2.1 + 9.7; gain *= 0.5; } return sum; }
void main(){
 vec2 p = vWorld.xz;
 float range = distance(vWorld, eye);
 float close = clamp(1.2 / range, 0.0, 1.0); // fine detail only where the camera can resolve it
 // Broad, soft drifts of lighter and darker dust.
 float drift = fbm(p * 0.9);
 float patches = fbm(p * 3.0 + 31.0);
 vec3 color = mix(SOIL_A, SOIL_B, smoothstep(-0.45, 0.45, drift + 0.4 * patches));
 color = mix(color, SOIL_DARK, 0.45 * smoothstep(0.05, 0.55, fbm(p * 1.7 - 12.0)));
 // Hand-sized mottling, so the ground right in front of the rover is not flat.
 color *= 1.0 + 0.16 * fbm(p * 11.0 + 5.0) + 0.07 * close * fbm(p * 37.0);
 // Gentle wind ripples and a whisper of grain up close.
 color *= 1.0 + 0.05 * close * noise(vec2(p.x * 9.0 + 2.0 * drift, p.y * 38.0));
 color *= 1.0 + 0.04 * close * noise(p * 140.0);
 // A few small round stones, lit from the upper left, each with a soft shadow.
 float scale = 13.0;
 vec2 cell = floor(p * scale), inside = fract(p * scale) - 0.5;
 if (hash(cell + 3.7) > 0.78) {
  vec2 centre = (vec2(hash(cell + 11.0), hash(cell + 29.0)) - 0.5) * 0.5;
  float radius = 0.06 + 0.16 * hash(cell + 51.0) * hash(cell + 5.0);
  vec2 d = (inside - centre) / radius;
  float shadow = smoothstep(1.6, 0.4, length(d - vec2(0.45, 0.35)));
  color *= 1.0 - 0.3 * shadow * close;
  float body = smoothstep(1.0, 0.8, length(d));
  float lit = 0.75 + 0.35 * clamp(-(d.x * 0.7 + d.y * 0.5), -1.0, 1.0);
  vec3 stone = mix(vec3(0.37, 0.31, 0.29), vec3(0.49, 0.41, 0.36), hash(cell + 77.0));
  color = mix(color, mix(stone, SOIL_A, 0.35) * lit, body * close);
 }
 // Dust in the thin air: distant ground fades into the Martian sky.
 color = mix(color, SKY, smoothstep(2.5, 25.0, range));
 // The colours above are screen (sRGB) values; the renderer expects linear light.
 gl_FragColor = vec4(pow(color, vec3(2.2)), 1.0);
 #include <colorspace_fragment>
}`
	});
	const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), material);
	ground.rotation.x = -Math.PI / 2;
	ground.frustumCulled = false;
	ground.visible = false;
	return ground;
}
