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
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
 return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float sum = 0.0, gain = 0.5; for (int i = 0; i < 5; i++) { sum += gain * noise(p); p = p * 2.03 + 17.1; gain *= 0.5; } return sum; }
// Height of the dusty surface: slow dunes, ripples and fine grit.
float surface(vec2 p){ return 0.6 * fbm(p * 1.3) + 0.25 * fbm(p * 7.0) + 0.06 * noise(p * 60.0); }
void main(){
 vec2 p = vWorld.xz;
 float range = distance(vWorld, eye);
 // Fine detail turns to shimmer far away; fade it out with distance.
 float detail = clamp(1.6 / range, 0.0, 1.0);
 float h = surface(p);
 vec3 dust = mix(vec3(0.42, 0.20, 0.11), vec3(0.74, 0.42, 0.24), smoothstep(0.25, 0.85, h));
 // Darker, coarser patches of gravel.
 float gravel = smoothstep(0.52, 0.7, fbm(p * 3.1 + 40.0));
 dust = mix(dust, vec3(0.33, 0.17, 0.11), 0.45 * gravel);
 // Scattered pebbles: one possible stone per small cell.
 vec2 cell = floor(p * 14.0), inside = fract(p * 14.0) - 0.5;
 float chance = hash(cell + 3.7);
 vec2 offset = (vec2(hash(cell + 11.0), hash(cell + 29.0)) - 0.5) * 0.5;
 float radius = 0.10 + 0.22 * hash(cell + 51.0);
 float stone = step(0.86 - 0.1 * gravel, chance) * smoothstep(radius, radius * 0.6, length(inside - offset));
 dust = mix(dust, vec3(0.25, 0.14, 0.10) + 0.10 * hash(cell), stone * detail);
 // Light from the upper left, taken from the slope of the surface.
 float e = 0.01;
 vec2 slope = vec2(surface(p + vec2(e, 0.0)) - h, surface(p + vec2(0.0, e)) - h) / e;
 float light = clamp(0.85 - dot(slope, vec2(0.10, 0.07)) * detail, 0.45, 1.25);
 light += 0.25 * stone * detail * (0.5 - (inside.x - offset.x) / radius);
 vec3 color = dust * light;
 // Dust in the thin air: distant ground fades to the colour of the Martian sky.
 color = mix(color, vec3(0.80, 0.56, 0.38), smoothstep(3.0, 30.0, range));
 gl_FragColor = vec4(color, 1.0);
 #include <colorspace_fragment>
}`
	});
	const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), material);
	ground.rotation.x = -Math.PI / 2;
	ground.frustumCulled = false;
	ground.visible = false;
	return ground;
}
