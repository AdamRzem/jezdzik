#!/usr/bin/env node
// Generates the Mars Pathfinder site models as GLB files. No dependencies.
// Run with: npm run models
//
// Two families of models:
//   cover/  rocks sized to hide a real 10 cm cube completely (stylised, not to scale)
//   site/   the landing site at true scale in metres (lander, rover, rocks, ground)
//
// Every position and size that is not backed by a source is marked "approximate"
// in layout.json. Check those against NASA's overhead maps before presenting them as fact.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'static', 'assets', 'models');

// ---------------------------------------------------------------- maths

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => {
	const t = clamp((v - a) / (b - a), 0, 1);
	return t * t * (3 - 2 * t);
};
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const DEG = Math.PI / 180;

function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function hash(ix, iy, iz, seed) {
	let h =
		Math.imul(ix, 73856093) ^
		Math.imul(iy, 19349663) ^
		Math.imul(iz, 83492791) ^
		Math.imul(seed, 1274126177);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}

// Value noise, 0..1
function noise(x, y, z, seed) {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const iz = Math.floor(z);
	const fx = x - ix;
	const fy = y - iy;
	const fz = z - iz;
	const ux = fx * fx * (3 - 2 * fx);
	const uy = fy * fy * (3 - 2 * fy);
	const uz = fz * fz * (3 - 2 * fz);
	let v = 0;
	for (let dz = 0; dz < 2; dz++)
		for (let dy = 0; dy < 2; dy++)
			for (let dx = 0; dx < 2; dx++) {
				const w = (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
				v += w * hash(ix + dx, iy + dy, iz + dz, seed);
			}
	return v;
}

// Fractal noise, -1..1
function fbm(x, y, z, seed, octaves = 4) {
	let amp = 0.5;
	let freq = 1;
	let sum = 0;
	let norm = 0;
	for (let i = 0; i < octaves; i++) {
		sum += amp * (noise(x * freq, y * freq, z * freq, seed + i * 17) * 2 - 1);
		norm += amp;
		amp *= 0.5;
		freq *= 2;
	}
	return sum / norm;
}

// ---------------------------------------------------------------- meshes

function newMesh(name, material = 'matte') {
	return { name, material, positions: [], normals: [], colors: [], indices: [] };
}
const vcount = (m) => m.positions.length / 3;

function addVertex(m, p, c) {
	m.positions.push(p[0], p[1], p[2]);
	m.colors.push(c[0], c[1], c[2]);
	return vcount(m) - 1;
}

// For convex primitives: make every triangle face away from the centre.
function fixConvexWinding(m) {
	const n = vcount(m);
	const c = [0, 0, 0];
	for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) c[k] += m.positions[i * 3 + k] / n;
	const P = (i) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]];
	for (let i = 0; i < m.indices.length; i += 3) {
		const a = P(m.indices[i]);
		const b = P(m.indices[i + 1]);
		const d = P(m.indices[i + 2]);
		const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
		const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
		const nx = u[1] * v[2] - u[2] * v[1];
		const ny = u[2] * v[0] - u[0] * v[2];
		const nz = u[0] * v[1] - u[1] * v[0];
		const tx = (a[0] + b[0] + d[0]) / 3 - c[0];
		const ty = (a[1] + b[1] + d[1]) / 3 - c[1];
		const tz = (a[2] + b[2] + d[2]) / 3 - c[2];
		if (nx * tx + ny * ty + nz * tz < 0) {
			const t = m.indices[i + 1];
			m.indices[i + 1] = m.indices[i + 2];
			m.indices[i + 2] = t;
		}
	}
	return m;
}

// Upright prism over a convex polygon given as [x, z] points.
function prism(points, y0, y1, color) {
	const m = newMesh('prism');
	const n = points.length;
	for (const [x, z] of points) addVertex(m, [x, y0, z], color);
	for (const [x, z] of points) addVertex(m, [x, y1, z], color);
	for (let i = 1; i < n - 1; i++) {
		m.indices.push(0, i, i + 1);
		m.indices.push(n, n + i, n + i + 1);
	}
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		m.indices.push(i, j, n + j, i, n + j, n + i);
	}
	return fixConvexWinding(m);
}

const box = (w, h, d, color) =>
	prism(
		[
			[-w / 2, -d / 2],
			[w / 2, -d / 2],
			[w / 2, d / 2],
			[-w / 2, d / 2]
		],
		0,
		h,
		color
	);

function cylinder(r, h, seg, color) {
	const pts = [];
	for (let i = 0; i < seg; i++) {
		const a = (i / seg) * Math.PI * 2;
		pts.push([Math.cos(a) * r, Math.sin(a) * r]);
	}
	return prism(pts, 0, h, color);
}

// Thin slab under four top corners given as [x, y, z].
function slab(top, thickness, color) {
	const m = newMesh('slab');
	for (const p of top) addVertex(m, p, color);
	for (const p of top) addVertex(m, [p[0], p[1] - thickness, p[2]], color);
	m.indices.push(0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7);
	for (let i = 0; i < 4; i++) {
		const j = (i + 1) % 4;
		m.indices.push(i, j, 4 + j, i, 4 + j, 4 + i);
	}
	return fixConvexWinding(m);
}

function translate(m, x, y, z) {
	for (let i = 0; i < m.positions.length; i += 3) {
		m.positions[i] += x;
		m.positions[i + 1] += y;
		m.positions[i + 2] += z;
	}
	return m;
}

function rotate(m, axis, angle) {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	const [i0, i1] = axis === 'x' ? [1, 2] : axis === 'y' ? [2, 0] : [0, 1];
	for (const arr of [m.positions, m.normals]) {
		for (let i = 0; i < arr.length; i += 3) {
			const a = arr[i + i0];
			const b = arr[i + i1];
			arr[i + i0] = a * c - b * s;
			arr[i + i1] = a * s + b * c;
		}
	}
	return m;
}

function computeSmoothNormals(m) {
	const n = vcount(m);
	const N = new Float64Array(n * 3);
	for (let i = 0; i < m.indices.length; i += 3) {
		const a = m.indices[i] * 3;
		const b = m.indices[i + 1] * 3;
		const c = m.indices[i + 2] * 3;
		const p = m.positions;
		const ux = p[b] - p[a];
		const uy = p[b + 1] - p[a + 1];
		const uz = p[b + 2] - p[a + 2];
		const vx = p[c] - p[a];
		const vy = p[c + 1] - p[a + 1];
		const vz = p[c + 2] - p[a + 2];
		const nx = uy * vz - uz * vy;
		const ny = uz * vx - ux * vz;
		const nz = ux * vy - uy * vx;
		for (const k of [a, b, c]) {
			N[k] += nx;
			N[k + 1] += ny;
			N[k + 2] += nz;
		}
	}
	m.normals = [];
	for (let i = 0; i < n; i++) {
		const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
		m.normals.push(N[i * 3] / l, N[i * 3 + 1] / l, N[i * 3 + 2] / l);
	}
	return m;
}

// One vertex per triangle corner, so every face is flat.
function flatShade(m) {
	const out = newMesh(m.name, m.material);
	const p = m.positions;
	for (let i = 0; i < m.indices.length; i += 3) {
		const ids = [m.indices[i], m.indices[i + 1], m.indices[i + 2]];
		const [a, b, c] = ids.map((k) => [p[k * 3], p[k * 3 + 1], p[k * 3 + 2]]);
		const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
		const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
		let nx = u[1] * v[2] - u[2] * v[1];
		let ny = u[2] * v[0] - u[0] * v[2];
		let nz = u[0] * v[1] - u[1] * v[0];
		const l = Math.hypot(nx, ny, nz) || 1;
		nx /= l;
		ny /= l;
		nz /= l;
		for (const k of ids) {
			out.positions.push(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]);
			out.colors.push(m.colors[k * 3], m.colors[k * 3 + 1], m.colors[k * 3 + 2]);
			out.normals.push(nx, ny, nz);
			out.indices.push(out.indices.length);
		}
	}
	return out;
}

function merge(name, material, list) {
	const out = newMesh(name, material);
	for (const m of list) {
		const base = vcount(out);
		out.positions.push(...m.positions);
		out.colors.push(...m.colors);
		out.normals.push(...m.normals);
		for (const i of m.indices) out.indices.push(i + base);
	}
	return out;
}

// Hard-surface part: flat shaded.
const hard = (name, material, parts) => merge(name, material, parts.map(flatShade));

function bounds(m) {
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < m.positions.length; i += 3)
		for (let k = 0; k < 3; k++) {
			min[k] = Math.min(min[k], m.positions[i + k]);
			max[k] = Math.max(max[k], m.positions[i + k]);
		}
	return { min, max };
}

// ---------------------------------------------------------------- cube sphere

