<script lang="ts" setup>
import {
	circleMarker,
	CRS,
	imageOverlay,
	latLng,
	map as LeafletMap,
	Map,
	CircleMarkerOptions,
	LatLngBoundsLiteral,
	icon,
	LatLng,
	Marker,
	marker,
	Point,
	LatLngBounds,
	divIcon,
	polyline,
	polygon as leafletPolygon,
	Polyline,
	Polygon,
	Layer,
} from "leaflet";
import "leaflet/dist/leaflet.css";
import { Icon } from "leaflet";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { DaocMapInfo, DaocMaps, DaocMiniMaps } from "@/models/DaocMaps";
import {
	MapMarker,
	MapLayer,
	MarkerTypeColors,
	MarkerTypeIcons,
	createMarker,
	exportMarkersToJson,
	importMarkersFromJson,
	createDefaultLayer,
	createLayer,
	DEFAULT_LAYER_ID,
	compressForUrl,
	decompressFromUrl,
	MarkerType,
} from "@/models/MapMarker";
import MarkerEditor from "@/components/MarkerEditor.vue";
import LayerManager from "@/components/LayerManager.vue";
import GeometryEditor from "@/components/GeometryEditor.vue";

/* This code is needed to properly load the images in the Leaflet CSS */
delete (Icon as any).Default.prototype._getIconUrl;
Icon.Default.mergeOptions({
	iconRetinaUrl,
	iconUrl,
	shadowUrl,
});

const props = defineProps<{
	defaultSearch?: string;
}>();

let leafletMap: Map;
let markers: Record<string, any> = {};
let customMarkerLayers: Record<string, Layer> = {};

const mapId = ref(51);
const search = ref(props.defaultSearch ?? "");
const playerLevel = ref(50);
const loading = ref(false);
const selected = ref<any>(undefined);
const debugPos = ref("");

// Layers
const layers = ref<MapLayer[]>([createDefaultLayer()]);
const selectedLayerId = ref<string>(DEFAULT_LAYER_ID);

// Marker editing state
const customMarkers = ref<MapMarker[]>([]);
const showMarkerEditor = ref(false);
const editingMarker = ref<MapMarker | null>(null);
const addMarkerMode = ref<"point" | "path" | "polygon" | null>(null);

// Geometry editing state
const showGeometryEditor = ref(false);
const editingGeometryMarker = ref<MapMarker | null>(null);
const tempGeometryPoints = ref<{ x: number; y: number }[]>([]);
let tempPolylineLayer: Polyline | null = null;
let tempPolygonLayer: Polygon | null = null;

// Import dialog
const showImportDialog = ref(false);
const importToNewLayer = ref(true);
const importNewLayerName = ref("Imported");

const refMap = ref<HTMLDivElement | null>(null);
const refPopup = ref<HTMLDivElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

// Computed markers for current map, filtered by visible layers
const currentMapMarkers = computed(() =>
	customMarkers.value.filter((m) => {
		if (m.mapId !== mapId.value) return false;
		const layer = layers.value.find((l) => l.id === m.layerId);
		return layer?.visible !== false;
	})
);

// Get current selected layer
const currentLayer = computed(() => layers.value.find((l) => l.id === selectedLayerId.value) ?? layers.value[0]);

function getConLevel(level: number, compareLevel: number) {
	const constep = Math.max(1, (level + 9) / 10) | 0;
	const stepping = 1.0 / constep;
	const leveldiff = level - compareLevel;
	return Math.min(3, Math.max(-3, 0 - leveldiff * stepping)) | 0;
}

function clearMarkers() {
	for (const m of Object.values(markers)) m.remove();
	markers = {};
}

function clearCustomMarkerLayers() {
	for (const m of Object.values(customMarkerLayers)) m.remove();
	customMarkerLayers = {};
	clearTempLayers();
}

function clearTempLayers() {
	if (tempPolylineLayer) {
		tempPolylineLayer.remove();
		tempPolylineLayer = null;
	}
	if (tempPolygonLayer) {
		tempPolygonLayer.remove();
		tempPolygonLayer = null;
	}
}

function getLayerColor(layerId: string): string {
	const layer = layers.value.find((l) => l.id === layerId);
	return layer?.color ?? "#2196F3";
}

