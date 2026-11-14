export interface Pose {
	e: number;
	f: number;
	x: number;
	z: number;
	yaw: number;
	pitch: number;
	roll: number;
	q: 0 | 1 | 2;
}
export interface MarkerDetection {
	id: number;
	rotation: number[];
	translation: number[];
}
export interface MarkerResult {
	type: 'markers';
	e: number;
	f: number;
	detections: MarkerDetection[];
}
export interface Observation {
	cmd: 'obs';
	e: number;
	f: number;
	item: number;
	right: number;
	forward: number;
	yaw: number;
}
export interface TrackedItem {
	id: number;
	x: number;
	z: number;
	yaw: number;
	lastSeen: number;
	detections: number;
}
export type DepthTier = 'A' | 'B' | 'C';
export type QualityOverride = 'auto' | DepthTier;
export type ViewMode = 'objects' | 'grid' | 'depth';
export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export interface DepthResult {
	type: 'depth';
	e: number;
	f: number;
	width: number;
	height: number;
	data: Float32Array;
	ms: number;
}
export interface ViewerStatus {
	alignment: 'exact' | 'approximate';
	mode: 'demo' | 'live';
	video: ConnectionState;
	socket: ConnectionState;
	pose: Pose | null;
	fps: number;
	frame: number | null;
	unknown: number;
	trackingLost: boolean;
	tier: DepthTier;
	depthMs: number | null;
	fit: number;
	markers: string;
	depth: string;
	/** Floor tracking from the video (live rover only). */
	motion: string;
	items: TrackedItem[];
	path: { x: number; z: number }[];
	error: string | null;
}