const sphereCache = new Map();
function cubeSphere(n) {
	if (sphereCache.has(n)) return sphereCache.get(n);
	const dirs = [];
	const index = new Map();
	const tris = [];
	const faces = [
		[
			[-1, -1, 1],
			[2, 0, 0],
			[0, 2, 0]
		],
		[
			[1, -1, -1],
			[-2, 0, 0],
			[0, 2, 0]
		],
		[
			[1, -1, 1],
			[0, 0, -2],
			[0, 2, 0]
		],
		[
			[-1, -1, -1],
			[0, 0, 2],
			[0, 2, 0]
		],
		[
			[-1, 1, 1],
			[2, 0, 0],
			[0, 0, -2]
		],
		[
			[-1, -1, -1],
			[2, 0, 0],
			[0, 0, 2]
		]
	];
	const vid = (x, y, z) => {
		const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
		let i = index.get(key);
		if (i === undefined) {
			const l = Math.hypot(x, y, z);
			i = dirs.length;
			dirs.push([x / l, y / l, z / l]);
			index.set(key, i);
		}
		return i;
	};
	for (const [o, u, v] of faces) {
		const grid = [];
		for (let j = 0; j <= n; j++)
			for (let i = 0; i <= n; i++) {
				const a = i / n;
				const b = j / n;
				grid.push(
					vid(o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b, o[2] + u[2] * a + v[2] * b)
				);
			}
		for (let j = 0; j < n; j++)
			for (let i = 0; i < n; i++) {
				const a = grid[j * (n + 1) + i];
				const b = grid[j * (n + 1) + i + 1];
				const c = grid[(j + 1) * (n + 1) + i];
				const d = grid[(j + 1) * (n + 1) + i + 1];
				tris.push(a, b, d, a, d, c);
			}
	}
	for (let i = 0; i < tris.length; i += 3) {
		const a = dirs[tris[i]];
		const b = dirs[tris[i + 1]];
		const c = dirs[tris[i + 2]];
		const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
		const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
		const nx = u[1] * v[2] - u[2] * v[1];
		const ny = u[2] * v[0] - u[0] * v[2];
		const nz = u[0] * v[1] - u[1] * v[0];
		if (nx * (a[0] + b[0] + c[0]) + ny * (a[1] + b[1] + c[1]) + nz * (a[2] + b[2] + c[2]) < 0) {
			const t = tris[i + 1];
			tris[i + 1] = tris[i + 2];
			tris[i + 2] = t;
		}
	}
	const out = { dirs, tris };
	sphereCache.set(n, out);
	return out;
}

// ---------------------------------------------------------------- rocks

const DUST = hex('#b9703f');
const SOIL = hex('#c48655');

// Envelope a cover rock must fill so that a 10 cm cube under it is hidden at any yaw.
// The cube's corners reach 7.07 cm from its axis and 10 cm above the floor.
const COVER = { rMin: 0.083, ySide: 0.106, yTopMin: 0.108, yMax: 0.12 };

function enforceCover(pts, dirs, seed) {
	for (let i = 0; i < pts.length; i++) {
		const p = pts[i];
		const d = dirs[i];
		if (p[1] > COVER.yMax) p[1] = COVER.yMax;
		const rh = Math.hypot(p[0], p[2]);
		if (rh >= COVER.rMin) continue;
		if (d[1] > 0.6) {
			// Top cap over the cube: keep it above the cube's top face.
			if (p[1] < COVER.yTopMin) p[1] = COVER.yTopMin;
		} else if (p[1] > 0.0005) {
			// Side over the cube: push it out past the cube's corners.
			const target = COVER.rMin + 0.004 * noise(d[0] * 5, d[1] * 5, d[2] * 5, seed + 909);
			const dh = Math.hypot(d[0], d[2]) || 1;
			p[0] = (d[0] / dh) * target;
			p[2] = (d[2] / dh) * target;
			if (p[1] > COVER.ySide) p[1] = Math.max(p[1], COVER.yTopMin);
		}
	}
}

function paintRock(m, cavity, pal, seed) {
	const { min, max } = bounds(m);
	const height = max[1] - min[1];
	const size = Math.max(max[0] - min[0], height, max[2] - min[2]);
	const s1 = 5 / size;
	const s2 = 22 / size;
	const s3 = 9 / size;
	const side = pal.side ?? null;
	m.colors = [];
	for (let i = 0; i < vcount(m); i++) {
		const x = m.positions[i * 3];
		const y = m.positions[i * 3 + 1];
		const z = m.positions[i * 3 + 2];
		const nx = m.normals[i * 3];
		const ny = m.normals[i * 3 + 1];
		const nz = m.normals[i * 3 + 2];
		let c = mix(pal.rock, pal.rock2, smooth(0.35, 0.65, noise(x * s1, y * s1, z * s1, seed + 1)));
		const mottle = 0.84 + 0.3 * noise(x * s2, y * s2, z * s2, seed + 2);
		const shade = lerp(0.7, 1, smooth(-0.45, 0.35, cavity[i]));
		c = c.map((v) => v * mottle * shade);
		let dust = (pal.dustAmount + 0.2) * smooth(0.2, 0.85, ny);
		dust += 0.5 * (1 - smooth(0, 0.14 * height, y));
		if (side) dust += side.amount * smooth(-0.1, 0.8, nx * side.dir[0] + nz * side.dir[1]);
		dust = clamp(dust * (0.7 + 0.6 * noise(x * s3, y * s3, z * s3, seed + 3)), 0, 0.93);
		c = mix(c, pal.dust ?? DUST, dust);
		m.colors.push(clamp(c[0], 0, 1), clamp(c[1], 0, 1), clamp(c[2], 0, 1));
	}
}

function makeRock(o) {
	const {
		name,
		seed,
		n = 20,
		half,
		exp = 3,
		warp = 0.16,
		warpFreq = 1.2,
		detail = 0.045,
		detailFreq = 4.5,
		bumps = 0,
		bumpFreq = 6,
		pits = 0,
		flutes = null,
		bury = 0.3,
		pre = null,
		post = null,
		height = null,
		fit = null,
		cover = false,
		faceted = false,
		palette
	} = o;
	const { dirs, tris } = cubeSphere(n);
	const so = seed * 13.37;
	const pts = [];
	const cavity = [];
	for (const d of dirs) {
		const t = Math.pow(
			Math.abs(d[0] / half[0]) ** exp +
				Math.abs(d[1] / half[1]) ** exp +
				Math.abs(d[2] / half[2]) ** exp,
			-1 / exp
		);
		const w = fbm(d[0] * warpFreq + so, d[1] * warpFreq + so * 0.7, d[2] * warpFreq - so, seed, 3);
		const dt = fbm(
			d[0] * detailFreq - so,
			d[1] * detailFreq + so,
			d[2] * detailFreq + so * 0.3,
			seed + 101,
			4
		);
		let r = 1 + warp * w + detail * dt;
		let cav = w * 0.5 + dt * 0.5;
		if (bumps) {
			const b = smooth(
				0.5,
				0.78,
				noise(d[0] * bumpFreq + so, d[1] * bumpFreq, d[2] * bumpFreq - so, seed + 202)
			);
			r += bumps * b;
			cav += b * 0.5 - 0.15;
		}
		if (pits) {
			const b = smooth(
				0.58,
				0.8,
				noise(d[0] * bumpFreq - so, d[1] * bumpFreq + so, d[2] * bumpFreq, seed + 303)
			);
			r -= pits * b;
			cav -= b * 0.7;
		}
		if (flutes) {
			const a = Math.atan2(d[2], d[0]);
			const f = (0.5 + 0.5 * Math.cos(flutes.count * a + 2.5 * d[1])) * (1 - Math.abs(d[1]));
			r *= 1 - flutes.depth * f;
			cav -= f * 0.6;
		}
		let p = [d[0] * t * r, d[1] * t * r, d[2] * t * r];
		if (pre) p = pre(p, d);
		pts.push(p);
		cavity.push(cav);
	}

	// Sink the rock into the ground and flatten what is below it.
	let minY = Infinity;
	let maxY = -Infinity;
	for (const p of pts) {
		minY = Math.min(minY, p[1]);
		maxY = Math.max(maxY, p[1]);
	}
	const y0 = minY + bury * (maxY - minY);
	for (const p of pts) p[1] = Math.max(p[1] - y0, 0);
	if (height) {
		const s = height / (maxY - y0);
		for (const p of pts) p[1] *= s;
	}
	if (fit) {
		const lo = [Infinity, Infinity, Infinity];
		const hi = [-Infinity, -Infinity, -Infinity];
		for (const p of pts)
			for (let k = 0; k < 3; k++) {
				lo[k] = Math.min(lo[k], p[k]);
				hi[k] = Math.max(hi[k], p[k]);
			}
		for (const p of pts) {
			p[0] = ((p[0] - (lo[0] + hi[0]) / 2) * fit[0]) / (hi[0] - lo[0]);
			p[1] = (p[1] * fit[1]) / hi[1];
			p[2] = ((p[2] - (lo[2] + hi[2]) / 2) * fit[2]) / (hi[2] - lo[2]);
		}
	}
	if (post) for (const p of pts) post(p);
	if (cover) enforceCover(pts, dirs, seed);

	let m = newMesh(name);
	for (const p of pts) m.positions.push(p[0], p[1], p[2]);
	m.indices = tris.slice();
	computeSmoothNormals(m);
	paintRock(m, cavity, palette, seed);
	if (faceted) m = flatShade(m);
	return m;
}

function checkCover(m) {
	const { min, max } = bounds(m);
	let minSide = Infinity;
	let minTop = Infinity;
	for (let i = 0; i < vcount(m); i++) {
		const x = m.positions[i * 3];
		const y = m.positions[i * 3 + 1];
		const z = m.positions[i * 3 + 2];
		const rh = Math.hypot(x, z);
		if (y > 0.001 && y <= 0.105) minSide = Math.min(minSide, rh);
		if (rh < 0.0757) minTop = Math.min(minTop, y > 0.001 ? y : Infinity);
	}
	const ok = max[1] <= 0.1201 && minSide >= 0.08 && minTop >= 0.105;
	return {
		ok,
		height: max[1],
		width: max[0] - min[0],
		depth: max[2] - min[2],
		minSide,
		minTop
	};
}

