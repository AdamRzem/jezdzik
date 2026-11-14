import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAMERA, ITEM_TYPES } from './config';
import { makeGround } from './ground';
import { cameraWorld, DISTORT_GLSL, projectionMatrix, rectifiedToRaw } from './rectify';
import type { OcclusionFrame } from './occlusion';
import type { Pose, TrackedItem, ViewMode } from './types';

export function calibratedCamera() {
	const camera = new THREE.PerspectiveCamera();
	camera.near = CAMERA.near;
	camera.far = CAMERA.far;
	camera.projectionMatrix.copy(projectionMatrix());
	camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
	camera.matrixAutoUpdate = false;
	return camera;
}
export function setCameraPose(camera: THREE.Camera, pose: Pose) {
	camera.matrix.copy(cameraWorld(pose));
	camera.updateMatrixWorld(true);
}
export function disposeObject(object: THREE.Object3D) {
	object.traverse((child) => {
		if (!(child instanceof THREE.Mesh || child instanceof THREE.Line)) return;
		child.geometry.dispose();
		for (const material of Array.isArray(child.material) ? child.material : [child.material])
			material.dispose();
	});
}

/** A broad, low rock covers the 10 cm replacement cube through its full height. */
function makeRock(id: number) {
	const group = new THREE.Group();
	const vertices: number[] = [],
		indices: number[] = [],
		sides = 9;
	for (const [ring, level] of [
		{ y: 0, r: 0.12 },
		{ y: 0.06, r: 0.135 },
		{ y: 0.107, r: 0.112 }
	].entries()) {
		for (let i = 0; i < sides; i++) {
			const angle = (i / sides) * Math.PI * 2,
				r = level.r * (1 + 0.07 * Math.sin(i * 7 + id * 3));
			vertices.push(Math.cos(angle) * r + ring * 0.003, level.y, Math.sin(angle) * r);
			if (ring < 2) {
				const a = ring * sides + i,
					b = ring * sides + ((i + 1) % sides);
				indices.push(a, a + sides, b, b, a + sides, b + sides);
			}
		}
	}
	vertices.push(0.02, 0.12, -0.015);
	for (let i = 0; i < sides; i++)
		indices.push(sides * 2 + i, sides * 3, sides * 2 + ((i + 1) % sides));
	const indexed = new THREE.BufferGeometry();
	indexed.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
	indexed.setIndex(indices);
	const geometry = indexed.toNonIndexed();
	indexed.dispose();
	geometry.computeVertexNormals();
	const rock = new THREE.Mesh(
		geometry,
		new THREE.MeshStandardMaterial({
			color: ITEM_TYPES[id].color,
			roughness: 0.93,
			flatShading: true
		})
	);
	group.add(rock);
	const shadowCanvas = document.createElement('canvas');
	shadowCanvas.width = shadowCanvas.height = 64;
	const ctx = shadowCanvas.getContext('2d')!;
	const gradient = ctx.createRadialGradient(32, 32, 10, 32, 32, 32);
	gradient.addColorStop(0, 'rgba(0,0,0,0.4)');
	gradient.addColorStop(1, 'rgba(0,0,0,0)');
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, 64, 64);
	const texture = new THREE.CanvasTexture(shadowCanvas);
	const shadow = new THREE.Mesh(
		new THREE.PlaneGeometry(0.34, 0.34),
		new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
	);
	shadow.rotation.x = -Math.PI / 2;
	shadow.position.y = 0.001;
	group.add(shadow);
	group.userData.shadowTexture = texture;
	return group;
}

