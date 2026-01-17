import { ref, computed, Ref } from "vue";
import {
	MapMarker,
	MapLayer,
	createMarker,
	createDefaultLayer,
	createLayer,
	DEFAULT_LAYER_ID,
	MarkerType,
} from "@/models/MapMarker";

export function useMapMarkers() {
	const markers = ref<MapMarker[]>([]);
	const layers = ref<MapLayer[]>([createDefaultLayer()]);
	const selectedLayerId = ref<string>(DEFAULT_LAYER_ID);

	// Get current selected layer
	const currentLayer = computed(
		() => layers.value.find((l) => l.id === selectedLayerId.value) ?? layers.value[0]
	);

	// Get markers for a specific map, filtered by visible layers
	function getMarkersForMap(mapId: number) {
		return computed(() =>
			markers.value.filter((m) => {
				if (m.mapId !== mapId) return false;
				const layer = layers.value.find((l) => l.id === m.layerId);
				return layer?.visible !== false;
			})
		);
	}

	// Add a new marker
	function addMarker(markerData: MapMarker) {
		markers.value.push(markerData);
	}

	// Update an existing marker
	function updateMarker(markerData: MapMarker) {
		const idx = markers.value.findIndex((m) => m.id === markerData.id);
		if (idx !== -1) {
			markers.value[idx] = markerData;
		} else {
			markers.value.push(markerData);
		}
	}

	// Delete a marker
	function deleteMarker(markerId: string) {
		markers.value = markers.value.filter((m) => m.id !== markerId);
	}

	// Create a new point marker
	function createPointMarker(x: number, y: number, mapId: number): MapMarker {
		return createMarker({
			x,
			y,
			mapId,
			layerId: selectedLayerId.value,
		});
	}

	// Create a path or polygon marker
	function createGeometryMarker(
		type: "path" | "polygon",
		points: { x: number; y: number }[],
		mapId: number
	): MapMarker {
		const defaultType: MarkerType = type === "path" ? "stablemaster" : "area";
		return createMarker({
			geometry: { type, points },
			type: defaultType,
			mapId,
			layerId: selectedLayerId.value,
		});
	}

	// Update marker geometry points
	function updateMarkerGeometry(markerId: string, points: { x: number; y: number }[]) {
		const idx = markers.value.findIndex((m) => m.id === markerId);
		if (idx === -1) return;

		const marker = markers.value[idx];
		const geomType = marker.geometry.type;
		if (geomType === "path" || geomType === "polygon") {
			markers.value[idx] = {
				...marker,
				geometry: { type: geomType, points: [...points] },
			};
		}
	}

	// Update marker position (for point markers)
	function updateMarkerPosition(markerId: string, x: number, y: number) {
		const idx = markers.value.findIndex((m) => m.id === markerId);
		if (idx !== -1 && markers.value[idx].geometry.type === "point") {
			markers.value[idx] = {
				...markers.value[idx],
				geometry: { type: "point", x: Math.round(x), y: Math.round(y) },
			};
		}
	}

	// Layer management
	function addLayer(name: string, color?: string) {
		const layer = createLayer(name, color);
		layers.value = [...layers.value, layer];
		return layer;
	}

	function updateLayer(layerId: string, updates: Partial<MapLayer>) {
		const idx = layers.value.findIndex((l) => l.id === layerId);
		if (idx !== -1) {
			layers.value[idx] = { ...layers.value[idx], ...updates };
		}
	}

	function deleteLayer(layerId: string) {
		if (layerId === DEFAULT_LAYER_ID) return; // Can't delete default layer
		layers.value = layers.value.filter((l) => l.id !== layerId);
		markers.value = markers.value.filter((m) => m.layerId !== layerId);
		if (selectedLayerId.value === layerId) {
			selectedLayerId.value = DEFAULT_LAYER_ID;
		}
	}

	function getLayerColor(layerId: string): string {
		const layer = layers.value.find((l) => l.id === layerId);
		return layer?.color ?? "#2196F3";
	}

	function isLayerLocked(layerId: string): boolean {
		const layer = layers.value.find((l) => l.id === layerId);
		return layer?.locked ?? false;
	}

	return {
		markers,
		layers,
		selectedLayerId,
		currentLayer,
		getMarkersForMap,
		addMarker,
		updateMarker,
		deleteMarker,
		createPointMarker,
		createGeometryMarker,
		updateMarkerGeometry,
		updateMarkerPosition,
		addLayer,
		updateLayer,
		deleteLayer,
		getLayerColor,
		isLayerLocked,
	};
}