const PAL = {
	dark: { rock: hex('#55494a'), rock2: hex('#746259'), dustAmount: 0.5 },
	barnacle: { rock: hex('#5b4e48'), rock2: hex('#7a675c'), dustAmount: 0.4 },
	yogi: {
		rock: hex('#6a5a50'),
		rock2: hex('#8a705f'),
		dustAmount: 0.55,
		side: { dir: [-0.8, 0.6], amount: 0.45 }
	},
	scooby: { rock: hex('#c4a58c'), rock2: hex('#dcc3aa'), dustAmount: 0.3, dust: SOIL },
	moe: { rock: hex('#665248'), rock2: hex('#84695a'), dustAmount: 0.45 },
	stimpy: { rock: hex('#4c4444'), rock2: hex('#6a5a55'), dustAmount: 0.35 },
	chimp: { rock: hex('#5e5049'), rock2: hex('#7d6a5e'), dustAmount: 0.6 },
	pebble: { rock: hex('#5f514b'), rock2: hex('#7c685c'), dustAmount: 0.6 }
};

// Shape recipes shared by the cover and true-scale versions of each named rock.
// "half" is in arbitrary units for true-scale rocks (they are fitted to a size)
// and in metres for cover rocks.
const RECIPES = {
	'barnacle-bill': {
		label: 'Barnacle Bill',
		seed: 11,
		exp: 3.2,
		bumps: 0.1,
		bumpFreq: 6.5,
		palette: PAL.barnacle,
		coverHalf: [0.122, 0.085, 0.112]
	},
	yogi: {
		label: 'Yogi',
		seed: 23,
		exp: 2.9,
		warp: 0.14,
		detail: 0.035,
		palette: PAL.yogi,
		coverHalf: [0.13, 0.088, 0.122]
	},
	'scooby-doo': {
		label: 'Scooby-Doo',
		seed: 37,
		exp: 4.2,
		siteExp: 3,
		warp: 0.1,
		pits: 0.05,
		bumpFreq: 8,
		palette: PAL.scooby,
		coverHalf: [0.135, 0.082, 0.118]
	},
	wedge: {
		label: 'Wedge',
		seed: 41,
		exp: 3.6,
		warp: 0.12,
		palette: PAL.dark,
		coverHalf: [0.118, 0.085, 0.108],
		pre: (p) => {
			if (p[0] > 0) p[0] *= 1.75;
			return p;
		},
		coverPost: (p) => {
			if (p[0] > 0.085) p[1] *= 1 - 0.88 * smooth(0.085, 0.215, p[0]);
		},
		sitePre: (p) => {
			if (p[0] > 0) p[1] -= 0.75 * smooth(0, 1.6, p[0]) * Math.max(p[1] + 0.3, 0);
			return p;
		}
	},
	shark: {
		label: 'Shark',
		seed: 53,
		exp: 3.3,
		warp: 0.13,
		palette: PAL.dark,
		coverHalf: [0.13, 0.085, 0.105],
		pre: (p) => {
			const k = smooth(0, 0.085, p[1]);
			p[0] += 0.45 * p[1];
			p[2] *= 1 - 0.28 * k;
			return p;
		},
		sitePre: (p) => {
			p[0] += 0.55 * p[1];
			p[2] *= 1 - 0.45 * smooth(0, 0.8, p[1]);
			return p;
		}
	},
	'half-dome': {
		label: 'Half Dome',
		seed: 67,
		exp: 3.0,
		warp: 0.12,
		palette: PAL.dark,
		coverHalf: [0.122, 0.088, 0.13],
		pre: (p) => {
			p[2] = Math.min(p[2], 0.096);
			return p;
		},
		sitePre: (p) => {
			p[2] = Math.min(p[2], 0.45);
			return p;
		}
	},
	moe: {
		label: 'Moe',
		seed: 71,
		exp: 3.1,
		warp: 0.12,
		flutes: { count: 9, depth: 0.09 },
		palette: PAL.moe,
		coverHalf: [0.128, 0.086, 0.118]
	},
	stimpy: {
		label: 'Stimpy',
		seed: 83,
		exp: 3.4,
		warp: 0.2,
		detail: 0.07,
		faceted: true,
		coverN: 7,
		siteN: 5,
		palette: PAL.stimpy,
		coverHalf: [0.118, 0.085, 0.11]
	},
	chimp: {
		label: 'Chimp',
		seed: 97,
		exp: 5,
		siteExp: 3.4,
		warp: 0.1,
		detail: 0.04,
		palette: PAL.chimp,
		coverHalf: [0.145, 0.08, 0.122]
	}
};

function coverRock(id) {
	const r = RECIPES[id];
	return makeRock({
		name: `cover-${id}`,
		seed: r.seed,
		n: r.coverN ?? 20,
		half: r.coverHalf,
		exp: r.exp,
		warp: r.warp,
		detail: r.detail,
		bumps: r.bumps,
		bumpFreq: r.bumpFreq,
		pits: r.pits,
		flutes: r.flutes,
		bury: 0.3,
		pre: r.pre,
		post: r.coverPost,
		height: COVER.yMax,
		cover: true,
		faceted: r.faceted,
		palette: r.palette
	});
}

function siteRock(id, size, n = 12) {
	const r = RECIPES[id];
	return makeRock({
		name: `rock-${id}`,
		seed: r.seed + 500,
		n: r.siteN ?? n,
		half: [1, 0.75, 0.9],
		// True-scale rocks have no cube to hide, so they can be rounder and lumpier.
		exp: r.siteExp ?? Math.min(r.exp, 2.4),
		warp: (r.warp ?? 0.16) + 0.14,
		warpFreq: 0.95,
		detail: r.detail,
		bumps: r.bumps,
		bumpFreq: r.bumpFreq,
		pits: r.pits,
		flutes: r.flutes,
		bury: 0.22,
		pre: r.sitePre,
		fit: size,
		faceted: r.faceted,
		palette: r.palette
	});
}

// ---------------------------------------------------------------- lander

const C = {
	petal: hex('#d7d2c5'),
	solar: hex('#1c2440'),
	solarEdge: hex('#39446a'),
	gold: hex('#b89443'),
	white: hex('#e6e3da'),
	grey: hex('#8c8f94'),
	dark: hex('#2a2a2e'),
	airbag: hex('#d8cfbf'),
	wheel: hex('#6f7175'),
	ramp: hex('#c9b27a')
};

// The open lander is one large triangle, 2.4 m on a side, split into four: the base
// in the middle and three petals. That gives 2.77 m across, matching the quoted 2.75 m.
const LANDER = { side: 2.4, deck: 0.32, plate: 0.04, boxH: 0.36, mast: 0.8, rampAngle: 20 * DEG };

