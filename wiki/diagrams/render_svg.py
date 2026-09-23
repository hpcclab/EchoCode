#!/usr/bin/env python3
"""
Renders the generated .drawio files to SVG so the diagrams can be embedded in wiki pages.

Reads geometry straight out of the .drawio XML rather than recomputing it, so the images
cannot drift from the editable source. Only the shape vocabulary generate.js emits is
supported (rounded/plain rects, cylinders, actor, note, container bands, orthogonal
edges with pinned endpoints) — this is not a general draw.io renderer.

    python3 wiki/diagrams/render_svg.py
"""

import glob
import os
import re
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "svg")

FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
CHAR_W = 0.545          # width of one char as a fraction of font size, for wrapping
STUB = 18               # how far an edge travels straight out of a shape before turning


# ----------------------------------------------------------------- style parsing

def style_map(style):
    out = {}
    for part in (style or "").split(";"):
        if not part:
            continue
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v.strip()
        else:
            out[part.strip()] = True
    return out


def kind_of(sm):
    if "shape" in sm and sm.get("shape") == "cylinder3":
        return "cylinder"
    if sm.get("shape") == "umlActor":
        return "actor"
    if sm.get("shape") == "note":
        return "note"
    if sm.get("container") == "1":
        return "band"
    if "text" in sm:
        return "text"
    return "rect"


# ----------------------------------------------------------------- geometry

def collect(diagram):
    """Returns (nodes, edges) with absolute coordinates, parents resolved."""
    cells = diagram.findall(".//mxCell")
    by_id = {c.get("id"): c for c in cells}

    def absolute(cell):
        g = cell.find("mxGeometry")
        x, y = float(g.get("x", 0)), float(g.get("y", 0))
        p = cell.get("parent")
        while p and p != "1" and p in by_id:
            pg = by_id[p].find("mxGeometry")
            if pg is None:
                break
            x += float(pg.get("x", 0))
            y += float(pg.get("y", 0))
            p = by_id[p].get("parent")
        return x, y, float(g.get("width", 0)), float(g.get("height", 0))

    nodes, edges = {}, []
    for c in cells:
        if c.get("vertex") == "1":
            sm = style_map(c.get("style"))
            x, y, w, h = absolute(c)
            nodes[c.get("id")] = {
                "id": c.get("id"), "label": c.get("value") or "", "sm": sm,
                "kind": kind_of(sm), "x": x, "y": y, "w": w, "h": h,
            }
        elif c.get("edge") == "1":
            sm = style_map(c.get("style"))
            edges.append({
                "src": c.get("source"), "dst": c.get("target"),
                "label": c.get("value") or "",
                "ex": float(sm.get("exitX", 1)), "ey": float(sm.get("exitY", 0.5)),
                "enx": float(sm.get("entryX", 0)), "eny": float(sm.get("entryY", 0.5)),
                "dashed": sm.get("dashed") == "1",
                "stroke": sm.get("strokeColor", "#555555"),
            })
    return nodes, edges


def side_normal(fx, fy):
    """Which way an edge leaves/enters, from a fractional anchor on the box."""
    if fx >= 0.999:
        return (1, 0)
    if fx <= 0.001:
        return (-1, 0)
    if fy >= 0.999:
        return (0, 1)
    if fy <= 0.001:
        return (0, -1)
    return (1, 0)


def route(s, ds, e, de):
    """Orthogonal path from s leaving along ds, to e arriving along de."""
    sx, sy = s
    ex, ey = e
    p1 = (sx + ds[0] * STUB, sy + ds[1] * STUB)
    p2 = (ex - de[0] * STUB, ey - de[1] * STUB)
    pts = [(sx, sy), p1]

    s_horiz = ds[0] != 0
    e_horiz = de[0] != 0

    if s_horiz and e_horiz:
        mid = (p1[0] + p2[0]) / 2
        pts += [(mid, p1[1]), (mid, p2[1])]
    elif not s_horiz and not e_horiz:
        mid = (p1[1] + p2[1]) / 2
        pts += [(p1[0], mid), (p2[0], mid)]
    elif s_horiz and not e_horiz:
        pts += [(p2[0], p1[1])]
    else:
        pts += [(p1[0], p2[1])]

    pts += [p2, (ex, ey)]

    # drop consecutive duplicates so the polyline stays clean
    out = [pts[0]]
    for p in pts[1:]:
        if abs(p[0] - out[-1][0]) > 0.5 or abs(p[1] - out[-1][1]) > 0.5:
            out.append(p)
    return out


# ----------------------------------------------------------------- text

