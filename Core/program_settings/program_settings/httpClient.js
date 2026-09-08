const http = require("http");
const https = require("https");

/**
 * Shared HTTP transport for every EchoCode AI backend (Ollama, OpenAI-compatible
 * APIs, Anthropic). Kept dependency-free on purpose: the extension ships as a VSIX
 * and Node's built-ins are all this needs.
 */
function openRequest(url, { method, headers, timeoutMs, label }, onResponse) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid ${label || "request"} URL: ${url}`);
  }

  const isHttps = parsedUrl.protocol === "https:";
  const transport = isHttps ? https : http;

  const req = transport.request(
    {
      method,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      headers,
    },
    onResponse,
  );

  if (timeoutMs) {
    req.setTimeout(timeoutMs, () => {
      req.destroy(
        new Error(`Request to ${url} timed out after ${timeoutMs}ms`),
      );
    });
  }

  return req;
}

function buildHeaders(payload, extraHeaders) {
  const headers = { ...(extraHeaders || {}) };
  if (payload) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(payload);
  }
  return headers;
}

/**
 * Buffers a JSON response. `label` only shapes the error text so failures name the
 * backend the user actually picked instead of always blaming Ollama.
 */
function requestJson(url, body, options = {}) {
  return new Promise((resolve, reject) => {
    const label = options.label || "AI provider";
    const payload = body ? JSON.stringify(body) : null;
    const method = options.method || (body ? "POST" : "GET");

    let req;
    try {
      req = openRequest(
        url,
        {
          method,
          headers: buildHeaders(payload, options.headers),
          timeoutMs: options.timeoutMs,
          label,
        },
        (res) => {
          let raw = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            raw += chunk;
          });
          res.on("end", () => {
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
              reject(
                new Error(
                  `${label} request failed (${res.statusCode || "unknown"}): ${describeError(raw)}`,
                ),
              );
              return;
            }

            try {
              resolve(JSON.parse(raw));
            } catch {
              reject(new Error(`${label} returned invalid JSON.`));
            }
          });
        },
      );
    } catch (err) {
      reject(err);
      return;
    }

    req.on("error", (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Streams a newline-delimited JSON response, invoking `onEvent` per parsed line.
 * Ollama's /api/pull reports download progress this way, which is the only way to
 * show a real progress bar while a multi-gigabyte model downloads.
 */
function requestNdjson(url, body, options = {}) {
  return new Promise((resolve, reject) => {
    const label = options.label || "AI provider";
    const payload = body ? JSON.stringify(body) : null;
    const onEvent = options.onEvent || (() => {});

    let req;
    try {
      req = openRequest(
        url,
        {
          method: options.method || (body ? "POST" : "GET"),
          headers: buildHeaders(payload, options.headers),
          timeoutMs: options.timeoutMs,
          label,
        },
        (res) => {
          res.setEncoding("utf8");

          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            let raw = "";
            res.on("data", (chunk) => {
              raw += chunk;
            });
            res.on("end", () =>
              reject(
                new Error(
                  `${label} request failed (${res.statusCode || "unknown"}): ${describeError(raw)}`,
                ),
              ),
            );
            return;
          }

          let buffer = "";
          let handlerError = null;

          const flush = (line) => {
            const trimmed = line.trim();
            if (!trimmed || handlerError) return;

            let event;
            try {
              event = JSON.parse(trimmed);
            } catch {
              // A partial or non-JSON keepalive line is not worth failing over.
              return;
            }

            // A throw from onEvent is how a caller reports a failure carried *inside*
            // the stream — Ollama returns HTTP 200 with an {"error": …} line for an
            // unknown model, so swallowing this would silently "succeed" on a failed
            // download. Abort the request and surface it.
            try {
              onEvent(event);
            } catch (err) {
              handlerError = err;
              req.destroy();
              reject(err);
            }
          };

          res.on("data", (chunk) => {
            buffer += chunk;
            let newlineIndex = buffer.indexOf("\n");
            while (newlineIndex !== -1) {
              flush(buffer.slice(0, newlineIndex));
              buffer = buffer.slice(newlineIndex + 1);
              newlineIndex = buffer.indexOf("\n");
            }
          });

          res.on("end", () => {
            flush(buffer);
            if (!handlerError) resolve();
          });
        },
      );
    } catch (err) {
      reject(err);
      return;
    }

    req.on("error", (err) => reject(err));
    if (options.cancellationToken) {
      options.cancellationToken.onCancellationRequested(() =>
        req.destroy(new Error("Cancelled.")),
      );
    }
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Providers return their failure reason in a JSON envelope; surfacing that instead
 * of the whole body is the difference between "invalid api key" and a wall of HTML.
 */
function describeError(raw) {
  if (!raw) return "no response body";
  try {
    const parsed = JSON.parse(raw);
    const message =
      parsed?.error?.message || parsed?.error || parsed?.message || null;
    if (message) return typeof message === "string" ? message : JSON.stringify(message);
  } catch {
    // Fall through to the raw body.
  }
  return raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
}

module.exports = { requestJson, requestNdjson };
