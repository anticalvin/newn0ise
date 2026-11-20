# Authoring guide for AI assistants (and the people using them)

**Goal:** a single valid JSON object (`.n0world`) that n0ise builds on the first try.

## Workflow
1. Give the assistant [`ai-brief.txt`](ai-brief.txt) once per chat, then describe the world in plain words (size, mood, what opens what).
2. Ask for **only the JSON**, no fences or commentary.
3. Import it. Read the report. If it lists lines, press **Copy report** and paste it back with "fix these and send the whole file again".
4. Edit by hand in the World tab: every object, prefab parameter and group stays editable. **Export .n0world** gives you the edited file back, and you can hand that to the assistant to continue from.

## Rules of thumb for good files
- Prefer **prefabs** over loose boxes: one `room` replaces four walls, a floor and a ceiling and stays one editable object.
- Always add one `spawn` inside the room. Without it the character starts at 0,0,0 (the report says so).
- Use `dims` for exact sizes and put `pos.y: 0` for anything on the floor.
- Define a few named `materials` and reuse them. Unknown material names are replaced by the default and reported.
- Light it: set `timeOfDay` or add one or two `lights`.
- Triggers: use a `zone` prefab as an invisible pad or doorway sensor; use `player-interact` on a door or button object.

## Common mistakes (and what n0ise does)
| mistake | result |
|---|---|
| unknown `prefab`, `type`, trigger, action or sound | pink placeholder box or the rule/action is skipped; named in the report |
| a material that isn't defined | default material, named in the report |
| out-of-range numbers (a 40 m door) | clamped, named in the report |
| a rule that targets an id that doesn't exist | rule or action skipped, named in the report |
| `toggle-open` on something that isn't a door | action skipped |
| duplicate ids | the second one is renamed (`id_2`) and reported |
| more than the limits (500 instances, 64 rules, ~3000 meshes) | extras are ignored; too many meshes is refused |
| JSON syntax errors (comments, trailing commas) | nothing can be read; the error says so |
| `scripts`, code, URLs | never run; ignored and reported |

## The report format
Every problem is one line, written to be pasted back:
```
World report #f7c929dacf56 (0 errors, 9 repaired, 5 to check):
- FIXED instances[0] "room".params.material: material "steel2" doesn't exist; using the default. Define it under "materials" (available: wall).
- CHECK instances[1] "door": prefab "drawbridge" isn't supported (available: door, platform, stairs, spawn, room, group, zone). Shown as a pink placeholder box.
- ERROR version: This file is version 2 but this app reads version 1.
```
`FIXED` = changed to something safe, `CHECK` = kept but worth a look, `ERROR` = could not be used (nothing is built). The hash identifies the exact file.

## Safety
Files are untrusted data. There is no scripting and no network access. Names and messages are shown as text only. Imported worlds can't change other projects or built-in objects. `?safe=1` loads n0ise without imported worlds.