function makeLander() {
	const R = LANDER.side / Math.sqrt(3);
	const H = LANDER.deck;
	const at = (deg, r) => [Math.cos(deg * DEG) * r, Math.sin(deg * DEG) * r];
	const big = [90, 210, 330].map((a) => at(a, R));
	const mid = [270, 30, 150].map((a) => at(a, R / 2));
	const inset = (tri, k) => {
		const c = [(tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3];
		return tri.map((p) => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]);
	};
	const parts = [];

	// Base and petals
	parts.push(prism(mid, H - LANDER.plate, H, C.petal));
	const petals = [
		[big[0], mid[1], mid[2]], // rover petal, points along +z
		[big[1], mid[2], mid[0]],
		[big[2], mid[0], mid[1]]
	];
	petals.forEach((tri, i) => {
		parts.push(prism(tri, H - LANDER.plate, H, C.petal));
		parts.push(prism(inset(tri, 0.9), H, H + 0.004, C.solarEdge));
		parts.push(prism(inset(tri, i === 0 ? 0.55 : 0.84), H + 0.004, H + 0.008, C.solar));
	});
	// Where the rover sat on its petal
	parts.push(translate(box(0.5, 0.012, 0.3, C.white), 0, H + 0.008, R * 0.52));

	// Electronics box, mast and camera
	parts.push(translate(box(0.62, LANDER.boxH, 0.5, C.gold), 0, H, -0.02));
	parts.push(translate(box(0.66, 0.02, 0.54, C.white), 0, H + LANDER.boxH, -0.02));
	const mastBase = H + LANDER.boxH + 0.02;
	parts.push(translate(cylinder(0.022, LANDER.mast, 8, C.grey), 0, mastBase, -0.02));
	const head = rotate(cylinder(0.05, 0.22, 10, C.white), 'z', 90 * DEG);
	parts.push(translate(head, 0.11, mastBase + LANDER.mast - 0.05, -0.02));
	for (const sx of [-1, 1])
		parts.push(
			translate(
				rotate(cylinder(0.022, 0.03, 8, C.dark), 'x', 90 * DEG),
				sx * 0.075,
				mastBase + LANDER.mast,
				0.03
			)
		);

	// High-gain dish and low-gain antenna
	parts.push(translate(cylinder(0.012, 0.22, 6, C.grey), 0.22, mastBase, -0.2));
	const dish = rotate(cylinder(0.15, 0.02, 16, C.white), 'x', -35 * DEG);
	parts.push(translate(dish, 0.22, mastBase + 0.24, -0.2));
	parts.push(translate(cylinder(0.008, 0.3, 6, C.grey), -0.24, mastBase, -0.2));

	// Weather mast at the tip of a side petal, with three wind socks
	const tip = [big[1][0] * 0.82, big[1][1] * 0.82];
	parts.push(translate(cylinder(0.01, 1.0, 6, C.grey), tip[0], H, tip[1]));
	for (const y of [0.35, 0.65, 0.95])
		parts.push(translate(box(0.05, 0.02, 0.02, C.white), tip[0] + 0.03, H + y, tip[1]));

	// Two ramps off the free edges of the rover petal, sloping to the ground
	const run = H / Math.tan(LANDER.rampAngle);
	const rampW = 0.44;
	for (const m of [mid[1], mid[2]]) {
		const v = big[0];
		const e = [(v[0] + m[0]) / 2, (v[1] + m[1]) / 2];
		const along = [v[0] - m[0], v[1] - m[1]];
		const al = Math.hypot(along[0], along[1]);
		const ax = [along[0] / al, along[1] / al];
		let out = [ax[1], -ax[0]];
		const pc = [(v[0] + mid[1][0] + mid[2][0]) / 3, (v[1] + mid[1][1] + mid[2][1]) / 3];
		if (out[0] * (e[0] - pc[0]) + out[1] * (e[1] - pc[1]) < 0) out = [-out[0], -out[1]];
		const a = [e[0] - (ax[0] * rampW) / 2, e[1] - (ax[1] * rampW) / 2];
		const b = [e[0] + (ax[0] * rampW) / 2, e[1] + (ax[1] * rampW) / 2];
		parts.push(
			slab(
				[
					[a[0], H, a[1]],
					[b[0], H, b[1]],
					[b[0] + out[0] * run, 0.012, b[1] + out[1] * run],
					[a[0] + out[0] * run, 0.012, a[1] + out[1] * run]
				],
				0.012,
				C.ramp
			)
		);
	}
	const body = hard('lander-body', 'metal', parts);

	// Deflated airbags bunched under and around the petals
	const bags = [];
	const rand = rng(4242);
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * 360 + rand() * 14;
		const r = 0.75 + rand() * 0.55;
		const bag = makeRock({
			name: 'bag',
			seed: 600 + i,
			n: 6,
			half: [1, 0.5, 0.8],
			exp: 2.4,
			warp: 0.3,
			warpFreq: 1.6,
			detail: 0.1,
			bury: 0.35,
			fit: [0.7 + rand() * 0.45, 0.16 + rand() * 0.12, 0.55 + rand() * 0.35],
			palette: { rock: C.airbag, rock2: hex('#c4b9a6'), dustAmount: 0.35, dust: SOIL }
		});
		rotate(bag, 'y', rand() * Math.PI);
		const [x, z] = at(a, r);
		bags.push(translate(bag, x, 0, z));
	}
	const airbags = merge('lander-airbags', 'matte', bags);
	return { body, airbags };
}

// ---------------------------------------------------------------- Sojourner

// 65 cm long, 48 cm wide, 30 cm tall; six wheels of 13 cm diameter and 7.9 cm width.
// Forward is -z.
function makeSojourner(material = 'metal') {
	const parts = [];
	const wheelR = 0.065;
	const wheelW = 0.079;
	for (const sx of [-1, 1]) {
		for (const z of [-0.26, 0, 0.26]) {
			const w = rotate(cylinder(wheelR, wheelW, 14, C.wheel), 'z', 90 * DEG);
			parts.push(translate(w, sx * 0.2 + wheelW / 2, wheelR, z));
		}
		// Rocker-bogie arms
		parts.push(translate(box(0.02, 0.025, 0.3, C.grey), sx * 0.15, 0.085, -0.13));
		parts.push(translate(box(0.02, 0.025, 0.3, C.grey), sx * 0.15, 0.085, 0.13));
		parts.push(translate(box(0.02, 0.1, 0.025, C.grey), sx * 0.15, 0.09, 0));
	}
	parts.push(translate(box(0.28, 0.14, 0.44, C.gold), 0, 0.135, 0)); // warm electronics box
	parts.push(translate(box(0.46, 0.012, 0.6, C.solarEdge), 0, 0.282, 0)); // solar panel
	parts.push(translate(box(0.42, 0.006, 0.56, C.solar), 0, 0.294, 0));
	for (const sx of [-1, 1])
		parts.push(translate(box(0.035, 0.035, 0.03, C.dark), sx * 0.07, 0.2, -0.235)); // front cameras
	parts.push(translate(rotate(cylinder(0.025, 0.07, 8, C.grey), 'x', 90 * DEG), 0.06, 0.16, 0.22)); // APXS at the rear
	parts.push(translate(cylinder(0.004, 0.32, 5, C.grey), -0.2, 0.3, 0.26)); // UHF antenna
	return hard('sojourner', material, parts);
}

// ---------------------------------------------------------------- ground

// o.blast: radius in metres of soil darkened around the origin by landing rockets.
function makeGround(size = 30, seg = 64, o = {}) {
	const m = newMesh('ground');
	const a = o.a ?? hex('#b06a3c');
	const b = o.b ?? hex('#c98b58');
	const dark = o.dark ?? hex('#8d5633');
	const s = o.seed ?? 77;
	for (let j = 0; j <= seg; j++)
		for (let i = 0; i <= seg; i++) {
			const x = (i / seg - 0.5) * size;
			const z = (j / seg - 0.5) * size;
			let c = mix(a, b, smooth(-0.35, 0.4, fbm(x * 0.18, 0, z * 0.18, s, 4)));
			c = mix(c, dark, 0.5 * smooth(0.1, 0.6, fbm(x * 0.6, 3, z * 0.6, s + 1, 3)));
			if (o.blast)
				c = mix(c, dark, 0.55 * (1 - smooth(o.blast * 0.4, o.blast * 1.3, Math.hypot(x, z))));
			const g = 0.92 + 0.16 * noise(x * 3, 0, z * 3, s + 2);
			addVertex(m, [x, 0, z], [c[0] * g, c[1] * g, c[2] * g]);
			m.normals.push(0, 1, 0);
		}
	for (let j = 0; j < seg; j++)
		for (let i = 0; i < seg; i++) {
			const p = j * (seg + 1) + i;
			m.indices.push(p, p + seg + 1, p + 1, p + 1, p + seg + 1, p + seg + 2);
		}
	return m;
}

// ---------------------------------------------------------------- InSight

const CI = {
	deck: hex('#cfcac0'),
	gold: hex('#b08a3e'),
	solar: hex('#20263f'),
	rib: hex('#8f8d86'),
	strut: hex('#9a9da1'),
	dark: hex('#26262a'),
	white: hex('#ecebe6'),
	copper: hex('#b06a3a'),
	copperLight: hex('#c98552'),
	skirt: hex('#a98f5a'),
	tether: hex('#c79a3c')
};

// Box of cross-section w x h between two points.
function beam(p0, p1, w, h, color) {
	const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
	const len = Math.hypot(d[0], d[1], d[2]);
	const dir = d.map((v) => v / len);
	const ref = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
	let u = [
		dir[1] * ref[2] - dir[2] * ref[1],
		dir[2] * ref[0] - dir[0] * ref[2],
		dir[0] * ref[1] - dir[1] * ref[0]
	];
	const ul = Math.hypot(u[0], u[1], u[2]);
	u = u.map((v) => v / ul);
	const v = [
		dir[1] * u[2] - dir[2] * u[1],
		dir[2] * u[0] - dir[0] * u[2],
		dir[0] * u[1] - dir[1] * u[0]
	];
	const m = newMesh('beam');
	for (const p of [p0, p1])
		for (const [su, sv] of [
			[-1, -1],
			[1, -1],
			[1, 1],
			[-1, 1]
		])
			addVertex(
				m,
				[0, 1, 2].map((k) => p[k] + (u[k] * su * w) / 2 + (v[k] * sv * h) / 2),
				color
			);
	m.indices.push(0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7);
	for (let i = 0; i < 4; i++) {
		const j = (i + 1) % 4;
		m.indices.push(i, j, 4 + j, i, 4 + j, 4 + i);
	}
	return fixConvexWinding(m);
}

// Surface of revolution around the y axis. profile is [radius, y] from bottom to top.
function lathe(name, profile, seg, colorAt) {
	const m = newMesh(name);
	for (let j = 0; j < profile.length; j++)
		for (let i = 0; i < seg; i++) {
			const a = (i / seg) * Math.PI * 2;
			const [r, y] = profile[j];
			addVertex(m, [Math.cos(a) * r, y, Math.sin(a) * r], colorAt(j, a));
		}
	for (let j = 0; j < profile.length - 1; j++)
		for (let i = 0; i < seg; i++) {
			const a = j * seg + i;
			const b = j * seg + ((i + 1) % seg);
			m.indices.push(a, a + seg, b, b, a + seg, b + seg);
		}
	return computeSmoothNormals(m);
}

const ring = (r, n, rot = 0) =>
	Array.from({ length: n }, (_, i) => {
		const a = rot + (i / n) * Math.PI * 2;
		return [Math.cos(a) * r, Math.sin(a) * r];
	});

