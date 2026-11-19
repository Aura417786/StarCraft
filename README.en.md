# Star Breaker · 星际突围

**v37.0-rc.1 · Abyssal Nightmare test build.** Choose Abyssal Nightmare under Sortie Setup, then select Start Game. Easy, Normal, and Hard are also available.

Abyssal Nightmare adds enemy formations and coordinated elites. An eligible fighter costs one life when its entire hull leaves the left side of the field. Boss health locks on entry based on your fighter and current build. The final form enters a frenzy at 30% core health. Read the boss's movements, charge effects, and lit routes to evade attacks. Campaign and Boss Rush records are tracked by difficulty.


**v36.2 · Counterattack.** Breaking a shell gives the boss a chance to unleash its signature attack. Slip between the closing claws, pick the marked reflection, or counter when the electric ring discharges. All three fighters deal less ultimate damage to bosses. Encounter health locks to the loadout you bring in.

**v36.1 · Apex Mimicry.** Choose the third evolution to cast your last defeated boss's ultimate with **F**. Carry Hadal Confluence into the next fight or unleash the Stargrave Sovereign's Lightless Collapse. Your imprint changes on each boss kill. All three fighters share their restored swept-wing, twin-engine silhouettes across and battle.


**v36 · Rift Echoes.** Watch Crimson's coils build pressure, follow Azure's discharge from mark to mark, or catch a strike on Auric's segmented shield. Each of the eleven bosses answers a broken shell with a different organ attack and musical motif. Read the tell and attack during its recovery.

During Lightless Collapse, violet streams fold into a dark core that eclipses the starfield. Watch the countdown and shield cue when a boss seals the arena. Other attacks show their reach through dissipating spray, molten fissures and arcs.

**High-refresh rendering and dense combat optimizations.** Interpolated ship and projectile positions follow the display refresh while combat uses a fixed simulation step. Pooled combat objects and cached glow reduce repeated work in dense battles.

**High-resolution hangar fighters.** View Crimson, Azure and Auric at an angle to see the recessed barrels, armor seams and canopy reflections in fullscreen.

**Hangar navigation fix.** Refits, Campaign Archive and Badge Wall open in both windowed and fullscreen play.

**Fighter exhaust.** A compact hot plume stays on at normal thrust. In Overdrive or during an ultimate, the core extends into a turbulent plasma trail that sheds bright sparks.

**New fighters and ultimate hit feedback.** Crimson carries a centerline cannon, Azure has twin forward prongs, and Auric has swept wings with paired gun arrays. Ion Swarm torpedoes leave blue-violet vapor trails, while Crimson Beam carries a hot core in turbulent orange plasma. The first boss hit from each ultimate pauses combat for 50 ms and sends light and fragments out from the contact point. Reduced motion keeps the softer local hit cue.

**Nitrous boost.** Hold Shift for 38% faster directional movement and a blue-white exhaust plume. Release to coast at normal speed. Tap Shift to switch between spread and focused fire.

**v35.5 Ten boss redesigns.** The Broodmother contracts its mantle when gathering the tide. The Marrow Stalker hinges its rib cage, the Rift Weaver draws threads with its legs, and the Pulse Binder closes its claws in sequence. Mirror Ray folds its fins, Thunder Wyrm passes current down its spine, and Spore Regent exhales through expanding sacs. The Dimensional Maw curls into its aperture, Neural King fires along its branches, and the Confluence uses three distinct organs for siphon, lance and burst.

**v35.4 Cinder Maw redesign.** Overlapping basalt plates frame a hinged jaw and a recessed furnace. The Cinder Rift erupts in sections, sends molten rock through the fractures, then cools as the embers disperse.

**v35.3 Cinematic UI.** Floating ability dials and edge-aligned readouts keep the battlefield open, while slender boss health tracks and timed cues mark threats. The hangar adds a fighter radar and revised refit, progress and sortie reports. Display, audio, controls and accessibility each have a settings tab, with separate master, music and effects levels.

