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
} from "leaflet";
import "leaflet/dist/leaflet.css";
import { Icon } from "leaflet";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { DaocMapInfo, DaocMaps, DaocMiniMaps } from "@/models/DaocMaps";
import { MapMarker, MarkerTypeColors, MarkerTypeIcons, createMarker, exportMarkersToJson, importMarkersFromJson } from "@/models/MapMarker";
import MarkerEditor from "@/components/MarkerEditor.vue";

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
let customMarkerLayers: Record<string, Marker> = {};

const mapId = ref(51);
const search = ref(props.defaultSearch ?? "");
const playerLevel = ref(50);
const loading = ref(false);
const selected = ref<any>(undefined);
const debugPos = ref("");

// Marker editing state
const customMarkers = ref<MapMarker[]>([]);
const showMarkerEditor = ref(false);
const editingMarker = ref<MapMarker | null>(null);
const addMarkerMode = ref(false);

const refMap = ref<HTMLDivElement | null>(null);
const refPopup = ref<HTMLDivElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

// Computed markers for current map
const currentMapMarkers = computed(() => 
	customMarkers.value.filter(m => m.mapId === mapId.value)
);

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
}

function createMarkerIcon(markerData: MapMarker) {
	const color = MarkerTypeColors[markerData.type];
	return divIcon({
		className: 'custom-marker-icon',
		html: `<div style="
			background-color: ${color};
			width: 24px;
			height: 24px;
			border-radius: 50%;
			border: 2px solid white;
			box-shadow: 0 2px 5px rgba(0,0,0,0.3);
			display: flex;
			align-items: center;
			justify-content: center;
		">
			<span class="mdi ${MarkerTypeIcons[markerData.type].replace('mdi-', 'mdi-')}" style="color: white; font-size: 14px;"></span>
		</div>`,
		iconSize: [24, 24],
		iconAnchor: [12, 12],
	});
}

function renderCustomMarkers() {
	clearCustomMarkerLayers();
	
	for (const markerData of currentMapMarkers.value) {
		const latlng = daocToLatLng({ X: String(markerData.x), Y: String(markerData.y) });
		const markerLayer = marker(latlng, {
			icon: createMarkerIcon(markerData),
			draggable: true,
		});

		// Click to edit
		markerLayer.on('click', () => {
			editingMarker.value = markerData;
			showMarkerEditor.value = true;
		});

		// Drag to move
		markerLayer.on('dragend', () => {
			const newLatLng = markerLayer.getLatLng();
			const newCoords = latLngToDaoc(newLatLng);
			const idx = customMarkers.value.findIndex(m => m.id === markerData.id);
			if (idx !== -1) {
				customMarkers.value[idx] = {
					...customMarkers.value[idx],
					x: Math.round(newCoords.X),
					y: Math.round(newCoords.Y),
				};
			}
		});

		// Tooltip with name and level
		let tooltipContent = `<strong>${markerData.name}</strong>`;
		if (markerData.levelMin != null || markerData.levelMax != null) {
			const levelText = markerData.levelMin === markerData.levelMax
				? `Level ${markerData.levelMin}`
				: `Level ${markerData.levelMin ?? '?'}-${markerData.levelMax ?? '?'}`;
			tooltipContent += `<br><small>${levelText}</small>`;
		}
		markerLayer.bindTooltip(tooltipContent);

		markerLayer.addTo(leafletMap);
		customMarkerLayers[markerData.id] = markerLayer;
	}
}

function handleMapClick(latlng: LatLng) {
	if (!addMarkerMode.value) return;
	
	const coords = latLngToDaoc(latlng);
	const newMarker = createMarker({
		x: Math.round(coords.X),
		y: Math.round(coords.Y),
		mapId: mapId.value,
	});
	
	editingMarker.value = newMarker;
	showMarkerEditor.value = true;
	addMarkerMode.value = false;
}

function handleSaveMarker(markerData: MapMarker) {
	const idx = customMarkers.value.findIndex(m => m.id === markerData.id);
	if (idx !== -1) {
		customMarkers.value[idx] = markerData;
	} else {
		customMarkers.value.push(markerData);
	}
	renderCustomMarkers();
}

function handleDeleteMarker(markerId: string) {
	customMarkers.value = customMarkers.value.filter(m => m.id !== markerId);
	renderCustomMarkers();
}

function toggleAddMarkerMode() {
	addMarkerMode.value = !addMarkerMode.value;
}

function saveMarkersToFile() {
	const json = exportMarkersToJson(customMarkers.value);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `daoc-markers-${new Date().toISOString().split('T')[0]}.json`;
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
			const loadedMarkers = importMarkersFromJson(json);
			customMarkers.value = loadedMarkers;
			renderCustomMarkers();
		} catch (err) {
			console.error('Failed to load markers:', err);
			alert('Failed to load markers file. Make sure it is a valid JSON file.');
		}
	};
	reader.readAsText(file);
	input.value = ''; // Reset input
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
	await initMap();
	// ESC key to cancel add marker mode
	document.addEventListener('keydown', handleKeydown);
});
onUnmounted(() => {
	clearMarkers();
	clearCustomMarkerLayers();
	document.removeEventListener('keydown', handleKeydown);
});

function handleKeydown(e: KeyboardEvent) {
	if (e.key === 'Escape' && addMarkerMode.value) {
		addMarkerMode.value = false;
	}
}

watch(mapId, () => {
	initMap();
});
watch(currentMapMarkers, renderCustomMarkers, { deep: true });
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
			<v-col sm="4">
				<v-autocomplete
					v-model="mapId"
					:items="Object.values(DaocMaps)"
					:item-title="(v: DaocMapInfo) => `${v.id} - ${v.name}`"
					item-value="id"
					prepend-inner-icon="mdi-map"
					label="Region"
					variant="underlined"
					hide-details
				/>
			</v-col>
			<v-col sm="3">
				<v-text-field v-model="search" prepend-inner-icon="mdi-magnify" label="Search" hide-details />
			</v-col>
			<v-col sm="2">
				<v-text-field
					label="Player level"
					type="number"
					v-model.number="playerLevel"
					hide-details
					variant="underlined"
				/>
			</v-col>
			<v-col sm="3" class="d-flex align-center gap-1">
				<v-btn
					:color="addMarkerMode ? 'primary' : undefined"
					:variant="addMarkerMode ? 'elevated' : 'text'"
					icon="mdi-map-marker-plus"
					size="small"
					@click="toggleAddMarkerMode"
					:title="addMarkerMode ? 'Click on map to add marker (ESC to cancel)' : 'Add marker'"
				/>
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
				<v-chip v-if="currentMapMarkers.length > 0" size="small" color="primary">
					{{ currentMapMarkers.length }} markers
				</v-chip>
			</v-col>
		</v-toolbar>

		<!-- Hidden file input for loading markers -->
		<input
			ref="fileInputRef"
			type="file"
			accept=".json"
			style="display: none"
			@change="handleFileUpload"
		/>

		<!-- Add marker mode banner -->
		<v-alert
			v-if="addMarkerMode"
			type="info"
			density="compact"
			closable
			@click:close="addMarkerMode = false"
		>
			<strong>Add Marker Mode:</strong> Click on the map to add a new marker. Press ESC or click the X to cancel.
		</v-alert>

		<v-row>
			<v-col>
				<v-progress-linear :active="loading" indeterminate />
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
			@save="handleSaveMarker"
			@delete="handleDeleteMarker"
		/>
	</div>
</template>

<style scoped>
.map-container {
	position: relative;
	min-height: calc(100vh - 260px);
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
