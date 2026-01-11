<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { MapMarker, MarkerType, MarkerTypeLabels, MarkerTypeIcons, MarkerTypeColors } from '@/models/MapMarker';

const props = defineProps<{
	marker: MapMarker | null;
	modelValue: boolean;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: boolean];
	'save': [marker: MapMarker];
	'delete': [markerId: string];
}>();

const dialog = computed({
	get: () => props.modelValue,
	set: (value) => emit('update:modelValue', value),
});

const editedMarker = ref<MapMarker | null>(null);

watch(() => props.marker, (newMarker) => {
	if (newMarker) {
		editedMarker.value = { ...newMarker };
	}
}, { immediate: true });

const markerTypes = computed(() => 
	Object.entries(MarkerTypeLabels).map(([value, title]) => ({
		value: value as MarkerType,
		title,
		icon: MarkerTypeIcons[value as MarkerType],
		color: MarkerTypeColors[value as MarkerType],
	}))
);

const isEditing = computed(() => props.marker?.id != null);

function save() {
	if (editedMarker.value) {
		emit('save', { ...editedMarker.value });
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
					<v-col cols="12">
						<v-text-field
							v-model="editedMarker.name"
							label="Name"
							variant="outlined"
							density="compact"
							prepend-icon="mdi-label"
						/>
					</v-col>
				</v-row>

				<v-row>
					<v-col cols="12">
						<v-select
							v-model="editedMarker.type"
							:items="markerTypes"
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

				<v-row>
					<v-col cols="6">
						<v-text-field
							v-model.number="editedMarker.x"
							label="X Coordinate"
							type="number"
							variant="outlined"
							density="compact"
							prepend-icon="mdi-axis-x-arrow"
							readonly
						/>
					</v-col>
					<v-col cols="6">
						<v-text-field
							v-model.number="editedMarker.y"
							label="Y Coordinate"
							type="number"
							variant="outlined"
							density="compact"
							prepend-icon="mdi-axis-y-arrow"
							readonly
						/>
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
