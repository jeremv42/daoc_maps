import { ref, shallowRef, Ref, onUnmounted } from "vue";
import {
	CRS,
	imageOverlay,
	latLng,
	map as LeafletMap,
	Map,
	LatLngBoundsLiteral,
	LatLng,
	marker,
	circleMarker,
	polyline,
	polygon as leafletPolygon,
	divIcon,
	Layer,
	LatLngBounds,
} from "leaflet";
import "leaflet/dist/leaflet.css";
import { Icon } from "leaflet";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { DaocMapInfo, DaocMaps, DaocMiniMaps } from "@/models/DaocMaps";
import { MapMarker, MapLayer, MarkerTypeColors, MarkerTypeIcons } from "@/models/MapMarker";

// Fix Leaflet default icon issue
delete (Icon as any).Default.prototype._getIconUrl;
Icon.Default.mergeOptions({
	iconRetinaUrl,
	iconUrl,
	shadowUrl,
});

export function useLeafletMap(mapContainer: Ref<HTMLDivElement | null>) {
	const leafletMap = shallowRef<Map | null>(null);
	const loading = ref(false);
	const debugPos = ref("");

	// Marker layers storage
	let markers: Record<string, any> = {};
	let customMarkerLayers: Record<string, Layer> = {};

	// Coordinate conversion
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

	// Clear all markers
	function clearMarkers() {
		for (const m of Object.values(markers)) m.remove();
		markers = {};
	}

	function clearCustomMarkerLayers() {
		for (const m of Object.values(customMarkerLayers)) m.remove();
		customMarkerLayers = {};
	}

	// Create marker icon
	function createMarkerIcon(markerData: MapMarker, layerColor: string) {
		const color = MarkerTypeColors[markerData.type];
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

	// Render custom markers on the map
	function renderCustomMarkers(
		markersData: MapMarker[],
		layers: MapLayer[],
		callbacks: {
			onMarkerClick?: (marker: MapMarker) => void;
			onMarkerDragEnd?: (marker: MapMarker, newLatLng: LatLng) => void;
		} = {}
	) {
		if (!leafletMap.value) return;

		clearCustomMarkerLayers();

		for (const markerData of markersData) {
			const layer = layers.find((l) => l.id === markerData.layerId);
			if (!layer?.visible) continue;

			const geom = markerData.geometry;
			const layerColor = layer?.color ?? "#2196F3";
			const markerColor = MarkerTypeColors[markerData.type];

			if (geom.type === "point") {
				const latlng = daocToLatLng({ X: String(geom.x), Y: String(geom.y) });
				const markerLayer = marker(latlng, {
					icon: createMarkerIcon(markerData, layerColor),
					draggable: !layer?.locked,
				});

				if (callbacks.onMarkerClick) {
					markerLayer.on("click", () => callbacks.onMarkerClick!(markerData));
				}

				if (callbacks.onMarkerDragEnd) {
					markerLayer.on("dragend", () => {
						const newLatLng = markerLayer.getLatLng();
						callbacks.onMarkerDragEnd!(markerData, newLatLng);
					});
				}

				let tooltipContent = `<strong>${markerData.name}</strong>`;
				if (markerData.levelMin != null || markerData.levelMax != null) {
					const levelText =
						markerData.levelMin === markerData.levelMax
							? `Level ${markerData.levelMin}`
							: `Level ${markerData.levelMin ?? "?"}-${markerData.levelMax ?? "?"}`;
					tooltipContent += `<br><small>${levelText}</small>`;
				}
				markerLayer.bindTooltip(tooltipContent);

				markerLayer.addTo(leafletMap.value);
				customMarkerLayers[markerData.id] = markerLayer;
			} else if (geom.type === "path") {
				const latlngs = geom.points.map((p) => daocToLatLng({ X: String(p.x), Y: String(p.y) }));
				const pathLayer = polyline(latlngs, {
					color: markerColor,
					weight: 4,
					opacity: 0.8,
					dashArray: "10, 5",
				});

				if (callbacks.onMarkerClick) {
					pathLayer.on("click", () => callbacks.onMarkerClick!(markerData));
				}

				pathLayer.bindTooltip(
					`<strong>${markerData.name}</strong><br><small>Path: ${geom.points.length} waypoints</small>`
				);
				pathLayer.addTo(leafletMap.value);
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
					wpMarker.addTo(leafletMap.value!);
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

				if (callbacks.onMarkerClick) {
					polygonLayer.on("click", () => callbacks.onMarkerClick!(markerData));
				}

				polygonLayer.bindTooltip(
					`<strong>${markerData.name}</strong><br><small>Area: ${geom.points.length} vertices</small>`
				);
				polygonLayer.addTo(leafletMap.value);
				customMarkerLayers[markerData.id] = polygonLayer;
			}
		}
	}

	// Initialize the map
	async function initMap(
		mapId: number,
		callbacks: {
			onMouseMove?: (coords: { X: number; Y: number }, debugStr: string) => void;
			onClick?: (latlng: LatLng) => void;
		} = {}
	) {
		if (!mapContainer.value) return;

		loading.value = true;

		if (leafletMap.value) {
			leafletMap.value.off();
			leafletMap.value.remove();
			await new Promise((r) => setTimeout(r, 50));
		}

		const current = DaocMiniMaps.find((r) => r.id === mapId);
		if (!current) {
			loading.value = false;
			console.error("map not found", mapId);
			return;
		}

		leafletMap.value = LeafletMap(mapContainer.value, {
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
				bounds[0][0] += add[1][0];
				bounds[0][1] += add[0][1];
				bounds[1][0] += add[1][0];
				bounds[1][1] += add[0][1];
			}
			imageOverlay(zone.src, bounds).addTo(leafletMap.value);
			mapBounds = [
				[Math.min(bounds[0][0], mapBounds[0][0]), Math.min(bounds[0][1], mapBounds[0][1])],
				[Math.max(bounds[1][0], mapBounds[1][0]), Math.max(bounds[1][1], mapBounds[1][1])],
			];
		}

		leafletMap.value.fitBounds(mapBounds);

		// Mouse move handler
		leafletMap.value.on("mousemove", (ev) => {
			const { X, Y } = latLngToDaoc(ev.latlng);
			let [lx, ly] = [X / 8192, Y / 8192];
			const zone = current.zones.find(
				(z) =>
					z.offsetX <= lx &&
					lx < z.offsetX + (z.width || 8) &&
					z.offsetY <= ly &&
					ly < z.offsetY + (z.height || 8)
			);
			if (zone) [lx, ly] = [X - zone.offsetX, Y - zone.offsetY];
			const tile = tiles.find((t) => new LatLngBounds(t.bounds).contains(ev.latlng));
			if (tile)
				[lx, ly] = [
					X - latLngToDaoc(new LatLng(...tile.bounds[0])).X,
					Y - latLngToDaoc(new LatLng(...tile.bounds[1])).Y,
				];
			const zoneId = (zone?.src ?? tile?.src ?? "maps/.jpg").substring(6).substring(0, 3);
			const loc = zone || tile ? `loc=${lx},${ly}, z:${zoneId}` : "";
			debugPos.value = `gloc (x:${X}, y:${Y}) ${loc}`;

			if (callbacks.onMouseMove) {
				callbacks.onMouseMove({ X, Y }, debugPos.value);
			}
		});

		// Click handler
		leafletMap.value.on("click", (ev) => {
			if (callbacks.onClick) {
				callbacks.onClick(ev.latlng);
			}
		});

		loading.value = false;
	}

	// Cleanup
	function cleanup() {
		clearMarkers();
		clearCustomMarkerLayers();
	}

	// Zoom to fit all markers
	function zoomToMarkers(markersData: MapMarker[]) {
		if (!leafletMap.value || markersData.length === 0) return;

		const points: LatLng[] = [];

		for (const markerData of markersData) {
			const geom = markerData.geometry;
			if (geom.type === "point") {
				points.push(daocToLatLng({ X: String(geom.x), Y: String(geom.y) }));
			} else if (geom.type === "path" || geom.type === "polygon") {
				for (const p of geom.points) {
					points.push(daocToLatLng({ X: String(p.x), Y: String(p.y) }));
				}
			}
		}

		if (points.length === 0) return;

		const bounds = new LatLngBounds(points);
		leafletMap.value.fitBounds(bounds, { padding: [50, 50], maxZoom: 7 });
	}

	return {
		leafletMap,
		loading,
		debugPos,
		customMarkerLayers,
		daocToLatLng,
		latLngToDaoc,
		clearMarkers,
		clearCustomMarkerLayers,
		createMarkerIcon,
		renderCustomMarkers,
		initMap,
		cleanup,
		zoomToMarkers,
	};
}