function createMarkerIcon(markerData: MapMarker) {
	const color = MarkerTypeColors[markerData.type];
	const layerColor = getLayerColor(markerData.layerId);
	return divIcon({
		className: "custom-marker-icon",
		html: `<div style="
			background-color: ${color};
			width: 24px;
			height: 24px;
			border-radius: 50%;
			border: 3px solid ${layerColor};
			box-shadow: 0 2px 5px rgba(0,0,0,0.3);
			display: flex;
			align-items: center;
			justify-content: center;
		">
			<span class="mdi ${MarkerTypeIcons[markerData.type]}" style="color: white; font-size: 14px;"></span>
		</div>`,
		iconSize: [24, 24],
		iconAnchor: [12, 12],
	});
}

function renderCustomMarkers() {
	clearCustomMarkerLayers();

	for (const markerData of currentMapMarkers.value) {
		const layer = layers.value.find((l) => l.id === markerData.layerId);
		if (!layer?.visible) continue;

		const geom = markerData.geometry;
		const layerColor = getLayerColor(markerData.layerId);
		const markerColor = MarkerTypeColors[markerData.type];

		if (geom.type === "point") {
			const latlng = daocToLatLng({ X: String(geom.x), Y: String(geom.y) });
			const markerLayer = marker(latlng, {
				icon: createMarkerIcon(markerData),
				draggable: !layer?.locked,
			});

			markerLayer.on("click", () => {
				editingMarker.value = markerData;
				showMarkerEditor.value = true;
			});

			markerLayer.on("dragend", () => {
				const newLatLng = markerLayer.getLatLng();
				const newCoords = latLngToDaoc(newLatLng);
				const idx = customMarkers.value.findIndex((m) => m.id === markerData.id);
				if (idx !== -1 && customMarkers.value[idx].geometry.type === "point") {
					customMarkers.value[idx] = {
						...customMarkers.value[idx],
						geometry: {
							type: "point",
							x: Math.round(newCoords.X),
							y: Math.round(newCoords.Y),
						},
					};
					updateUrlHash();
				}
			});

			let tooltipContent = `<strong>${markerData.name}</strong>`;
			if (markerData.levelMin != null || markerData.levelMax != null) {
				const levelText =
					markerData.levelMin === markerData.levelMax
						? `Level ${markerData.levelMin}`
						: `Level ${markerData.levelMin ?? "?"}-${markerData.levelMax ?? "?"}`;
				tooltipContent += `<br><small>${levelText}</small>`;
			}
			markerLayer.bindTooltip(tooltipContent);

			markerLayer.addTo(leafletMap);
			customMarkerLayers[markerData.id] = markerLayer;
		} else if (geom.type === "path") {
			const latlngs = geom.points.map((p) => daocToLatLng({ X: String(p.x), Y: String(p.y) }));
			const pathLayer = polyline(latlngs, {
				color: markerColor,
				weight: 4,
				opacity: 0.8,
				dashArray: "10, 5",
			});

			pathLayer.on("click", () => {
				editingMarker.value = markerData;
				showMarkerEditor.value = true;
			});

			pathLayer.bindTooltip(
				`<strong>${markerData.name}</strong><br><small>Path: ${geom.points.length} waypoints</small>`
			);
			pathLayer.addTo(leafletMap);
			customMarkerLayers[markerData.id] = pathLayer;

			// Add waypoint markers
			geom.points.forEach((p, i) => {
				const wpMarker = circleMarker(daocToLatLng({ X: String(p.x), Y: String(p.y) }), {
					radius: 6,
					fillColor: markerColor,
					color: layerColor,
					weight: 2,
					fillOpacity: 0.8,
				});
				wpMarker.bindTooltip(`${markerData.name} - Waypoint ${i + 1}`);
				wpMarker.addTo(leafletMap);
				customMarkerLayers[`${markerData.id}-wp-${i}`] = wpMarker;
			});
		} else if (geom.type === "polygon") {
			const latlngs = geom.points.map((p) => daocToLatLng({ X: String(p.x), Y: String(p.y) }));
			const polygonLayer = leafletPolygon(latlngs, {
				color: layerColor,
				fillColor: markerColor,
				fillOpacity: 0.2,
				weight: 2,
			});

			polygonLayer.on("click", () => {
				editingMarker.value = markerData;
				showMarkerEditor.value = true;
			});

			polygonLayer.bindTooltip(
				`<strong>${markerData.name}</strong><br><small>Area: ${geom.points.length} vertices</small>`
			);
			polygonLayer.addTo(leafletMap);
			customMarkerLayers[markerData.id] = polygonLayer;
		}
	}
}

