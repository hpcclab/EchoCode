const os = require("os");
const { exec } = require("child_process");

const BYTES_PER_GB = 1024 ** 3;

/**
 * Runs a short shell probe and resolves to "" instead of rejecting. Every caller
 * here is a best-effort hardware sniff — a missing tool must never block setup.
 */
function probe(command, timeoutMs = 4000) {
  return new Promise((resolve) => {
    try {
      exec(command, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
        resolve(err ? "" : String(stdout || "").trim());
      });
    } catch {
      resolve("");
    }
  });
}

/**
 * Best-effort discrete-GPU VRAM lookup. NVIDIA is the only vendor that exposes a
 * reliable number from a CLI that ships with the driver, so that's the only one we
 * trust for sizing; anything else is reported by name only and sizing falls back to RAM.
 */
async function detectGpu() {
  const platform = os.platform();

  const nvidia = await probe(
    "nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits",
  );
  if (nvidia) {
    // "NVIDIA GeForce RTX 4070, 12282" — take the largest card if several are listed.
    const cards = nvidia
      .split(/\r?\n/)
      .map((line) => {
        const [name, mib] = line.split(",").map((p) => (p || "").trim());
        const vramGb = Number(mib) / 1024;
        return name && Number.isFinite(vramGb) && vramGb > 0
          ? { name, vramGb }
          : null;
      })
      .filter(Boolean);

    if (cards.length) {
      return cards.reduce((best, c) => (c.vramGb > best.vramGb ? c : best));
    }
  }

  if (platform === "darwin" && os.arch() === "arm64") {
    // Apple Silicon shares one memory pool between CPU and GPU, so total RAM is
    // the budget. Ollama will happily use most of it via Metal.
    const chip = await probe(
      "sysctl -n machdep.cpu.brand_string",
    );
    return {
      name: chip || "Apple Silicon (unified memory)",
      vramGb: os.totalmem() / BYTES_PER_GB,
      unified: true,
    };
  }

  if (platform === "win32") {
    // AdapterRAM is capped at 4 GB by Windows and is wrong on modern cards, so we
    // take the name for display only and let RAM drive the recommendation.
    const name = await probe(
      'powershell -NoProfile -NonInteractive -Command "(Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name)"',
    );
    if (name) return { name, vramGb: 0 };
  }

  return null;
}

/**
 * Snapshot of what this machine can actually run. Never throws.
 */
async function scanSystemSpecs() {
  const totalRamGb = os.totalmem() / BYTES_PER_GB;
  const freeRamGb = os.freemem() / BYTES_PER_GB;
  const cpus = os.cpus() || [];

  let gpu = null;
  try {
    gpu = await detectGpu();
  } catch {
    gpu = null;
  }

  return {
    platform: os.platform(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model?.trim() || "unknown CPU",
    cpuCores: cpus.length,
    totalRamGb,
    freeRamGb,
    gpu,
  };
}

/**
 * How much memory we're willing to hand a model. A dedicated GPU is the fast path,
 * so its VRAM wins when it's big enough to be worth using; otherwise we budget a
 * share of system RAM and leave the rest for the OS, VS Code and the user's program.
 */
function memoryBudgetGb(specs) {
  const ramBudget = specs.totalRamGb * 0.55;
  const vram = specs.gpu?.vramGb || 0;

  if (specs.gpu?.unified) {
    // Unified memory: the same pool, so don't double-count it.
    return ramBudget;
  }
  return vram >= 4 ? Math.max(vram, ramBudget * 0.75) : ramBudget;
}

/**
 * Ollama models ordered smallest first. `requiredGb` is roughly the resident size of
 * the default (Q4) quantisation plus room for a modest context window.
 * Coder-tuned models are preferred at each size because EchoCode is a coding assistant.
 */
const MODEL_CATALOG = [
  {
    name: "qwen2.5-coder:1.5b",
    requiredGb: 2.5,
    blurb: "Tiny coder model — runs on almost anything, basic explanations.",
  },
  {
    name: "llama3.2:3b",
    requiredGb: 4,
    blurb: "Small general model — decent explanations, very fast.",
  },
  {
    name: "qwen2.5-coder:7b",
    requiredGb: 7,
    blurb: "Strong code understanding at a modest size. Good default.",
  },
  {
    name: "qwen2.5-coder:14b",
    requiredGb: 12,
    blurb: "Noticeably better reasoning about code. Needs a healthy machine.",
  },
  {
    name: "qwen2.5-coder:32b",
    requiredGb: 24,
    blurb: "Best local quality EchoCode recommends. Workstation class.",
  },
];

/**
 * Picks the largest catalog entry that fits the budget, and returns the rest as
 * ranked alternates so the user can override the recommendation.
 */
function recommendModel(specs) {
  const budgetGb = memoryBudgetGb(specs);
  const fits = MODEL_CATALOG.filter((m) => m.requiredGb <= budgetGb);

  // Even a machine below the smallest entry gets an offer — the tiny model will be
  // slow but it will run, and refusing outright is worse than a warning.
  const recommended = fits.length
    ? fits[fits.length - 1]
    : MODEL_CATALOG[0];

  return {
    budgetGb,
    recommended,
    underpowered: fits.length === 0,
    alternatives: MODEL_CATALOG.filter((m) => m.name !== recommended.name),
  };
}

/**
 * One-line, screen-reader friendly summary of the scan. EchoCode speaks this aloud,
 * so it avoids symbols and abbreviations that TTS mangles.
 */
function describeSpecs(specs) {
  const parts = [
    `${specs.cpuCores} CPU cores`,
    `${specs.totalRamGb.toFixed(1)} gigabytes of RAM`,
  ];
  if (specs.gpu?.vramGb) {
    parts.push(
      specs.gpu.unified
        ? `${specs.gpu.name}`
        : `${specs.gpu.name} with ${specs.gpu.vramGb.toFixed(1)} gigabytes of video memory`,
    );
  } else if (specs.gpu?.name) {
    parts.push(specs.gpu.name);
  }
  return parts.join(", ");
}

module.exports = {
  scanSystemSpecs,
  recommendModel,
  describeSpecs,
  memoryBudgetGb,
  MODEL_CATALOG,
};
