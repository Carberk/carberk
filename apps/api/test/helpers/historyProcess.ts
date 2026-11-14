import { fork } from "node:child_process";
import { resolve } from "node:path";
import type { HistoryWaitingActor, HistoryWaitingState, HistoryWaitTransition } from "../../src/modules/vehicle-history/vehicle-history.public";

type Reply = { type: string; port: number; pid: number; value: HistoryWaitingState; code?: string };

/** Each call owns one actual listener/process on this worker's explicit targets. */
export async function historyProcess(testers: string[], options?: { historyNow: string }) {
  const child = fork(resolve(__dirname, "historyProcessChild.ts"), [], {
    execArgv: ["--import", "tsx"], serialization: "advanced",
    env: { ...process.env, HISTORY_PROCESS_TESTERS: testers.join(","), HISTORY_PROCESS_NOW: options?.historyNow },
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((done) => {
    child.once("exit", (code, signal) => done({ code, signal }));
  });
  function response(type: string): Promise<Reply> {
    return new Promise((done, fail) => {
      const timer = setTimeout(() => finish(new Error("Owned History child response timed out")), 20_000);
      const onExit = () => finish(new Error("Owned History child exited before response"));
      const onMessage = (message: Reply) => {
        if (message.type === "failed") finish(new Error("Owned History child startup failed"));
        else if (message.type === type) finish(undefined, message);
      };
      function finish(error?: Error, message?: Reply) {
        clearTimeout(timer); child.off("message", onMessage); child.off("exit", onExit);
        if (error) fail(error); else if (message) done(message);
      }
      child.on("message", onMessage); child.once("exit", onExit);
    });
  }
  let ready: Reply;
  try { ready = await response("ready"); }
  catch (error) { child.kill("SIGKILL"); await exited; throw error; }
  return {
    pid: ready.pid, url: `http://127.0.0.1:${ready.port}`,
    responseHeld: () => response("response-held"),
    async change(actor: HistoryWaitingActor, id: string, transition: HistoryWaitTransition) {
      const pending = response("result");
      child.send({ type: "change", actor, id, transition });
      const result = await pending;
      if (result.code) throw new Error(result.code);
      return result.value;
    },
    async kill() { child.kill("SIGKILL"); return exited; },
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.send({ type: "close" });
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      try { await exited; } finally { clearTimeout(timer); }
    },
  };
}
