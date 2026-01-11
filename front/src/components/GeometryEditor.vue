<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
	modelValue: boolean;
	points: { x: number; y: number }[];
	isPolygon?: boolean; // true for polygon, false for path
}>();

const emit = defineEmits<{
	'update:modelValue': [value: boolean];
	'update:points': [points: { x: number; y: number }[]];
	'add-point': [point: { x: number; y: number }];
	'close': [];
}>();

const dialog = computed({
	get: () => props.modelValue,
	set: (value) => emit('update:modelValue', value),
});

const localPoints = ref<{ x: number; y: number }[]>([]);

watch(() => props.points, (newPoints) => {
	localPoints.value = [...newPoints];
}, { immediate: true, deep: true });

const selectedPointIndex = ref<number | null>(null);

function selectPoint(index: number) {
	selectedPointIndex.value = selectedPointIndex.value === index ? null : index;
}

function deletePoint(index: number) {
	localPoints.value.splice(index, 1);
	emit('update:points', [...localPoints.value]);
	selectedPointIndex.value = null;
}

function movePointUp(index: number) {
	if (index <= 0) return;
	const temp = localPoints.value[index];
	localPoints.value[index] = localPoints.value[index - 1];
	localPoints.value[index - 1] = temp;
	emit('update:points', [...localPoints.value]);
	selectedPointIndex.value = index - 1;
}

function movePointDown(index: number) {
	if (index >= localPoints.value.length - 1) return;
	const temp = localPoints.value[index];
	localPoints.value[index] = localPoints.value[index + 1];
	localPoints.value[index + 1] = temp;
	emit('update:points', [...localPoints.value]);
	selectedPointIndex.value = index + 1;
}

function updatePointCoord(index: number, axis: 'x' | 'y', value: number) {
	localPoints.value[index] = { ...localPoints.value[index], [axis]: value };
	emit('update:points', [...localPoints.value]);
}

function clearAllPoints() {
	localPoints.value = [];
	emit('update:points', []);
	selectedPointIndex.value = null;
}

function close() {
	dialog.value = false;
	emit('close');
}

const minPoints = computed(() => props.isPolygon ? 3 : 2);
const pointsLabel = computed(() => props.isPolygon ? 'Polygon Points' : 'Path Waypoints');
const instructions = computed(() => 
	props.isPolygon 
		? 'Click on the map to add polygon vertices. Minimum 3 points required.'
		: 'Click on the map to add waypoints. Minimum 2 points required.'
);
</script>

<template>
	<v-card v-if="dialog" class="geometry-editor" elevation="4">
		<v-card-title class="d-flex align-center py-2">
			<v-icon :icon="isPolygon ? 'mdi-vector-polygon' : 'mdi-vector-polyline'" class="mr-2" size="small" />
			<span class="text-body-2">{{ pointsLabel }}</span>
			<v-spacer />
			<v-btn
				icon="mdi-close"
				size="x-small"
				variant="text"
				@click="close"
			/>
		</v-card-title>
		
		<v-divider />
		
		<v-card-text class="py-2">
			<v-alert
				type="info"
				density="compact"
				variant="tonal"
				class="mb-2"
			>
				<small>{{ instructions }}</small>
			</v-alert>
			
			<div class="d-flex align-center mb-2">
				<span class="text-caption">
					{{ localPoints.length }} point{{ localPoints.length !== 1 ? 's' : '' }}
					<span v-if="localPoints.length < minPoints" class="text-error">
						(need {{ minPoints - localPoints.length }} more)
					</span>
				</span>
				<v-spacer />
				<v-btn
					size="x-small"
					variant="text"
					color="error"
					@click="clearAllPoints"
					:disabled="localPoints.length === 0"
				>
					Clear All
				</v-btn>
			</div>
			
			<v-list density="compact" class="points-list">
				<v-list-item
					v-for="(point, index) in localPoints"
					:key="index"
					:active="selectedPointIndex === index"
					@click="selectPoint(index)"
					class="point-item"
				>
					<template #prepend>
						<span class="point-number">{{ index + 1 }}</span>
					</template>
					
					<div class="d-flex align-center gap-2">
						<v-text-field
							:model-value="point.x"
							@update:model-value="(v: any) => updatePointCoord(index, 'x', Number(v))"
							type="number"
							label="X"
							density="compact"
							variant="outlined"
							hide-details
							class="coord-input"
							@click.stop
						/>
						<v-text-field
							:model-value="point.y"
							@update:model-value="(v: any) => updatePointCoord(index, 'y', Number(v))"
							type="number"
							label="Y"
							density="compact"
							variant="outlined"
							hide-details
							class="coord-input"
							@click.stop
						/>
					</div>
					
					<template #append>
						<v-btn
							icon="mdi-arrow-up"
							size="x-small"
							variant="text"
							:disabled="index === 0"
							@click.stop="movePointUp(index)"
						/>
						<v-btn
							icon="mdi-arrow-down"
							size="x-small"
							variant="text"
							:disabled="index === localPoints.length - 1"
							@click.stop="movePointDown(index)"
						/>
						<v-btn
							icon="mdi-delete"
							size="x-small"
							variant="text"
							color="error"
							@click.stop="deletePoint(index)"
						/>
					</template>
				</v-list-item>
				
				<v-list-item v-if="localPoints.length === 0" class="text-center text-disabled">
					<small>Click on the map to add points</small>
				</v-list-item>
			</v-list>
		</v-card-text>
	</v-card>
</template>

<style scoped>
.geometry-editor {
	position: absolute;
	bottom: 10px;
	left: 10px;
	z-index: 1000;
	min-width: 300px;
	max-width: 400px;
	max-height: 300px;
	background: rgba(30, 30, 30, 0.95);
}

.points-list {
	max-height: 150px;
	overflow-y: auto;
	background: transparent;
}

.point-item {
	min-height: 48px;
}

.point-number {
	width: 20px;
	height: 20px;
	border-radius: 50%;
	background: rgba(255, 255, 255, 0.2);
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 0.75rem;
	font-weight: bold;
}

.coord-input {
	max-width: 80px;
}

.coord-input :deep(input) {
	font-size: 0.75rem;
}
</style>