**v35.2 Boss effects update.** All eleven bosses have refreshed signature attacks and ultimates. Look for foaming tides, curved ribs, veined chitin, holographic decoys, prism flares and branching neural arcs. Layered beams and particles follow the original attack geometry, and illuminated edges mark escape corridors.

**v35.1 Black-hole visual fix.** The Dimensional Maw's gravity field now has a dark horizon, a blue inner rim and detailed violet accretion flow. Inner and outer strands rotate at different speeds. Rift warnings remain visible, shockwave safe openings stay clear, and low quality retains the complete black-hole artwork.

**v35 Elemental encounters.** Eleven bosses coordinate setup, interception and pursuit, with stronger enraged chains and distinct finales. Bosses no longer maintain a generic orb lattice. Vortices, closing bone cages, magma cover, mirrors and neural relays demand different responses. Environmental hits do not refund a shield. The finisher's warning locks its response: reserve a shield if stocked, or follow the announced passage when empty or shields are disabled. No emergency shield is supplied.

Blender-authored water, magma and singularity animation joins geometry-aligned surfaces and refraction. Crimson's piercing cannon, Azure's tracking arcs and Auric's coverage field have separate effects and sound palettes. Elemental boss voices and music layers respond to elites, low life and encounter phase. [Design and verification](docs/nextgen-v35-plan.md)

**v34 Hangar main menu.** Start Game launches with the displayed fighter and difficulty. Sortie Setup lets you change both. Records & Refits holds refits, the campaign archive, and badges. The Flight Manual holds the guide. Use Settings for sound, graphics, language, and fullscreen.


**v32 Battlefield lighting.** Key light and ambient bounce change as you fly through the five sectors. Charged weapons, shields and explosions cast brief pools of light on nearby ships and aliens. Try the mirror boss in single-boss practice to see its cyan and violet beams, from the charge to the fading aftershock.

**v31 Alien arrivals and combat effects.** Each of the eleven bosses has an individual roar and a distinct entrance built from light and particles. Starfields, engine wakes, shots, shields, evolution skills, ultimate attacks and detonations now share the same real-time effects treatment. Use single-boss practice to preview the different encounters. [Effects and checks](docs/v31-vfx.md)

**v30.1 Perfect Guard and impact audio.** Press **V** as a projectile approaches. Blocking it within 0.25 seconds counterattacks and refunds the shield use. Gunfire is quieter, hits on enemy fighters crack like small blasts, and boss hits land with louder, deeper thuds before the final explosion.

**v30: combat feedback and exclusive evolutions.** Shell cracks, low impacts and localized ripples distinguish ordinary hits from energy bursts. Heavy hits add a brief pause and directional camera kick. Easy, Normal and Hard change hostile attack frequency and projectile speed; boss durability follows your power at entrance. Commit to **Heartfire Detonation**, **Absolute Blizzard** or **Temporal Recall**, then level that route with subsequent boss victories without a rank cap. Press **F** for its skill. Space specials and V shields remain available. [Mechanics and checks](docs/v30-combat-evolution.md)

**v30: retry the current boss.** If you die during a boss fight, choose **Retry this boss** to return to its entrance with the same fighter, equipment, evolution, lives and stored skill energy. Combo and battle time also rewind. Dying in a finale restarts the whole boss encounter. The checkpoint exists only for this run in the current page; refreshing or closing the page clears it. Retried runs can still earn new Campaign boss unlocks and merit, but do not record scores or award speed, no-hit or other achievements. [Rules and manual checks](docs/v30-boss-retry.md)

**Authored boss chains and elemental ultimates.** Ten aliens each have two linked assaults and a signature ultimate. A wave opening becomes a vortex, shelter from magma becomes a backdraft trap, and mirrors, webs, spores and neural circuits demand different responses. Shield through the announced arena finisher and attack as its shell breaks. No-shield challenges preserve a marked passage.