function updateTempGeometry() {
	clearTempLayers();

	if (tempGeometryPoints.value.length < 2) return;

	const latlngs = tempGeometryPoints.value.map((p) => daocToLatLng({ X: String(p.x), Y: String(p.y) }));

	if (
		addMarkerMode.value === "path" ||
		(showGeometryEditor.value && editingGeometryMarker.value?.geometry.type === "path")
	) {
		tempPolylineLayer = polyline(latlngs, {
			color: "#FF9800",
			weight: 3,
			dashArray: "5, 10",
			opacity: 0.8,
		});
		tempPolylineLayer.addTo(leafletMap);
	} else if (
		addMarkerMode.value === "polygon" ||
		(showGeometryEditor.value && editingGeometryMarker.value?.geometry.type === "polygon")
	) {
		tempPolygonLayer = leafletPolygon(latlngs, {
			color: "#FF9800",
			fillColor: "#FF9800",
			fillOpacity: 0.1,
			weight: 2,
			dashArray: "5, 10",
		});
		tempPolygonLayer.addTo(leafletMap);
	}
}

function handleMapClick(latlng: LatLng) {
	const coords = latLngToDaoc(latlng);
	const point = { x: Math.round(coords.X), y: Math.round(coords.Y) };

	// If editing geometry (path or polygon), add point
	if (showGeometryEditor.value) {
		tempGeometryPoints.value = [...tempGeometryPoints.value, point];
		updateTempGeometry();
		return;
	}

	if (!addMarkerMode.value) return;

	if (addMarkerMode.value === "point") {
		const newMarker = createMarker({
			x: point.x,
			y: point.y,
			mapId: mapId.value,
			layerId: selectedLayerId.value,
		});

		editingMarker.value = newMarker;
		showMarkerEditor.value = true;
		addMarkerMode.value = null;
	} else if (addMarkerMode.value === "path" || addMarkerMode.value === "polygon") {
		tempGeometryPoints.value = [...tempGeometryPoints.value, point];
		updateTempGeometry();

		// Add visual feedback for the point
		const tempMarker = circleMarker(latlng, {
			radius: 6,
			fillColor: "#FF9800",
			color: "#fff",
			weight: 2,
			fillOpacity: 0.8,
		});
		tempMarker.addTo(leafletMap);
		customMarkerLayers[`temp-${tempGeometryPoints.value.length}`] = tempMarker;
	}
}

function finishGeometryCreation() {
	if (!addMarkerMode.value || addMarkerMode.value === "point") return;

	const minPoints = addMarkerMode.value === "polygon" ? 3 : 2;
	if (tempGeometryPoints.value.length < minPoints) {
		alert(`Need at least ${minPoints} points to create a ${addMarkerMode.value}`);
		return;
	}

	const defaultType: MarkerType = addMarkerMode.value === "path" ? "stablemaster" : "area";

	const newMarker = createMarker({
		geometry: {
			type: addMarkerMode.value,
			points: [...tempGeometryPoints.value],
		},
		type: defaultType,
		mapId: mapId.value,
		layerId: selectedLayerId.value,
	});

	editingMarker.value = newMarker;
	showMarkerEditor.value = true;
	cancelAddMode();
}

function cancelAddMode() {
	addMarkerMode.value = null;
	tempGeometryPoints.value = [];
	clearTempLayers();
	// Remove temp point markers
	Object.keys(customMarkerLayers)
		.filter((k) => k.startsWith("temp-"))
		.forEach((k) => {
			customMarkerLayers[k].remove();
			delete customMarkerLayers[k];
		});
}

function handleSaveMarker(markerData: MapMarker) {
	const idx = customMarkers.value.findIndex((m) => m.id === markerData.id);
	if (idx !== -1) {
		customMarkers.value[idx] = markerData;
	} else {
		customMarkers.value.push(markerData);
	}
	renderCustomMarkers();
	updateUrlHash();
}

function handleDeleteMarker(markerId: string) {
	customMarkers.value = customMarkers.value.filter((m) => m.id !== markerId);
	renderCustomMarkers();
	updateUrlHash();
}