const shieldColour = (skirtRows) => (j, a) => {
	if (j < skirtRows) return CI.skirt.map((v) => v * (0.78 + 0.22 * Math.cos(a * 18)));
	if (j === skirtRows) return CI.strut.map((v) => v * 0.7);
	return CI.white.map((v) => v * (Math.abs(Math.sin(a * 3)) < 0.06 ? 0.85 : 1));
};

// Instruments sized to hide a 10 cm cube, like the rock covers. Stylised, not to scale.
function insightCovers() {
	const shield = lathe(
		'cover-seis-shield',
		[
			[0.14, 0],
			[0.138, 0.012],
			[0.128, 0.03],
			[0.114, 0.036],
			[0.113, 0.07],
			[0.108, 0.092],
			[0.097, 0.106],
			[0.09, 0.1095],
			[0.07, 0.1165],
			[0.04, 0.1193],
			[0, 0.12]
		],
		48,
		shieldColour(3)
	);

	const feet = (r, radius, h, n, rot = 0) =>
		ring(r, n, rot).map(([x, z]) => translate(cylinder(radius, h, 8, CI.strut), x, 0, z));
	const tetherStub = () => translate(box(0.05, 0.004, 0.1, CI.tether), 0, 0.001, 0.16);

	const seis = hard('cover-seis', 'metal', [
		prism(ring(0.118, 6), 0, 0.1, CI.copper),
		prism(ring(0.121, 6), 0.045, 0.055, CI.dark),
		prism(ring(0.1, 6), 0.1, 0.112, CI.copperLight),
		translate(cylinder(0.02, 0.008, 10, CI.strut), 0, 0.112, 0),
		...feet(0.137, 0.016, 0.03, 3, Math.PI / 6),
		tetherStub()
	]);

	const probe = hard('cover-heat-probe', 'metal', [
		prism(ring(0.112, 8, Math.PI / 8), 0, 0.104, CI.dark),
		prism(ring(0.1, 8, Math.PI / 8), 0.104, 0.11, CI.gold),
		translate(cylinder(0.022, 0.01, 10, CI.strut), 0.03, 0.11, 0),
		...feet(0.15, 0.018, 0.012, 4, Math.PI / 4),
		tetherStub()
	]);

	return [
		{
			id: 'seis',
			label: 'Seismometer (SEIS)',
			mesh: seis,
			note: 'The copper-coloured seismometer. Stylised to hide a 10 cm cube; not to scale.'
		},
		{
			id: 'seis-shield',
			label: 'Wind and Thermal Shield',
			mesh: shield,
			note: 'The dome placed over the seismometer to protect it from wind and temperature swings. Stylised to hide a 10 cm cube; not to scale.'
		},
		{
			id: 'heat-probe',
			label: 'Heat probe (HP3)',
			mesh: probe,
			note: 'The heat flow probe and its support structure. Stylised to hide a 10 cm cube; not to scale.'
		}
	];
}

// True-scale InSight. Deck 1.56 m across, two ten-sided 2.15 m solar arrays spanning 6 m,
// deck about 0.95 m above the ground, 1.8 m robotic arm (all sourced). Detail is schematic.
// Front (the instrument workspace) is +z, which is south.
function makeInsight() {
	const deckTop = 0.95;
	const parts = [];
	parts.push(prism(ring(0.78, 12), deckTop - 0.12, deckTop, CI.deck));
	parts.push(translate(cylinder(0.55, 0.3, 12, CI.gold), 0, deckTop - 0.42, 0));

	// Three legs with footpads
	for (const deg of [30, 150, 270]) {
		const a = deg * DEG;
		const foot = [Math.cos(a) * 1.12, 0.06, Math.sin(a) * 1.12];
		parts.push(
			beam([Math.cos(a) * 0.6, deckTop - 0.12, Math.sin(a) * 0.6], foot, 0.05, 0.05, CI.strut)
		);
		for (const off of [-28, 28]) {
			const b = (deg + off) * DEG;
			parts.push(
				beam([Math.cos(b) * 0.5, deckTop - 0.35, Math.sin(b) * 0.5], foot, 0.03, 0.03, CI.strut)
			);
		}
		parts.push(translate(cylinder(0.14, 0.04, 12, CI.strut), foot[0], 0, foot[2]));
	}

	// Solar arrays, east and west
	for (const side of [-1, 1]) {
		const cx = side * 1.925;
		parts.push(translate(prism(ring(1.075, 10), deckTop - 0.02, deckTop, CI.solar), cx, 0, 0));
		for (const [x, z] of ring(1.075, 10))
			parts.push(beam([cx, deckTop + 0.004, 0], [cx + x, deckTop + 0.004, z], 0.02, 0.006, CI.rib));
		parts.push(
			beam([side * 0.6, deckTop - 0.06, 0], [cx, deckTop - 0.03, 0], 0.06, 0.04, CI.strut)
		);
	}

	// Robotic arm, reaching out over the workspace
	const shoulder = [0.25, deckTop + 0.1, 0.6];
	const elbow = [0.25, deckTop + 0.6, 1.15];
	const wrist = [0.25, deckTop - 0.1, 1.72];
	parts.push(translate(cylinder(0.05, 0.1, 10, CI.strut), shoulder[0], deckTop, shoulder[2]));
	parts.push(beam(shoulder, elbow, 0.05, 0.05, CI.white));
	parts.push(beam(elbow, wrist, 0.045, 0.045, CI.white));
	parts.push(beam(wrist, [wrist[0], wrist[1] - 0.3, wrist[2]], 0.008, 0.008, CI.dark)); // grapple cable
	parts.push(translate(box(0.07, 0.05, 0.07, CI.dark), wrist[0], wrist[1] - 0.35, wrist[2])); // grapple
	parts.push(translate(box(0.08, 0.07, 0.1, CI.dark), 0.25, deckTop + 0.38, 1.33)); // arm camera
	parts.push(translate(box(0.1, 0.06, 0.12, CI.strut), 0.33, wrist[1], wrist[2])); // scoop

	// Deck equipment
	parts.push(translate(cylinder(0.06, 0.25, 10, CI.white), -0.35, deckTop, -0.3)); // UHF antenna
	for (const side of [-1, 1]) {
		parts.push(translate(box(0.1, 0.12, 0.1, CI.gold), side * 0.45, deckTop, -0.45)); // medium-gain horns
		parts.push(translate(cylinder(0.012, 0.25, 6, CI.strut), side * 0.62, deckTop, 0.2)); // weather booms
		parts.push(translate(box(0.12, 0.02, 0.02, CI.strut), side * 0.66, deckTop + 0.24, 0.2));
	}
	parts.push(translate(box(0.26, 0.1, 0.16, CI.gold), -0.2, deckTop, 0.5)); // tether storage box
	parts.push(translate(cylinder(0.04, 0.03, 10, CI.white), 0.05, deckTop, -0.1)); // pressure inlet
	const lander = hard('insight-lander', 'metal', parts);

	// Instruments on the ground
	const shield = lathe(
		'insight-seis-shield',
		[
			[0.43, 0],
			[0.42, 0.03],
			[0.39, 0.08],
			[0.35, 0.1],
			[0.35, 0.2],
			[0.33, 0.27],
			[0.27, 0.33],
			[0.17, 0.37],
			[0.07, 0.385],
			[0, 0.39]
		],
		40,
		shieldColour(3)
	);
	const probe = hard('insight-heat-probe', 'metal', [
		translate(box(0.34, 0.06, 0.3, CI.dark), 0, 0.05, 0),
		...ring(0.21, 4, Math.PI / 4).map(([x, z]) =>
			translate(cylinder(0.03, 0.05, 8, CI.strut), x, 0, z)
		),
		translate(box(0.2, 0.14, 0.22, CI.dark), 0, 0.11, 0),
		translate(cylinder(0.03, 0.45, 10, CI.strut), 0.05, 0.11, 0), // tube that held the mole
		translate(box(0.12, 0.1, 0.18, CI.gold), -0.09, 0.11, -0.02)
	]);

	// Tethers: flat ribbon cables from the deck to each instrument
	const tether = (to) =>
		hard(
			'insight-tether',
			'matte',
			[
				[
					[-0.2, deckTop, 0.7],
					[-0.15, 0.012, 1.1]
				],
				[
					[-0.15, 0.012, 1.1],
					[to[0], 0.012, to[2] - 0.3]
				]
			].map(([p, q]) => beam(p, q, 0.06, 0.006, CI.tether))
		);
	return { lander, shield, probe, tether };
}

const INSIGHT_SOURCES = {
	nasaMission: 'https://science.nasa.gov/mission/insight/',
	pressKit: 'https://www.jpl.nasa.gov/news/press_kits/insight/landing/facts',
	firstInstrument: 'https://www.jpl.nasa.gov/news/nasas-insight-places-first-instrument-on-mars/'
};

// Lander at the origin. Instruments were set down to the south of the lander.
const INSIGHT_ITEMS = [
	{
		id: 'seis',
		label: 'Seismometer under its Wind and Thermal Shield',
		east: 0.2,
		north: -2.0,
		position: 'approximate',
		source: INSIGHT_SOURCES.firstInstrument,
		note: 'Placed on 19 December 2018, 1.636 m from the lander, about as far as the arm could reach (sourced). Which point of the lander that is measured from is not stated, so the modelled spot is approximate. The shield size is approximate.'
	},
	{
		id: 'heat-probe',
		label: 'Heat probe (HP3)',
		east: 1.4,
		north: -2.0,
		position: 'approximate',
		source: INSIGHT_SOURCES.firstInstrument,
		note: 'Planned about 1.2 m to the left of the seismometer, at a similar distance from the lander. Size approximate.'
	}
];

