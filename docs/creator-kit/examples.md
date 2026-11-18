# Worked examples

The three worlds are in [`worlds/`](../../worlds): open them with the 3D page's **Import world**, or `node tools/n0world-validate.mjs worlds/*.n0world`. They were written by hand following the brief (they were not produced by another assistant), and each is checked to build and play. The prompts show the kind of request that leads to a file like this.

## 1. A small room with a door and a spawn: [`room-with-door.n0world`](../../worlds/room-with-door.n0world)
> Prompt: "Make a cosy 6 by 5 metre room with a wooden table and one door on the south wall. I should start inside, looking at the table. A warm lamp light. Late afternoon."

Why it works: one `room` prefab with one opening, one `door` prefab placed at that opening, one `spawn` (`yaw: 0` looks at the table; use 180 to face the door), a `player-interact` rule on the door. Stand near the door and press **E** (or the **Use** button).

## 2. A platform course with collectibles: [`platform-course.n0world`](../../worlds/platform-course.n0world)
> Prompt: "A short platform course outdoors: three steps up to four floating platforms rising away from me, a gold coin on each, a message when I've got the last one. Foggy morning."

Why it works: `stairs` and `platform` prefabs, coins are plain `sphere`s with a `gold` material, `object-touch` rules `collect` each coin and `set-flag` it, and a `zone` at the end shows a message only `if` the last coin's flag is true.

## 3. Two rooms and a trigger-controlled door: [`two-rooms.n0world`](../../worlds/two-rooms.n0world)
> Prompt: "Two connected rooms at dusk. A steel gate between them stays shut until I step on a red pad in the first room. Tell me something clicked."

Why it works: two `room` prefabs with matching `e`/`w` openings, a `door` rotated `[0, 90, 0]` in the gap, a `zone` over a red cylinder, and a `player-enter` rule with `toggle-open`, `set-flag`, `show-message` and `play-sound`.

## A file that doesn't work (on purpose): [`broken.n0world`](../../worlds/broken.n0world)
Unknown material, prefab, type, trigger, action and sound; a duplicate id; a bad position; a rule aimed at a missing target; a `scripts` key. It still builds what it can, shows pink placeholders, and produces a report that can be pasted straight back to an AI.
