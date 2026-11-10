# Measuring Game Feel

Replace opinion with data wherever data exists, and use disciplined comparison where it does not. Distinguish the two kinds of metric and never present one as the other.

- **Hard metrics** — objectively measurable numbers: latency, frame rate, position over time, parameter values, object counts and spacing.
- **Soft metrics** — structured subjective comparisons: "this feels like a squirrel," "these collisions feel like water balloons," "this space feels claustrophobic." Legitimate and useful, provided they are made explicit, compared consistently, and grounded in everyday physical reference points.

## Measuring latency

Do not trust engine-reported timings. Record the screen and the input device in the same frame at 60 fps, then count frames from the moment the button visibly depresses to the first pixel change. Divide by frame rate and multiply by 1000 for milliseconds.

Measure the worst case, not the average. Measure under load. Measure after a state change, after a scene stream, and during effects-heavy moments.

Thresholds: under 50 ms instantaneous; 50–100 ms tight and responsive; ~100 ms noticeable but ignorable; ~200 ms sluggish; over 240 ms real-time control is broken.

## Measuring response

For each avatar record:

- How many objects the player controls.
- For each: type of motion, dimensions of motion, frame of reference, direct or indirect, position or rate.
- The ADSR envelope for every parameter each input modulates. Log the parameter every frame while scripting an input, then graph it. Do this before and after every tuning change.
- The full list of tunable parameters and the relationships between them.

Graph position over time for the avatar under a fixed input script. Compare that graph against a reference game's. The number of distinct positions and velocities reachable is a direct proxy for expressive range.

Soft metric: the overall sensitivity of the system as a joint function of input sensitivity and response sensitivity. Place the mechanic in the four-quadrant grid (low/high input × low/high response) and confirm the quadrant matches the design intent.

## Measuring input

For each individual input record:

- Number of distinguishable states (two-state button, analog trigger, thumbstick, mouse).
- Axes of movement and whether motion is linear or rotational.
- Whether the input is bounded, and whether the boundary matters to play.
- Sensitivity — the resolution of signal it can produce.

For the device as a whole, count the combinations available through chording, since the whole exceeds the sum of the parts. Note physical properties too: weight, materials, and button travel and click all change feel before a single line of code runs.

## Measuring context

- High level: describe the overall sense of space with an everyday comparison — open shoreline, dense city, subway tunnel, cave.
- Medium level: record object count, size, nature, layout, and spacing, all relative to avatar speed and turn rate. This is the primary difficulty dial.
- Low level: describe collision response by comparison to real materials, and note how much energy comes back out of a collision.

Verify the impression of speed by stripping the environment to nothing and confirming that speed becomes unreadable, then reintroducing reference objects until it reads correctly.

## Measuring polish

Audit by subtraction. Disable each effect individually and re-feel the mechanic. An effect whose removal is not noticeable is decoration — cut it or strengthen it.

Catalogue for each significant interaction which of the five channels are covered: animation, visual effects, sound effects, cinematic effects, tactile effects. Interactions covered by fewer than two channels are underweighted.

## Measuring metaphor

For every object, write two columns: what it appears to be, and what the player therefore expects of its behavior, motion, sound, and interaction. Then check each expectation against actual response, context, and polish, and list every mismatch.

Place the treatment on the realistic/iconic/abstract spectrum and confirm every layer sits at the same point.

## Measuring rules

List the arbitrary relationships in the game and sort them into high, medium, and low level. For each, state which skill it makes valuable and which motion it therefore changes the feel of. Rules that make no motion feel different are doing nothing for feel.

## Running a feel audit on an existing game

1. Play the mechanic in isolation, in the emptiest space available.
2. Name the sensation in plain language and note the everyday physical comparison it evokes.
3. Measure latency and frame rate.
4. Map every input to its parameter and graph the envelopes.
5. Reconstruct the likely simulation from the envelopes — position-setting versus velocity-with-forces, and where filtering is applied.
6. Record object spacing and collision character.
7. Inventory polish per interaction and per channel.
8. List metaphor expectations and every violation.
9. List rules and the skills they make valuable.
10. Write the findings as the six layers, with hard numbers where they exist and explicit soft comparisons where they do not.

For measurement purposes the underlying implementation is largely irrelevant — the player experiences only the output. Reconstruct the simulation when the goal is to *build* a particular feel; measure only the output when the goal is to *compare* feels.
