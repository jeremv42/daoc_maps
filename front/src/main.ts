import { createApp, ref } from "vue";
import App from "./views/App.vue";
import { createVuetify } from "vuetify/dist/vuetify";

import "vuetify/dist/vuetify.css";
import "@mdi/font/css/materialdesignicons.css";

async function main() {
	const error = ref<unknown>();
	const app = createApp(App, { error });

	const vuetify = createVuetify({});
	app.use(vuetify);

	app.mount("#app");
	app.config.errorHandler = (err, _instance, info) => {
		console.error(err, info);
		error.value = err;
	};
}

main().catch(err => console.error(err));