function handleEditGeometry(markerData: MapMarker) {
	editingGeometryMarker.value = markerData;
	if (markerData.geometry.type === "path" || markerData.geometry.type === "polygon") {
		tempGeometryPoints.value = [...markerData.geometry.points];
	}
	showGeometryEditor.value = true;
	updateTempGeometry();
}

function handleGeometryUpdate(points: { x: number; y: number }[]) {
	tempGeometryPoints.value = points;
	updateTempGeometry();
}

function handleGeometryClose() {
	if (editingGeometryMarker.value && tempGeometryPoints.value.length >= 2) {
		const idx = customMarkers.value.findIndex((m) => m.id === editingGeometryMarker.value!.id);
		if (idx !== -1) {
			const geomType = customMarkers.value[idx].geometry.type;
			if (geomType === "path" || geomType === "polygon") {
				customMarkers.value[idx] = {
					...customMarkers.value[idx],
					geometry: {
						type: geomType,
						points: [...tempGeometryPoints.value],
					},
				};
			}
		}
	}

	showGeometryEditor.value = false;
	editingGeometryMarker.value = null;
	tempGeometryPoints.value = [];
	clearTempLayers();
	renderCustomMarkers();
	updateUrlHash();
}

function toggleAddMarkerMode(mode: "point" | "path" | "polygon") {
	if (addMarkerMode.value === mode) {
		cancelAddMode();
	} else {
		cancelAddMode();
		addMarkerMode.value = mode;
	}
}

