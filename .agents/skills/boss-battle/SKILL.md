---
name: boss-battle
description: >-
  Entry point for designing a complete boss encounter — the boss itself, its
  arena, its phases and signature skills, the specific hero abilities that
  counter each phase, and the cutscene or gameplay video that shows it. Use when
  the user says "boss", "boss fight", "final enemy", or describes a large enemy
  with phases.
metadata:
  title: Boss Battle Designer
  category: game-design
  triggers: >-
    design a boss; boss fight; boss battle; final boss for my game; a giant
    enemy with phases
---

# Boss Battle Designer

Design a boss the player will remember, and produce the assets and video that prove it.

## What a boss is

A boss is not a strong enemy. A boss is an enemy whose **rules change**, so the player has to change too. Every phase adds a signature skill that normal attacks cannot answer; every signature skill has a specific counter; every counter costs something. The fight is a conversation, not a health bar.

This skill designs that conversation first, and only then designs the monster.

## What the user gets

| Deliverable | Format |
|---|---|
| Boss design document | phases, skills, telegraphs, counters, cost, arena logic |
| Boss reference sheet | 3-panel (front / back / detail) in the project's locked style |
| Boss action board | 4-panel: wind-up · signature skill · being countered · phase break |
| Arena plate | 3/4-angle location with spatial lock and named landmarks |
| Hero ability board (if heroes exist) | normal attack vs special ability, visibly different |
| Cutscene or fight video | 10–30 s per phase, generated with `film-action-combat` rules |
| Music cue | optional, after picture lock |

## What the user has to do

1. Describe the boss and the world in a sentence or two.
2. Pick a visual style by letter if the project has none yet.
3. Approve the one-page design (phases + counters) before assets are generated.
4. Pick takes by number.

The skill decides archetype, arena, phase count, telegraph timing, action density and camera intensity. It states them. It does not ask.

## How it runs

```text
user: "final boss for my dark fantasy game, an undead king in a cathedral"
   │
   ▼
film-style-library   → style locked (skipped if project already has style.json)
   ▼
boss design pass     → design.md (this skill; see template below)  ← gate: approve
   ▼
film-character-sheet → boss sheet; hero sheets if heroes are named
film-prop-sheet      → boss weapon; any artefact that matters (a core, a relic)
film-location   → arena plate + spatial lock
action boards → boss 4-panel; hero abilities 4-panel (gpt-image-2)
   ▼
film-shot-prompt + film-action-combat → one prompt per phase (10–30 s each)
   ▼
film-generate-review → ×2 per phase in parallel, review by beat, lock, assemble
```

## Design template (`design.md`)

```markdown
# <Boss name>

## Identity
One sentence: who this was, what it is now, why it is here.
(A boss with a past is a boss the player feels something about when it falls.)

## Archetype
giant / assassin / caster / swarm-master / mirror  → sets default rhythm

## Arena
Name · size · 3–5 fixed landmarks · what can break · where the player can stand

## Phases

### Phase 1 — <name>  (100–66 % HP)
Normal attacks: <2–3, grounded, readable>
Signature skill: <name>
  Telegraph: <what the player sees, 0.5–1.0 s before>
  Area / target: <cone, ring, line, grab>
  Consequence if hit: <knockback, freeze, damage type>
  Counter: <specific hero ability, not "dodge">
  Cost of countering: <cooldown, position, resource>
Phase break: <what visibly changes — armour cracks, eyes shift, arena breaks>

### Phase 2 — ...
### Phase 3 — ...

## The win and its cost
What the player gets. What the world loses. (The core was also a person. The
arena is destroyed. The ally who held the line does not stand up.)

## Video plan
Phase → duration → density → camera → key frames
```

## Rules this entry enforces

- **Phases before pixels.** No boss sheet is generated until the phase table is approved. A boss designed as a picture first is a statue.
- **Signature skill ≠ normal attack.** On the action board and in every prompt, the two must be visibly different in stance, scale and light. If a viewer cannot tell which is which in one frame, redesign.
- **Every skill has a telegraph.** 0.5–1.0 s of readable wind-up. A boss that hits without warning is unfair in a game and unreadable in a video.
- **Counters are specific.** "The mage's constellation shield freezes the ring shockwave" — not "the party dodges."
- **Physics rules from `film-action-combat` apply.** Anchors, four-part strikes, causality, momentum, landmarks.
- **A cost is mandatory.** The design is rejected if the win is free.

## Related entries

- `hero-skill-system` — design the abilities that counter the boss
- `game-cutscene-generator` — the intro and the aftermath as cutscenes
- `environment-scene` — build the arena as a 3D asset
