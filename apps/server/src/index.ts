import { buildApp } from "./app.ts";
import { config } from "./config.ts";

const app = await buildApp(config);

const shutdown = async (): Promise<void> => {
  await app.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await app.listen({ host: config.host, port: config.port });
