<script lang="ts" setup>
import { LatLng, circleMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { DaocMapInfo, DaocMaps } from "@/models/DaocMaps";
import {
	MapMarker,
	createMarker,
	createDefaultLayer,
	MarkerType,
} from "@/models/MapMarker";
import MarkerEditor from "@/components/MarkerEditor.vue";
import LayerManager from "@/components/LayerManager.vue";
import GeometryEditor from "@/components/GeometryEditor.vue";
import { useMapMarkers } from "@/composables/useMapMarkers";
import { useMapStorage } from "@/composables/useMapStorage";
import { useLeafletMap } from "@/composables/useLeafletMap";

const props = defineProps<{
	defaultSearch?: string;
}>();

// Template refs
const refMap = ref<HTMLDivElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

// Basic state
const mapId = ref<number>(51);
const search = ref(props.defaultSearch ?? "");
const playerLevel = ref(50);
const showOnlyMapsWithMarkers = ref(false);

// Use composables
const {
	markers: customMarkers,
	layers,
	selectedLayerId,
	updateMarker,
	deleteMarker,
	updateMarkerPosition,
	updateMarkerGeometry,
} = useMapMarkers();

const {
	lastSaved,
	autoSaveEnabled,
	saveToLocalStorage,
	clearLocalStorage,
	copyShareableLink,
	exportToFile,
	importFromJson,
	initialize: initializeStorage,
	setupAutoSave,
} = useMapStorage(customMarkers, layers);

const {
	leafletMap,
	loading,
	debugPos,
	customMarkerLayers,
	latLngToDaoc,
	renderCustomMarkers,
	initMap: initLeafletMap,
	cleanup: cleanupLeafletMap,
	zoomToMarkers,
} = useLeafletMap(refMap);

// Marker editing state
const showMarkerEditor = ref(false);
const editingMarker = ref<MapMarker | null>(null);
const addMarkerMode = ref<"point" | "path" | "polygon" | null>(null);

// Geometry editing state
const showGeometryEditor = ref(false);
const editingGeometryMarker = ref<MapMarker | null>(null);
const tempGeometryPoints = ref<{ x: number; y: number }[]>([]);

// Import dialog
const showImportDialog = ref(false);
const importToNewLayer = ref(true);
const importNewLayerName = ref("Imported");
const pendingImportJson = ref<string>("");

// Computed markers for current map, filtered by visible layers
const currentMapMarkers = computed(() =>
	customMarkers.value.filter((m) => {
		if (m.mapId !== mapId.value) return false;
		const layer = layers.value.find((l) => l.id === m.layerId);
		return layer?.visible !== false;
	})
);

// Computed: maps that have markers
const mapsWithMarkers = computed(() => {
	const mapIds = new Set(customMarkers.value.map(m => m.mapId));
	return mapIds;
});

// Computed: filtered maps for the dropdown
const filteredMaps = computed(() => {
	const allMaps = Object.values(DaocMaps);
	if (!showOnlyMapsWithMarkers.value) {
		return allMaps;
	}
	return allMaps.filter(m => mapsWithMarkers.value.has(m.id));
});

// Get marker count for a specific map
function getMapMarkerCount(mapIdVal: number): number {
	return customMarkers.value.filter(m => m.mapId === mapIdVal).length;
}

// Format last saved time
const lastSavedText = computed(() => {
	if (!lastSaved.value) return "Never";
	const now = new Date();
	const diff = now.getTime() - lastSaved.value.getTime();
	if (diff < 60000) return "Just now";
	if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
	return lastSaved.value.toLocaleTimeString();
});

function handleMapClick(latlng: LatLng) {
	const coords = latLngToDaoc(latlng);
	const point = { x: Math.round(coords.X), y: Math.round(coords.Y) };

	// If editing geometry (path or polygon), add point
	if (showGeometryEditor.value) {
		tempGeometryPoints.value = [...tempGeometryPoints.value, point];
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

		// Add visual feedback for the point
		if (leafletMap.value) {
			const tempMarker = circleMarker(latlng, {
				radius: 6,
				fillColor: "#FF9800",
				color: "#fff",
				weight: 2,
				fillOpacity: 0.8,
			});
			tempMarker.addTo(leafletMap.value);
			customMarkerLayers[`temp-${tempGeometryPoints.value.length}`] = tempMarker;
		}
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
	// Remove temp point markers
	Object.keys(customMarkerLayers)
		.filter((k) => k.startsWith("temp-"))
		.forEach((k) => {
			customMarkerLayers[k].remove();
			delete customMarkerLayers[k];
		});
}

function toggleAddMarkerMode(mode: "point" | "path" | "polygon") {
	if (addMarkerMode.value === mode) {
		cancelAddMode();
	} else {
		cancelAddMode();
		addMarkerMode.value = mode;
	}
}

function handleSaveMarker(markerData: MapMarker) {
	updateMarker(markerData);
	doRenderMarkers();
}

function handleDeleteMarker(markerId: string) {
	deleteMarker(markerId);
	doRenderMarkers();
}

function handleEditGeometry(markerData: MapMarker) {
	editingGeometryMarker.value = markerData;
	if (markerData.geometry.type === "path" || markerData.geometry.type === "polygon") {
		tempGeometryPoints.value = [...markerData.geometry.points];
	}
	showGeometryEditor.value = true;
}

function handleGeometryUpdate(points: { x: number; y: number }[]) {
	tempGeometryPoints.value = points;
}

function handleGeometryClose() {
	if (editingGeometryMarker.value && tempGeometryPoints.value.length >= 2) {
		updateMarkerGeometry(editingGeometryMarker.value.id, tempGeometryPoints.value);
	}

	showGeometryEditor.value = false;
	editingGeometryMarker.value = null;
	tempGeometryPoints.value = [];
	doRenderMarkers();
}

// File operations
function saveMarkersToFile() {
	exportToFile();
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

function confirmImport() {
	const result = importFromJson(pendingImportJson.value, {
		toNewLayer: importToNewLayer.value,
		newLayerName: importNewLayerName.value,
	});

	if (result.success) {
		showImportDialog.value = false;
		pendingImportJson.value = "";
		doRenderMarkers();
	} else {
		alert("Failed to import markers. Make sure it is a valid JSON file.");
	}
}

async function handleCopyShareableLink() {
	const success = await copyShareableLink();
	if (success) {
		alert("Link copied to clipboard!");
	}
}

function handleClearStorage() {
	if (confirm("Are you sure you want to clear all saved markers from local storage? This cannot be undone.")) {
		clearLocalStorage();
		customMarkers.value = [];
		layers.value = [createDefaultLayer()];
		doRenderMarkers();
	}
}

// Render markers helper
function doRenderMarkers() {
	renderCustomMarkers(currentMapMarkers.value, layers.value, {
		onMarkerClick: (marker) => {
			editingMarker.value = marker;
			showMarkerEditor.value = true;
		},
		onMarkerDragEnd: (marker, newLatLng) => {
			const newCoords = latLngToDaoc(newLatLng);
			updateMarkerPosition(marker.id, newCoords.X, newCoords.Y);
		},
	});
}

// Initialize map
async function initMap() {
	await initLeafletMap(mapId.value, {
		onClick: handleMapClick,
	});
	doRenderMarkers();
}

// Keyboard handler
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

// Lifecycle
onMounted(async () => {
	// Initialize storage: load from URL hash first, then localStorage
	const hasMarkers = initializeStorage();
	
	// If we have markers, default to a map that has markers and enable filter
	if (hasMarkers && customMarkers.value.length > 0) {
		showOnlyMapsWithMarkers.value = true;
		const firstMapWithMarkers = customMarkers.value[0].mapId;
		if (firstMapWithMarkers && DaocMaps[firstMapWithMarkers]) {
			mapId.value = firstMapWithMarkers;
		}
	}
	
	// Setup auto-save
	const cleanupAutoSave = setupAutoSave();
	
	await initMap();
	
	// Zoom to markers if we have any on the current map
	if (hasMarkers && currentMapMarkers.value.length > 0) {
		zoomToMarkers(currentMapMarkers.value);
	}
	
	document.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
	cleanupLeafletMap();
	document.removeEventListener("keydown", handleKeydown);
});

// Watchers
watch(mapId, () => {
	initMap();
});

watch(currentMapMarkers, doRenderMarkers, { deep: true });

watch(
	layers,
	() => {
		doRenderMarkers();
	},
	{ deep: true }
);

watch(
	() => props.defaultSearch,
	() => (search.value = props.defaultSearch != null ? props.defaultSearch : search.value)
);
</script>

<template>
	<div>
		<v-toolbar title="Maps">
			<v-autocomplete
				v-model="mapId"
				:items="filteredMaps"
				:item-title="(v: DaocMapInfo) => {
					const count = getMapMarkerCount(v.id);
					return count > 0 ? `${v.id} - ${v.name} (${count} markers)` : `${v.id} - ${v.name}`;
				}"
				item-value="id"
				prepend-inner-icon="mdi-map"
				label="Region"
				hide-details
				class="mx-1"
			>
				<template #append-inner>
					<v-tooltip location="bottom">
						<template #activator="{ props: tooltipProps }">
							<v-btn
								v-bind="tooltipProps"
								:icon="showOnlyMapsWithMarkers ? 'mdi-filter' : 'mdi-filter-outline'"
								size="small"
								variant="text"
								:color="showOnlyMapsWithMarkers ? 'primary' : undefined"
								@click.stop="showOnlyMapsWithMarkers = !showOnlyMapsWithMarkers"
							/>
						</template>
						<span>{{ showOnlyMapsWithMarkers ? 'Show all maps' : 'Show only maps with markers' }}</span>
					</v-tooltip>
				</template>
			</v-autocomplete>

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
					@click="handleCopyShareableLink"
					title="Copy shareable link"
					:disabled="customMarkers.length === 0"
				/>

				<v-divider vertical class="mx-2" />

				<!-- Storage status with menu -->
				<v-menu>
					<template #activator="{ props: menuProps }">
						<v-tooltip location="bottom">
							<template #activator="{ props: tooltipProps }">
								<v-chip 
									v-bind="{ ...menuProps, ...tooltipProps }" 
									size="small" 
									:color="autoSaveEnabled ? 'success' : 'warning'" 
									variant="tonal"
									style="cursor: pointer"
								>
									<v-icon start size="small" :icon="autoSaveEnabled ? 'mdi-cloud-check' : 'mdi-cloud-off'" />
									{{ lastSavedText }}
									<v-icon end size="small" icon="mdi-chevron-down" />
								</v-chip>
							</template>
							<span>Auto-save {{ autoSaveEnabled ? 'enabled' : 'disabled' }}. Click for options.</span>
						</v-tooltip>
					</template>
					<v-list density="compact">
						<v-list-item @click="autoSaveEnabled = !autoSaveEnabled">
							<template #prepend>
								<v-icon :icon="autoSaveEnabled ? 'mdi-toggle-switch' : 'mdi-toggle-switch-off'" />
							</template>
							<v-list-item-title>{{ autoSaveEnabled ? 'Disable' : 'Enable' }} Auto-save</v-list-item-title>
						</v-list-item>
						<v-list-item @click="saveToLocalStorage">
							<template #prepend>
								<v-icon icon="mdi-content-save" />
							</template>
							<v-list-item-title>Save Now</v-list-item-title>
						</v-list-item>
						<v-divider />
						<v-list-item @click="handleClearStorage" class="text-error">
							<template #prepend>
								<v-icon icon="mdi-delete" color="error" />
							</template>
							<v-list-item-title>Clear Local Storage</v-list-item-title>
						</v-list-item>
					</v-list>
				</v-menu>

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
	min-height: calc(100vh - 64px - 24px);
	z-index: 1;
}

.map-view.add-marker-cursor {
	cursor: crosshair;
}
</style>
