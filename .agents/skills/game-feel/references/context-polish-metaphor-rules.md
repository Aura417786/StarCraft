# Context, Polish, Metaphor, Rules

Response supplies the motion. These four layers supply everything that makes the motion mean something.

## Context

Context is the effect of simulated space — collision behavior plus level layout. It is the second set of tuning knobs. Motion parameters have no meaning until they are tuned against a spatial layout.

### High level: the impression of space, speed, and size

Decide deliberately whether the world reads as open or enclosed. Open, sprawling space invites exploration and a sense of possibility. Tight, twisting space forces focus on the immediate surroundings and heightens caution.

Speed in a game is purely relative. Absolute velocity values convey nothing. Build the impression of speed out of:

- Near-field reference objects and ground texture the avatar passes.
- Density and spacing of passed objects.
- Camera distance — the same motion viewed from far away reads as crawling.
- Field of view widening as speed increases.
- Doppler shift, engine pitch, wind, and motion blur (these are polish, layered on top).

Build the impression of size out of speed and contrast. Something enormous must move slowly at a distance and appear to move appropriately quickly once the camera is near it. Getting this backwards — a huge creature that animates quickly from far away — reads as a small creature scaled up, and no amount of screen shake or dust rescues it. Give the player a continuous approach so they can gather a series of data points about mass.

Set relative speeds across characters to convey weight. A slow character reads as far heavier when a fast character exists for comparison.

### Medium level: spacing and object avoidance

This is where challenge is primarily created. To compare or tune it, record:

- Number of objects
- Size of objects
- Nature of objects
- Layout of objects
- Distance between objects

Tune object spacing against avatar speed and turn rate. Objects spaced far apart relative to avatar speed produce a hypnotic, disengaged traversal. Objects spaced tightly relative to speed produce tension and demand precision. Move along this axis to change difficulty without touching the controller.

### Low level: collision

Compare collision behavior to everyday physical objects and choose the analogue on purpose. Racing games generally want low-friction glancing collisions — a "waterslide" — because high-friction realistic collisions destroy a precision-driving game. Soft, jiggly, spring-loaded collisions read as gelatinous. Rigid, crisp collisions read as solid and heavy.

Return energy from collisions. Collisions that absorb everything and give nothing back make a world feel sterile and dead, and remove any reason to pay attention to surroundings.

## Polish

Polish is any effect that changes the player's perception of physical properties without changing the simulation. Its only job is to sell weight, mass, force, and material through clues at the moment objects interact.

Do not pursue realism. Emulating reality is not the efficient path to convincing perception; exaggeration is. Squash and stretch never happens to real objects, and no real brick emits multicolored stars — both work anyway, because they target perception rather than physics.

### Animation

Layer keyframed animation over the simulated object; the animation becomes the object in the player's mind, and any weight and presence it displays reads as real even though the simulation knows nothing about it. Apply the animation principles directly: squash and stretch, arcs, overlapping action, anticipation, follow-through, slow-in/slow-out.

Drive animation parameters from simulation state — scale run-cycle playback speed with actual velocity, lean with acceleration. Keep the drive one-directional: simulation drives animation, never the reverse, or the response becomes hostage to animation length.

### Visual effects

Spawn short-lived effects at the point of interaction: sparks, dust, trails, splinters, impact flashes. These are caused by an object without being the object.

Prioritize the motion of the effect over its texture. A satisfying burst-and-fade motion sells impact regardless of what the particle depicts.

### Sound effects

Treat sound as load-bearing, not decoration. Sound alone can flip a perception — two shapes that visually pass through each other read as bouncing off each other the moment an impact sound plays. When a move feels weak, add the sound before re-animating it.

Author impacts, grinds (looped and modulated by ongoing interaction state), and ambient loops. Randomize among several variants per event so repetition does not fatigue the player. Use reverb and muffling to convey the surrounding space. Sound is the least bound to realism of any channel — unexpected, stylized sounds are entirely viable when they match the treatment.

### Cinematic effects

Apply to the camera rather than to objects: screen shake, hit-stop / frame pause (tens of milliseconds), FOV changes, motion blur, slow motion, chromatic shifts. These have no everyday perceptual analogue but are deeply learned from film, and they read instantly as concussive force or speed.

### Tactile effects

Map rumble to metaphor: a single pulse for a single shot, sustained low-level rumble for grinding contact, continuous rumble for automatic fire. Use it sparingly and specifically — constant rumble becomes noise and fatigues hands. Force-feedback resistance can sell physicality but frequently just tires the player; justify it before adding it.

## Metaphor

Metaphor has two components:

- **Representation** — what the object appears to be. This gives the player a hook for expectations.
- **Treatment** — the cohesive whole of art, effects, sound, and music. This signals how much fidelity the player should expect.

The primary function of metaphor is to prime expectations about behavior. For every object, write down what it appears to be and what the player will therefore expect about its motion, sound, interaction, and damage response. Then check response, context, and polish against that list.

Place the treatment deliberately on the realistic ↔ iconic ↔ abstract spectrum, and hold every layer at the same point:

- **Realistic** — every behavior must match physical reality under active scrutiny. The most expensive promise; near-misses are more distracting than obvious stylization would be.
- **Iconic** — cartoon physics are accepted, exaggeration is expected, volume-preserving squash reads correctly. Far easier to keep in harmony.
- **Abstract** — expectations are wide open, almost nothing reads as wrong, but no existing knowledge is leveraged either.

Watch for the near-miss failure: a treatment that promises realism combined with behavior that falls just short is worse than a treatment that promised nothing. When the simulation cannot cash the check the visuals wrote, move the treatment toward iconic rather than pushing the simulation.

## Rules

Rules are arbitrary designed relationships between parameters or objects. They change how motion feels by changing what motion is worth.

### High-level rules

Direct attention toward a subset of mechanics by rewarding them. A hierarchical reward chain — collect these, which unlock that, which grants access to somewhere new — makes the smallest collectible feel valuable, and makes the skills required to collect it feel worth practicing.

Guard against dilution. When a collectible is everywhere and individually worthless, gathering it becomes a chore and the associated motion feels tedious. Scarcity and a non-transparent exchange rate preserve value.

Note that high-level rules can make an intrinsically unsatisfying action compelling by attaching a probabilistic reward to it. Use this knowingly, and prefer making the action itself good.

### Medium-level rules

Assign immediate, situational value to objects and locations. Low health turns a nearby health pack into the only thing that matters. Carrying an objective inverts the player's relationship to the whole level — the same movement suddenly feels slower, more exposed, more urgent.

Use these rules to change how a space is read and traversed without changing the space or the controller.

### Low-level rules

Change perceived physical properties through damage and health relationships. Enemies that absorb many hits read as massive and imposing; enemies that shatter on one hit read as fragile and make the same weapon feel devastating. Heavy attacks doing more damage than light ones is arbitrary in code but confirms the physical impression the animation and sound already suggested.

Tune hit counts as a feel parameter, not just a balance parameter.
