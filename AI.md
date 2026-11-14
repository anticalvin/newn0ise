# Building in n0ise with an AI

n0ise 3D has a scene API. An AI can read the scene, build it, render a picture, look at it, and fix it.
Units are metres, rotation is degrees, colours are `#rrggbb`. An object's `pos` is its base (`y: 0` is the floor).

## Connect Claude Code (or any MCP client)

```bash
cd tools/mcp && npm install
claude mcp add n0ise -- node "$(pwd)/server.mjs"
```

Then open the 3D page with the bridge switched on: `studio.html?mcp=1` (or tap **Connect AI** in the Scene tab).
The bridge listens on `127.0.0.1:8787` only. Set `N0_PORT` to change it. Nothing leaves your machine.

Ask: "Build a small courtyard with four pillars and a fountain, add a sun with shadows, render it, and fix anything that looks wrong."

## Tools

`n0_scene` read everything · `n0_add` shapes or glb/obj/ply/splat/photo from a URL · `n0_set` move/rotate/resize/recolour ·
`n0_delete` · `n0_duplicate` · `n0_light` · `n0_environment` (sky, ground, fog, sun, shadows) · `n0_camera` · `n0_view` ·
`n0_look` · `n0_walk` · `n0_sim` · `n0_render` (picture back to the AI) · `n0_export` (glb or project zip) · `n0_batch` · `n0_run` · `n0_describe`

`dims: [w, h, d]` gives an object an exact size in metres. `n0_scene` returns exact `bounds`, so align things with numbers instead of guessing.

## Without MCP

The same commands run in the page console: `await n0.run({cmd: 'add', type: 'cube', dims: [2, 1, 2], color: '#c9c1b3'})`.
`await n0.run({cmd: 'describe'})` lists every command.

## Physics

Give objects `phys: {type: "dynamic", mass, bounce, friction, shape}` (types: `static`, `dynamic`, `kinematic`, `none`), then `n0_sim {op: "play"}`.
`reset` puts everything back. Ready-made objects: `human`, `wall`, `floor`, `platform`, `pillar`, `crate`, `ball` (`crate` and `ball` fall by default).
Physics is Rapier, loaded when Play is first pressed.

## World tab

`studio.html#world` opens the World tab: tap a tile to place, drag with the gizmo or type numbers, Play for physics, Walk to stand inside.
Undo and redo cover everything placed from that tab. Time of day moves the sun and sky.

## Walk mode

**Walk** (Scene tab or the Walk button on the view) drops you into first person: WASD and mouse (click to capture), or the on-screen stick and right-thumb look on a phone. Space jumps, Shift runs, Esc leaves.
You collide with object bounds: low boxes are steps, tall ones are walls. The floor is `y = 0`.