def wrap(text, width_px, font_size):
    max_chars = max(6, int(width_px / (font_size * CHAR_W)))
    lines = []
    for para in text.split("\n"):
        if not para:
            lines.append("")
            continue
        cur = ""
        for word in para.split(" "):
            trial = (cur + " " + word).strip()
            if len(trial) <= max_chars:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
    return lines


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;"))


def text_block(lines, cx, cy, size, weight="normal", color="#333333", anchor="middle"):
    lh = size * 1.28
    top = cy - (len(lines) - 1) * lh / 2
    out = []
    for i, ln in enumerate(lines):
        if not ln:
            continue
        out.append(
            f'<text x="{cx:.1f}" y="{top + i * lh:.1f}" font-family="{FONT}" '
            f'font-size="{size}" font-weight="{weight}" fill="{color}" '
            f'text-anchor="{anchor}" dominant-baseline="middle">{esc(ln)}</text>'
        )
    return out


# ----------------------------------------------------------------- shapes

def draw_node(n):
    x, y, w, h = n["x"], n["y"], n["w"], n["h"]
    sm, kind, label = n["sm"], n["kind"], n["label"]
    fill = sm.get("fillColor", "#ffffff")
    stroke = sm.get("strokeColor", "#9a9a9a")
    size = float(sm.get("fontSize", 11))
    bold = sm.get("fontStyle") in ("1", "5")
    italic = sm.get("fontStyle") in ("2", "6")
    color = sm.get("fontColor", "#333333")
    out = []

    if kind == "text":
        lines = wrap(label, w, size)
        lh = size * 1.28
        for i, ln in enumerate(lines):
            out.append(
                f'<text x="{x:.1f}" y="{y + h / 2 + i * lh:.1f}" font-family="{FONT}" '
                f'font-size="{size}" font-weight="{"bold" if bold else "normal"}" '
                f'font-style="{"italic" if italic else "normal"}" fill="{color}" '
                f'dominant-baseline="middle">{esc(ln)}</text>'
            )
        return out

    if kind == "actor":
        cx = x + w / 2
        r = w * 0.26
        head = y + r
        out.append(f'<circle cx="{cx:.1f}" cy="{head:.1f}" r="{r:.1f}" fill="{fill}"/>')
        out.append(f'<path d="M {cx:.1f} {head + r:.1f} V {y + h * 0.66:.1f} '
                   f'M {x + 2:.1f} {y + h * 0.42:.1f} H {x + w - 2:.1f} '
                   f'M {cx:.1f} {y + h * 0.66:.1f} L {x + 3:.1f} {y + h:.1f} '
                   f'M {cx:.1f} {y + h * 0.66:.1f} L {x + w - 3:.1f} {y + h:.1f}" '
                   f'stroke="{fill}" stroke-width="2.4" fill="none" stroke-linecap="round"/>')
        out += text_block(wrap(label, w * 3.4, 10), cx, y + h + 14, 10, color="#555555")
        return out

    if kind == "cylinder":
        ry = h * 0.13
        out.append(
            f'<path d="M {x:.1f} {y + ry:.1f} '
            f'A {w / 2:.1f} {ry:.1f} 0 0 1 {x + w:.1f} {y + ry:.1f} '
            f'V {y + h - ry:.1f} '
            f'A {w / 2:.1f} {ry:.1f} 0 0 1 {x:.1f} {y + h - ry:.1f} Z" '
            f'fill="{fill}" stroke="{stroke}"/>'
        )
        out.append(
            f'<path d="M {x:.1f} {y + ry:.1f} A {w / 2:.1f} {ry:.1f} 0 0 0 '
            f'{x + w:.1f} {y + ry:.1f}" fill="none" stroke="{stroke}"/>'
        )
        out += text_block(wrap(label, w - 14, size), x + w / 2, y + h / 2 + ry * 0.5, size, color=color)
        return out

    if kind == "note":
        f = 14
        out.append(
            f'<path d="M {x:.1f} {y:.1f} H {x + w - f:.1f} L {x + w:.1f} {y + f:.1f} '
            f'V {y + h:.1f} H {x:.1f} Z" fill="{fill}" stroke="{stroke}"/>'
        )
        out.append(f'<path d="M {x + w - f:.1f} {y:.1f} V {y + f:.1f} H {x + w:.1f}" '
                   f'fill="none" stroke="{stroke}"/>')
        lines = wrap(label, w - 18, size)
        lh = size * 1.3
        for i, ln in enumerate(lines):
            out.append(
                f'<text x="{x + 9:.1f}" y="{y + 15 + i * lh:.1f}" font-family="{FONT}" '
                f'font-size="{size}" fill="#6b5c22" dominant-baseline="middle">{esc(ln)}</text>'
            )
        return out

    # rect / rounded rect / band
    rx = 6 if sm.get("rounded") == "1" else 0
    if kind == "band":
        rx = 4
    out.append(
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" '
        f'fill="{fill}" stroke="{stroke}"/>'
    )

    if kind == "band":
        out.append(
            f'<text x="{x + 12:.1f}" y="{y + 15:.1f}" font-family="{FONT}" font-size="{size}" '
            f'font-weight="bold" fill="{sm.get("fontColor", "#666666")}" '
            f'letter-spacing="0.6">{esc(label)}</text>'
        )
    else:
        out += text_block(wrap(label, w - 16, size), x + w / 2, y + h / 2, size,
                          "bold" if bold else "normal", color)
    return out


