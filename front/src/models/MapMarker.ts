export type MarkerType = 'npc' | 'spot' | 'quest' | 'boss' | 'vendor' | 'teleport' | 'dungeon' | 'town' | 'loot' | 'stablemaster' | 'area' | 'other';

// Geometry types for different marker shapes
export interface PointGeometry {
	type: 'point';
	x: number;
	y: number;
}

export interface PathGeometry {
	type: 'path';
	points: { x: number; y: number }[];
}

export interface PolygonGeometry {
	type: 'polygon';
	points: { x: number; y: number }[];
}

export type MarkerGeometry = PointGeometry | PathGeometry | PolygonGeometry;

export interface MapMarker {
	id: string;
	type: MarkerType;
	name: string;
	description: string; // Markdown content
	levelMin?: number;
	levelMax?: number;
	geometry: MarkerGeometry;
	mapId: number; // The map/region this marker belongs to
	layerId: string; // The layer this marker belongs to
}

export interface MapLayer {
	id: string;
	name: string;
	color: string;
	visible: boolean;
	locked: boolean;
}

export interface MarkersFile {
	version: number;
	layers: MapLayer[];
	markers: MapMarker[];
}

export const DEFAULT_LAYER_ID = 'default';

export function createDefaultLayer(): MapLayer {
	return {
		id: DEFAULT_LAYER_ID,
		name: 'Default',
		color: '#2196F3',
		visible: true,
		locked: false,
	};
}

export function createLayer(name: string, color?: string): MapLayer {
	return {
		id: crypto.randomUUID(),
		name,
		color: color ?? getRandomColor(),
		visible: true,
		locked: false,
	};
}

function getRandomColor(): string {
	const colors = ['#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#03A9F4', '#009688', '#8BC34A', '#FF9800', '#FF5722'];
	return colors[Math.floor(Math.random() * colors.length)];
}

export const MarkerTypeLabels: Record<MarkerType, string> = {
	npc: 'NPC',
	spot: 'Spot',
	quest: 'Quest',
	boss: 'Boss',
	vendor: 'Vendor',
	teleport: 'Teleport',
	dungeon: 'Dungeon',
	town: 'Town',
	loot: 'Loot',
	stablemaster: 'Stablemaster Path',
	area: 'Area',
	other: 'Other',
};

export const MarkerTypeIcons: Record<MarkerType, string> = {
	npc: 'mdi-account',
	spot: 'mdi-map-marker',
	quest: 'mdi-exclamation-thick',
	boss: 'mdi-skull',
	vendor: 'mdi-cart',
	teleport: 'mdi-teleport',
	dungeon: 'mdi-gate',
	town: 'mdi-city',
	loot: 'mdi-treasure-chest',
	stablemaster: 'mdi-horse',
	area: 'mdi-vector-polygon',
	other: 'mdi-help-circle',
};

export const MarkerTypeColors: Record<MarkerType, string> = {
	npc: '#4CAF50',
	spot: '#2196F3',
	quest: '#FFC107',
	boss: '#F44336',
	vendor: '#9C27B0',
	teleport: '#00BCD4',
	dungeon: '#795548',
	town: '#607D8B',
	loot: '#FFD700',
	stablemaster: '#8D6E63',
	area: '#00BCD4',
	other: '#9E9E9E',
};

// Marker types that use path geometry
export const PathMarkerTypes: MarkerType[] = ['stablemaster', 'teleport', 'other'];

// Marker types that use polygon geometry
export const PolygonMarkerTypes: MarkerType[] = ['spot', 'town', 'other'];

// Marker types that use point geometry
export const PointMarkerTypes: MarkerType[] = ['npc', 'spot', 'quest', 'boss', 'vendor', 'teleport', 'dungeon', 'loot', 'other'];

export function getGeometryTypeForMarker(type: MarkerType): 'point' | 'path' | 'polygon' {
	if (PathMarkerTypes.includes(type)) return 'path';
	if (PolygonMarkerTypes.includes(type)) return 'polygon';
	return 'point';
}

export function createMarker(partial: Partial<MapMarker> & { mapId: number; layerId?: string } & (
	| { x: number; y: number }
	| { geometry: MarkerGeometry }
)): MapMarker {
	let geometry: MarkerGeometry;
	
	if ('geometry' in partial && partial.geometry) {
		geometry = partial.geometry;
	} else if ('x' in partial && 'y' in partial) {
		geometry = { type: 'point', x: partial.x, y: partial.y };
	} else {
		throw new Error('Either geometry or x/y coordinates must be provided');
	}

	return {
		id: crypto.randomUUID(),
		type: 'spot',
		name: 'New Marker',
		description: '',
		layerId: DEFAULT_LAYER_ID,
		...partial,
		geometry,
	};
}

export function exportMarkersToJson(markers: MapMarker[], layers: MapLayer[]): string {
	const file: MarkersFile = {
		version: 2,
		layers,
		markers,
	};
	return JSON.stringify(file, null, 2);
}

export function importMarkersFromJson(json: string): { markers: MapMarker[]; layers: MapLayer[] } {
	const file = JSON.parse(json);
	
	// Handle version 1 format (no layers)
	if (file.version === 1) {
		const defaultLayer = createDefaultLayer();
		const markers: MapMarker[] = file.markers.map((m: any) => ({
			...m,
			layerId: DEFAULT_LAYER_ID,
			geometry: m.geometry ?? { type: 'point' as const, x: m.x, y: m.y },
		}));
		return { markers, layers: [defaultLayer] };
	}
	
	if (file.version !== 2) {
		throw new Error(`Unsupported markers file version: ${file.version}`);
	}
	
	return { markers: file.markers, layers: file.layers };
}

// Compress markers data for URL sharing
export function compressForUrl(markers: MapMarker[], layers: MapLayer[]): string {
	const data = { v: 2, l: layers, m: markers };
	const json = JSON.stringify(data);
	// Use base64 encoding for URL safety
	return btoa(encodeURIComponent(json));
}

// Decompress markers data from URL
export function decompressFromUrl(encoded: string): { markers: MapMarker[]; layers: MapLayer[] } {
	try {
		const json = decodeURIComponent(atob(encoded));
		const data = JSON.parse(json);
		
		if (data.v === 1) {
			const defaultLayer = createDefaultLayer();
			const markers: MapMarker[] = data.m.map((m: any) => ({
				...m,
				layerId: DEFAULT_LAYER_ID,
				geometry: m.geometry ?? { type: 'point' as const, x: m.x, y: m.y },
			}));
			return { markers, layers: [defaultLayer] };
		}
		
		return { markers: data.m, layers: data.l };
	} catch (e) {
		console.error('Failed to decompress URL data:', e);
		return { markers: [], layers: [createDefaultLayer()] };
	}
}

// Get marker center point (for any geometry type)
export function getMarkerCenter(marker: MapMarker): { x: number; y: number } {
	const geom = marker.geometry;
	
	if (geom.type === 'point') {
		return { x: geom.x, y: geom.y };
	}
	
	// For path and polygon, calculate centroid
	const points = geom.points;
	if (points.length === 0) return { x: 0, y: 0 };
	
	const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
	return { x: sum.x / points.length, y: sum.y / points.length };
}
