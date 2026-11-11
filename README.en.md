# Star Breaker · 星际突围

**v30: combat feedback and exclusive evolutions.** Shell cracks, low impacts and localized ripples distinguish ordinary hits from energy bursts. Heavy hits add a brief pause and directional camera kick. Easy, Normal and Hard change hostile attack frequency and projectile speed; boss durability follows your power at entrance. Commit to **Heartfire Detonation**, **Absolute Blizzard** or **Temporal Recall**, then level that route with subsequent boss victories without a rank cap. Press **F** for its skill. Space specials and V shields remain available. [Mechanics and checks](docs/v30-combat-evolution.md)

**v30: retry the current boss.** If you die during a boss fight, choose **Retry this boss** to return to its entrance with the same fighter, equipment, evolution, lives and stored skill energy. Combo and battle time also rewind. Dying in a finale restarts the whole boss encounter. The checkpoint exists only for this run in the current page; refreshing or closing the page clears it. Retried runs can still earn new Campaign boss unlocks and merit, but do not record scores or award speed, no-hit or other achievements. [Rules and manual checks](docs/v30-boss-retry.md)

**Authored boss chains and elemental ultimates.** Ten aliens each have two linked assaults and a signature ultimate. A wave opening becomes a vortex, shelter from magma becomes a backdraft trap, and mirrors, webs, spores and neural circuits demand different responses. Shield through the announced arena finisher and attack as its shell breaks. No-shield challenges preserve a marked passage.

Pick a fighter, cross five sectors, and survive eleven alien boss finales. Star Breaker is a single-player, side-scrolling shooter for desktop browsers. **v24** compresses all 22 boss and finale models and loads battle scenery and faction music as the campaign progresses. Break a weak point, recognize the gold counter window, and commit your fire. Crimson rewards a fully charged shot, Azure chains marks, and Auric uses close-range suppression fields.

[Public browser demo](https://star-breaker-aura-261107.huafeihua560.chatgpt.site/) · [Play on itch.io](https://aura417786.itch.io/star-breaker) · [Previous trailer](media/trailer.mp4) · [中文说明](README.md)

Public demos may run different versions. Open the game over HTTP to enable its WebGL boss models.

- **Three fighters, three ways to aim.** Crimson holds and releases C for a piercing cannon. Azure builds marks and discharges them in a three-hit chain. Auric earns suppression fields by managing charge and distance. Each ship has a different special.
- **Commit to one evolution.** Heartfire builds marks to detonate. Absolute Blizzard freezes hostiles while you can keep attacking. Temporal Recall returns to an earlier moment in this phase; recorded hits remain, and using it marks the run assisted. You cannot change routes, but later victories keep raising its level. Campaign merit still buys persistent refits.
- **Use the terrain.** Break rocks to send fragments through enemy formations, take cover behind destructible wrecks, and steer against the gravity tide. Watch for mines, shield escorts, and splitters.
- **Read the fight.** Follow three radio perspectives through eleven finales. Adaptive music tracks the fight. Fly through the gate, light all eleven waypoints, and read your final report. Return for Weekly Rush, badges, and hangar cosmetics; retired badges remain in your legacy collection.

## Quick start

Choose **English** on the main menu. The guide opens on your first visit and can be reopened via **How to Play**. Pick a fighter and a mode. Your main gun fires automatically by default. The first campaign offers a skippable training sequence for shielding, specials, and evolution.

| Key | Action |
| --- | --- |
| Arrow keys or WASD | Move and aim |
| Shift | Switch spread and focused fire |
| C | Hold and release Crimson’s charged primary |
| J | Fire if autofire is disabled |
| F | Use the selected evolution skill |
| Space | Use your fighter's stored special |
| V | Shield for two seconds; activate close to a projectile for a perfect block |
| Esc | Pause |

Shoot blue orbs for fire rate, yellow for firing lanes, and red for damage. Rare green orbs restore life, or raise your life capacity if you're full. Firepower has ceilings; use the gaps in each boss's attack cycle to sustain damage.

After a boss-fight death, **Retry this boss** restores that encounter's original checkpoint. Repeated retries use the same checkpoint; the next boss creates a new one. **Restart** still starts a new run. The retry button is absent after victory or a death between bosses. Campaign, Boss Rush, Practice, Daily Challenge and Weekly Rush support retries; a retried run is unranked in every mode.

**Two different rewinds:** Temporal Recall is an F-key skill used while alive. It stays within the current combat phase, cannot cross boss transformations or rewards, and uses assisted records without erasing prior hits. The death-screen retry restarts the whole boss encounter and stops score and achievement recording for that run. Neither provides a save you can resume after closing the page.

[Share playtest feedback](https://github.com/Aura417786/StarCraft/issues/new?title=Star%20Breaker%20playtest%20feedback) · [Fullscreen bug comparison](media/fullscreen-compare.mp4)

Settings include remappable keys, standard gamepad support, interface scale, subtitle size, and patterned hazard outlines. Progress and preferences are saved in this browser. See the [release and save notes](docs/release-v23-rc1.md).

The game uses HTML, CSS, JavaScript, Canvas, Three.js, and Web Audio. Serve the folder over local HTTP for live 3D rendering. Opening `index.html` directly also works with the compatible renderer.

Switching windows now opens a pause menu; confirm Resume when you return. Reduced motion and shake settings keep normal score eligibility. Extended attack warnings or using Temporal Recall put a run in assisted records; death-screen boss retries stop score recording for that run. Historical saves are preserved.
