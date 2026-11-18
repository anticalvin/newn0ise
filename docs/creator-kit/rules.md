# Rules reference

_Generated from `src/world-schema.js`. Do not edit by hand._

Rules are data, never code. A rule is `{"id","when":{"trigger",…},"if"?:{"flag","equals"},"then":[actions]}`. Rules only run while you are walking (Play in the World tab). Everything resets each time you start walking.

## Triggers
| trigger | meaning |
|---|---|
| `player-enter` | The character steps into a zone (target: a zone or any object id). |
| `player-interact` | The character is close to target and presses E (or the Use button). |
| `timer` | every: seconds between runs, or after: seconds once. |
| `object-touch` | The character touches target (any object id). |
| `object-shot` | The player shoots target (needs a spawn with weapon: true). |

`when.once: true` runs the rule only the first time. `player-enter` and `object-touch` fire when the character steps in, not every frame.

## Actions
| action | meaning |
|---|---|
| `toggle-open` | Open or close a door. {target:id, state?:"open"\|"closed"} |
| `move-to` | Slide an object. {target:id, pos:[x,y,z], seconds:1} |
| `teleport` | Put the character somewhere. {pos:[x,y,z], yaw?:deg} |
| `destroy` | Make an object disappear with a thud. {target:id} |
| `collect` | Pick something up: it disappears and is counted. {target:id} |
| `set-flag` | Remember something. {flag:"name", value:true\|false\|number} |
| `show-message` | Show text for a few seconds. {text:"..."} |
| `play-sound` | A built-in sound. {sound:"ding\|click\|whoosh\|thud\|chime"} |

## Conditions
`"if":{"flag":"gate-open","equals":true}` runs the rule only when that flag has that value. Flags are set with `set-flag`. `collect` also counts up a flag named `collected`.

## Limits
- at most 64 rules, 8 actions per rule, about 20 actions per second in total (extras are skipped)
- messages up to 140 characters
- sounds: `ding`, `click`, `whoosh`, `thud`, `chime` (built in, nothing is loaded)
- there is no scripting, no network and no way to start another rule from a rule
