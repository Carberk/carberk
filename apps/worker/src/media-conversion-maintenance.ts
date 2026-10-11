/** Hold the operator container alive without creating application providers or Bull consumers. */
export async function waitForMediaConversionMaintenance() {
  console.log("Worker paused for photo conversion maintenance; no queue consumers started");
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {}, 60_000);
    const stop = () => { clearInterval(timer); process.off("SIGTERM", stop); process.off("SIGINT", stop); resolve(); };
    process.once("SIGTERM", stop); process.once("SIGINT", stop);
  });
}
