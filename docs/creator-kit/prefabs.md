# Prefab catalogue

_Generated from `src/world-schema.js` by `node tools/n0world-docs.mjs`. Do not edit by hand._

A prefab instance is `{"id":"…","prefab":"door","pos":[x,y,z],"rot":[0,0,0],"params":{…}}`. It stays **one editable object** in n0ise: select it and change its parameters in the World tab. Out-of-range values are clamped and reported.

## `door` · Door
A frame and a leaf that swings. Use toggle-open to open and close it. The leaf blocks you while closed.

| parameter | values |
|---|---|
| `width` | number 0.5 to 4, default 1 |
| `height` | number 1 to 4, default 2.1 |
| `thickness` | number 0.03 to 0.3, default 0.08 |
| `material` | name of a material you defined (optional) |
| `frameMaterial` | name of a material you defined (optional) |
| `open` | true or false, default false |
| `hinge` | "left" | "right", default "left" |

## `platform` · Platform
A slab you can stand on.

| parameter | values |
|---|---|
| `width` | number 0.2 to 60, default 2 |
| `depth` | number 0.2 to 60, default 2 |
| `thickness` | number 0.05 to 10, default 0.3 |
| `material` | name of a material you defined (optional) |

## `stairs` · Stairs
Steps that climb toward -z (rotate it to turn it). pos is the bottom of the first step.

| parameter | values |
|---|---|
| `steps` | integer 1 to 40, default 6 |
| `rise` | number 0.05 to 0.5, default 0.18 |
| `run` | number 0.1 to 1, default 0.28 |
| `width` | number 0.4 to 10, default 1.2 |
| `material` | name of a material you defined (optional) |

## `spawn` · Spawn
Where the character starts. yaw turns it (0 faces -z, the way the camera first looks). weapon: true lets the player shoot (click, F or the Fire button).

| parameter | values |
|---|---|
| `yaw` | number -360 to 360, default 0 |
| `weapon` | true or false, default false |

## `room` · Room
Four walls, a floor and an optional ceiling, with openings cut where you ask. Stays one editable room.

| parameter | values |
|---|---|
| `width` | number 1 to 60, default 6 |
| `depth` | number 1 to 60, default 6 |
| `height` | number 1.5 to 12, default 2.8 |
| `wall` | number 0.05 to 1, default 0.15 |
| `floor` | true or false, default true |
| `ceiling` | true or false, default false |
| `material` | name of a material you defined (optional) |
| `floorMaterial` | name of a material you defined (optional) |
| `openings` | list of up to 12 items: wall ("n" | "s" | "e" | "w", default "s"); offset (number -30 to 30, default 0); width (number 0.5 to 6, default 1); height (number 1 to 4, default 2.1) |

## `group` · Group
An empty container. Give other instances "parent":"<this id>" and they move together.

No parameters.

## `ladder` · Ladder
A ladder you climb: walk into it and press forward (up) or back (down). Place it against a wall or platform edge; it faces +z.

| parameter | values |
|---|---|
| `height` | number 0.5 to 20, default 3 |
| `width` | number 0.3 to 2, default 0.6 |
| `material` | name of a material you defined (optional) |

## `vehicle` · Vehicle
A car you can drive. Walk up to it and press E (or Drive), steer with WASD or the stick, Space brakes, E gets out. It faces -z at rot 0.

| parameter | values |
|---|---|
| `length` | number 2 to 8, default 3.6 |
| `width` | number 1 to 3, default 1.8 |
| `height` | number 0.8 to 2.5, default 1.3 |
| `speed` | number 4 to 40, default 16 |
| `material` | name of a material you defined (optional) |

## `target` · Target
Something to shoot. It takes hp hits and then disappears. Rules can react with the object-shot trigger.

| parameter | values |
|---|---|
| `size` | number 0.3 to 4, default 1.2 |
| `hp` | integer 1 to 20, default 3 |
| `material` | name of a material you defined (optional) |

## `zone` · Zone
An invisible volume that rules can react to. Shown as a faint box only while editing.

| parameter | values |
|---|---|
| `size` | [x, y, z], default [2,2,2] |

## Plain shapes and ready-made objects

`type` is one of: `cube`, `sphere`, `torus`, `knot`, `plane`, `cylinder`, `cone`, `capsule`. Ready-made (physics defaults included): `human`, `wall`, `floor`, `platform`, `pillar`, `crate`, `ball`. Give exact size with `dims: [width, height, depth]` in metres.
