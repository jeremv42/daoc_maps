import { resolve } from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig(({ command }) => ({
	plugins: [vue()],
	resolve: {
		alias: [
			{
				find: "@",
				replacement: resolve(__dirname, "./src"),
			},
		],
	},
}));
