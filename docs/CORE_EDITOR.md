# Core editor, building, weapons and games

Everything here sits on Core's existing pieces: entities (`entity.create/set/remove`), static colliders, the asset catalog and undo. Nothing is a second scene graph.

## Islands
Historical: before the level creator, the blank scene was a round island (about 70 m flat top, a sand shelf, open sea) so you always spawn on land. Launcher: **Blank (level creator)** is now an empty grid floor for building levels (see CORE.md); the island is `?start=island`, used by the combat lab and physics test page. Older saved blank scenes keep their old square land.

## Editor (Edit mode, dock groups Build and Scene)
- Palette tabs: Props and buildings (catalog, with real rendered thumbnails), Build pieces, Online CC0 (Poly Haven). Drag a tile into the scene, or tap it and tap the ground. R turns the ghost 45 degrees. A ghost shows where it will land, on terrain or on top of other objects.
- Select by clicking. Move, Rotate, Scale gizmo (keys G, R, T) with grid snap (off, 25 cm, 50 cm, 1 m, 2 m). Duplicate (Ctrl/Cmd+D), Delete, Focus (F), V for select, Esc to cancel.
- Tools: Wall (drag a line), Floor (drag a rectangle), Room (drag a rectangle: floor, four walls with a door and windows, gable roof). A room is one undo step.
- Build pieces: walls (none, door, window, gate), floors, gable and flat roofs, stairs. Materials: plaster, brick, concrete, wood, tile, metal, roof tile, plain, glass, drawn procedurally with real-world scale UVs; any tint.
- Scene group: outliner, position, rotation and scale fields, material, tint, dimensions, Solid toggle, duplicate, focus, delete.

## Weapons and shooting
Two weapons (Blaster, Repeater), first person, hitscan with spread that grows while firing and shrinks when you stand still and aim, recoil that kicks the view and settles, aim down sights (right mouse or the Aim button) with a reflex red-dot whose dot is brighter than 1.0 so bloom picks it up, muzzle flash (sprite and light), tracers, sparks, bullet decals, hit and kill markers, ammo, reload, damage flash, weapon switching, sound. The viewmodel is drawn in its own pass with the depth cleared, so it never pokes into a wall. Bloom is an HDR post chain (`src/core/post.js`) used only while shooting.
Touch: Fire, Aim, Reload and Switch buttons, drag to look.

## Games (launcher, Examples)
- **Shooting range**: 12 steel plates and paper silhouettes at 12 to 56 m, 60 s, bonus for distance and headshots, accuracy at the end.
- **Drone arena**: three waves of flying drones that chase you, health, ammo and health drops, win or lose screen.
- **Coin run**: third person platforming over floating blocks, coins, a clock, a flag at the end.
- Plus the earlier **Starter island**, **Physics sandbox**, **Proving ground** and **Photo walk**.
Each game is a small function that adds meshes and rules and exposes `targets` to the shooter (`src/core/game.js`). Best scores are stored on the device.

## Limits, said plainly
- The weapons are Kenney's stylised blasters, not realistic firearms, and there are two. Reloading has no animation beyond a dip and tilt. No shell ejection, no penetration, no weapon pickups in the world.
- Walls are boxes: no curved walls, no CSG door cutting in arbitrary meshes, no automatic roof fitting to an irregular plan.
- Colliders for imported models are one box from their bounds. Stairs and platforms are exact boxes.
- Online models need a network on first use and again when a scene is reopened on a new device.
- No multiplayer, no AI navigation (drones fly straight at you), no save of game state mid-run.
- The editor is not a full Unreal editor: no prefab hierarchy editing, no terrain splines, no blueprint scripting, no material graph.
