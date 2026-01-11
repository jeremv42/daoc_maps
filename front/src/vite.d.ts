interface ImportMeta {
	env: Record<string, string | undefined>;
}
declare module "*.png" {
	const path: string;
	export default path;
}