export class ARScene {
	readonly renderer: THREE.WebGLRenderer;
	readonly camera = calibratedCamera();
	private scene = new THREE.Scene();
	private objects = new THREE.Group();
	private models = new Map<number, THREE.Group>();
	private backgroundCanvas = document.createElement('canvas');
	private context: CanvasRenderingContext2D;
	private videoTexture: THREE.CanvasTexture;
	private depthTexture = new THREE.DataTexture(
		new Float32Array([CAMERA.far]),
		1,
		1,
		THREE.RedFormat,
		THREE.FloatType
	);
	private inlierTexture = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat);
	private background: THREE.ShaderMaterial;
	private depthPass: THREE.Mesh;
	// 25 cm squares. One colour throughout: the grid is re-centred under the rover as it drives.
	private grid = new THREE.GridHelper(8, 32, '#a6cc74', '#a6cc74');
	private trail: THREE.Line;
	// Mars under the rover's wheels: shown in the Objects view, hidden behind real obstacles.
	private ground = makeGround();
	private disposed = false;
	private view: ViewMode = 'objects';
	constructor(canvas: HTMLCanvasElement) {
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
		this.renderer.setSize(CAMERA.width, CAMERA.height, false);
		this.renderer.setPixelRatio(1);
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.backgroundCanvas.width = CAMERA.width;
		this.backgroundCanvas.height = CAMERA.height;
		this.context = this.backgroundCanvas.getContext('2d', { alpha: false })!;
		this.videoTexture = new THREE.CanvasTexture(this.backgroundCanvas);
		this.videoTexture.colorSpace = THREE.SRGBColorSpace;
		this.depthTexture.needsUpdate = true;
		this.inlierTexture.needsUpdate = true;
		const d = CAMERA.distortion;
		const lens = {
			intrinsics: { value: new THREE.Vector4(CAMERA.fx, CAMERA.fy, CAMERA.cx, CAMERA.cy) },
			radial: { value: new THREE.Vector3(d.k1, d.k2, d.k3) },
			tangential: { value: new THREE.Vector2(d.p1, d.p2) }
		};
		const vertexShader =
			'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
		this.background = new THREE.ShaderMaterial({
			uniforms: {
				...lens,
				video: { value: this.videoTexture },
				stamped: { value: true },
				depth: { value: this.depthTexture },
				inliers: { value: this.inlierTexture },
				debug: { value: false }
			},
			vertexShader,
			depthTest: false,
			depthWrite: false,
			fragmentShader: `varying vec2 vUv; uniform sampler2D video; uniform sampler2D depth;
uniform sampler2D inliers; uniform bool debug; uniform bool stamped;
${DISTORT_GLSL}
void main(){
 vec2 p=rawUV(vUv);
 if(any(lessThan(p,vec2(0.0)))||any(greaterThan(p,vec2(1.0)))){gl_FragColor=vec4(0,0,0,1);return;}
 vec4 color=texture2D(video,vec2(p.x,1.0-p.y));
 if(stamped && p.x<416.0/1280.0 && p.y<16.0/720.0) color=vec4(0.025,0.035,0.035,1.0);
 if(debug){ float z=texture2D(depth,p).r;
  vec3 heat=mix(vec3(0.03,0.13,0.2),vec3(0.71,0.9,0.42),clamp(1.0-z/3.0,0.0,1.0));
  color.rgb=mix(color.rgb,heat,0.75);
  if(texture2D(inliers,p).r>0.5) color.rgb=vec3(1.0,0.4,0.72);
 }
 gl_FragColor=color;
 #include <colorspace_fragment>
}`
		});
		const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.background);
		quad.renderOrder = -2;
		quad.frustumCulled = false;
		this.scene.add(quad);
		const depthMaterial = new THREE.ShaderMaterial({
			uniforms: { ...lens, depth: { value: this.depthTexture } },
			vertexShader,
			colorWrite: false,
			depthTest: true,
			depthWrite: true,
			fragmentShader: `varying vec2 vUv; uniform sampler2D depth; ${DISTORT_GLSL}
void main(){vec2 p=rawUV(vUv); float z=50.0;
if(all(greaterThanEqual(p,vec2(0.0)))&&all(lessThanEqual(p,vec2(1.0)))) z=texture2D(depth,p).r;
gl_FragDepth=((50.0+0.05-2.0*0.05*50.0/max(z,0.05))/(50.0-0.05))*0.5+0.5;
gl_FragColor=vec4(0.0);}`
		});
		this.depthPass = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), depthMaterial);
		this.depthPass.renderOrder = -1;
		this.depthPass.frustumCulled = false;
		this.depthPass.visible = false;
		this.scene.add(
			this.depthPass,
			this.objects,
			new THREE.HemisphereLight('#eaf1e4', '#494d37', 2.3)
		);
		const light = new THREE.DirectionalLight('#fff0d7', 2.2);
		light.position.set(-2, 5, 1);
		this.scene.add(light);
		this.grid.position.set(0, 0.002, 0);
		this.grid.visible = false;
		this.scene.add(this.grid, this.ground);
		this.trail = new THREE.Line(
			new THREE.BufferGeometry(),
			new THREE.LineBasicMaterial({ color: '#b9df78' })
		);
		this.trail.visible = false;
		this.scene.add(this.trail);
	}
	setView(view: ViewMode) {
		this.view = view;
		this.grid.visible = this.trail.visible = view === 'grid';
		this.background.uniforms.debug.value = view === 'depth';
	}
	setDepth(frame: OcclusionFrame | null) {
		this.depthTexture.dispose();
		this.inlierTexture.dispose();
		this.depthTexture = new THREE.DataTexture(
			frame?.data ?? new Float32Array([CAMERA.far]),
			frame?.width ?? 1,
			frame?.height ?? 1,
			THREE.RedFormat,
			THREE.FloatType
		);
		this.depthTexture.needsUpdate = true;
		const dots = new Uint8Array((frame?.width ?? 1) * (frame?.height ?? 1));
		if (frame)
			for (const point of frame.fit.inliers) {
				const raw = rectifiedToRaw(point.u, point.v);
				const x = Math.round((raw.u / CAMERA.width) * (frame.width - 1)),
					y = Math.round((raw.v / CAMERA.height) * (frame.height - 1));
				if (x >= 0 && x < frame.width && y >= 0 && y < frame.height)
					dots[y * frame.width + x] = 255;
			}
		this.inlierTexture = new THREE.DataTexture(
			dots,
			frame?.width ?? 1,
			frame?.height ?? 1,
			THREE.RedFormat
		);
		this.inlierTexture.needsUpdate = true;
		this.background.uniforms.depth.value = this.depthTexture;
		this.background.uniforms.inliers.value = this.inlierTexture;
		(this.depthPass.material as THREE.ShaderMaterial).uniforms.depth.value = this.depthTexture;
		this.depthPass.visible = Boolean(frame);
	}
	setItems(items: TrackedItem[]) {
		const ids = new Set(items.map((item) => item.id));
		for (const [id, model] of this.models)
			if (!ids.has(id)) {
				this.removeModel(model);
				this.models.delete(id);
			}
		for (const item of items) {
			let model = this.models.get(item.id);
			if (!model) {
				model = makeRock(item.id);
				this.models.set(item.id, model);
				this.objects.add(model);
				const url = ITEM_TYPES[item.id].model;
				if (url) {
					const target = model;
					void new GLTFLoader()
						.loadAsync(url)
						.then((gltf) => {
							if (this.disposed || this.models.get(item.id) !== target) {
								disposeObject(gltf.scene);
								return;
							}
							const rock = target.children[0];
							disposeObject(rock);
							target.remove(rock);
							target.add(gltf.scene);
						})
						.catch(() => {
							/* Keep the bundled model if a configured asset is missing. */
						});
				}
			}
			model.position.set(item.x, 0, item.z);
			model.rotation.y = item.yaw;
		}
	}
	/** Simulated and mock video carry a frame-number stamp in the corner; real video does not. */
	setStamped(stamped: boolean) {
		this.background.uniforms.stamped.value = stamped;
	}
	setPath(path: { x: number; z: number }[]) {
		this.trail.geometry.dispose();
		this.trail.geometry = new THREE.BufferGeometry().setFromPoints(
			path.map((p) => new THREE.Vector3(p.x, 0.003, p.z))
		);
	}
	draw(frame: CanvasImageSource, pose: Pose | undefined, visible: boolean) {
		this.context.drawImage(frame, 0, 0, CAMERA.width, CAMERA.height);
		this.videoTexture.needsUpdate = true;
		if (pose) {
			setCameraPose(this.camera, pose);
			// Keep the grid under the rover, moving it by whole squares so its lines stay put.
			this.grid.position.x = Math.round(pose.x / 0.25) * 0.25;
			this.grid.position.z = Math.round(pose.z / 0.25) * 0.25;
			// The ground's pattern is fixed to the world; only the sheet follows the rover.
			this.ground.position.set(pose.x, 0, pose.z);
			(this.ground.material as THREE.ShaderMaterial).uniforms.eye.value.set(
				pose.x,
				CAMERA.heightM,
				pose.z
			);
		}
		this.objects.visible = visible;
		this.grid.visible = this.trail.visible = visible && this.view === 'grid';
		this.ground.visible = visible && this.view === 'objects';
		for (const model of this.models.values())
			model.traverse((child) => {
				if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
					child.material.transparent = pose?.q === 0;
					child.material.opacity = pose?.q === 0 ? 0.35 : 1;
				}
			});
		this.renderer.render(this.scene, this.camera);
	}
	private removeModel(model: THREE.Group) {
		this.objects.remove(model);
		disposeObject(model);
		(model.userData.shadowTexture as THREE.Texture)?.dispose();
	}
	hideObjects() {
		this.objects.visible = this.grid.visible = this.trail.visible = this.ground.visible = false;
		this.renderer.render(this.scene, this.camera);
	}
	clear() {
		for (const model of this.models.values()) this.removeModel(model);
		this.models.clear();
		this.setDepth(null);
		this.setPath([]);
	}
	dispose() {
		this.disposed = true;
		this.clear();
		disposeObject(this.scene);
		this.videoTexture.dispose();
		this.depthTexture.dispose();
		this.inlierTexture.dispose();
		this.renderer.dispose();
	}
}