// ---------------------------------------------------------------- GLB writer

const MATERIALS = {
	matte: {
		pbrMetallicRoughness: {
			baseColorFactor: [1, 1, 1, 1],
			metallicFactor: 0,
			roughnessFactor: 0.95
		}
	},
	metal: {
		pbrMetallicRoughness: {
			baseColorFactor: [1, 1, 1, 1],
			metallicFactor: 0.25,
			roughnessFactor: 0.6
		}
	},
	ghost: {
		pbrMetallicRoughness: {
			baseColorFactor: [0.75, 0.9, 1, 0.45],
			metallicFactor: 0,
			roughnessFactor: 0.8
		},
		alphaMode: 'BLEND'
	}
};

const node = (name, mesh = null, opts = {}) => ({ name, mesh, children: [], ...opts });

function writeGLB(file, roots) {
	const chunks = [];
	let offset = 0;
	const bufferViews = [];
	const accessors = [];
	const meshes = [];
	const meshIds = new Map();
	const materials = [];
	const materialIds = new Map();
	const nodes = [];
	let triangles = 0;

	const view = (typed, target) => {
		const pad = (4 - (offset % 4)) % 4;
		if (pad) {
			chunks.push(Buffer.alloc(pad));
			offset += pad;
		}
		bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: typed.byteLength, target });
		chunks.push(Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength));
		offset += typed.byteLength;
		return bufferViews.length - 1;
	};
	const materialId = (name) => {
		if (!materialIds.has(name)) {
			materialIds.set(name, materials.length);
			materials.push({ name, ...MATERIALS[name] });
		}
		return materialIds.get(name);
	};
	const meshId = (m) => {
		if (meshIds.has(m)) return meshIds.get(m);
		const n = vcount(m);
		const pos = new Float32Array(m.positions);
		const nor = new Float32Array(m.normals);
		const col = new Uint8Array(n * 4);
		for (let i = 0; i < n; i++) {
			for (let k = 0; k < 3; k++)
				col[i * 4 + k] = Math.round(255 * Math.pow(clamp(m.colors[i * 3 + k], 0, 1), 2.2));
			col[i * 4 + 3] = 255;
		}
		const idx = new Uint32Array(m.indices);
		const { min, max } = bounds(m);
		const a0 = accessors.length;
		accessors.push({
			bufferView: view(pos, 34962),
			componentType: 5126,
			count: n,
			type: 'VEC3',
			min,
			max
		});
		accessors.push({ bufferView: view(nor, 34962), componentType: 5126, count: n, type: 'VEC3' });
		accessors.push({
			bufferView: view(col, 34962),
			componentType: 5121,
			normalized: true,
			count: n,
			type: 'VEC4'
		});
		accessors.push({
			bufferView: view(idx, 34963),
			componentType: 5125,
			count: idx.length,
			type: 'SCALAR'
		});
		meshes.push({
			name: m.name,
			primitives: [
				{
					attributes: { POSITION: a0, NORMAL: a0 + 1, COLOR_0: a0 + 2 },
					indices: a0 + 3,
					material: materialId(m.material)
				}
			]
		});
		meshIds.set(m, meshes.length - 1);
		return meshes.length - 1;
	};
	const addNode = (n) => {
		const o = { name: n.name };
		if (n.mesh) {
			o.mesh = meshId(n.mesh);
			triangles += n.mesh.indices.length / 3;
		}
		if (n.t) o.translation = n.t;
		if (n.yaw) o.rotation = [0, Math.sin(n.yaw / 2), 0, Math.cos(n.yaw / 2)];
		if (n.scale) o.scale = n.scale;
		if (n.extras) o.extras = n.extras;
		const kids = n.children.map(addNode);
		if (kids.length) o.children = kids;
		nodes.push(o);
		return nodes.length - 1;
	};
	const rootIds = roots.map(addNode);

	const json = {
		asset: { version: '2.0', generator: 'jezdzik tools/make_models.mjs' },
		scene: 0,
		scenes: [{ nodes: rootIds }],
		nodes,
		meshes,
		materials,
		accessors,
		bufferViews,
		buffers: [{ byteLength: offset }]
	};
	let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
	if (jsonBuf.length % 4)
		jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(4 - (jsonBuf.length % 4), 0x20)]);
	let binBuf = Buffer.concat(chunks);
	if (binBuf.length % 4) binBuf = Buffer.concat([binBuf, Buffer.alloc(4 - (binBuf.length % 4))]);
	const header = Buffer.alloc(12);
	header.writeUInt32LE(0x46546c67, 0);
	header.writeUInt32LE(2, 4);
	header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
	const jh = Buffer.alloc(8);
	jh.writeUInt32LE(jsonBuf.length, 0);
	jh.writeUInt32LE(0x4e4f534a, 4);
	const bh = Buffer.alloc(8);
	bh.writeUInt32LE(binBuf.length, 0);
	bh.writeUInt32LE(0x004e4942, 4);
	const outPath = path.join(OUT, file);
	mkdirSync(path.dirname(outPath), { recursive: true });
	const glb = Buffer.concat([header, jh, jsonBuf, bh, binBuf]);
	writeFileSync(outPath, glb);
	return { file, triangles, bytes: glb.length };
}

// ---------------------------------------------------------------- site data

// Lander at the origin. east/north in metres at true scale.
// position/size confidence: "sourced" = stated by the cited source,
// "approximate" = placed by eye or from memory and NOT verified.
const SOURCES = {
	nasaMission: 'https://science.nasa.gov/mission/mars-pathfinder/',
	nasaYogi: 'https://science.nasa.gov/resource/sojourner-barnacle-bill-yogi/',
	wikiRover: 'https://en.wikipedia.org/wiki/Sojourner_(rover)',
	nssdc: 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1996-068A',
	astronomy: 'https://www.astronomy.com/space-exploration/sojourner-lost-and-found/',
	hirise: 'https://hirise.lpl.arizona.edu/PSP_001890_1995',
	rockGarden:
		'https://www.jpl.nasa.gov/images/pia00901-mosaic-of-wedge-shark-half-dome-moe-and-flat-top/'
};

const polar = (bearingDeg, dist) => ({
	east: +(Math.sin(bearingDeg * DEG) * dist).toFixed(2),
	north: +(Math.cos(bearingDeg * DEG) * dist).toFixed(2)
});

const SITE_ROCKS = [
	{
		id: 'yogi',
		...polar(315, 5),
		size: [1.25, 0.95, 1.05],
		position: 'sourced',
		sizeConfidence: 'approximate',
		source: SOURCES.nasaYogi,
		note: 'NASA: a metre-size rock about 5 m northwest of the lander. Exact width, height and depth are approximate.'
	},
	{
		id: 'barnacle-bill',
		...polar(292.5, 2.2),
		size: [0.36, 0.2, 0.3],
		position: 'approximate',
		sizeConfidence: 'approximate',
		source: SOURCES.nasaYogi,
		note: 'NASA: a small rock immediately west-northwest of the lander. The 2.2 m distance and the size are approximate.'
	},
	{
		id: 'scooby-doo',
		...polar(20, 4.2),
		size: [0.55, 0.14, 0.45],
		position: 'approximate',
		sizeConfidence: 'approximate',
		source: SOURCES.wikiRover,
		note: 'Analysed on sol 14. Its direction and distance from the lander are NOT verified.'
	},
	{
		id: 'wedge',
		...polar(232, 4.3),
		size: [0.5, 0.3, 0.36],
		position: 'approximate',
		sizeConfidence: 'approximate',
		source: SOURCES.rockGarden,
		note: 'In the Rock Garden, southwest of the lander. Position and size approximate.'
	},
	{
		id: 'shark',
		...polar(235, 6.4),
		size: [0.69, 0.4, 0.45],
		position: 'approximate',
		sizeConfidence: 'sourced',
		source: SOURCES.rockGarden,
		note: 'Reported as about 0.69 m wide, 0.40 m high and 6.4 m from the lander, in the Rock Garden to the southwest. The exact bearing and the depth are approximate.'
	},
	{
		id: 'half-dome',
		...polar(241, 6.7),
		size: [0.6, 0.5, 0.5],
		position: 'approximate',
		sizeConfidence: 'approximate',
		source: SOURCES.rockGarden,
		note: 'In the Rock Garden next to Shark. Position and size approximate.'
	},
	{
		id: 'moe',
		...polar(236, 7.5),
		size: [0.62, 0.42, 0.5],
		position: 'approximate',
		sizeConfidence: 'approximate',
		source: SOURCES.rockGarden,
		note: 'In the Rock Garden; shows fluting from wind erosion. Position and size approximate.'
	},
	{
		id: 'stimpy',
		...polar(229, 7.2),
		size: [0.32, 0.2, 0.26],
		position: 'approximate',
		sizeConfidence: 'approximate',
		source: SOURCES.rockGarden,
		note: 'In front of Moe. Position and size approximate.'
	},
	{
		id: 'chimp',
		...polar(214, 11.4),
		size: [0.75, 0.3, 0.6],
		position: 'approximate',
		sizeConfidence: 'approximate',
		source: SOURCES.astronomy,
		note: 'A tabular rock beyond the Rock Garden; the rover was last seen near it. Position and size approximate.'
	}
];

