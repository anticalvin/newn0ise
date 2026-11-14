# n0ise plugins (.n0fx)

A plugin is one JSON file. It adds an effect, a generator, a macro (a saved group of layers) or a pack (recipes and camera bodies). Plugins never run JavaScript: an effect is a GLSL function plus parameters, and everything is checked before it runs.

Open **Plugins** in the Effects header to import, write, test and manage them. `?safe=1` on the page address loads with every plugin off.

## Minimal effect
```json
{"n0fx":1,"id":"me.wobble","name":"Wobble","version":"1.0.0","apiVersion":1,"author":"me","licence":"CC0-1.0","kind":"effect",
 "params":[{"k":"amt","t":"r","label":"Amount","min":0,"max":100,"def":40,"hero":true}],
 "glsl":"vec4 fx(vec2 uv){ vec2 w=vec2(sin(uv.y*30.+uTime),cos(uv.x*30.+uTime))*u_amt/100.*.03; return vec4(texture(uSrc,uv+w).rgb,1.); }"}
```

## Fields
| Field | Notes |
|---|---|
| `n0fx` | always `1` |
| `id` | `author.name`, lower case, one dot |
| `name`, `version`, `author`, `licence` | required; the licence is shown to users |
| `apiVersion` | `1` |
| `kind` | `effect`, `generator`, `macro`, `pack` |
| `family` | where it appears in the list (default `Community`) |
| `params` | up to 16. `t`: `r` slider (min, max, def), `b` switch (def true/false), `color` (def `#rrggbb`), `c` choice (`opts`, integer `def`). Mark up to three `hero:true` so they show first |
| `glsl` | defines `vec4 fx(vec2 uv)` only |
| `feedback` | `true` gives `u_prev` (previous output) and `u_reset` (1 on the first frame or after a seek) |
| `layers` | macro: `[{"module":"blindemboss","params":{}}]` |
| `recipes`, `cameras` | pack data |

## Inside the shader
`uSrc` picture, `uAux` subject mask (`.r`), `uRes`, `uTime`, `uSeed`, `S` (= `uRes.y/600.`), `u_<k>` for each parameter, and helpers `luma`, `h21`, `vnoise`, `fbm`, `curl`.

## Limits and checks
64 KB of GLSL, 16 parameters, 64 texture reads, constant `for` limits up to 64, no `while`, no `#extension`, no `main()`. The shader is compiled and drawn once in a throwaway context; if it fails or is too slow (60 ms for a 256 px frame) it is rejected with a plain message. Installed plugins show author, licence, version and a content hash, and can be switched off or deleted.

Examples: `plugins/examples/`. Check a file from the command line with `node tools/n0fx-validate.mjs file.n0fx`. Multi-pass effects and scripted plugins are not supported yet.

See `docs/ai-plugin-guide.md` to have an AI write plugins for you.