function saveMarkersToFile() {
	const json = exportMarkersToJson(customMarkers.value, layers.value);
	const blob = new Blob([json], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `daoc-markers-${new Date().toISOString().split("T")[0]}.json`;
	a.click();
	URL.revokeObjectURL(url);
}

function loadMarkersFromFile() {
	fileInputRef.value?.click();
}

function handleFileUpload(event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	if (!file) return;

	const reader = new FileReader();
	reader.onload = (e) => {
		try {
			const json = e.target?.result as string;
			pendingImportJson.value = json;
			showImportDialog.value = true;
		} catch (err) {
			console.error("Failed to read file:", err);
			alert("Failed to read markers file.");
		}
	};
	reader.readAsText(file);
	input.value = "";
}

const pendingImportJson = ref<string>("");

function confirmImport() {
	try {
		const { markers: loadedMarkers, layers: loadedLayers } = importMarkersFromJson(pendingImportJson.value);

		if (importToNewLayer.value) {
			// Create a new layer and reassign all markers to it
			const newLayer = createLayer(importNewLayerName.value);
			layers.value = [...layers.value, newLayer];

			// Map old layer IDs to the new layer
			const reassignedMarkers = loadedMarkers.map((m) => ({
				...m,
				id: crypto.randomUUID(), // Generate new IDs to avoid conflicts
				layerId: newLayer.id,
			}));

			customMarkers.value = [...customMarkers.value, ...reassignedMarkers];
		} else {
			// Merge layers (add missing ones)
			for (const layer of loadedLayers) {
				if (!layers.value.find((l) => l.id === layer.id)) {
					layers.value = [...layers.value, layer];
				}
			}

			// Add markers with new IDs
			const reassignedMarkers = loadedMarkers.map((m) => ({
				...m,
				id: crypto.randomUUID(),
			}));

			customMarkers.value = [...customMarkers.value, ...reassignedMarkers];
		}

		showImportDialog.value = false;
		pendingImportJson.value = "";
		renderCustomMarkers();
		updateUrlHash();
	} catch (err) {
		console.error("Failed to import markers:", err);
		alert("Failed to import markers. Make sure it is a valid JSON file.");
	}
}

// URL hash handling
function updateUrlHash() {
	if (customMarkers.value.length === 0 && layers.value.length === 1) {
		history.replaceState(null, "", window.location.pathname);
		return;
	}

	const encoded = compressForUrl(customMarkers.value, layers.value);
	history.replaceState(null, "", `#${encoded}`);
}

function loadFromUrlHash() {
	const hash = window.location.hash.slice(1);
	if (!hash) return;

	try {
		const { markers: loadedMarkers, layers: loadedLayers } = decompressFromUrl(hash);
		customMarkers.value = loadedMarkers;
		layers.value = loadedLayers.length > 0 ? loadedLayers : [createDefaultLayer()];
	} catch (err) {
		console.error("Failed to load from URL:", err);
	}
}

function copyShareableLink() {
	updateUrlHash();
	navigator.clipboard.writeText(window.location.href).then(() => {
		alert("Link copied to clipboard!");
	});
}

async function initMap() {
	if (!refMap.value) return;

	loading.value = true;
	if (leafletMap) {
		leafletMap.off();
		leafletMap.remove();
		await new Promise((r) => setTimeout(r, 50));
	}

	const current = DaocMiniMaps.find((r) => r.id === mapId.value);
	if (!current) {
		loading.value = false;
		console.error("map not found", mapId.value);
		return;
	}

	leafletMap = LeafletMap(refMap.value, {
		crs: CRS.Simple,
		minZoom: 3,
		maxZoom: 13,
		preferCanvas: true,
	});

	const map = DaocMaps[current.id];
	let mapBounds: LatLngBoundsLiteral = [
		[1000, 10000],
		[-1000, -1000],
	];
	const tiles: DaocMapInfo["tiles"] = [];
	for (const zone of current.zones) {
		let bounds: LatLngBoundsLiteral = [
			[-(zone.offsetY + zone.height) / 8192, zone.offsetX / 8192],
			[-(zone.offsetY / 8192), (zone.offsetX + zone.width) / 8192],
		];
		const tile = map.tiles.find((t) => t.src === zone.src);
		if (tile) tiles.push(tile);

		if (bounds[0].every((i) => i === 0) && bounds[1].every((i) => i === 0)) {
			bounds = tile?.bounds ?? bounds;
		} else {
			const add = tile?.bounds ?? [
				[0, 0],
				[0, 0],
			];
			// add zone offsets
			bounds[0][0] += add[1][0];
			bounds[0][1] += add[0][1];
			bounds[1][0] += add[1][0];
			bounds[1][1] += add[0][1];
		}
		imageOverlay(zone.src, bounds).addTo(leafletMap);
		mapBounds = [
			[Math.min(bounds[0][0], mapBounds[0][0]), Math.min(bounds[0][1], mapBounds[0][1])],
			[Math.max(bounds[1][0], mapBounds[1][0]), Math.max(bounds[1][1], mapBounds[1][1])],
		];
	}
	leafletMap.fitBounds(mapBounds);

	leafletMap.on("mousemove", (ev) => {
		const { X, Y } = latLngToDaoc(ev.latlng);
		let [lx, ly] = [X / 8192, Y / 8192];
		const zone = current.zones.find(
			(z) => z.offsetX <= lx && lx < z.offsetX + (z.width || 8) && z.offsetY <= ly && ly < z.offsetY + (z.height || 8)
		);
		if (zone) [lx, ly] = [X - zone.offsetX, Y - zone.offsetY];
		const tile = tiles.find((t) => new LatLngBounds(t.bounds).contains(ev.latlng));
		if (tile)
			[lx, ly] = [X - latLngToDaoc(new LatLng(...tile.bounds[0])).X, Y - latLngToDaoc(new LatLng(...tile.bounds[1])).Y];
		const zoneId = (zone?.src ?? tile?.src ?? "maps/.jpg").substring(6).substring(0, 3);
		const loc = zone || tile ? `loc=${lx},${ly}, z:${zoneId}` : "";
		debugPos.value = `gloc (x:${X}, y:${Y}) ${loc}`;
	});

	// Click to add marker when in add mode
	leafletMap.on("click", (ev) => {
		handleMapClick(ev.latlng);
	});

	// Render existing custom markers
	renderCustomMarkers();

	loading.value = false;
}

onMounted(async () => {
	loadFromUrlHash();
	await initMap();
	document.addEventListener("keydown", handleKeydown);
	window.addEventListener("hashchange", loadFromUrlHash);
});
onUnmounted(() => {
	clearMarkers();
	clearCustomMarkerLayers();
	document.removeEventListener("keydown", handleKeydown);
	window.removeEventListener("hashchange", loadFromUrlHash);
});

function handleKeydown(e: KeyboardEvent) {
	if (e.key === "Escape") {
		if (addMarkerMode.value) {
			cancelAddMode();
		}
		if (showGeometryEditor.value) {
			handleGeometryClose();
		}
	}
	// Enter to finish geometry creation
	if (e.key === "Enter" && addMarkerMode.value && addMarkerMode.value !== "point") {
		finishGeometryCreation();
	}
}

watch(mapId, () => {
	initMap();
});
watch(currentMapMarkers, renderCustomMarkers, { deep: true });
watch(
	layers,
	() => {
		renderCustomMarkers();
		updateUrlHash();
	},
	{ deep: true }
);
watch(
	() => props.defaultSearch,
	() => (search.value = props.defaultSearch != null ? props.defaultSearch : search.value)
);

function daocToLatLng(npc: { X: string; Y: string }) {
	return latLng({
		lat: -parseInt(npc.Y) / 8192,
		lng: parseInt(npc.X) / 8192,
	});
}
function latLngToDaoc(coord: LatLng) {
	return {
		X: coord.lng * 8192,
		Y: coord.lat * -8192,
	};
}
</script>

<template>
	<div>
		<v-toolbar title="Maps">
			<v-autocomplete
				v-model="mapId"
				:items="Object.values(DaocMaps)"
				:item-title="(v: DaocMapInfo) => `${v.id} - ${v.name}`"
				item-value="id"
				prepend-inner-icon="mdi-map"
				label="Region"
				hide-details
				class="mx-1"
			/>

			<v-text-field v-model="search" prepend-inner-icon="mdi-magnify" label="Search" hide-details class="mx-1" />

			<v-text-field label="Level" type="number" v-model.number="playerLevel" hide-details class="mx-1" />

			<div class="d-flex align-center gap-1 flex-wrap">
				<!-- Add marker buttons -->
				<v-btn-toggle :model-value="addMarkerMode" density="compact">
					<v-btn
						value="point"
						size="small"
						:color="addMarkerMode === 'point' ? 'primary' : undefined"
						@click="toggleAddMarkerMode('point')"
						title="Add point marker"
					>
						<v-icon icon="mdi-map-marker-plus" />
					</v-btn>
					<v-btn
						value="path"
						size="small"
						:color="addMarkerMode === 'path' ? 'warning' : undefined"
						@click="toggleAddMarkerMode('path')"
						title="Add path (stablemaster route)"
					>
						<v-icon icon="mdi-vector-polyline" />
					</v-btn>
					<v-btn
						value="polygon"
						size="small"
						:color="addMarkerMode === 'polygon' ? 'success' : undefined"
						@click="toggleAddMarkerMode('polygon')"
						title="Add polygon (area)"
					>
						<v-icon icon="mdi-vector-polygon" />
					</v-btn>
				</v-btn-toggle>

				<v-divider vertical class="mx-2" />

				<!-- File operations -->
				<v-btn
					icon="mdi-content-save"
					size="small"
					variant="text"
					@click="saveMarkersToFile"
					title="Save markers to JSON"
					:disabled="customMarkers.length === 0"
				/>
				<v-btn
					icon="mdi-folder-open"
					size="small"
					variant="text"
					@click="loadMarkersFromFile"
					title="Load markers from JSON"
				/>
				<v-btn
					icon="mdi-share-variant"
					size="small"
					variant="text"
					@click="copyShareableLink"
					title="Copy shareable link"
					:disabled="customMarkers.length === 0"
				/>

				<v-chip v-if="currentMapMarkers.length > 0" size="small" color="primary">
					{{ currentMapMarkers.length }} markers
				</v-chip>
			</div>
		</v-toolbar>

		<!-- Hidden file input for loading markers -->
		<input ref="fileInputRef" type="file" accept=".json" style="display: none" @change="handleFileUpload" />

		<!-- Add marker mode banners -->
		<v-alert v-if="addMarkerMode === 'point'" type="info" density="compact" closable @click:close="cancelAddMode">
			<strong>Add Point Marker:</strong> Click on the map to place a marker.
		</v-alert>
		<v-alert v-if="addMarkerMode === 'path'" type="warning" density="compact" closable @click:close="cancelAddMode">
			<strong>Add Path:</strong> Click to add waypoints. Press <kbd>Enter</kbd> to finish or <kbd>ESC</kbd> to cancel.
			<span v-if="tempGeometryPoints.length > 0">({{ tempGeometryPoints.length }} points)</span>
			<v-btn v-if="tempGeometryPoints.length >= 2" size="small" class="ml-2" @click="finishGeometryCreation"
				>Finish Path</v-btn
			>
		</v-alert>
		<v-alert v-if="addMarkerMode === 'polygon'" type="success" density="compact" closable @click:close="cancelAddMode">
			<strong>Add Polygon:</strong> Click to add vertices. Press <kbd>Enter</kbd> to finish or <kbd>ESC</kbd> to cancel.
			<span v-if="tempGeometryPoints.length > 0">({{ tempGeometryPoints.length }} points)</span>
			<v-btn v-if="tempGeometryPoints.length >= 3" size="small" class="ml-2" @click="finishGeometryCreation"
				>Finish Polygon</v-btn
			>
		</v-alert>

		<v-row>
			<v-col>
				<v-progress-linear :active="loading" indeterminate />
				<div style="position: relative">
					<!-- Layer Manager Panel -->
					<LayerManager v-model:layers="layers" v-model:selectedLayerId="selectedLayerId" />

					<!-- Geometry Editor Panel -->
					<GeometryEditor
						v-model="showGeometryEditor"
						:points="tempGeometryPoints"
						:is-polygon="editingGeometryMarker?.geometry.type === 'polygon'"
						@update:points="handleGeometryUpdate"
						@close="handleGeometryClose"
					/>
				</div>
				<div class="map-container">
					<div ref="refMap" class="map-view" :class="{ 'add-marker-cursor': addMarkerMode }" />
				</div>
				<div>{{ debugPos }}</div>
			</v-col>
		</v-row>

		<div style="display: none">
			<div ref="refPopup" style="min-width: 187px">
				<template v-if="!selected">Nothing selected</template>
			</div>
		</div>

		<!-- Marker Editor Dialog -->
		<MarkerEditor
			v-model="showMarkerEditor"
			:marker="editingMarker"
			:layers="layers"
			@save="handleSaveMarker"
			@delete="handleDeleteMarker"
			@edit-geometry="handleEditGeometry"
		/>

		<!-- Import Dialog -->
		<v-dialog v-model="showImportDialog" max-width="400">
			<v-card>
				<v-card-title>Import Markers</v-card-title>
				<v-card-text>
					<v-switch v-model="importToNewLayer" label="Import to new layer" color="primary" />
					<v-text-field
						v-if="importToNewLayer"
						v-model="importNewLayerName"
						label="New layer name"
						variant="outlined"
						density="compact"
					/>
					<v-alert v-if="!importToNewLayer" type="info" density="compact" variant="tonal">
						Markers will be added to their original layers. Missing layers will be created.
					</v-alert>
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="showImportDialog = false">Cancel</v-btn>
					<v-btn color="primary" variant="elevated" @click="confirmImport">Import</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<style scoped>
.map-container {
	position: relative;
	min-height: calc(100vh - 260px);
	overflow: hidden;
}

.map-view {
	height: 100%;
	min-height: calc(100vh - 260px);
	z-index: 1;
}

.map-view.add-marker-cursor {
	cursor: crosshair;
}

.players-panel {
	position: absolute;
	top: 10px;
	right: 10px;
	z-index: 1000;
	background: rgba(0, 0, 0, 0.8);
	border-radius: 4px;
	min-width: 140px;
	max-width: 180px;
	font-size: 0.8em;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.players-header {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 4px 8px;
	cursor: pointer;
	user-select: none;
	color: #fff;
	font-weight: 500;
}

.players-header:hover {
	background: rgba(255, 255, 255, 0.1);
}

.players-list {
	max-height: 150px;
	overflow-y: auto;
}

.player-item {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 3px 8px;
	cursor: pointer;
	color: #eee;
	border-left: 2px solid transparent;
}

.player-item:hover {
	background: rgba(255, 255, 255, 0.1);
}

.player-item.selected {
	background: rgba(238, 238, 17, 0.2);
	border-left-color: #eeee11;
}

.player-name {
	flex: 1;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.player-level {
	color: #aaa;
	font-size: 0.85em;
}

.player-bars {
	width: 30px;
	height: 4px;
	background: #333;
	border-radius: 2px;
	overflow: hidden;
}

.health-bar {
	height: 100%;
	background: #ee2222;
	transition: width 0.3s;
}
</style>