const SITE_POINTS = [
	{
		id: 'sojourner-last-known',
		label: 'Sojourner: last known position',
		...polar(212, 11.0),
		position: 'approximate',
		source: SOURCES.astronomy,
		note: 'Near the rock Chimp at the final data transmission on 27 September 1997. Sources give 12 m (Wikipedia: always within 12 m) to 13 m (Astronomy) from the lander. Exact spot approximate.'
	},
	{
		id: 'sojourner-hirise-candidate',
		label: 'Sojourner: possible resting place',
		...polar(180, 6),
		position: 'sourced',
		source: SOURCES.hirise,
		note: 'A feature about 6 m due south of the lander in the 21 December 2006 HiRISE image, tentatively identified as the rover. The identification was never confirmed.'
	}
];

// The rear ramp points roughly toward Barnacle Bill and Yogi. Approximate.
const LANDER_YAW_DEG = 120;

// ---------------------------------------------------------------- build

const report = [];
const manifest = [];

// Cover rocks
for (const id of Object.keys(RECIPES)) {
	const m = coverRock(id);
	const check = checkCover(m);
	const out = writeGLB(`cover/${id}.glb`, [node(`cover-${id}`, m)]);
	report.push({
		model: out.file,
		tris: out.triangles,
		kB: +(out.bytes / 1024).toFixed(0),
		'w x h x d (cm)': `${(check.width * 100).toFixed(1)} x ${(check.height * 100).toFixed(1)} x ${(check.depth * 100).toFixed(1)}`,
		'hides cube': check.ok ? 'yes' : 'NO',
		'min side r (cm)': +(check.minSide * 100).toFixed(2),
		'min top y (cm)': +(check.minTop * 100).toFixed(2)
	});
	manifest.push({
		id: `cover-${id}`,
		group: 'cover',
		cover: true,
		label: RECIPES[id].label,
		file: out.file,
		triangles: out.triangles,
		note: 'Stylised to hide a 10 cm cube. Not to scale.'
	});
	if (!check.ok) process.exitCode = 1;
}

// True-scale pieces
const rockMeshes = {};
for (const r of SITE_ROCKS) {
	rockMeshes[r.id] = siteRock(r.id, r.size);
	const out = writeGLB(`site/${r.id}.glb`, [node(`rock-${r.id}`, rockMeshes[r.id])]);
	report.push({
		model: out.file,
		tris: out.triangles,
		kB: +(out.bytes / 1024).toFixed(0),
		'w x h x d (cm)': r.size.map((v) => (v * 100).toFixed(0)).join(' x ')
	});
	manifest.push({
		id: `site-${r.id}`,
		group: 'site',
		label: `${RECIPES[r.id].label} (true scale)`,
		file: out.file,
		triangles: out.triangles,
		note: r.note
	});
}

const lander = makeLander();
const landerNode = () =>
	node('lander', null, {
		children: [node('lander-body', lander.body), node('lander-airbags', lander.airbags)]
	});
const sojourner = makeSojourner('metal');
const sojournerGhost = makeSojourner('ghost');
const ground = makeGround();

const pieces = [
	[
		'site/lander.glb',
		[landerNode()],
		'Carl Sagan Memorial Station (lander)',
		'Open lander with ramps, camera mast and deflated airbags. Layout is schematic; overall size is approximate.'
	],
	[
		'site/sojourner.glb',
		[node('sojourner', sojourner)],
		'Sojourner',
		'65 x 48 x 30 cm with six 13 cm wheels (sourced). Detail is schematic.'
	],
	[
		'site/ground.glb',
		[node('ground', ground)],
		'Ground',
		'Flat 30 m soil patch, for an optional floor overlay.'
	]
];
for (const [file, roots, label, note] of pieces) {
	const out = writeGLB(file, roots);
	report.push({ model: out.file, tris: out.triangles, kB: +(out.bytes / 1024).toFixed(0) });
	manifest.push({
		id: file.replace(/\.glb$/, '').replace('/', '-'),
		group: 'site',
		label,
		file: out.file,
		triangles: out.triangles,
		note
	});
}

// Rock field: Ares Vallis is one of the rockiest places on Mars.
const pebbles = [];
for (let i = 0; i < 6; i++)
	pebbles.push(
		makeRock({
			name: `pebble-${i}`,
			seed: 900 + i,
			n: 4,
			half: [1, 0.7, 0.85],
			exp: 2.1 + (i % 3) * 0.25,
			warp: 0.3,
			warpFreq: 1,
			detail: 0.08,
			bury: 0.3,
			fit: [1, 0.55 + (i % 3) * 0.1, 0.8],
			faceted: i % 2 === 0,
			palette: PAL.pebble
		})
	);
