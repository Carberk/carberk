import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "smol-toml";
import { SaxesParser } from "saxes";

export function runNativeExporterTests({
  mobileRoot = fileURLToPath(new URL("../apps/mobile/", import.meta.url)),
  env = process.env,
  run = spawnSync,
} = {}) {
  const androidRoot = path.join(mobileRoot, "android");
  const missing = [];
  for (const file of ["gradlew", "gradle/wrapper/gradle-wrapper.jar", "gradle/wrapper/gradle-wrapper.properties", "settings.gradle", "gradle.properties"]) {
    if (!fs.existsSync(path.join(androidRoot, file))) missing.push(`Missing android/${file}; run pnpm --filter @auto-tm/mobile exec expo prebuild --platform android --no-install`);
  }
  const java = env.JAVA_HOME && path.join(env.JAVA_HOME, "bin/java");
  if (!java || !fs.existsSync(java) || !fs.existsSync(path.join(env.JAVA_HOME, "bin/javac"))) missing.push("Set JAVA_HOME to an installed JDK 17 (java and javac required)");
  const sdk = env.ANDROID_HOME;
  if (!sdk || !fs.existsSync(sdk)) missing.push("Set ANDROID_HOME to an installed Android SDK");
  if (env.ANDROID_SDK_ROOT && env.ANDROID_SDK_ROOT !== sdk) missing.push("ANDROID_SDK_ROOT must match ANDROID_HOME");
  const catalogPath = path.join(mobileRoot, "node_modules/react-native/gradle/libs.versions.toml");
  if (!fs.existsSync(catalogPath)) missing.push("Install workspace dependencies with pnpm install --frozen-lockfile");
  if (missing.length) throw new Error(`Native exporter prerequisites:\n${missing.join("\n")}`);

  const versions = parse(fs.readFileSync(catalogPath, "utf8")).versions;
  const properties = fs.readFileSync(path.join(androidRoot, "gradle.properties"), "utf8");
  const sdkVersion = (key, fallback) => properties.match(new RegExp(`^android\\.${key}\\s*=\\s*(\\S+)`, "m"))?.[1] ?? fallback;
  for (const file of [
    `platforms/android-${sdkVersion("compileSdkVersion", versions.compileSdk)}/android.jar`,
    `build-tools/${sdkVersion("buildToolsVersion", versions.buildTools)}/source.properties`,
    `ndk/${sdkVersion("ndkVersion", versions.ndkVersion)}/source.properties`,
  ]) {
    if (!fs.existsSync(path.join(sdk, file))) missing.push(`Missing Android SDK component: ${file}`);
  }
  if (missing.length) throw new Error(`Native exporter prerequisites:\n${missing.join("\n")}`);
  const boundedEnv = {
    ...env,
    ANDROID_SDK_ROOT: sdk,
    JAVA_TOOL_OPTIONS: "-XX:ActiveProcessorCount=2",
    JDK_JAVA_OPTIONS: "",
    JAVA_OPTS: "-Xmx256m -XX:ActiveProcessorCount=2",
    GRADLE_OPTS: "",
  };
  const version = run(java, ["-version"], { env: boundedEnv, encoding: "utf8" });
  if (version.status !== 0 || !/version "17[.\"]/.test(`${version.stdout}${version.stderr}`)) throw new Error("JAVA_HOME must run JDK 17; no Gradle tasks started");
  const flags = [
    "--console=plain", "--max-workers=1", "--no-parallel", "--priority=low", "--no-daemon",
    "-Dorg.gradle.jvmargs=-Xmx2g -XX:MaxMetaspaceSize=512m -XX:ActiveProcessorCount=2 -Djdk.tls.client.protocols=TLSv1.2",
    "-Porg.gradle.java.installations.auto-download=false",
    "-Porg.gradle.java.installations.auto-detect=false",
    `-Porg.gradle.java.installations.paths=${env.JAVA_HOME}`,
    "-Pkotlin.compiler.execution.strategy=in-process",
    "-Pandroid.builder.sdkDownload=false",
  ];
  const wrapper = path.join(androidRoot, "gradlew");
  const tasks = run(wrapper, [":listing-video:tasks", "--all", ...flags], { cwd: androidRoot, env: boundedEnv, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (tasks.status !== 0) throw new Error(`Unable to resolve exporter unit task: ${tasks.error?.message ?? ""}\n${tasks.stdout ?? ""}${tasks.stderr ?? ""}`);
  const task = tasks.stdout.match(/^testDebugUnitTest\s+-\s+.+$/m)?.[0].split(/\s/)[0];
  if (!task) throw new Error("Gradle did not expose :listing-video:testDebugUnitTest; no tests started");
  console.log(`Native exporter: :listing-video:${task}; JDK 17; SDK ${sdk}; ${flags.join(" ")}`);
  const report = path.join(mobileRoot, `modules/listing-video/android/build/test-results/${task}/TEST-tm.auto.listingvideo.ListingVideoExporterTest.xml`);
  fs.rmSync(report, { force: true });
  const result = run(wrapper, [`:listing-video:${task}`, "--tests", "tm.auto.listingvideo.ListingVideoExporterTest", "--rerun", ...flags], { cwd: androidRoot, env: boundedEnv, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Exporter unit tests failed (${result.status ?? result.error?.message ?? result.signal})`);
  if (!fs.existsSync(report)) throw new Error("No executed exporter tests: fresh JUnit report missing");
  let tests = 0;
  let unsuccessful = false;
  const parser = new SaxesParser();
  parser.on("opentag", ({ name }) => {
    if (name === "testcase") tests += 1;
    if (["skipped", "failure", "error"].includes(name)) unsuccessful = true;
  });
  parser.write(fs.readFileSync(report, "utf8")).close();
  if (tests === 0 || unsuccessful) throw new Error("No executed exporter tests or suite contains unsuccessful tests");
  console.log(`Exporter regressions executed: ${tests}; report: ${report}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 2) throw new Error("Usage: pnpm --filter @auto-tm/mobile test:native-exporter (set JAVA_HOME and ANDROID_HOME)");
    runNativeExporterTests();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
