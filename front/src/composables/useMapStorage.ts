import { ref, watch, Ref } from "vue";
import {
	MapMarker,
	MapLayer,
	createDefaultLayer,
	exportMarkersToJson,
	importMarkersFromJson,
	compressForUrl,
	decompressFromUrl,
} from "@/models/MapMarker";

const STORAGE_KEY = "daoc-map-markers";
const STORAGE_VERSION = 1;

interface StorageData {
	version: number;
	markers: MapMarker[];
	layers: MapLayer[];
	lastSaved: string;
}

export function useMapStorage(
	markers: Ref<MapMarker[]>,
	layers: Ref<MapLayer[]>
) {
	const lastSaved = ref<Date | null>(null);
	const autoSaveEnabled = ref(true);

	// Load from localStorage
	function loadFromLocalStorage(): boolean {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (!stored) return false;

			const data: StorageData = JSON.parse(stored);
			if (data.version !== STORAGE_VERSION) {
				console.warn("Storage version mismatch, migrating...");
				// Handle migration if needed
			}

			markers.value = data.markers;
			layers.value = data.layers.length > 0 ? data.layers : [createDefaultLayer()];
			lastSaved.value = new Date(data.lastSaved);
			return true;
		} catch (err) {
			console.error("Failed to load from localStorage:", err);
			return false;
		}
	}

	// Save to localStorage
	function saveToLocalStorage() {
		try {
			const data: StorageData = {
				version: STORAGE_VERSION,
				markers: markers.value,
				layers: layers.value,
				lastSaved: new Date().toISOString(),
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
			lastSaved.value = new Date();
		} catch (err) {
			console.error("Failed to save to localStorage:", err);
		}
	}

	// Clear localStorage
	function clearLocalStorage() {
		localStorage.removeItem(STORAGE_KEY);
		lastSaved.value = null;
	}

	// Load from URL hash
	function loadFromUrlHash(): boolean {
		const hash = window.location.hash.slice(1);
		if (!hash) return false;

		try {
			const { markers: loadedMarkers, layers: loadedLayers } = decompressFromUrl(hash);
			markers.value = loadedMarkers;
			layers.value = loadedLayers.length > 0 ? loadedLayers : [createDefaultLayer()];
			return true;
		} catch (err) {
			console.error("Failed to load from URL:", err);
			return false;
		}
	}

	// Update URL hash
	function updateUrlHash() {
		if (markers.value.length === 0 && layers.value.length === 1) {
			history.replaceState(null, "", window.location.pathname);
			return;
		}

		const encoded = compressForUrl(markers.value, layers.value);
		history.replaceState(null, "", `#${encoded}`);
	}

	// Copy shareable link to clipboard
	async function copyShareableLink(): Promise<boolean> {
		updateUrlHash();
		try {
			await navigator.clipboard.writeText(window.location.href);
			return true;
		} catch {
			return false;
		}
	}

	// Export to JSON file
	function exportToFile() {
		const json = exportMarkersToJson(markers.value, layers.value);
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `daoc-markers-${new Date().toISOString().split("T")[0]}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// Import from JSON string
	function importFromJson(
		json: string,
		options: { toNewLayer?: boolean; newLayerName?: string } = {}
	): { success: boolean; error?: string } {
		try {
			const { markers: loadedMarkers, layers: loadedLayers } = importMarkersFromJson(json);

			if (options.toNewLayer) {
				// Create a new layer and reassign all markers to it
				const newLayer: MapLayer = {
					id: crypto.randomUUID(),
					name: options.newLayerName || "Imported",
					color: getRandomColor(),
					visible: true,
					locked: false,
				};
				layers.value = [...layers.value, newLayer];

				// Map old layer IDs to the new layer
				const reassignedMarkers = loadedMarkers.map((m) => ({
					...m,
					id: crypto.randomUUID(),
					layerId: newLayer.id,
				}));

				markers.value = [...markers.value, ...reassignedMarkers];
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

				markers.value = [...markers.value, ...reassignedMarkers];
			}

			return { success: true };
		} catch (err) {
			console.error("Failed to import markers:", err);
			return { success: false, error: String(err) };
		}
	}

	// Initialize: load from URL hash first, then localStorage
	// Returns true if markers were loaded
	function initialize(): boolean {
		const loadedFromUrl = loadFromUrlHash();
		if (!loadedFromUrl) {
			return loadFromLocalStorage();
		}
		return true;
	}

	// Auto-save watcher
	function setupAutoSave() {
		watch(
			[markers, layers],
			() => {
				if (autoSaveEnabled.value) {
					saveToLocalStorage();
					updateUrlHash();
				}
			},
			{ deep: true }
		);

		// Listen for hash changes
		window.addEventListener("hashchange", loadFromUrlHash);

		return () => {
			window.removeEventListener("hashchange", loadFromUrlHash);
		};
	}

	return {
		lastSaved,
		autoSaveEnabled,
		loadFromLocalStorage,
		saveToLocalStorage,
		clearLocalStorage,
		loadFromUrlHash,
		updateUrlHash,
		copyShareableLink,
		exportToFile,
		importFromJson,
		initialize,
		setupAutoSave,
	};
}

function getRandomColor(): string {
	const colors = ["#E91E63", "#9C27B0", "#673AB7", "#3F51B5", "#03A9F4", "#009688", "#8BC34A", "#FF9800", "#FF5722"];
	return colors[Math.floor(Math.random() * colors.length)];
}
