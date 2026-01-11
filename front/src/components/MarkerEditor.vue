<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { 
	MapMarker, 
	MarkerType, 
	MarkerTypeLabels, 
	MarkerTypeIcons, 
	MarkerTypeColors,
	MapLayer,
	getGeometryTypeForMarker,
	PointMarkerTypes,
	PathMarkerTypes,
	PolygonMarkerTypes,
} from '@/models/MapMarker';

const props = defineProps<{
	marker: MapMarker | null;
	modelValue: boolean;
	layers: MapLayer[];
}>();

const emit = defineEmits<{
	'update:modelValue': [value: boolean];
	'save': [marker: MapMarker];
	'delete': [markerId: string];
	'edit-geometry': [marker: MapMarker];
}>();

const dialog = computed({
	get: () => props.modelValue,
	set: (value) => emit('update:modelValue', value),
});

const editedMarker = ref<MapMarker | null>(null);

watch(() => props.marker, (newMarker) => {
	if (newMarker) {
		editedMarker.value = JSON.parse(JSON.stringify(newMarker)); // Deep copy
	}
}, { immediate: true });

// Filter marker types based on geometry compatibility
const pointMarkerTypes = computed(() => 
	PointMarkerTypes.map(type => ({
		value: type,
		title: MarkerTypeLabels[type],
		icon: MarkerTypeIcons[type],
		color: MarkerTypeColors[type],
		geometry: 'point',
	}))
);

const pathMarkerTypes = computed(() => 
	PathMarkerTypes.map(type => ({
		value: type,
		title: MarkerTypeLabels[type],
		icon: MarkerTypeIcons[type],
		color: MarkerTypeColors[type],
		geometry: 'path',
	}))
);

const polygonMarkerTypes = computed(() => 
	PolygonMarkerTypes.map(type => ({
		value: type,
		title: MarkerTypeLabels[type],
		icon: MarkerTypeIcons[type],
		color: MarkerTypeColors[type],
		geometry: 'polygon',
	}))
);

const allMarkerTypes = computed(() => [
	...pointMarkerTypes.value,
	...pathMarkerTypes.value,
	...polygonMarkerTypes.value,
]);

// Get compatible types for current geometry
const compatibleTypes = computed(() => {
	if (!editedMarker.value) return allMarkerTypes.value;
	
	const geomType = editedMarker.value.geometry.type;
	if (geomType === 'point') return pointMarkerTypes.value;
	if (geomType === 'path') return pathMarkerTypes.value;
	if (geomType === 'polygon') return polygonMarkerTypes.value;
	return allMarkerTypes.value;
});

const isEditing = computed(() => {
	// Check if marker already exists (has been saved before)
	return props.marker?.id != null && props.marker.id !== '';
});

const geometryInfo = computed(() => {
	if (!editedMarker.value) return '';
	const geom = editedMarker.value.geometry;
	if (geom.type === 'point') {
		return `Point: (${geom.x}, ${geom.y})`;
	}
	if (geom.type === 'path') {
		return `Path: ${geom.points.length} waypoints`;
	}
	if (geom.type === 'polygon') {
		return `Polygon: ${geom.points.length} vertices`;
	}
	return '';
});

const canEditGeometry = computed(() => {
	if (!editedMarker.value) return false;
	return editedMarker.value.geometry.type !== 'point';
});

function save() {
	if (editedMarker.value) {
		emit('save', JSON.parse(JSON.stringify(editedMarker.value)));
		dialog.value = false;
	}
}

function deleteMarker() {
	if (editedMarker.value) {
		emit('delete', editedMarker.value.id);
		dialog.value = false;
	}
}

function cancel() {
	dialog.value = false;
}

function editGeometry() {
	if (editedMarker.value) {
		emit('edit-geometry', editedMarker.value);
		dialog.value = false;
	}
}
</script>

