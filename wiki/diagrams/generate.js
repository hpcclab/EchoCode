#!/usr/bin/env node
/**
 * Generates Level 0 (context) and Level 1 (decomposition) data-flow diagrams for every
 * EchoCode feature, as .drawio files with one page per level.
 *
 * Style and layer vocabulary follow the "Our Proposed Approach" architecture diagram in
 * the EchoCode research slides, so these read as expansions of it rather than a separate
 * notation. Each feature is described as data in features.js; layout here is formulaic
 * so output stays predictable and diff-able.
 *
 *   node wiki/diagrams/generate.js
 *
 * Two layout rules exist because of how draw.io behaves, and both matter:
 *
 * 1. Every edge declares explicit exit and entry points. Without them draw.io picks
 *    perimeter points itself, which makes edges detour around shapes and pile onto the
 *    same spot. Flows fan out across an edge instead, so converging arrows stay legible.
 *
 * 2. The ECHOCODE CORE band is a real container and the step boxes are its children.
 *    A sibling band would render on top of the steps (later cells draw over earlier
 *    ones) and need sending to the back by hand on every open. As a container it sits
 *    behind its children permanently, and dragging it moves the steps with it.
 */

const fs = require("fs");
const path = require("path");

const OUT = __dirname;

/* ---------------------------------------------------------------- *
 * Style — matched to the slide deck's layers
 * ---------------------------------------------------------------- */

const LAYER = {
  input:    { fill: "#dae8fc", stroke: "#7ea6d8", label: "INPUT LAYER" },
  vscode:   { fill: "#f5f5f5", stroke: "#9a9a9a", label: "VS CODE ENVIRONMENT" },
  core:     { fill: "#fdf0fb", stroke: "#d98cc4", label: "ECHOCODE CORE" },
  ai:       { fill: "#f3eafa", stroke: "#b39ddb", label: "AI SERVICES LAYER" },
  external: { fill: "#ffffff", stroke: "#9a9a9a", label: "EXTERNAL SERVICES" },
};

const S = {
  actor:   "shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;fillColor=#4a90d9;strokeColor=none;",
  entity:  "rounded=0;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#9a9a9a;fontSize=11;",
  process: "rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#d98cc4;fontSize=11;arcSize=16;",
  aiproc:  "rounded=1;whiteSpace=wrap;html=1;fillColor=#f3eafa;strokeColor=#b39ddb;fontSize=11;arcSize=16;",
  store:   "shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=7;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontSize=10;",
  speech:  "rounded=0;whiteSpace=wrap;html=1;fillColor=#e8f5e9;strokeColor=#66a06a;fontSize=11;",
  ext:     "rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#9a9a9a;fontSize=11;",
  note:    "shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;darkOpacity=0.05;fillColor=#fff2cc;strokeColor=#d6b656;size=14;fontSize=10;align=left;spacingLeft=6;verticalAlign=top;spacingTop=4;",
  title:   "text;html=1;align=left;verticalAlign=middle;fontSize=15;fontStyle=1;fontColor=#222222;",
  sub:     "text;html=1;align=left;verticalAlign=middle;fontSize=11;fontStyle=2;fontColor=#777777;",
  colHead: "text;html=1;align=left;verticalAlign=middle;fontSize=10;fontStyle=1;fontColor=#999999;",

  // container=1 so children sit inside it; collapsible=0 so nobody folds it by accident
  band: (l) =>
    `rounded=1;whiteSpace=wrap;html=1;fillColor=${LAYER[l].fill};strokeColor=${LAYER[l].stroke};` +
    `verticalAlign=top;align=left;spacingLeft=12;spacingTop=6;fontSize=10;fontStyle=1;fontColor=#666666;` +
    `arcSize=4;container=1;collapsible=0;expand=0;recursiveResize=0;movable=1;`,
};

// Shared edge geometry. jettySize keeps the stub off the shape edge; orthogonalLoop
// stops self-routing oddities; the jumpStyle makes unavoidable crossings readable.
const EDGE_BASE =
  "edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;endFill=1;" +
  "jettySize=auto;orthogonalLoop=1;jumpStyle=arc;jumpSize=6;fontSize=9;" +
  "labelBackgroundColor=#ffffff;verticalAlign=bottom;";

const EDGE = `${EDGE_BASE}strokeColor=#555555;`;
const EDGE_BACK = `${EDGE_BASE}strokeColor=#8a8a8a;dashed=1;`;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/\n/g, "&#xa;");

/* ---------------------------------------------------------------- *
 * Emitters
 * ---------------------------------------------------------------- */

function vertex(id, value, style, x, y, w, h, parent = "1") {
  return `        <mxCell id="${id}" value="${esc(value)}" style="${style}" vertex="1" parent="${parent}">
          <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry" />
        </mxCell>`;
}

