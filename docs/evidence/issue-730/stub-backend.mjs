// Local stand-in for the two Sign-in Code endpoints, used only for the #730
// emulator proof because the PR backend was not deployed. It mirrors the API
// contract: OtpRequestResponseSchema for a code request, and AuthController's
// 400 INVALID_OTP body for every verify. It holds no data and accepts no code.
//
// The optional second argument delays the verify answer, to stand in for
// network latency.
//
//   node docs/evidence/issue-730/stub-backend.mjs 3906 600
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 3906);
const verifyDelayMs = Number(process.argv[3] ?? 0);

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    if (req.method === "POST" && req.url === "/api/v1/auth/otp/request") {
      send(res, 200, { requestId: randomUUID(), resendInSeconds: 60 });
      return;
    }
    if (req.method === "POST" && req.url === "/api/v1/auth/otp/verify") {
      setTimeout(() => {
        send(res, 400, {
          code: "INVALID_OTP",
          message: "Invalid OTP code. Please try again.",
        });
      }, verifyDelayMs);
      return;
    }
    send(res, 404, { code: "NOT_FOUND", message: "Not stubbed." });
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`stub backend on 127.0.0.1:${port}, verify delay ${verifyDelayMs}ms`);
});
