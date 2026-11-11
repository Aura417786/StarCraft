# Star Breaker · 星际突围

Pick a fighter, cross five sectors, and survive eleven alien boss finales. Star Breaker is a single-player, side-scrolling shooter for desktop browsers. **v24** compresses all 22 boss and finale models and loads battle scenery and faction music as the campaign progresses. Break a weak point, recognize the gold counter window, and commit your fire. Crimson rewards a fully charged shot, Azure chains marks, and Auric uses close-range suppression fields.

[Public browser demo](https://star-breaker-aura-261107.huafeihua560.chatgpt.site/) · [Play on itch.io](https://aura417786.itch.io/star-breaker) · [Previous trailer](media/trailer.mp4) · [中文说明](README.md)

Public demos may run different versions. Open the game over HTTP to enable its WebGL boss models.

- **Three fighters, three ways to aim.** Crimson holds and releases C for a piercing cannon. Azure builds marks and discharges them in a three-hit chain. Auric earns suppression fields by managing charge and distance. Each ship has a different special.
- **Evolve during a run.** Mix Wing Blades, a Falcon Wingman, and a return-fire shield. Only one branch can reach its final rank. Campaign merit buys persistent refits; practice and daily runs use fixed equipment.
- **Use the terrain.** Break rocks to send fragments through enemy formations, take cover behind destructible wrecks, and steer against the gravity tide. Watch for mines, shield escorts, and splitters.
- **Read the fight.** Follow three radio perspectives through eleven finales. Adaptive music tracks the fight. Fly through the gate, light all eleven waypoints, and read your final report. Weekly Rush and 38 badges give you reasons to return.

## Quick start

Choose **English** on the main menu. The guide opens on your first visit and can be reopened via **How to Play**. Pick a fighter and a mode. Your main gun fires automatically by default. The first campaign offers a skippable training sequence for shielding, specials, and evolution.

| Key | Action |
| --- | --- |
| Arrow keys or WASD | Move and aim |
| Shift | Switch fire modes; hold and release for Wing Blades III |
| C | Hold and release Crimson’s charged primary |
| J | Fire if autofire is disabled |
| F | Command an upgraded Falcon Wingman |
| Space | Use your fighter's stored special |
| V | Shield for two seconds; activate close to a projectile for a perfect block |
| Esc | Pause |

Shoot blue orbs for fire rate, yellow for firing lanes, and red for damage. Rare green orbs restore life, or raise your life capacity if you're full. Firepower has ceilings; use the gaps in each boss's attack cycle to sustain damage.

[Share playtest feedback](https://github.com/Aura417786/StarCraft/issues/new?title=Star%20Breaker%20playtest%20feedback) · [Fullscreen bug comparison](media/fullscreen-compare.mp4)

Settings include remappable keys, standard gamepad support, interface scale, subtitle size, and patterned hazard outlines. Progress and preferences are saved in this browser. See the [release and save notes](docs/release-v23-rc1.md).

The game uses HTML, CSS, JavaScript, Canvas, Three.js, and Web Audio. Serve the folder over local HTTP for live 3D rendering. Opening `index.html` directly also works with the compatible renderer.

Switching windows now opens a pause menu; confirm Resume when you return. Reduced motion and shake settings keep normal score eligibility. Only extended attack warnings use assisted records; historical saves are preserved.
