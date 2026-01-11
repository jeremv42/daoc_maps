export type MarkerType = 'npc' | 'spot' | 'quest' | 'boss' | 'vendor' | 'teleport' | 'dungeon' | 'other';

export interface MapMarker {
	id: string;
	type: MarkerType;
	name: string;
	description: string; // Markdown content
	levelMin?: number;
	levelMax?: number;
	x: number; // DAOC X coordinate
	y: number; // DAOC Y coordinate
	mapId: number; // The map/region this marker belongs to
}

export interface MarkersFile {
	version: number;
	markers: MapMarker[];
}

export const MarkerTypeLabels: Record<MarkerType, string> = {
	npc: 'NPC',
	spot: 'Spot',
	quest: 'Quest',
	boss: 'Boss',
	vendor: 'Vendor',
	teleport: 'Teleport',
	dungeon: 'Dungeon',
	other: 'Other',
};

export const MarkerTypeIcons: Record<MarkerType, string> = {
	npc: 'mdi-account',
	spot: 'mdi-map-marker',
	quest: 'mdi-exclamation-thick',
	boss: 'mdi-skull',
	vendor: 'mdi-cart',
	teleport: 'mdi-teleport',
	dungeon: 'mdi-dungeon',
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
	other: '#9E9E9E',
};

export function createMarker(partial: Partial<MapMarker> & { x: number; y: number; mapId: number }): MapMarker {
	return {
		id: crypto.randomUUID(),
		type: 'spot',
		name: 'New Marker',
		description: '',
		...partial,
	};
}

export function exportMarkersToJson(markers: MapMarker[]): string {
	const file: MarkersFile = {
		version: 1,
		markers,
	};
	return JSON.stringify(file, null, 2);
}

export function importMarkersFromJson(json: string): MapMarker[] {
	const file: MarkersFile = JSON.parse(json);
	if (file.version !== 1) {
		throw new Error(`Unsupported markers file version: ${file.version}`);
	}
	return file.markers;
}
