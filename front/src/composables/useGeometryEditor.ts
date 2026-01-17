import { ref, Ref } from "vue";
import { MapMarker } from "@/models/MapMarker";
import { LatLng, Polyline, Polygon, polyline, polygon as leafletPolygon, Map, circleMarker, Layer } from "leaflet";

export interface GeometryEditorState {
	isEditing: boolean;
	marker: MapMarker | null;
	points: { x: number; y: number }[];
}

export function useGeometryEditor(
	leafletMap: Ref<Map | null>,
	daocToLatLng: (coords: { X: string; Y: string }) => LatLng,
	customMarkerLayers: Record<string, Layer>
) {
	const showEditor = ref(false);
	const editingMarker = ref<MapMarker | null>(null);
	const tempPoints = ref<{ x: number; y: number }[]>([]);
	
	let tempPolylineLayer: Polyline | null = null;
	let tempPolygonLayer: Polygon | null = null;

	// Add marker creation mode
	const addMode = ref<"point" | "path" | "polygon" | null>(null);

	function clearTempLayers() {
		if (tempPolylineLayer) {
			tempPolylineLayer.remove();
			tempPolylineLayer = null;
		}
		if (tempPolygonLayer) {
			tempPolygonLayer.remove();
			tempPolygonLayer = null;
		}
		// Remove temp point markers
		Object.keys(customMarkerLayers)
			.filter((k) => k.startsWith("temp-"))
			.forEach((k) => {
				customMarkerLayers[k].remove();
				delete customMarkerLayers[k];
			});
	}

	function updateTempGeometry() {
		clearTempLayers();

		if (!leafletMap.value || tempPoints.value.length < 2) return;

		const latlngs = tempPoints.value.map((p) => daocToLatLng({ X: String(p.x), Y: String(p.y) }));

		const isPath =
			addMode.value === "path" ||
			(showEditor.value && editingMarker.value?.geometry.type === "path");

		const isPolygon =
			addMode.value === "polygon" ||
			(showEditor.value && editingMarker.value?.geometry.type === "polygon");

		if (isPath) {
			tempPolylineLayer = polyline(latlngs, {
				color: "#FF9800",
				weight: 3,
				dashArray: "5, 10",
				opacity: 0.8,
			});
			tempPolylineLayer.addTo(leafletMap.value);
		} else if (isPolygon) {
			tempPolygonLayer = leafletPolygon(latlngs, {
				color: "#FF9800",
				fillColor: "#FF9800",
				fillOpacity: 0.1,
				weight: 2,
				dashArray: "5, 10",
			});
			tempPolygonLayer.addTo(leafletMap.value);
		}
	}

	function addPoint(point: { x: number; y: number }, latlng?: LatLng) {
		tempPoints.value = [...tempPoints.value, point];
		updateTempGeometry();

		// Add visual feedback for the point
		if (leafletMap.value && latlng) {
			const tempMarker = circleMarker(latlng, {
				radius: 6,
				fillColor: "#FF9800",
				color: "#fff",
				weight: 2,
				fillOpacity: 0.8,
			});
			tempMarker.addTo(leafletMap.value);
			customMarkerLayers[`temp-${tempPoints.value.length}`] = tempMarker;
		}
	}

	function startEditing(marker: MapMarker) {
		editingMarker.value = marker;
		if (marker.geometry.type === "path" || marker.geometry.type === "polygon") {
			tempPoints.value = [...marker.geometry.points];
		}
		showEditor.value = true;
		updateTempGeometry();
	}

	function finishEditing(): { x: number; y: number }[] | null {
		const points = [...tempPoints.value];
		showEditor.value = false;
		editingMarker.value = null;
		tempPoints.value = [];
		clearTempLayers();
		return points.length >= 2 ? points : null;
	}

	function cancelEditing() {
		showEditor.value = false;
		editingMarker.value = null;
		tempPoints.value = [];
		clearTempLayers();
	}

	function toggleAddMode(mode: "point" | "path" | "polygon") {
		if (addMode.value === mode) {
			cancelAddMode();
		} else {
			cancelAddMode();
			addMode.value = mode;
		}
	}

	function cancelAddMode() {
		addMode.value = null;
		tempPoints.value = [];
		clearTempLayers();
	}

	function canFinishGeometry(): boolean {
		if (!addMode.value || addMode.value === "point") return false;
		const minPoints = addMode.value === "polygon" ? 3 : 2;
		return tempPoints.value.length >= minPoints;
	}

	function updatePoints(points: { x: number; y: number }[]) {
		tempPoints.value = points;
		updateTempGeometry();
	}

	return {
		showEditor,
		editingMarker,
		tempPoints,
		addMode,
		clearTempLayers,
		updateTempGeometry,
		addPoint,
		startEditing,
		finishEditing,
		cancelEditing,
		toggleAddMode,
		cancelAddMode,
		canFinishGeometry,
		updatePoints,
	};
}
