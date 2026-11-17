import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runNativeExporterTests } from "./native-exporter-test.mjs";

test("an unprepared workspace reports prerequisites without starting Gradle", (t) => {
  const mobileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "exporter-test-"));
  t.after(() => fs.rmSync(mobileRoot, { recursive: true, force: true }));
  assert.throws(() => runNativeExporterTests({ mobileRoot, env: {}, run: () => assert.fail("must not spawn") }), /expo prebuild.*JAVA_HOME.*ANDROID_HOME/s);
});

function prepared(t) {
  const mobileRoot = fs.mkdtempSync(path.join(os.tmpdir(), "exporter-test-"));
  t.after(() => fs.rmSync(mobileRoot, { recursive: true, force: true }));
  const write = (file, body = "") => {
    const destination = path.join(mobileRoot, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, body);
  };
  for (const file of ["gradlew", "gradle/wrapper/gradle-wrapper.jar", "gradle/wrapper/gradle-wrapper.properties", "settings.gradle", "gradle.properties"]) write(`android/${file}`);
  write("jdk/bin/java");
  write("jdk/bin/javac");
  write("node_modules/react-native/gradle/libs.versions.toml", '[versions]\ncompileSdk = "36"\nbuildTools = "36.0.0"\nndkVersion = "27.1.12297006"\n');
  for (const file of ["platforms/android-36/android.jar", "build-tools/36.0.0/source.properties", "ndk/27.1.12297006/source.properties"]) write(`sdk/${file}`);
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args, ...options });
    if (command.endsWith("/java")) return { status: 0, stdout: "", stderr: 'openjdk version "17.0.17"' };
    if (args[0] === ":listing-video:tasks") return { status: 0, stdout: "testDebugUnitTest - Run unit tests for the debug build.\ntestReleaseUnitTest - Run unit tests for release.\n" };
    return { status: 0 };
  };
  return { mobileRoot, env: { JAVA_HOME: path.join(mobileRoot, "jdk"), ANDROID_HOME: path.join(mobileRoot, "sdk") }, run, calls, write };
}

test("a prepared workspace resolves the debug unit task and reruns exporter regressions with bounded resources", (t) => {
  const fixture = prepared(t);
  const run = (command, args, options) => {
    const result = fixture.run(command, args, options);
    if (args[0] === ":listing-video:testDebugUnitTest") fixture.write("modules/listing-video/android/build/test-results/testDebugUnitTest/TEST-tm.auto.listingvideo.ListingVideoExporterTest.xml", '<testsuite><testcase name="cancel before copy"/><testcase name="cancel during copy"/></testsuite>');
    return result;
  };
  runNativeExporterTests({ ...fixture, run });
  const invocation = fixture.calls.at(-1);
  assert.deepEqual(invocation.args.slice(0, 4), [":listing-video:testDebugUnitTest", "--tests", "tm.auto.listingvideo.ListingVideoExporterTest", "--rerun"]);
  for (const flag of ["--max-workers=1", "--no-parallel", "--no-daemon", "--priority=low", "-Pandroid.builder.sdkDownload=false", "-Porg.gradle.java.installations.auto-download=false", "-Pkotlin.compiler.execution.strategy=in-process"]) assert.ok(invocation.args.includes(flag), flag);
  assert.ok(invocation.args.includes("-Dorg.gradle.jvmargs=-Xmx2g -XX:MaxMetaspaceSize=512m -XX:ActiveProcessorCount=2 -Djdk.tls.client.protocols=TLSv1.2"));
  assert.equal(invocation.env.JAVA_TOOL_OPTIONS, "-XX:ActiveProcessorCount=2");
  assert.equal(invocation.env.ANDROID_SDK_ROOT, fixture.env.ANDROID_HOME);
  assert.equal(invocation.cwd, path.join(fixture.mobileRoot, "android"));
});

test("missing SDK components fail before task resolution", (t) => {
  const fixture = prepared(t);
  fs.rmSync(path.join(fixture.env.ANDROID_HOME, "platforms"), { recursive: true });
  assert.throws(() => runNativeExporterTests(fixture), /Missing Android SDK component: platforms\/android-36\/android.jar/);
  assert.equal(fixture.calls.length, 0);
});

test("a different JDK or mismatched SDK refuses before Gradle", (t) => {
  const fixture = prepared(t);
  assert.throws(() => runNativeExporterTests({ ...fixture, env: { ...fixture.env, ANDROID_SDK_ROOT: "/other-sdk" } }), /must match ANDROID_HOME/);
  assert.throws(() => runNativeExporterTests({ ...fixture, run: () => ({ status: 0, stderr: 'openjdk version "21.0.9"' }) }), /must run JDK 17/);
  assert.equal(fixture.calls.length, 0);
});

for (const [name, response, message] of [
  ["task configuration failure", { status: 1, stderr: "SDK configuration failed" }, /SDK configuration failed/],
  ["missing debug unit task", { status: 0, stdout: "testReleaseUnitTest - release only" }, /did not expose/],
]) {
  test(`${name} never starts tests`, (t) => {
    const fixture = prepared(t);
    const run = (command, args, options) => command.endsWith("/java") ? fixture.run(command, args, options) : response;
    assert.throws(() => runNativeExporterTests({ ...fixture, run }), message);
  });
}

test("a failing exporter suite makes the command fail", (t) => {
  const fixture = prepared(t);
  const run = (command, args, options) => args[0] === ":listing-video:testDebugUnitTest" ? { status: 1 } : fixture.run(command, args, options);
  assert.throws(() => runNativeExporterTests({ ...fixture, run }), /Exporter unit tests failed \(1\)/);
});

test("a successful Gradle exit without executed tests cannot establish a green suite", (t) => {
  const fixture = prepared(t);
  assert.throws(() => runNativeExporterTests(fixture), /No executed exporter tests/);
});

for (const [name, xml] of [
  ["empty", "<testsuite/>"],
  ["skipped", '<testsuite><testcase name="cancel"><skipped/></testcase></testsuite>'],
  ["failed", '<testsuite><testcase name="cancel"><failure/></testcase></testsuite>'],
]) {
  test(`a ${name} report is not proof of executed passing regressions`, (t) => {
    const fixture = prepared(t);
    const run = (command, args, options) => {
      const result = fixture.run(command, args, options);
      if (args[0] === ":listing-video:testDebugUnitTest") fixture.write("modules/listing-video/android/build/test-results/testDebugUnitTest/TEST-tm.auto.listingvideo.ListingVideoExporterTest.xml", xml);
      return result;
    };
    assert.throws(() => runNativeExporterTests({ ...fixture, run }), /No executed exporter tests/);
  });
}

test("a stale passing report cannot hide a Gradle run that executes no tests", (t) => {
  const fixture = prepared(t);
  fixture.write("modules/listing-video/android/build/test-results/testDebugUnitTest/TEST-tm.auto.listingvideo.ListingVideoExporterTest.xml", '<testsuite><testcase name="old pass"/></testsuite>');
  assert.throws(() => runNativeExporterTests(fixture), /fresh JUnit report missing/);
});