<template>
	<v-dialog v-model="dialog" max-width="600" persistent>
		<v-card v-if="editedMarker">
			<v-card-title class="d-flex align-center">
				<v-icon :icon="MarkerTypeIcons[editedMarker.type]" :color="MarkerTypeColors[editedMarker.type]" class="mr-2" />
				{{ isEditing ? 'Edit Marker' : 'Add Marker' }}
			</v-card-title>
			
			<v-card-text>
				<v-row>
					<v-col cols="12" sm="8">
						<v-text-field
							v-model="editedMarker.name"
							label="Name"
							variant="outlined"
							density="compact"
							prepend-icon="mdi-label"
						/>
					</v-col>
					<v-col cols="12" sm="4">
						<v-select
							v-model="editedMarker.layerId"
							:items="layers"
							item-value="id"
							item-title="name"
							label="Layer"
							variant="outlined"
							density="compact"
							prepend-icon="mdi-layers"
						>
							<template #item="{ props: itemProps, item }">
								<v-list-item v-bind="itemProps">
									<template #prepend>
										<div 
											class="layer-color-dot"
											:style="{ backgroundColor: item.raw.color }"
										/>
									</template>
								</v-list-item>
							</template>
							<template #selection="{ item }">
								<div 
									class="layer-color-dot mr-2"
									:style="{ backgroundColor: item.raw.color }"
								/>
								{{ item.raw.name }}
							</template>
						</v-select>
					</v-col>
				</v-row>

				<v-row>
					<v-col cols="12">
						<v-select
							v-model="editedMarker.type"
							:items="compatibleTypes"
							item-value="value"
							item-title="title"
							label="Type"
							variant="outlined"
							density="compact"
							prepend-icon="mdi-tag"
						>
							<template #item="{ props: itemProps, item }">
								<v-list-item v-bind="itemProps">
									<template #prepend>
										<v-icon :icon="item.raw.icon" :color="item.raw.color" />
									</template>
								</v-list-item>
							</template>
							<template #selection="{ item }">
								<v-icon :icon="item.raw.icon" :color="item.raw.color" class="mr-2" size="small" />
								{{ item.raw.title }}
							</template>
						</v-select>
					</v-col>
				</v-row>

				<v-row>
					<v-col cols="6">
						<v-text-field
							v-model.number="editedMarker.levelMin"
							label="Min Level"
							type="number"
							variant="outlined"
							density="compact"
							prepend-icon="mdi-arrow-down"
							:min="1"
							:max="50"
							clearable
						/>
					</v-col>
					<v-col cols="6">
						<v-text-field
							v-model.number="editedMarker.levelMax"
							label="Max Level"
							type="number"
							variant="outlined"
							density="compact"
							prepend-icon="mdi-arrow-up"
							:min="1"
							:max="50"
							clearable
						/>
					</v-col>
				</v-row>

				<!-- Geometry info -->
				<v-row>
					<v-col cols="12">
						<v-alert
							type="info"
							variant="tonal"
							density="compact"
						>
							<div class="d-flex align-center">
								<v-icon 
									:icon="editedMarker.geometry.type === 'point' ? 'mdi-map-marker' : 
										   editedMarker.geometry.type === 'path' ? 'mdi-vector-polyline' : 'mdi-vector-polygon'" 
									class="mr-2"
								/>
								<span>{{ geometryInfo }}</span>
								<v-spacer />
								<v-btn
									v-if="canEditGeometry"
									size="small"
									variant="text"
									@click="editGeometry"
								>
									Edit Shape
								</v-btn>
							</div>
						</v-alert>
					</v-col>
				</v-row>

				<v-row>
					<v-col cols="12">
						<v-textarea
							v-model="editedMarker.description"
							label="Description (Markdown)"
							variant="outlined"
							density="compact"
							prepend-icon="mdi-text"
							rows="4"
							hint="You can use Markdown formatting"
							persistent-hint
						/>
					</v-col>
				</v-row>
			</v-card-text>

			<v-card-actions>
				<v-btn
					v-if="isEditing"
					color="error"
					variant="text"
					@click="deleteMarker"
				>
					<v-icon icon="mdi-delete" class="mr-1" />
					Delete
				</v-btn>
				<v-spacer />
				<v-btn variant="text" @click="cancel">Cancel</v-btn>
				<v-btn color="primary" variant="elevated" @click="save">
					<v-icon icon="mdi-content-save" class="mr-1" />
					Save
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<style scoped>
.layer-color-dot {
	width: 12px;
	height: 12px;
	border-radius: 50%;
	border: 1px solid rgba(255, 255, 255, 0.3);
}
</style>
