---
name: game-feel
description: Design, tune, and audit the moment-to-moment tactile sensation of real-time player control — responsiveness, avatar motion, juice/polish, camera, collision feel, and input mapping. Use when building or fixing player controllers, jumps, vehicle handling, hit feedback, or when someone says controls feel floaty, stiff, twitchy, mushy, sluggish, or "off".
---

# Game Feel

Build and tune the tactile sensation of controlling something in a simulated space. Treat feel as an engineering target with measurable parameters, not as a matter of taste.

## Core model

Decompose every feel problem into exactly six layers. Diagnose which layer is broken before changing anything.

1. **Input** — the physical device, its sensitivity, and how many distinguishable states it offers.
2. **Response** — how the game modulates parameters over time in reaction to input signals.
3. **Context** — collision behavior and the spatial layout that gives motion meaning.
4. **Polish** — effects that change perception without changing the simulation.
5. **Metaphor** — what the object appears to be, and the expectations that representation sets.
6. **Rules** — arbitrary designed relationships that assign value and challenge to motion.

Fix at the layer that actually owns the defect. A jump that feels weightless is a Response bug; a jump that feels weightless *only in the tutorial room* is a Context bug; a jump that reads as weightless despite correct physics is a Polish bug.

## Hard constraints — never violate these

These come from human perceptual limits, not preference. Treat them as pass/fail.

- **Render above 10 fps** or the illusion of motion collapses. Target 30+; treat 60 as the working floor for anything twitch-based.
- **Produce a perceivable response within 100 ms of input.** Under ~50 ms reads as instantaneous, ~100 ms reads as noticeable but ignorable, ~200 ms reads as sluggish.
- **Never exceed 240 ms** from input to perceivable response. Past that the player completes a full perceive-think-act cycle before the game answers, and real-time control is broken.
- **Accept input and deliver feedback continuously at 100 ms or better.** Sporadic responsiveness destroys control even when average latency looks fine.
- **Exempt only player-chosen commitments.** A 750 ms recovery on a heavy attack the player deliberately triggered is a risk/reward tradeoff, not lag. An unrequested 750 ms delay is a defect.

Measure latency; do not estimate it. Record the screen and the controller simultaneously at 60 fps and count frames between the button going down and the first visible pixel change.

## Principles

### Give predictable results

Guarantee that the same intent produces the same outcome. Difficulty is fine; inconsistency is not. When results feel random, practice feels pointless and players quit.

Eliminate the three causes of perceived randomness:

- **Control ambiguity** — Resolve simultaneous or near-simultaneous inputs deterministically and legibly. Never let two buttons pressed "at the same time" resolve by millisecond ordering the player cannot perceive. Define an explicit priority or a chord, and buffer inputs across a window so near-simultaneous presses land as one intent.
- **State overwhelm** — Make every state change perceivable. Remapping inputs per state buys expressivity cheaply, but only when the player can see which state they are in. Signal each state through animation, sound, camera, and effects before adding another one.
- **Poor staging** — Exaggerate the result of every input so it can be read at a glance. Stage one idea at a time; if the response is lost inside other motion or happens too fast to parse, the player cannot reproduce it deliberately.

Design results that support inference. A good response teaches the player about actions they have not tried yet, not just the one they took.

### Respond instantaneously

Deliver a large, obvious change immediately after input, then let the motion resolve however slowly it needs to. A long attack phase is compatible with a responsive feel as long as the biggest visible delta happens in the first frames. Front-load the response; never front-load the wind-up.

### Make it easy but deep

Lower the skill floor with natural and conventional mappings — thumbstick direction to movement direction, wheel to steering, mouse to cursor, WASD to motion. Exploit knowledge the player already has instead of teaching new translations.

Raise the ceiling by increasing sensitivity between input and response, then giving that new expressivity somewhere to matter: timed challenges, spacing that rewards precision, scoring, leaderboards, direct competition. Competition makes the ceiling effectively infinite.

### Sustain novelty

Prevent the response from going stale over thousands of repetitions. Avoid fixed linear animation as the sole response to a common action. Introduce variation through simulation, blended states, randomized effect and sound variants, and new mechanics layered onto existing motion. Real motion is never identical twice; when a game's motion is, it starts reading as wrong.

### Make the response appealing in a void

Verify that the control is pleasurable to tinker with in an empty gray room, with no goals, enemies, or level. If it is boring there, no amount of content will save it. Context supplies meaning; it does not supply appeal.

Invest in failure states specifically. Players spend most of their time failing. Make crashes, deaths, and misses varied, physical, and fun to watch — this reduces frustration and speeds learning.

### Produce organic motion

Prefer curved, arcing motion paths over linear ones. Do not overwrite position directly each frame; maintain internal velocity and modify it with forces, acceleration, and drag. Position-setting produces stiff, robotic motion; force-driven simulation produces flowing motion.

