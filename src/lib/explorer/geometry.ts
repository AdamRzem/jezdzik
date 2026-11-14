/** East-positive longitude, north-positive latitude; matches equirectangular maps. */
export function surfacePoint(lat: number, lon: number, radius = 1): [number, number, number] {
	const phi = (lat * Math.PI) / 180;
	const theta = (lon * Math.PI) / 180;
	return [
		radius * Math.cos(phi) * Math.cos(theta),
		radius * Math.sin(phi),
		-radius * Math.cos(phi) * Math.sin(theta)
	];
}
