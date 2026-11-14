import "reflect-metadata";
import { historyFixture } from "./historyFixture";
import { HISTORY_CLOCK, HISTORY_WAITING_LIFECYCLE, type HistoryClock, type HistoryWaitingActor, type HistoryWaitingLifecycle, type HistoryWaitTransition } from "../../src/modules/vehicle-history/vehicle-history.public";

// Test entrypoint only: real HTTP/Identity/History/Business Messaging composition.
// DB barriers and a test-only real response gate; never imported by the API.
async function main() {
  const fixture = await historyFixture((config) => {
    config.set("APP_ENV", "test");
    config.set("VEHICLE_HISTORY_SYNTHETIC_ENABLED", true);
    config.set("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", process.env["HISTORY_PROCESS_TESTERS"]);
  }, (app) => {
    app.getHttpAdapter().getInstance().addHook("onSend", async (request) => {
      if (request.headers["x-history-response"] !== "hold") return;
      process.send?.({ type: "response-held" });
      await new Promise<void>(() => { /* SIGKILL interrupts the actual unsent response. */ });
    });
  });
  const historyNow = process.env["HISTORY_PROCESS_NOW"];
  if (historyNow) fixture.app.get<HistoryClock>(HISTORY_CLOCK).now = () => new Date(historyNow);
  process.on("message", async (message: { type: string; actor: HistoryWaitingActor; id: string; transition: HistoryWaitTransition }) => {
    if (message.type === "close") {
      await fixture.app.close();
      process.exit(0);
    }
    if (message.type !== "change") return;
    try {
      const value = await fixture.app.get<HistoryWaitingLifecycle>(HISTORY_WAITING_LIFECYCLE)
        .change(message.actor, message.id, message.transition);
      process.send?.({ type: "result", value });
    } catch (error) {
      process.send?.({ type: "result", code: error instanceof Error ? error.message : "failed" });
    }
  });
  const address = fixture.app.getHttpServer().address();
  if (!address || typeof address === "string") throw new Error("Missing owned listener");
  process.send?.({ type: "ready", port: address.port, pid: process.pid });
}
void main().catch(() => { process.send?.({ type: "failed" }); process.exit(1); });