Use stiff, position-driven motion deliberately when the design wants precision and contemplation rather than fluidity — but choose it, never default into it.

### Enforce harmony

Keep all six layers consistent with one another. If it looks like a car, it must steer, grip, bounce, sound, and crumple like one. Active perception is far more acute than passive viewing; players notice small inconsistencies constantly and cannot help it.

Match the level of abstraction across visuals, sound, motion, and rules. Pushing toward photorealism raises the bar on every other layer simultaneously and is the hardest promise to keep. An iconic treatment sets expectations you can actually meet.

Convert unavoidable inconsistencies into mechanics where possible. Pressing a character into a wall is an artifact; turning wall contact into a cover system makes the same collision read as intentional.

### Build toward ownership

Aim for the point where mastery becomes self-expression. Deliver ownership through either high sensitivity and subtlety in the simulation, or a large set of legible states combined with an environment whose objects are usable from many approaches and positions. Support improvisation by making interactions general rather than special-cased, so behaviors emerge from recombining a few simple rules.

## Working method

1. **Reproduce and localize.** Play the mechanic in isolation. Name the sensation in plain words — floaty, twitchy, stiff, mushy, sluggish, unresponsive — then map that word to a layer and a parameter.
2. **Measure before tuning.** Capture the actual latency, the actual motion curve, and the actual frame rate. Do not tune against a hunch.
3. **Build a tuning harness.** Expose every feel parameter as a live, editable value with hot reload. Tune with the game running; feel cannot be tuned through a compile cycle.
4. **Change one parameter at a time** and re-feel. Feel comes from relationships between parameters, so a change to one usually requires re-checking its partners (jump force against gravity, turn rate against speed, acceleration against max speed and drag).
5. **Tune against context, never in a void.** Absolute speed values are meaningless. Place reference objects and lay out spacing, then tune motion against that spacing.
6. **Verify against the checklist below** before declaring it done.

## Verification checklist

Run every item. Record the measured value, not an impression.

- [ ] Frame rate holds above 30 fps during the mechanic, including worst case.
- [ ] Measured input-to-visible-response latency is under 100 ms; nothing exceeds 240 ms except player-chosen commitments.
- [ ] Input is accepted every frame; no window drops or ignores presses.
- [ ] The same input sequence produces the same result 10 times out of 10.
- [ ] Simultaneous button presses resolve identically every time and match what the player intended.
- [ ] Every state the avatar can enter is distinguishable at a glance from every other state.
- [ ] Each distinct action has feedback across at least two channels (visual, audio, camera, haptic).
- [ ] Motion traces curved paths; position is derived from velocity, not assigned directly.
- [ ] The control is enjoyable in an empty test room with no goals present.
- [ ] Failure states are varied and interesting to watch.
- [ ] A new player produces intentional, non-random movement within 60 seconds without instruction.
- [ ] Removing any single polish effect measurably degrades the feel — if not, the effect is decoration and should be cut or strengthened.
- [ ] Object visuals, sounds, collision behavior, and motion all sit at the same level of abstraction.
- [ ] Every feel parameter is externalized and hot-reloadable.

## Diagnosing common complaints

| Complaint | Most likely cause | First move |
|---|---|---|
| Unresponsive | No perceivable change in the first 100 ms | Front-load the attack; add an immediate visible/audible cue |
| Floaty | Attack and release too long, drag too low, falling gravity too weak | Shorten attack, raise drag, increase falling gravity |
| Twitchy | Attack extremely short with a linear on/off progression | Curve the attack; add a short ramp and a small release |
| Stiff / robotic | Position overwritten each frame; no acceleration or release | Introduce velocity, acceleration, and drag |
| Random / uncontrollable | Control ambiguity or unperceived state changes | Resolve input priority; make states legible |
| Weightless | No falling asymmetry, no impact feedback | Increase falling gravity relative to rise; add impact effects, screen shake, sound |
| Boring despite correct physics | Missing polish, no context, no rules assigning value | Add effects and sound; place reference objects; give the motion a goal |
| Fatiguing | Decay phase — peak speed above sustain, rewarding mashing | Remove decay; make sustain the maximum |
| Slow-motion despite high speed values | No spatial reference for speed | Add near-field objects, texture detail, FOV change with speed |
| Dissonant / uncanny | Treatment promises more fidelity than the simulation delivers | Move the treatment toward iconic, or raise simulation fidelity |

## References

Load these when the task calls for depth beyond the principles above.

- `references/response-tuning.md` — ADSR envelopes, simulation vs. position-setting, input filtering, chording and gestures, state design, and a complete parameter recipe for a platformer jump.
- `references/context-polish-metaphor-rules.md` — the three levels of context, the five polish types and what each is for, metaphor treatment and expectation-setting, and the three levels of rules.
- `references/measurement.md` — hard and soft metrics, what to record for each layer, and how to run a feel audit on an existing game.