def draw_edge(e, nodes):
    s, d = nodes.get(e["src"]), nodes.get(e["dst"])
    if not s or not d:
        return []
    sp = (s["x"] + s["w"] * e["ex"], s["y"] + s["h"] * e["ey"])
    ep = (d["x"] + d["w"] * e["enx"], d["y"] + d["h"] * e["eny"])
    ds = side_normal(e["ex"], e["ey"])
    de = side_normal(e["enx"], e["eny"])
    de = (-de[0], -de[1])            # entry normal points inward

    pts = route(sp, ds, ep, de)
    dash = ' stroke-dasharray="5 4"' if e["dashed"] else ""
    path = "M " + " L ".join(f"{px:.1f} {py:.1f}" for px, py in pts)
    out = [f'<path d="{path}" fill="none" stroke="{e["stroke"]}" stroke-width="1.3" '
           f'stroke-linejoin="round"{dash} marker-end="url(#arrow)"/>']

    if e["label"]:
        # Prefer the longest horizontal run. Text reads along it, and two flows sharing a
        # vertical corridor would otherwise stack their labels on top of each other.
        best_h, len_h, best_any, len_any = None, -1, None, -1
        for i in range(len(pts) - 1):
            (ax, ay), (bx, by) = pts[i], pts[i + 1]
            ln = abs(bx - ax) + abs(by - ay)
            mid = ((ax + bx) / 2, (ay + by) / 2)
            if ln > len_any:
                len_any, best_any = ln, (mid[0], mid[1], abs(bx - ax) >= abs(by - ay))
            if abs(by - ay) < 1 and ln > len_h:
                len_h, best_h = ln, (mid[0], mid[1], True)
        mx, my, horiz = best_h if (best_h and len_h >= 45) else best_any
        lines = wrap(e["label"], 150, 9)
        wpx = max(len(l) for l in lines) * 9 * CHAR_W + 8
        hpx = len(lines) * 11 + 3
        out.append(f'<rect x="{mx - wpx / 2:.1f}" y="{my - hpx / 2 - (7 if horiz else 0):.1f}" '
                   f'width="{wpx:.1f}" height="{hpx:.1f}" rx="2" fill="#ffffff" '
                   f'fill-opacity="0.92" stroke="none"/>')
        out += text_block(lines, mx, my - (7 if horiz else 0), 9, color="#666666")
    return out


# ----------------------------------------------------------------- page

def render(diagram):
    model = diagram.find("mxGraphModel")
    w = float(model.get("pageWidth", 1100))
    h = float(model.get("pageHeight", 800))
    nodes, edges = collect(diagram)

    body = []
    order = {"band": 0, "text": 3}
    # bands first so they sit behind their children, then edges, then everything else
    for n in sorted(nodes.values(), key=lambda n: order.get(n["kind"], 2)):
        if n["kind"] == "band":
            body += draw_node(n)
    for e in edges:
        body += draw_edge(e, nodes)
    for n in nodes.values():
        if n["kind"] != "band":
            body += draw_node(n)

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{h:.0f}" '
        f'viewBox="0 0 {w:.0f} {h:.0f}" role="img">\n'
        '  <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" '
        'markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M 0 1 L 10 5 L 0 9 z" fill="#555555"/></marker></defs>\n'
        f'  <rect width="100%" height="100%" fill="#ffffff"/>\n  '
        + "\n  ".join(body)
        + "\n</svg>\n"
    )


def main():
    os.makedirs(OUT, exist_ok=True)
    made = 0
    for path in sorted(glob.glob(os.path.join(HERE, "[0-9][0-9]-*.drawio"))):
        stem = os.path.basename(path).replace(".drawio", "")
        for diagram in ET.parse(path).getroot().findall("diagram"):
            level = "L0" if "Level 0" in diagram.get("name") else "L1"
            dest = os.path.join(OUT, f"{stem}-{level}.svg")
            with open(dest, "w") as fh:
                fh.write(render(diagram))
            print(f"  {os.path.relpath(dest, HERE)}")
            made += 1
    print(f"\n{made} SVGs.")


if __name__ == "__main__":
    main()
