# Units and coordinates

- **Units:** metres. **Rotation:** degrees. **Colours:** `#rrggbb`.
- **Up** is `+y`. The floor is `y = 0`. An object's `pos` is its **base**, so `pos.y: 0` stands it on the floor. A table 0.8 m tall at `pos.y: 0` has its top at 0.8.
- **Right** is `+x`. **Toward the viewer** is `+z`, so **forward is `-z`**. A character (spawn `yaw: 0`) first faces `-z`. Positive yaw turns counter-clockwise seen from above: `yaw: 90` faces `-x`, `yaw: 180` faces `+z`, `yaw: -90` faces `+x`.
- **`rot: [x, y, z]`** is in degrees. To turn something around the vertical axis use `[0, deg, 0]`.
- **Rooms** are centred on their `pos` (the middle of the floor). Walls sit inside `width × depth`. Wall letters: `n` = the `-z` wall, `s` = `+z`, `e` = `+x`, `w` = `-x`. An opening's `offset` slides it along the wall (metres from the wall's centre: along x for n/s, along z for e/w).
- **Doors** are `width` wide along their local x axis, the frame sits around the opening, and the leaf swings about its hinge. To fit a door to a room opening, put it at the opening's centre in the wall, and rotate it `[0, 90, 0]` for `e`/`w` walls. For a room of depth D centred at the origin, the `s` wall's opening centre is at `z = D/2 − 0.1`.
- **Stairs** climb toward `-z` from `pos`. Rotate them to turn them.
- **Walking:** you collide with solid parts. Anything up to 0.55 m high can be stepped onto. Rooms, doors and stairs describe their own solid parts, so doorways are open and closed doors block.
