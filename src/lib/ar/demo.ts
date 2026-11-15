import * as THREE from 'three';
import { CAMERA, MARKER } from './config';
import { drawStamp } from './framestamp';
import { cameraWorld, floorDepth, floorPlane } from './rectify';
import { calibratedCamera, disposeObject, setCameraPose } from './scene';
import type { DepthResult, Pose } from './types';

export const DEMO_ITEMS = [
	{ id: 0, x: -0.14, z: -0.85, yaw: 0.2 },
	{ id: 1, x: 0.23, z: -1.38, yaw: -0.3 },
	{ id: 2, x: -0.22, z: -2.12, yaw: 0.5 }
];

// The story course: every item from src/lib/story/world.ts, laid out so each next
// target is roughly ahead of the last. Items 0-2 keep their demo positions.
export const COURSE_ITEMS = [
	...DEMO_ITEMS,
	// The Rock Garden's real named rocks, gathered behind point B, and Chimp beside
	// point C, where the story says the rover was last seen. Scenery only.
	{ id: 3, x: -1.15, z: -1.45, yaw: 0.4 }, // Wedge
	{ id: 4, x: -1.3, z: -1.95, yaw: -0.2 }, // Shark
	{ id: 5, x: -1.05, z: -2.3, yaw: 0.6 }, // Half Dome
	{ id: 6, x: -1.5, z: -1.6, yaw: 0.1 }, // Moe
	{ id: 7, x: -1.45, z: -2.35, yaw: -0.5 }, // Stimpy
	{ id: 8, x: 1.15, z: -1.9, yaw: 0.3 }, // Chimp
	{ id: 9, x: 0.95, z: -3.4, yaw: 0.2 }, // seismometer
	{ id: 10, x: 1.35, z: -2.9, yaw: 0 }, // wind and thermal shield
	{ id: 11, x: 0.9, z: -2.7, yaw: 0.1 }, // heat probe
	{ id: 12, x: 0.5, z: -0.7, yaw: 0 }, // point A
	{ id: 13, x: -0.7, z: -1.7, yaw: 0 }, // point B
	{ id: 14, x: 0.75, z: -2.1, yaw: 0 }, // point C
	{ id: 15, x: 0.3, z: -3.0, yaw: 0 }, // spot D
	{ id: 16, x: -0.8, z: -2.9, yaw: 0 }, // spot E
	{ id: 17, x: -0.2, z: -3.8, yaw: 0 } // point F
];
const DRIVE_SPEED = 0.45; // metres per second
const TURN_SPEED = 1.1; // radians per second
const CARRY_AHEAD = 0.45; // metres in front of the lens where a carried item is held