Pick a fighter, cross five sectors, and survive eleven alien boss finales. Star Breaker is a single-player, side-scrolling shooter for desktop browsers. **v24** compresses all 22 boss and finale models and loads battle scenery and faction music as the campaign progresses. Break a weak point, recognize the gold counter window, and commit your fire. Crimson rewards a fully charged shot, Azure chains marks, and Auric uses close-range suppression fields.

[Public browser demo](https://star-breaker-aura-261107.huafeihua560.chatgpt.site/) · [Play on itch.io](https://aura417786.itch.io/star-breaker) · [Previous trailer](media/trailer.mp4) · [中文说明](README.md)

Public demos may run different versions. Open the game over HTTP to enable its WebGL boss models.

- **Three fighters, three ways to aim.** Crimson holds and releases C for a piercing cannon. Azure builds marks and discharges them in a three-hit chain. Auric earns suppression fields by managing charge and distance. Each ship has a different special.
- **Commit to one evolution.** Heartfire builds marks to detonate. Absolute Blizzard freezes hostiles while you can keep attacking. Apex Mimicry releases the last defeated boss's ultimate. You cannot change routes, but later victories keep raising its level. Campaign merit still buys persistent refits.
- **Use the terrain.** Break rocks to send fragments through enemy formations, take cover behind destructible wrecks, and steer against the gravity tide. Watch for mines, shield escorts, and splitters.
- **Read the fight.** Follow three radio perspectives through eleven finales. Adaptive music tracks the fight. Fly through the gate, light all eleven waypoints, and read your final report. Return for Weekly Rush, badges, and hangar cosmetics; retired badges remain in your legacy collection.

## Quick start

Choose **English** under **Settings**. The guide opens on your first visit and can be reopened via **Flight Manual → How to Play**. Pick a fighter in Sortie Setup. Your main gun fires automatically by default. The first campaign offers a skippable training sequence for shielding, specials, and evolution.

| Key | Action |
| --- | --- |
| Arrow keys or WASD | Move and aim |
| Shift | Tap to switch fire modes. Hold to boost. |
| C | Hold and release Crimson’s charged primary |
| J | Fire if autofire is disabled |
| F | Use the selected evolution skill |
| Space | Use your fighter's stored special |
| V | Shield for two seconds. A Perfect Guard refunds the shield use. |
| Esc | Pause |

Shoot blue orbs for fire rate, yellow for firing lanes, and red for damage. Rare green orbs restore life, or raise your life capacity if you're full. Firepower has ceilings; use the gaps in each boss's attack cycle to sustain damage.

After a boss-fight death, **Retry this boss** restores that encounter's original checkpoint. Repeated retries use the same checkpoint; the next boss creates a new one. **Restart** still starts a new run. The retry button is absent after victory or a death between bosses. Campaign, Boss Rush, Practice, Daily Challenge and Weekly Rush support retries; a retried run is unranked in every mode.


[Share playtest feedback](https://github.com/Aura417786/StarCraft/issues/new?title=Star%20Breaker%20playtest%20feedback) · [Fullscreen bug comparison](media/fullscreen-compare.mp4)

Settings include remappable keys, standard gamepad support, interface scale, subtitle size, and patterned hazard outlines. Progress and preferences are saved in this browser. See the [release and save notes](docs/release-v23-rc1.md).

The game uses HTML, CSS, JavaScript, Canvas, Three.js, and Web Audio. Serve the folder over local HTTP for live 3D rendering. Opening `index.html` directly also works with the compatible renderer.

Switching windows now opens a pause menu; confirm Resume when you return. Reduced motion and shake settings keep normal score eligibility. Extended attack warnings put a run in assisted records; death-screen boss retries stop score recording for that run. Historical saves are preserved.

[v35 implementation, verification and limitations (Chinese)](docs/v35-nextgen-release.md).
