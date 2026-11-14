# Having an AI write an n0ise plugin

1. In the app, open **Plugins → Copy brief for my AI**, paste it into ChatGPT or Claude, then finish the last sentence with what you want ("a halftone that follows brightness").
2. Paste the reply into the box in **Plugins**, press **Test**, then **Install**.
3. If there are errors, press **Copy errors** and paste them back to the AI. They are written so it can fix the file.

## The brief (copy-paste)
```
I want you to write a plugin for the n0ise image app. Reply with ONE JSON object and nothing else.
Format (.n0fx, JSON): {"n0fx":1,"id":"author.name","name":"...","version":"1.0.0","apiVersion":1,"author":"...","licence":"MIT","kind":"effect","family":"Community","description":"...","params":[{"k":"amt","t":"r","label":"Amount","min":0,"max":100,"def":40,"hero":true}],"glsl":"vec4 fx(vec2 uv){ ... return vec4(color,1.); }"}
Rules: "glsl" defines only vec4 fx(vec2 uv). No #version, #extension, uniform declarations, main(), while or do loops. for loops need a constant limit (for(int i=0;i<8;i++)), at most 64. At most 64 texture reads. Each param k (lower-case letters/digits) becomes the uniform float u_k (colour params become vec3). t is r (slider, needs min, max, def), b (switch, def true/false), color (def "#rrggbb") or c (choice: opts list plus integer def). Mark up to three important params "hero":true.
Available: uSrc (the picture, sampler2D), uAux (subject mask, .r = 1 inside the subject), uRes (vec2 pixels), uTime (seconds), uSeed (float), S (scale: uRes.y/600.), and helpers luma(vec3), h21(vec2), vnoise(vec2), fbm(vec2), curl(vec2). Set "feedback":true to get u_prev (the previous output frame) and u_reset (1 on the first frame).
Make the default look good with no tweaking. What I want:
```

## Common mistakes
- Writing `uniform float u_amt;` (parameters are declared for you).
- A `for` loop bounded by a variable. Use a number.
- Reading `u_prev` without `"feedback": true`.
- `amt` between 0 and 100 used directly as a distance. Divide it: `u_amt/100.*.03`.
- Returning `vec3`. Return `vec4(color,1.)`.

## Five working examples
See `plugins/examples/`: Ripple, Split RGB, Plasma (generator), Light Trails (feedback), Night pack (pack).
