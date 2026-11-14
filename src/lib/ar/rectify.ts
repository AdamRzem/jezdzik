import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { CAMERA } from './config';
import type { Pose } from './types';

export interface Distortion {
	k1: number;
	k2: number;
	p1: number;
	p2: number;
	k3: number;
}
export function rectifiedToRaw(u: number, v: number, d: Distortion = CAMERA.distortion) {
	const x = (u - CAMERA.cx) / CAMERA.fx,
		y = (v - CAMERA.cy) / CAMERA.fy;
	const r2 = x * x + y * y,
		radial = 1 + d.k1 * r2 + d.k2 * r2 ** 2 + d.k3 * r2 ** 3;
	return {
		u: CAMERA.fx * (x * radial + 2 * d.p1 * x * y + d.p2 * (r2 + 2 * x * x)) + CAMERA.cx,
		v: CAMERA.fy * (y * radial + d.p1 * (r2 + 2 * y * y) + 2 * d.p2 * x * y) + CAMERA.cy
	};
}
export function rawToRectified(u: number, v: number, d: Distortion = CAMERA.distortion) {
	if (!(d.k1 || d.k2 || d.p1 || d.p2 || d.k3)) return { u, v };
	let ru = u,
		rv = v;
	for (let i = 0; i < 6; i++) {
		const raw = rectifiedToRaw(ru, rv, d);
		ru += u - raw.u;
		rv += v - raw.v;
	}
	return { u: ru, v: rv };
}
export function cameraWorld(pose: Pose) {
	const q = new Quaternion().setFromEuler(new Euler(pose.pitch, pose.yaw, pose.roll, 'YXZ'));
	q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -CAMERA.tilt));
	return new Matrix4().compose(
		new Vector3(pose.x, CAMERA.heightM, pose.z),
		q,
		new Vector3(1, 1, 1)
	);
}
/** Coefficients of world Y for an unnormalised OpenCV ray (x, y, 1). */
export function floorPlane(pose: Pose) {
	const m = cameraWorld(pose).elements;
	return { x: m[1], y: -m[5], z: -m[9] };
}
export function floorDepth(u: number, v: number, plane: ReturnType<typeof floorPlane>) {
	const down = -(
		(plane.x * (u - CAMERA.cx)) / CAMERA.fx +
		(plane.y * (v - CAMERA.cy)) / CAMERA.fy +
		plane.z
	);
	return down > 0 ? CAMERA.heightM / down : Infinity;
}
export function projectionMatrix() {
	const { width: w, height: h, fx, fy, cx, cy, near: n, far: f } = CAMERA;
	return new Matrix4().set(
		(2 * fx) / w,
		0,
		1 - (2 * cx) / w,
		0,
		0,
		(2 * fy) / h,
		(2 * cy) / h - 1,
		0,
		0,
		0,
		-(f + n) / (f - n),
		(-2 * f * n) / (f - n),
		0,
		0,
		-1,
		0
	);
}

// uv is bottom-up for the background. Pixel coordinates and depth data are top-down.
export const DISTORT_GLSL = `
uniform vec4 intrinsics;
uniform vec3 radial;
uniform vec2 tangential;
vec2 rawUV(vec2 uv) {
  vec2 pixel = vec2(uv.x, 1.0 - uv.y) * vec2(1280.0, 720.0);
  vec2 p = (pixel - intrinsics.zw) / intrinsics.xy;
  float r2 = dot(p, p);
  float r = 1.0 + radial.x*r2 + radial.y*r2*r2 + radial.z*r2*r2*r2;
  vec2 d = p*r + vec2(2.0*tangential.x*p.x*p.y + tangential.y*(r2+2.0*p.x*p.x),
    tangential.x*(r2+2.0*p.y*p.y) + 2.0*tangential.y*p.x*p.y);
  return (d*intrinsics.xy + intrinsics.zw) / vec2(1280.0, 720.0);
}
`;
