# Response Tuning

Response is what the game does with an input signal. Every input follows the same path: signal arrives → signal is filtered → signal modulates a parameter. Tune each stage deliberately.

## Identify the mapping first

Before tuning anything, write down exactly what each input controls. For every avatar, record:

- **Type of motion** — linear or rotational.
- **Dimensions** — which of X, Y, Z the object translates or rotates in.
- **Frame of reference** — relative to the avatar, the camera, or the world.
- **Position vs. rate** — does the input set a position, or set the rate of change of one?
- **Direct vs. indirect** — does the input move the object, or add force to a simulation that moves it?
- **Integrated vs. separate** — does one input drive multiple parameters at once?

An input signal can only do a small number of things. Pick knowingly:

- Set a new position each frame.
- Set a new orientation each frame.
- Add force or torque to a simulated body.
- Modify a simulation variable (gravity, friction, drag, max speed).
- Trigger playback of an animation.
- Change the playback rate of a looping animation.
- Spawn a new entity with its own motion.

## Shape the ADSR envelope

Describe every parameter modulation as an attack/decay/sustain/release envelope, then tune the envelope directly.

- **Attack** — time from input to full effect. Long attack reads floaty or loose. Short attack reads tight. Short *and* linear reads twitchy. Short, linear, and with no release reads stiff.
- **Decay** — a peak above the sustain level. Almost always a bug. It rewards rapid re-pressing, produces exploitable speed, and fatigues hands. Remove it unless it is a deliberate mechanic.
- **Sustain** — the ceiling. This is max speed, max turn rate, terminal velocity.
- **Release** — time from input-off back to rest. Mirror it to the attack for a consistent loose feel. Zero release reads abrupt and crisp.

Curve the attack rather than ramping it linearly. A nonlinear attack keeps motion organic while a large early delta preserves the impression of instantaneous response. Combine a steep initial rise with a long overall attack to get both responsiveness and looseness.

Treat floaty, twitchy, tight, loose, and unresponsive as points on one continuum — different envelope shapes, not different systems.

## Choose the simulation that produces the envelope

The envelope is an output. It comes from how the motion is computed.

**Position-setting** — add a constant to position each frame while the input is held. Produces near-zero attack and release. Crisp, precise, robotic. Correct for grid movement, cursors, and games about exact placement.

**Velocity simulation** — store velocity; add acceleration each frame while input is held; apply drag each frame; clamp to max speed. Produces curved attack and release. Fluid, organic, expressive. Correct for almost everything else.

The construction of the simulation determines which feels are reachable at all. Tuning only explores the space the simulation defines. When no tuning value feels right, change the simulation, not the numbers.

Tune relationships, not isolated values. Jump force is meaningless without gravity. Turn rate is meaningless without forward speed. Carving requires lateral friction; without it, turning reads as sliding on ice. Scale a pair of values together and the feel survives; change one alone and it does not.

## Filter input before it reaches the simulation

Rarely map raw signals. Transposition is where most tuning leverage lives.

- **Scaling** — multiply or divide the signal. Control-display ratio for cursors falls here.
- **Nonlinear curves** — apply an exponential or piecewise curve across an analog range. Widening the low end of a steering curve kills oversteer twitchiness while preserving full lock at the extreme.
- **Ramping over time** — increase the effect of a held digital input over its first frames to synthesize a soft attack from a binary button. This gives one button both fine taps and full-rate holds.
- **Deadzones and saturation** — clamp the noisy center and the unreachable corners of an analog range.

## Add sensitivity without adding inputs

Three techniques multiply expressivity from a fixed set of buttons:

**States** — change the meaning of inputs based on simulated circumstance (grounded vs. airborne, blocking, ducking, grinding). Each state effectively duplicates the input set. Add states only as fast as you can make them perceivable; unperceived state changes read as randomness.

**Chording** — assign a distinct meaning to simultaneous inputs. Requires a tolerance window so human-simultaneous presses register as chords, and an unambiguous resolution when the window is exceeded.

**Gestures** — recognize a sequence of inputs across time as a single new signal. Give the sequence a bounded time window between steps and reset cleanly on failure. Fighting-game motions, cheat codes, and motion-controller swings are all the same pattern-matching layer.

**Context sensitivity** — change the meaning of an input based on the avatar's position in the world. This can be discrete (near a ladder, the action button climbs) or continuous (proximity to field sources scales the effect smoothly). Continuous context sensitivity produces richer feel than discrete prompts.

## Balance input sensitivity against response sensitivity

Four combinations, four feels:

- **Low input, low response** — rigid and grid-like. Contemplative rather than visceral. Weak in isolation, workable when the design wants deliberation.
- **Low input, high response** — a few buttons driving a rich simulation. Flowing, organic, expressive. The classic platformer configuration and the safest default.
- **High input, low response** — an analog device driving direct position. Natural and instantly learnable, but weightless and quickly boring. Nothing to master.
- **High input, high response** — analog device driving a rich simulation. The most expressive and the hardest to master. Choose when depth matters more than immediate accessibility.

Smooth high-sensitivity raw input with at least a little simulation. Even direct-look controls benefit from a small amount of response softening.

## Worked recipe: expressive platformer movement

A complete, reachable parameter set. Ship every one of these as a tunable value.

### Horizontal

- Acceleration (left), acceleration (right)
- Max speed
- Deceleration / drag — applies whether or not the run modifier is held
- Run acceleration (left), run acceleration (right)
- Run max speed
- Air acceleration (left), air acceleration (right)

Apply acceleration to velocity each frame the direction is held; derive position from velocity; clamp velocity to max speed; apply deceleration each frame the direction is released.

Bind the run modifier to *changes in the simulation* — higher acceleration and higher max speed — rather than to an added force. The perception of speed comes from the contrast between walk and run values, not from their absolute magnitude. Preserve the ratio and the feel survives any rescale.

Reduce horizontal acceleration in the air while preserving carried velocity. This makes momentum matter and forces committed jumps without freezing air control entirely.

### Vertical

- Gravity (rising)
- Initial jump force — applied as an instantaneous velocity set, not a sustained force
- Minimum jump button hold time
- Maximum jump button hold time
- Reduced jump velocity (the early-release clamp)
- Falling gravity — roughly 3× rising gravity
- Terminal velocity

Set Y velocity instantaneously on press so the response is unmistakable within one frame. Let gravity erode it. Bound how long the jump listens to the button so short taps and long holds give genuinely different heights.

Apply the early-release clamp: when the button is released while Y velocity is still above a threshold, snap Y velocity to a fixed low value close to but not equal to zero. This is what makes the expressive range between the smallest hop and the tallest jump wide, and it makes every jump end on the same arc regardless of height. Without it the minimum jump is still far too tall.

Raise gravity sharply after the apex. Symmetrical gravity makes the airborne phase feel too long, strips the impression of weight, and leaves the player out of control. Clamp falling speed with a terminal velocity — unclamped falls read as wrong from height, and an over-low clamp reads as a parachute.
