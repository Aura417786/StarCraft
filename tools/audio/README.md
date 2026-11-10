# 《星际突围》音频制作

配乐与音效可从可编辑乐谱和音频设计参数重建。配乐的上行三度在巡航时由电钢琴提出，长笛应答。进入 Boss 战后，低弦以 3+3+2 重音接手，同一动机由铜管、合唱和半音低音重组。终局再引入断续弦乐与钟声，保留相同的乐句位置。

| 配乐 | 作法 | 循环 |
| --- | --- | --- |
| 巡航和声、巡航节拍 | 暖音垫、电钢琴、长笛，配模拟低音与拨弦。连击或暴走会逐步提亮节拍声部 | 116 BPM，16 小节，约 33.103 秒 |
| Boss 和声、压迫节拍、终局声部 | 低弦、铜管、合唱、定音鼓和终局钟声。出招、低生命、狂暴与终局改变各轨的音量 | 132 BPM，16 小节，约 29.091 秒 |
| 舱内底噪 | 低频振动与立体声气流，Boss 战时降低 | 8 秒 |

每只异形有独立的节奏、音程、乐器和材质声。渊潮是下潜的圆号和水压气流，星尘镜魟是钢片琴的反射回响，维度噬口是反向吸入的低音管风琴。与敌方开火、大招、破壳和爆炸重叠时，音乐会短暂降低。普通枪声、击中和重大事件有独立的播放间隔，控制高密度火力下的声部数。

## 重建

使用 Python 与 NumPy、[FluidSynth 2.6.2](https://github.com/FluidSynth/fluidsynth/releases/tag/v2.6.2)、[FFmpeg](https://ffmpeg.org/download.html) 和 [MuseScore General SF3](https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/)。已用 FFmpeg 7.1-essentials 验证。MuseScore General SF3 的制作副本 SHA-256 为 `5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3`。音色库的署名和许可见 [随游戏分发的说明](../../assets/audio-LICENSE.md)。

```powershell
python tools/audio/render_bank.py --synth "C:/tools/fluidsynth/bin/fluidsynth.exe" --soundfont "C:/tools/MuseScore_General.sf3" --ffmpeg "C:/tools/ffmpeg/bin/ffmpeg.exe" --work "C:/tools/star-breaker-audio"
```

脚本写出五份标准 MIDI，以及由 FluidSynth 渲染的三轮乐句。从中间截取循环以保留前一轮的混响尾音。FFmpeg 对音频进行均衡、限制峰值和 Opus 编码。编辑 `render_bank.py` 中的音符、乐器和事件参数可重新生成浏览器音频库。也可将 `scores` 下的 MIDI 导入支持标准 MIDI 的音序器查看和编辑。

浏览器在第一次玩家操作后分批解码音频，配乐声部以同一时间起播。静音或窗口暂停时保存进度。网络与本地双击版使用同一音频库。在浏览器缺少解码能力时，原有 Web Audio 合成负责配乐与关键事件。开源 [Compose Game Music Skill](https://github.com/sora16bit/codex-game-music-skill/blob/13e5236615871573f50effd75a24a7c5b5d19271/skills/compose-game-music/SKILL.md) 用于分轨方案、乐句连续性与战斗中的声音优先级。

## 验证

`node work/audio-check.cjs` 运行原有合成回退、重叠声音和暂停检查。安装 Playwright 后用 `node work/audio-bank-browser.cjs` 启动本地文件版，检查实际解码、同刻启动的声部、输出信号、终局混音和静音恢复。可通过 `CHROME_PATH` 指向本机 Chrome。

Chromium 实测以 32 kHz 混音，全部音频解码后的 PCM 数据约 46 MiB。测试确认了十一种首领入场音、终局新增声部、循环接缝和静音前后播放位置。Opus 解码产物的最高采样峰值约为 0.851（满幅为 1）。
