import "dotenv/config";
import http from "http";
import { createApp } from "./app.js";
import { attachYjsCollabServer } from "./collab/yjsServer.js";
import { attachAuthorshipBroadcastServer } from "./collab/authorshipBroadcast.js";
import { closeDanglingSessions, startAuthorshipIdleSweep } from "./collab/authorshipCapture.js";

const app = createApp();
const rawPort = process.env.PORT?.trim();
const PORT = rawPort ? Number(rawPort) : 3001;

const httpServer = http.createServer(app);
attachYjsCollabServer(httpServer);
attachAuthorshipBroadcastServer(httpServer);

closeDanglingSessions().catch((err) => console.error("[collab] closeDanglingSessions failed", err));
startAuthorshipIdleSweep();

httpServer.listen(PORT, () => {
  console.log(`FairTraze AI server running on http://localhost:${PORT}`);
});