/**
 * An edge with pinned exit and entry points.
 *
 * `ex/ey` and `enx/eny` are fractions of the source and target bounds (0,0 is top-left).
 * Pinning both ends is what keeps a fan of arrows from collapsing onto one another.
 */
function edge(id, source, target, label, ex, ey, enx, eny, style = EDGE) {
  const s =
    `${style}exitX=${ex};exitY=${ey};exitDx=0;exitDy=0;` +
    `entryX=${enx};entryY=${eny};entryDx=0;entryDy=0;`;
  return `        <mxCell id="${id}" value="${esc(label || "")}" style="${s}" edge="1" parent="1" source="${source}" target="${target}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>`;
}

// Spread n connection points down an edge, avoiding the exact corners.
const fan = (i, n) => (n <= 1 ? 0.5 : Number((0.22 + (0.56 * i) / (n - 1)).toFixed(3)));

function page(id, name, cells, w, h) {
  return `  <diagram id="${id}" name="${esc(name)}">
    <mxGraphModel dx="${w}" dy="${h}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${w}" pageHeight="${h}" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
${cells.join("\n")}
      </root>
    </mxGraphModel>
  </diagram>`;
}

function file(pages) {
  return `<mxfile host="app.diagrams.net" agent="EchoCode wiki generator" version="24.7.17">
${pages.join("\n")}
</mxfile>
`;
}

/* ---------------------------------------------------------------- *
 * Level 0 — context diagram
 *
 * Three columns: sources, the single process, sinks. Flows fan across the process's
 * left and right edges so nothing overlaps.
 * ---------------------------------------------------------------- */

function buildLevel0(f) {
  const c = [];
  const COL_L = 40, COL_M = 430, COL_R = 830;
  const NW = 250, NH = 62, ROW = 96;

  c.push(vertex("ttl", `${f.title} — Level 0 (Context)`, S.title, 40, 14, 760, 24));
  c.push(vertex("sub", f.purpose, S.sub, 40, 40, 1000, 18));
  c.push(vertex("hdA", "SOURCES", S.colHead, COL_L, 78, 200, 16));
  c.push(vertex("hdB", "PROCESS", S.colHead, COL_M, 78, 200, 16));
  c.push(vertex("hdC", "SINKS", S.colHead, COL_R, 78, 200, 16));

  const nSrc = f.l0.sources.length;
  const nSnk = f.l0.sinks.length;

  // Vertically centre the process against the taller of the two side columns.
  const srcTop = 140;
  const snkTop = 140;
  const srcSpan = nSrc * ROW;
  const snkSpan = nSnk * ROW;
  const span = Math.max(srcSpan, snkSpan);

  c.push(vertex("actor", "Users\n(BVI programmer)", S.actor, COL_L + 100, 96, 40, 62));

  f.l0.sources.forEach((s, i) => {
    const h = s.store ? 52 : NH;
    c.push(vertex(`src${i}`, s.name, s.store ? S.store : S.entity,
      COL_L, srcTop + 40 + i * ROW + (span - srcSpan) / 2, NW, h));
  });

  const procH = Math.max(110, span * 0.5);
  const procY = srcTop + 40 + span / 2 - procH / 2;
  c.push(vertex("proc", `${f.num}.0\n\n${f.title}`, S.process, COL_M, procY, 280, procH));

  f.l0.sinks.forEach((s, i) => {
    const style = s.store ? S.store : s.speech ? S.speech : s.ai ? S.aiproc : S.ext;
    const h = s.store ? 52 : NH;
    c.push(vertex(`snk${i}`, s.name, style,
      COL_R, snkTop + 40 + i * ROW + (span - snkSpan) / 2, NW, h));
  });

  let e = 0;
  // Actor enters the top of the process; everything else fans across the sides.
  c.push(edge(`e${e++}`, "actor", "proc", f.l0.trigger || "invoke", 1, 0.5, 0.15, 0));
  f.l0.sources.forEach((s, i) =>
    c.push(edge(`e${e++}`, `src${i}`, "proc", s.flow, 1, 0.5, 0, fan(i, nSrc))));
  f.l0.sinks.forEach((s, i) =>
    c.push(edge(`e${e++}`, "proc", `snk${i}`, s.flow, 1, fan(i, nSnk), 0, 0.5,
      s.back ? EDGE_BACK : EDGE)));

  const bottom = srcTop + 40 + span + 30;
  if (f.note) c.push(vertex("note", f.note, S.note, COL_M, bottom, 360, 78));

  return page(`${f.slug}-l0`, "Level 0 — Context", c, 1180, Math.max(720, bottom + 140));
}

/* ---------------------------------------------------------------- *
 * Level 1 — decomposition
 *
 * Inputs left; the numbered pipeline inside the ECHOCODE CORE container; external
 * services right; data stores along the bottom. Stores go underneath rather than in a
 * fourth column so their flows do not cross the services column.
 * ---------------------------------------------------------------- */

