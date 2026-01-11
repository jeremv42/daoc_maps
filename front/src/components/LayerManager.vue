<script setup lang="ts">
import { computed } from 'vue';
import { MapLayer, createLayer, DEFAULT_LAYER_ID } from '@/models/MapMarker';

const props = defineProps<{
	layers: MapLayer[];
	selectedLayerId: string;
}>();

const emit = defineEmits<{
	'update:layers': [layers: MapLayer[]];
	'update:selectedLayerId': [layerId: string];
}>();

const localLayers = computed({
	get: () => props.layers,
	set: (value) => emit('update:layers', value),
});

const selectedLayer = computed({
	get: () => props.selectedLayerId,
	set: (value) => emit('update:selectedLayerId', value),
});

function addLayer() {
	const name = `Layer ${localLayers.value.length + 1}`;
	const newLayer = createLayer(name);
	localLayers.value = [...localLayers.value, newLayer];
	selectedLayer.value = newLayer.id;
}

function deleteLayer(layerId: string) {
	if (layerId === DEFAULT_LAYER_ID) return; // Can't delete default layer
	
	localLayers.value = localLayers.value.filter(l => l.id !== layerId);
	
	if (selectedLayer.value === layerId) {
		selectedLayer.value = DEFAULT_LAYER_ID;
	}
}

function toggleVisibility(layer: MapLayer) {
	const idx = localLayers.value.findIndex(l => l.id === layer.id);
	if (idx !== -1) {
		const updated = [...localLayers.value];
		updated[idx] = { ...updated[idx], visible: !updated[idx].visible };
		localLayers.value = updated;
	}
}

function toggleLock(layer: MapLayer) {
	const idx = localLayers.value.findIndex(l => l.id === layer.id);
	if (idx !== -1) {
		const updated = [...localLayers.value];
		updated[idx] = { ...updated[idx], locked: !updated[idx].locked };
		localLayers.value = updated;
	}
}

function updateLayerName(layer: MapLayer, name: string) {
	const idx = localLayers.value.findIndex(l => l.id === layer.id);
	if (idx !== -1) {
		const updated = [...localLayers.value];
		updated[idx] = { ...updated[idx], name };
		localLayers.value = updated;
	}
}

function updateLayerColor(layer: MapLayer, color: string) {
	const idx = localLayers.value.findIndex(l => l.id === layer.id);
	if (idx !== -1) {
		const updated = [...localLayers.value];
		updated[idx] = { ...updated[idx], color };
		localLayers.value = updated;
	}
}
</script>

<template>
	<v-card class="layer-manager" elevation="4">
		<v-card-title class="d-flex align-center py-2">
			<v-icon icon="mdi-layers" class="mr-2" size="small" />
			<span class="text-body-2">Layers</span>
			<v-spacer />
			<v-btn
				icon="mdi-plus"
				size="x-small"
				variant="text"
				@click="addLayer"
				title="Add new layer"
			/>
		</v-card-title>
		
		<v-divider />
		
		<v-list density="compact" class="layer-list">
			<v-list-item
				v-for="layer in localLayers"
				:key="layer.id"
				:active="selectedLayer === layer.id"
				@click="selectedLayer = layer.id"
				class="layer-item"
			>
				<template #prepend>
					<v-btn
						:icon="layer.visible ? 'mdi-eye' : 'mdi-eye-off'"
						size="x-small"
						variant="text"
						:color="layer.visible ? undefined : 'grey'"
						@click.stop="toggleVisibility(layer)"
						title="Toggle visibility"
					/>
					<div
						class="layer-color-swatch"
						:style="{ backgroundColor: layer.color }"
						@click.stop
					>
						<v-menu :close-on-content-click="false">
							<template #activator="{ props: menuProps }">
								<div v-bind="menuProps" class="swatch-inner" />
							</template>
							<v-color-picker
								:model-value="layer.color"
								@update:model-value="(c: any) => updateLayerColor(layer, typeof c === 'string' ? c : c.hexa)"
								mode="hexa"
								hide-inputs
							/>
						</v-menu>
					</div>
				</template>
				
				<v-list-item-title class="text-body-2">
					<v-text-field
						:model-value="layer.name"
						@update:model-value="(v: string) => updateLayerName(layer, v)"
						density="compact"
						variant="plain"
						hide-details
						single-line
						class="layer-name-input"
						@click.stop
					/>
				</v-list-item-title>
				
				<template #append>
					<v-btn
						:icon="layer.locked ? 'mdi-lock' : 'mdi-lock-open'"
						size="x-small"
						variant="text"
						:color="layer.locked ? 'warning' : undefined"
						@click.stop="toggleLock(layer)"
						title="Toggle lock"
					/>
					<v-btn
						v-if="layer.id !== DEFAULT_LAYER_ID"
						icon="mdi-delete"
						size="x-small"
						variant="text"
						color="error"
						@click.stop="deleteLayer(layer.id)"
						title="Delete layer"
					/>
				</template>
			</v-list-item>
		</v-list>
	</v-card>
</template>

<style scoped>
.layer-manager {
	position: absolute;
	top: 10px;
	right: 10px;
	z-index: 1000;
	min-width: 220px;
	max-width: 280px;
}

.layer-list {
	max-height: 200px;
	overflow-y: auto;
	background: transparent;
}

.layer-item {
	min-height: 36px;
}

.layer-color-swatch {
	width: 16px;
	height: 16px;
	border-radius: 3px;
	border: 1px solid rgba(255, 255, 255, 0.3);
	cursor: pointer;
	margin-left: 4px;
}

.swatch-inner {
	width: 100%;
	height: 100%;
}

.layer-name-input {
	font-size: 0.875rem;
}

.layer-name-input :deep(input) {
	padding: 0;
}
</style>
