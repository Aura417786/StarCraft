# v35 Next-Generation Overhaul

Baseline: `a5374770007bf1d6d47f3496a31ccad21aae3948` / v34. Checkpoint: `checkpoint/pre-nextgen-20261117`. Integration: `nextgen/v35`. All work must preserve historical releases, save compatibility, both languages, three fighters and eleven bosses.

## Task graph

| ID | Scope | Dependencies | Acceptance |
|---|---|---|---|
| NG-01 | Audit, baseline captures and budgets | none | Production rendering, source contracts, software versions recorded |
| NG-02 | Blender water, magma and void material/motion assets | NG-01 | Transparent margins, temporal motion, real renders, reproducible authoring |
| NG-03 | Eleven elemental combat sequences | NG-01 | No generic Boss orb supply; setup/interception/payoff; fair tells, distinct control; real collisions |
| NG-04 | Elemental VFX and environment response | NG-02, NG-03 interfaces | Geometry and collision agree; materials and silhouettes differ; quality limits |
| NG-05 | Three fighter VFX | NG-01 | Red heavy cylinder, blue tracking/discharge, yellow expanding coverage; damage unchanged |
| NG-06 | Elemental sound bank and adaptive mix | NG-01, NG-03 interfaces | Original rendered assets; pan, phase changes, warning priority, voice budget |
| NG-07 | Integration and regression | NG-03..06 | All eleven Bosses, three fighters, difficulty, rewind/retry, languages, quality/resolution, performance |
| NG-08 | Frozen build and delivery | NG-07 | ZIP, SHA-256, manifest, commit/tag, resources, evidence, limitations, DeepSeek instructions |

## Design contracts

- Hazard geometry remains authoritative. Visual shaders, sprites, mist and debris never silently widen damage.
- Boss attack chains replace the generic projectile lattice. Shield-only full-field attacks use a choice locked at anticipation; no-shield encounters retain an announced reachable route. No free shield injection. Perfect parry of ordinary enemy projectiles still refunds its spent charge.
- Normal attacks establish pressure, chained attacks exploit a previously announced location, and recovery creates a usable counterattack window. No live late retargeting disguised by effects.
- Major effects use anticipation, gathering, environmental tint, release, propagation, impact and residue. Boss themes use distinct bodies/material motion, not palette swaps.
- Keep warning silhouettes above material detail. Preserve reduced motion, reduced flashes and low-quality fallbacks. Pool or bound transient data; cosmetic motion must not consume gameplay random state.
- Reference images guide form, volume, lighting and motion only. Do not redistribute the supplied commercial artwork as game assets. New assets are authored for this project.
- Use existing Blender/FFmpeg/free audio tooling; no paid service or engine migration. Render outputs and recordings stay on D:. Runtime asset additions are budgeted and measured.

## Verification honesty

Differentiate deterministic simulation, staged production-render recordings, real-keyboard runs and human play. Do not label accelerated or protected fixtures natural victories. Do not claim commercial AAA equivalence from code volume or effects count. Record measured performance, actual visual limitations and unverified hardware explicitly.

## Sources and skills

- Matt Pocock `ask-matt`: workflow routing, isolated implementation, test/review closure.
- [Three.js graphics workflow](https://github.com/majidmanzarpour/threejs-game-skills/tree/main/skills/threejs-aaa-graphics-builder): material-first composition, geometry/readability, renderer budgets.
- [Game audio design](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/main/skills/disciplines/audio-design/SKILL.md): mixing, warning ducking, audio-clock layered transitions.
- Existing project encounter/action-combat, headless balance and Scenario Blender skills, read for their corresponding work.

User authorized uninterrupted execution of all stages. Internal visual/asset gates are evaluated before integration; no external review is requested mid-development.
