# Feature Diagrams

Level 0 (context) and Level 1 (decomposition) data-flow diagrams for every EchoCode
feature, one `.drawio` file per feature with a page per level.

Open with the **Draw.io Integration** extension in VS Code (`hediet.vscode-drawio`), or
drag onto [app.diagrams.net](https://app.diagrams.net).

## Regenerating

These are generated, not hand-drawn. Edit the data, not the XML:

```bash
node wiki/diagrams/generate.js
```

| File | Holds |
|---|---|
| `features.js` | Each feature's processes, stores, and flows |
| `generate.js` | Style constants and layout |

Changing a style constant reapplies to all 28 diagrams at once. Hand-editing a `.drawio`
works fine for a one-off, but the next regeneration overwrites it.

## Conventions

The layer vocabulary follows the "Our Proposed Approach" architecture diagram in the
EchoCode research slides, so these read as zoom-ins on that diagram rather than a
separate notation:

| Element | Meaning |
|---|---|
| Blue band | Input Layer |
| Grey band | VS Code Environment |
| Pink band | EchoCode Core |
| Lavender | AI Services Layer |
| White | External Services |
| Green cylinder | Local Storage & State |
| Green rectangle | Speech Output / TTS |
| Dashed arrow | Return or read-back flow |

Processes are numbered `N.0` at Level 0 and `N.1 … N.5` at Level 1.

## Two layout rules worth preserving

Both exist because of how draw.io behaves, and dropping either brings back a specific
annoyance:

**Every edge pins its exit and entry points.** Without them draw.io picks perimeter
points itself, so edges detour around shapes and converging flows stack on one spot.
Flows fan across an edge instead — see `fan()` in `generate.js`.

**The ECHOCODE CORE band is a container and the steps are its children.** A sibling band
renders *on top* of the steps, because later cells draw over earlier ones — which means
sending it to the back by hand every time the file is opened. As a container it sits
behind its children permanently, and dragging it moves the pipeline with it.

Data stores sit along the bottom rather than in a fourth column, so their flows do not
cross the services column.