function buildLevel1(f) {
  const c = [];
  const l1 = f.l1;
  const COL_L = 40, BAND_X = 360, COL_R = 790;
  const PW = 260, PH = 64, GAP = 30;
  const TOP = 120;

  c.push(vertex("ttl", `${f.title} — Level 1 (Decomposition)`, S.title, 40, 14, 820, 24));
  c.push(vertex("sub", f.purpose, S.sub, 40, 40, 1040, 18));
  c.push(vertex("hdA", "INPUTS", S.colHead, COL_L, 86, 200, 16));
  c.push(vertex("hdC", "SERVICES & SINKS", S.colHead, COL_R, 86, 220, 16));

  // --- the container first, so its children nest inside it ---
  const bandH = 44 + l1.steps.length * PH + (l1.steps.length - 1) * GAP + 20;
  c.push(vertex("band", LAYER.core.label, S.band("core"), BAND_X, TOP, PW + 40, bandH));

  // --- steps as children of the band: geometry is relative to the band ---
  l1.steps.forEach((s, i) => {
    const relY = 40 + i * (PH + GAP);
    c.push(vertex(`p${i}`, `${f.num}.${i + 1}\n${s.name}`, s.ai ? S.aiproc : S.process,
      20, relY, PW, PH, "band"));
  });

  // --- inputs ---
  c.push(vertex("actor", "Users", S.actor, COL_L + 90, TOP + 6, 40, 62));
  l1.inputs.forEach((n, i) => {
    c.push(vertex(`in${i}`, n.name, n.store ? S.store : S.entity,
      COL_L, TOP + 110 + i * 86, 220, n.store ? 50 : 58));
  });

  // --- services and sinks ---
  l1.outputs.forEach((n, i) => {
    const style = n.store ? S.store : n.speech ? S.speech : n.ai ? S.aiproc : S.ext;
    c.push(vertex(`out${i}`, n.name, style, COL_R, TOP + 34 + i * 88, 240, n.store ? 50 : 60));
  });

  // --- data stores along the bottom ---
  const stores = l1.stores || [];
  const storeY = TOP + bandH + 70;
  stores.forEach((n, i) => {
    c.push(vertex(`st${i}`, n.name, S.store, BAND_X - 120 + i * 250, storeY, 220, 52));
  });

  let e = 0;
  c.push(edge(`e${e++}`, "actor", "p0", l1.trigger || "invoke", 1, 0.5, 0, 0.35));

  l1.inputs.forEach((n, i) =>
    c.push(edge(`e${e++}`, `in${i}`, `p${n.into ?? 0}`, n.flow, 1, 0.5, 0, 0.65)));

  // pipeline chain: bottom of one step into the top of the next
  for (let i = 0; i < l1.steps.length - 1; i++) {
    c.push(edge(`e${e++}`, `p${i}`, `p${i + 1}`, l1.steps[i].to, 0.5, 1, 0.5, 0));
  }

  const nOut = l1.outputs.length;
  l1.outputs.forEach((n, i) =>
    c.push(edge(`e${e++}`, `p${n.from ?? l1.steps.length - 1}`, `out${i}`, n.flow,
      1, fan(i, nOut), 0, 0.5, n.back ? EDGE_BACK : EDGE)));

  // stores hang off the bottom of their step
  stores.forEach((n, i) =>
    c.push(edge(`e${e++}`, `p${n.from ?? 0}`, `st${i}`, n.flow,
      i % 2 === 0 ? 0.25 : 0.75, 1, 0.5, 0, n.back ? EDGE_BACK : EDGE)));

  (l1.extraEdges || []).forEach((x) =>
    c.push(edge(`e${e++}`, x.from, x.to, x.label, 1, 0.5, 0, 0.5, x.dashed ? EDGE_BACK : EDGE)));

  const bottom = Math.max(storeY + (stores.length ? 80 : 0), TOP + bandH + 30,
    TOP + 34 + nOut * 88);
  if (f.note) c.push(vertex("note", f.note, S.note, COL_R, bottom, 340, 82));

  const width = Math.max(1220, BAND_X - 120 + stores.length * 250 + 60);
  return page(`${f.slug}-l1`, "Level 1 — Decomposition", c, width, Math.max(820, bottom + 150));
}

/* ---------------------------------------------------------------- *
 * Emit
 * ---------------------------------------------------------------- */

const FEATURES = require("./features.js");

let n = 0;
for (const f of FEATURES) {
  const xml = file([buildLevel0(f), buildLevel1(f)]);
  const p = path.join(OUT, `${String(f.num).padStart(2, "0")}-${f.slug}.drawio`);
  fs.writeFileSync(p, xml);
  console.log(`  ${path.basename(p)}`);
  n++;
}
console.log(`\n${n} files, ${n * 2} diagrams.`);