const toXZ = (f) => [f.east, 0, -f.north];
const field = node('rock-field');
{
	const rand = rng(1997);
	const keepOut = [...SITE_ROCKS, ...SITE_POINTS].map((f) => ({ x: f.east, z: -f.north, r: 0.9 }));
	keepOut.push({ x: 0, z: 0, r: 2.6 });
	let placed = 0;
	let tries = 0;
	while (placed < 220 && tries++ < 5000) {
		const a = rand() * Math.PI * 2;
		const d = 2.6 + Math.sqrt(rand()) * 11.4;
		const x = Math.cos(a) * d;
		const z = Math.sin(a) * d;
		if (keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
		const s = 0.06 + 0.42 * Math.pow(rand(), 3);
		field.children.push(
			node(`pebble`, pebbles[Math.floor(rand() * pebbles.length)], {
				t: [+x.toFixed(3), 0, +z.toFixed(3)],
				yaw: +(rand() * Math.PI * 2).toFixed(3),
				scale: [s, s, s].map((v) => +v.toFixed(3))
			})
		);
		placed++;
	}
}

// Whole site
const site = node('ares-vallis');
site.children.push(node('ground', ground));
site.children.push({ ...landerNode(), yaw: LANDER_YAW_DEG * DEG });
for (const r of SITE_ROCKS)
	site.children.push(
		node(`rock-${r.id}`, rockMeshes[r.id], {
			t: toXZ(r),
			yaw: ((RECIPES[r.id].seed * 37) % 360) * DEG,
			extras: { label: RECIPES[r.id].label, position: r.position, size: r.sizeConfidence }
		})
	);
for (const p of SITE_POINTS)
	site.children.push(
		node(p.id, sojournerGhost, {
			t: toXZ(p),
			yaw: 40 * DEG,
			extras: { label: p.label, position: p.position }
		})
	);
site.children.push(field);
{
	const out = writeGLB('site/ares-vallis.glb', [site]);
	report.push({ model: out.file, tris: out.triangles, kB: +(out.bytes / 1024).toFixed(0) });
	manifest.unshift({
		id: 'site-ares-vallis',
		group: 'site',
		label: 'Whole landing site',
		file: out.file,
		triangles: out.triangles,
		note: 'Lander, named rocks, both Sojourner positions and a random rock field, at true scale. Rock positions marked approximate in layout.json are not verified.'
	});
}

// InSight: instrument covers
for (const c of insightCovers()) {
	const check = checkCover(c.mesh);
	const out = writeGLB(`cover/${c.id}.glb`, [node(`cover-${c.id}`, c.mesh)]);
	report.push({
		model: out.file,
		tris: out.triangles,
		kB: +(out.bytes / 1024).toFixed(0),
		'w x h x d (cm)': `${(check.width * 100).toFixed(1)} x ${(check.height * 100).toFixed(1)} x ${(check.depth * 100).toFixed(1)}`,
		'hides cube': check.ok ? 'yes' : 'NO',
		'min side r (cm)': +(check.minSide * 100).toFixed(2),
		'min top y (cm)': Number.isFinite(check.minTop) ? +(check.minTop * 100).toFixed(2) : 'flat top'
	});
	manifest.push({
		id: `cover-${c.id}`,
		group: 'cover-insight',
		cover: true,
		label: c.label,
		file: out.file,
		triangles: out.triangles,
		note: c.note
	});
	if (!check.ok) process.exitCode = 1;
}

// Waypoint beacons A to F: a low four-sided pylon with the letter on every side.
// Kept under 12 cm so the rover's low camera can read it from close up, and wide
// enough (17 cm) to hide a cube if the point's marker is on one.
{
	const STROKES = {
		a: [
			[0, 0, 0.5, 1],
			[0.5, 1, 1, 0],
			[0.2, 0.4, 0.8, 0.4]
		],
		b: [
			[0, 0, 0, 1],
			[0, 1, 0.7, 1],
			[0.7, 1, 0.9, 0.75],
			[0.9, 0.75, 0.7, 0.5],
			[0, 0.5, 0.7, 0.5],
			[0.7, 0.5, 0.9, 0.25],
			[0.9, 0.25, 0.7, 0],
			[0.7, 0, 0, 0]
		],
		c: [
			[1, 0.85, 0.75, 1],
			[0.75, 1, 0.25, 1],
			[0.25, 1, 0, 0.75],
			[0, 0.75, 0, 0.25],
			[0, 0.25, 0.25, 0],
			[0.25, 0, 0.75, 0],
			[0.75, 0, 1, 0.15]
		],
		d: [
			[0, 0, 0, 1],
			[0, 1, 0.6, 1],
			[0.6, 1, 0.95, 0.7],
			[0.95, 0.7, 0.95, 0.3],
			[0.95, 0.3, 0.6, 0],
			[0.6, 0, 0, 0]
		],
		e: [
			[0, 0, 0, 1],
			[0, 1, 0.9, 1],
			[0, 0.5, 0.7, 0.5],
			[0, 0, 0.9, 0]
		],
		f: [
			[0, 0, 0, 1],
			[0, 1, 0.9, 1],
			[0, 0.5, 0.7, 0.5]
		]
	};
	const body = hex('#0f7f8a');
	const glow = hex('#5ff2ff');
	const ink = hex('#f4fbff');
	const half = 0.085;
	for (const [letter, strokes] of Object.entries(STROKES)) {
		const parts = [
			prism(ring(0.23, 28), 0, 0.004, glow),
			prism(ring(half * Math.SQRT2, 4, Math.PI / 4), 0, 0.118, body),
			prism(ring(half * Math.SQRT2 + 0.006, 4, Math.PI / 4), 0.118, 0.12, glow)
		];
		for (let face = 0; face < 4; face++) {
			const phi = (face * Math.PI) / 2;
			const n = [Math.sin(phi), 0, Math.cos(phi)];
			const r = [Math.cos(phi), 0, -Math.sin(phi)];
			const at = (u, v) => [
				n[0] * (half + 0.004) + r[0] * (u - 0.5) * 0.085,
				0.018 + v * 0.085,
				n[2] * (half + 0.004) + r[2] * (u - 0.5) * 0.085
			];
			for (const [u0, v0, u1, v1] of strokes)
				parts.push(beam(at(u0, v0), at(u1, v1), 0.013, 0.013, ink));
		}
		const out = writeGLB(`cover/beacon-${letter}.glb`, [
			node(`beacon-${letter}`, hard(`beacon-${letter}`, 'matte', parts))
		]);
		report.push({ model: out.file, tris: out.triangles, kB: +(out.bytes / 1024).toFixed(0) });
		manifest.push({
			id: `cover-beacon-${letter}`,
			group: 'waypoints',
			cover: true,
			label: `Waypoint ${letter.toUpperCase()}`,
			file: out.file,
			triangles: out.triangles,
			note: 'Waypoint beacon with its letter on all four sides. Low enough to read from the rover’s camera; wide enough to hide a 10 cm cube.'
		});
	}
}

// InSight: true-scale site
{
	const insight = makeInsight();
	const insightGround = makeGround(20, 48, {
		a: hex('#a8683f'),
		b: hex('#bb7d50'),
		dark: hex('#7c4c30'),
		seed: 300,
		blast: 3
	});
	const at = (id) => {
		const f = INSIGHT_ITEMS.find((i) => i.id === id);
		return [f.east, 0, -f.north];
	};
	const single = [
		[
			'insight/lander.glb',
			[node('insight-lander', insight.lander)],
			'InSight lander',
			'Deck 1.56 m across, two 2.15 m solar arrays spanning 6 m, 1.8 m robotic arm (sourced). Detail is schematic.'
		],
		[
			'insight/seis-shield.glb',
			[node('insight-seis-shield', insight.shield)],
			'Wind and Thermal Shield (true scale)',
			'The dome over the seismometer. Size approximate.'
		],
		[
			'insight/heat-probe.glb',
			[node('insight-heat-probe', insight.probe)],
			'Heat probe (true scale)',
			'Support structure with the tube that held the self-hammering probe. Size approximate.'
		]
	];
	for (const [file, roots, label, note] of single) {
		const out = writeGLB(file, roots);
		report.push({ model: out.file, tris: out.triangles, kB: +(out.bytes / 1024).toFixed(0) });
		manifest.push({
			id: file.replace(/\.glb$/, '').replace('/', '-'),
			group: 'insight',
			label,
			file: out.file,
			triangles: out.triangles,
			note
		});
	}

	// Elysium Planitia is flat and sandy with few rocks, unlike Ares Vallis.
	const scatter = node('rock-field');
	const rand = rng(2018);
	let placed = 0;
	while (placed < 45) {
		const a = rand() * Math.PI * 2;
		const d = 3.4 + Math.sqrt(rand()) * 6;
		const s = 0.03 + 0.14 * Math.pow(rand(), 2);
		scatter.children.push(
			node('pebble', pebbles[Math.floor(rand() * pebbles.length)], {
				t: [+(Math.cos(a) * d).toFixed(3), 0, +(Math.sin(a) * d).toFixed(3)],
				yaw: +(rand() * Math.PI * 2).toFixed(3),
				scale: [s, s, s].map((v) => +v.toFixed(3))
			})
		);
		placed++;
	}

	const elysium = node('elysium-planitia');
	elysium.children.push(node('ground', insightGround));
	elysium.children.push(node('insight-lander', insight.lander));
	elysium.children.push(node('insight-seis-shield', insight.shield, { t: at('seis') }));
	elysium.children.push(node('insight-heat-probe', insight.probe, { t: at('heat-probe') }));
	elysium.children.push(node('tether-seis', insight.tether(at('seis'))));
	elysium.children.push(node('tether-heat-probe', insight.tether(at('heat-probe'))));
	elysium.children.push(scatter);
	const out = writeGLB('insight/elysium-planitia.glb', [elysium]);
	report.push({ model: out.file, tris: out.triangles, kB: +(out.bytes / 1024).toFixed(0) });
	manifest.push({
		id: 'insight-elysium-planitia',
		group: 'insight',
		label: 'Whole InSight site',
		file: out.file,
		triangles: out.triangles,
		note: 'Lander, both instruments with their tethers, and the soil darkened by the landing rockets, at true scale. Instrument positions are approximate.'
	});
}

// Layout and manifest
const layout = {
	groups: [
		{ id: 'cover', title: 'Cube covers: Sojourner rocks' },
		{ id: 'cover-insight', title: 'Cube covers: InSight instruments' },
		{ id: 'waypoints', title: 'Waypoint beacons' },
		{ id: 'site', title: 'Pathfinder site (true scale)' },
		{ id: 'insight', title: 'InSight site (true scale)' }
	],
	insight: {
		frame:
			'Lander at the origin, solar arrays east and west, instruments to the south. east and north are metres at true scale.',
		facts: {
			type: 'A stationary lander, not a rover',
			landing: '26 November 2018, Elysium Planitia',
			endOfMission: '15 December 2022',
			deckDiameter: '1.56 m',
			solarArrays: 'two ten-sided arrays, each 2.15 m across; 6.00 m span when open',
			deckHeight: '0.83 to 1.08 m above the ground',
			arm: '1.8 m robotic arm that lifted the instruments off the deck and set them on the ground',
			seismometerPlaced: '19 December 2018, 1.636 m from the lander'
		},
		lander: { east: 0, north: 0, model: 'insight/lander.glb' },
		instruments: INSIGHT_ITEMS.map((i) => ({
			id: i.id,
			label: i.label,
			east: i.east,
			north: i.north,
			confidence: { position: i.position },
			source: i.source,
			note: i.note
		})),
		sources: INSIGHT_SOURCES
	},
	frame:
		'Lander at the origin. east and north are metres at true scale. In Three.js use x = east, y = up, z = -north.',
	confidence: {
		sourced: 'Stated by the cited source.',
		approximate: 'Placed by eye or from memory. NOT verified; check before presenting as fact.'
	},
	facts: {
		landing: '4 July 1997, Ares Vallis',
		lastTransmission: '27 September 1997',
		roverSize: '65 x 48 x 30 cm, six wheels of 13 cm diameter',
		roverTopSpeed: '1 cm/s',
		roverDistance: 'about 100 m in total, always within about 12 m of the lander',
		cameraMast: 'camera about 1.5 m above the ground on a 0.8 m pop-up mast',
		landerSize: 'about 2.75 m across with petals open (approximate, not re-checked)'
	},
	lander: {
		east: 0,
		north: 0,
		yawDeg: LANDER_YAW_DEG,
		yawConfidence: 'approximate',
		model: 'site/lander.glb'
	},
	rocks: SITE_ROCKS.map((r) => ({
		id: r.id,
		label: RECIPES[r.id].label,
		east: r.east,
		north: r.north,
		size: { width: r.size[0], height: r.size[1], depth: r.size[2] },
		confidence: { position: r.position, size: r.sizeConfidence },
		model: `site/${r.id}.glb`,
		cover: `cover/${r.id}.glb`,
		source: r.source,
		note: r.note
	})),
	points: SITE_POINTS.map((p) => ({
		id: p.id,
		label: p.label,
		east: p.east,
		north: p.north,
		confidence: { position: p.position },
		source: p.source,
		note: p.note
	})),
	distant: [
		{
			id: 'twin-peaks',
			label: 'Twin Peaks',
			note: 'Two hills on the southwestern horizon, about 1 to 2 km away. Not modelled.'
		},
		{ id: 'big-crater', label: 'Big Crater', note: 'About 2200 m away. Not modelled.' }
	],
	sources: SOURCES,
	models: manifest
};
writeFileSync(path.join(OUT, 'layout.json'), JSON.stringify(layout, null, '\t') + '\n');

console.table(report);
console.log(`Wrote ${report.length} models and layout.json to ${path.relative(ROOT, OUT)}`);
