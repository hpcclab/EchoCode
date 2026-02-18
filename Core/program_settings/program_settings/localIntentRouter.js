const path = require("path");
const { spawn } = require("child_process");

async function classifyLocalIntent(transcript, commands) {
  return new Promise((resolve) => {
    try {
      const pyPath = path.join(__dirname, "local_intent_matcher.py");
      const pythonExe = process.env.ECHOCODE_PYTHON || "python";
      const py = spawn(pythonExe, [pyPath]);

      let stdout = "";
      let stderr = "";

      py.stdout.on("data", (d) => (stdout += d.toString()));
      py.stderr.on("data", (d) => (stderr += d.toString()));

      py.on("close", (code) => {
        if (stderr.trim().length > 0) console.log("[localIntent ERR]", stderr);
        if (code !== 0) {
          console.log(`[localIntent] Python exited with ${code}`);
          return resolve("none");
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          if (parsed?.score > 0.55) {
            resolve(parsed.command);
          } else {
            console.log(`[localIntent] Low confidence: ${parsed?.score}`);
            resolve("none");
          }
        } catch (err) {
          console.log("[localIntent parse error]", err.message, stdout);
          resolve("none");
        }
      });

      py.stdin.write(JSON.stringify({ transcript, commands }));
      py.stdin.end();
    } catch (err) {
      console.log("[localIntent router error]", err);
      resolve("none");
    }
  });
}

module.exports = { classifyLocalIntent };
