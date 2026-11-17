# v35 authored audio

The 99 effects in this folder are original offline synthesized material Foley,
not field recordings. Each Boss has a pressure/tension telegraph, three separately
rendered releases, an impact and a material residue. The three fighter families
have eleven events each. No downloaded third-party effects or paid services were
used. Scripts and sound designs are supplied with the game.

Six original MIDI-rendered stems use the existing MuseScore General SoundFont
through FluidSynth 2.6.2. The original SoundFont acknowledgements and MIT license
are retained in [audio-LICENSE.md](../../audio-LICENSE.md). The SoundFont itself is
not redistributed here. FFmpeg 7.1 performs filtering, limiting, Opus encoding and
EBU R128 analysis. A copy of the MIDI is included for every new stem.

`tools/audio/render_nextgen.py` rebuilds every file from deterministic seeds and
the editable MIDI composition. `manifest.json` records duration, bytes, SHA-256,
decoded sample peak/RMS and encoded loop endpoint difference. The `.js` files
contain the same Opus bytes for local double-click playback. HTTP playback loads
individual Ogg files. Only the current Boss material family remains decoded;
music keeps its current faction and releases the preceding decoded cache.

The hangar is 84 BPM, eight bars, with two aligned stems. Flight alert follows the
existing 116 BPM sixteen-bar score. Bio (112), mechanical (124) and void (104)
danger layers share the existing thirty-two-bar chord/phrase maps. Low life and
elite pressure introduce the counterline at audio-clock beat boundaries. Boss
health still moves the three main stems through opening, pressure and finale.
The existing victory cadence remains in use.

Browser decoded loop endpoints are matched over 15 ms after Opus decoding.
Music transitions crossfade on the next audio-clock beat. Urgent skill cues are
never delayed to a musical beat. Telegraphs have a protected bus, duck music and
ordinary effects, and retain a distance floor. Other sounds retain distance
attenuation and left/right location. At most 48 active/fading voices are allowed.

Verification: run `node tools/testkit/nextgen-audio.cjs --contract-only`,
`node work/audio-check.cjs`, and `node tools/testkit/nextgen-audio-browser.cjs
<output-directory>` with Playwright and Chrome. The browser test records real
Web Audio PCM for all families, fighters and dynamic states. Captures and meters
verify rendering and signal safety; they do not substitute for human headphone
and speaker listening.
