// O worker do MapLibre entra no bundle como texto (plugin do scripts/build.mjs).
declare module "maplibre-worker-texto" {
  const codigo: string;
  export default codigo;
}
declare module "*.css";
declare const process: { env: Record<string, string | undefined> };