export class DemoSource {
	/** Items in this simulation. In course mode a carried item moves with the rover. */
	readonly items: { id: number; x: number; z: number; yaw: number }[];
	private cubes = new Map<number, THREE.Mesh>();
	private control = { forward: 0, turn: 0 };
	private driven = { x: 0, z: 0, yaw: 0 };
	private carried: number | null = null;
	private lastCapture = 0;
	private renderer = new THREE.WebGLRenderer({ antialias: true });
	private scene = new THREE.Scene();
	private camera = calibratedCamera();
	private canvas = document.createElement('canvas');
	private context: CanvasRenderingContext2D;
	private texture: THREE.CanvasTexture;
	private obstacle: THREE.Mesh;
	private started = performance.now();
	private epoch = Math.floor(Math.random() * (2 ** 31 - 1));
	private frame = 0;
	/** course: lay out the story course and steer with setDrive() instead of the idle sway. */
	constructor(private course = false) {
		this.items = (course ? COURSE_ITEMS : DEMO_ITEMS).map((item) => ({ ...item }));
		this.renderer.setSize(CAMERA.width, CAMERA.height);
		this.renderer.setPixelRatio(1);
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.scene.background = new THREE.Color('#6c7066');
		this.scene.fog = new THREE.Fog('#777a6b', 4, 12);
		this.canvas.width = CAMERA.width;
		this.canvas.height = CAMERA.height;
		this.context = this.canvas.getContext('2d', { alpha: false })!;
		const wood = document.createElement('canvas');
		wood.width = wood.height = 512;
		const ctx = wood.getContext('2d')!;
		ctx.fillStyle = '#bfa47a';
		ctx.fillRect(0, 0, 512, 512);
		// Seeded grain keeps the simulated video deterministic and entirely local.
		let seed = 72;
		const random = () => {
			seed = (seed * 16807) % 2147483647;
			return seed / 2147483647;
		};
		for (let plank = 0; plank < 8; plank++) {
			ctx.fillStyle = `rgba(80,52,25,${0.025 + random() * 0.09})`;
			ctx.fillRect(plank * 64, 0, 64, 512);
			ctx.fillStyle = 'rgba(60,42,24,0.15)';
			ctx.fillRect(plank * 64, 0, 1, 512);
			for (let grain = 0; grain < 90; grain++) {
				ctx.fillStyle = `rgba(70,40,15,${random() * 0.06})`;
				ctx.fillRect(plank * 64 + random() * 64, random() * 512, random() * 2, 60 + random() * 200);
			}
			ctx.fillStyle = 'rgba(60,42,24,0.12)';
			ctx.fillRect(plank * 64, (plank % 3) * 150, 64, 1);
		}
		this.texture = new THREE.CanvasTexture(wood);
		this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
		this.texture.repeat.set(10, 10);
		this.texture.colorSpace = THREE.SRGBColorSpace;
		this.texture.anisotropy = 8;
		const floor = new THREE.Mesh(
			new THREE.PlaneGeometry(20, 20),
			new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.65 })
		);
		floor.rotation.x = -Math.PI / 2;
		this.scene.add(floor);
		const wall = new THREE.Mesh(
			new THREE.BoxGeometry(20, 4, 0.1),
			new THREE.MeshStandardMaterial({ color: '#aeb3a2', roughness: 1 })
		);
		wall.position.set(0, 2, -7);
		this.scene.add(wall);
		for (const z of [-0.5, -1, -2, -3, -5]) {
			const line = new THREE.Mesh(
				new THREE.PlaneGeometry(5, 0.024),
				new THREE.MeshBasicMaterial({ color: '#e8e4c7' })
			);
			line.rotation.x = -Math.PI / 2;
			line.position.set(0, 0.0005, z);
			this.scene.add(line);
		}
		for (const x of [-0.6, 0.6]) {
			const line = new THREE.Mesh(
				new THREE.PlaneGeometry(0.025, 12),
				new THREE.MeshBasicMaterial({ color: '#477b76' })
			);
			line.rotation.x = -Math.PI / 2;
			line.position.set(x, 0.0008, -3);
			this.scene.add(line);
		}
		for (const item of this.items) {
			const cube = new THREE.Mesh(
				new THREE.BoxGeometry(MARKER.cubeM, MARKER.cubeM, MARKER.cubeM),
				new THREE.MeshStandardMaterial({ color: '#e5e4d8', roughness: 0.9 })
			);
			cube.position.set(item.x, MARKER.cubeM / 2, item.z);
			this.scene.add(cube);
			this.cubes.set(item.id, cube);
		}
		this.obstacle = new THREE.Mesh(
			new THREE.BoxGeometry(0.07, 0.24, 0.07),
			new THREE.MeshStandardMaterial({ color: '#4d6259', roughness: 0.9 })
		);
		this.obstacle.position.set(0.45, 0.12, -0.6);
		this.scene.add(this.obstacle);
		this.scene.add(new THREE.HemisphereLight('#fff5df', '#5d624e', 2.3));
		const sun = new THREE.DirectionalLight('#fff6da', 2.5);
		sun.position.set(-3, 6, -1);
		this.scene.add(sun);
	}
	reset() {
		this.epoch = (this.epoch + 1 + Math.floor(Math.random() * 2147483646)) % 2147483648;
		this.started = performance.now();
	}
	/** Course mode: forward and turn are -1 to 1; positive turn is left. */
	setDrive(forward: number, turn: number) {
		this.control = { forward, turn };
	}
	/** Course mode: hold an item in front of the rover, or pass null to set it down. */
	carry(id: number | null) {
		this.carried = id;
	}
	capture(now: number) {
		const t = (now - this.started) / 1000;
		let x = 0.025 * Math.sin(t * 0.18),
			z = -0.04 * (1 - Math.cos(t * 0.15)),
			yaw = Math.sin(t * 0.12) * 0.035;
		if (this.course) {
			const dt = this.lastCapture ? Math.min(0.5, (now - this.lastCapture) / 1000) : 0;
			this.lastCapture = now;
			const d = this.driven;
			d.yaw += this.control.turn * TURN_SPEED * dt;
			d.x -= Math.sin(d.yaw) * this.control.forward * DRIVE_SPEED * dt;
			d.z -= Math.cos(d.yaw) * this.control.forward * DRIVE_SPEED * dt;
			({ x, z, yaw } = d);
			const held = this.items.find((item) => item.id === this.carried);
			if (held) {
				held.x = x - Math.sin(yaw) * CARRY_AHEAD;
				held.z = z - Math.cos(yaw) * CARRY_AHEAD;
				this.cubes.get(held.id)?.position.set(held.x, MARKER.cubeM / 2, held.z);
			}
		}
		const pose: Pose = {
			e: this.epoch,
			f: this.frame++ & 0xffff,
			x,
			z,
			yaw,
			pitch: 0,
			roll: 0,
			q: 2
		};
		this.obstacle.position.x = Math.sin(t * 0.24) * 0.36 + 0.1;
		setCameraPose(this.camera, pose);
		this.renderer.render(this.scene, this.camera);
		this.context.drawImage(this.renderer.domElement, 0, 0);
		drawStamp(this.context, pose.f);
		return { pose, canvas: this.canvas };
	}
	/** Analytic scene depth exercises exactly the live floor-fit/masking pipeline. */
	depth(pose: Pose): DepthResult {
		const width = 322,
			height = 182,
			data = new Float32Array(width * height),
			plane = floorPlane(pose);
		const matrix = cameraWorld(pose),
			origin = new THREE.Vector3(pose.x, CAMERA.heightM, pose.z);
		const boxes = [
			...this.items.map(
				(item) =>
					new THREE.Box3(
						new THREE.Vector3(item.x - MARKER.cubeM / 2, 0, item.z - MARKER.cubeM / 2),
						new THREE.Vector3(item.x + MARKER.cubeM / 2, MARKER.cubeM, item.z + MARKER.cubeM / 2)
					)
			),
			new THREE.Box3(
				new THREE.Vector3(this.obstacle.position.x - 0.035, 0, -0.635),
				new THREE.Vector3(this.obstacle.position.x + 0.035, 0.24, -0.565)
			)
		];
		const direction = new THREE.Vector3(),
			hit = new THREE.Vector3(),
			ray = new THREE.Ray(origin);
		for (let y = 0; y < height; y++)
			for (let x = 0; x < width; x++) {
				const u = ((x + 0.5) / width) * CAMERA.width,
					v = ((y + 0.5) / height) * CAMERA.height;
				let z = Math.min(50, floorDepth(u, v, plane));
				direction.set((u - CAMERA.cx) / CAMERA.fx, -(v - CAMERA.cy) / CAMERA.fy, -1);
				const rayLength = direction.length();
				direction.transformDirection(matrix);
				ray.direction.copy(direction);
				for (const box of boxes)
					if (ray.intersectBox(box, hit)) z = Math.min(z, hit.distanceTo(origin) / rayLength);
				data[y * width + x] = 1 / z;
			}
		return { type: 'depth', e: pose.e, f: pose.f, width, height, data, ms: 0 };
	}
	dispose() {
		disposeObject(this.scene);
		this.texture.dispose();
		this.renderer.dispose();
		this.renderer.forceContextLoss();
	}
}
