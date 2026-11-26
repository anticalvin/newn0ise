# n0ise Core Dynamics / R&D 001
Open index.html directly in a modern browser. No CDN or build step. WASD, touch arrows or standard gamepad left stick; drag canvas to orbit. Push torso, release motors, recover, tune stiffness and friction, pause or single-step.

## API
`import { Dynamics, BONES } from './dynamics.mjs'`.
`new Dynamics({ground:(x,z)=>height, friction:.8, wall:3, iterations:10})`; `setIntent({x,z,guard})`; `step(dtSeconds)` accumulates fixed 120 Hz substeps; `impulse(node,[x,y,z])` in approximate N·s; `recover()`; `snapshot()` returns node positions, support contacts, state, energy and simulation time; `reset()`. Local coordinates in metres, Y up. The ground callback must return finite heights. No renderer dependency.

## Core integration (proposal, not applied)
Current repository main uses a fixed 60 Hz loop and GeoWorld has a separate update path. Add this module under src/core/dynamics/experimental/ and invoke step(1/60) from the simulation loop for an isolated test actor. Do not also advance it from the render loop. Map existing semantic input to setIntent, keep explore input unchanged. Build a Three.js adapter consuming snapshot nodes (bone transforms derived from parent-child directions; twist needs separate handling). Start as an opt-in diagnostic in an isolated experience, not a replacement for Character or player collision. GeoWorld local origin is distinct from region-global coordinates; transform ground queries and render positions through its origin, and rebase all solver state together or keep an anchored local coordinate frame. Use Core's existing command boundary to expose reset, impulse, inspect and recover; add smoke tests before enabling in either existing mode.

## Limitations and next stage
This is a position-based point-mass skeleton with distance constraints and world-space pose drives; not Euphoria, not anatomically constrained, not Rapier, no body-body collision, no dynamic object interaction, no torque-based motor or true balance/ground propulsion. The box limits are test chamber boundaries. The visual mesh is a projected canvas debug rig, not a production character. Recovery uses upward pose drives and may fail depending on pose. Do not run this solver and Rapier on the same actor. Next implement a backend using Rapier articulated rigid bodies, joint limits, bounded motor torques, foot contact and support polygon control, collision groups and skinned glTF retargeting. Preserve intent/snapshot contract where practical. Profile real mobile hardware before asserting performance. 

## Tests
`node test.mjs` checks upright idle, impulse response, finite simulation during movement, ground bounds and reset. No browser or device benchmark was executed.
