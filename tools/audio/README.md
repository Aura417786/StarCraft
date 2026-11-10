# 《星际突围》音频制作

游戏的乐谱、声音设计参数和混音可以重建。巡航仍使用电钢琴提出上行三度，长笛应答。每只 Boss 的入场、破壳、技能和死亡采用独立的材质声与音程。

| 配乐 | 作法 | 时长 |
| --- | --- | --- |
| 巡航 | 暖音垫、电钢琴、长笛、模拟低音与拨弦。连击和暴走逐步提亮节拍 | 116 BPM，16 小节，33.103 秒循环 |
| 机械阵营《Iron Meridian》 | D 小调中插入三全音和低半音，铜管与模拟低音以 3+3+2 交接，终局转为较高的弦与金属打击 | 124 BPM，32 小节，61.935 秒循环 |
| 生物阵营《Hadal Heart》 | E 小调大提琴与低弦呼吸，圆号和鼓按不对称间距应答，终局加入合唱和钟声 | 112 BPM，32 小节，68.571 秒循环 |
| 虚空阵营《Event Horizon Choir》 | 降 D 的低管风琴与钟琴以小二度和三全音交错，半拍后突然回声，终局抬高声区 | 104 BPM，32 小节，73.846 秒循环 |
| 结局《Stargate》 | 圆号接回巡航动机，竖琴与大提琴交替，最后以大三度落到星门 | 128 BPM，8 小节，15 秒一次播放 |

机械主题用于灼核吞星兽、锁脉巨螯、星尘镜魟。生物主题用于渊潮母体、骨冠猎兽、沉渊震鳗、裂梦孢皇。虚空主题用于裂隙织母、维度噬口、无昼神经王、群渊合生体。

每套 32 小节沿 A / B / A′ / B′ 排列，每段 8 小节。机械在 B 段加入钢片音和反拍鼓，生物用长笛倒序回答并放松低音，虚空把原动机交给偏左的合成唱腔和钟片。B 段更换配器、节奏和和弦顺序，以原曲的回归和弦衔接下一段。三个分轨共享小节、采样长度和起播点，较长 Boss 战不会增加并行播放的轨道数。

Boss 生命降至 66% 或 33% 时，下一半拍开始交叉淡化，终局形态直接切到第三档。技能的低频冲击仍保留，主预警和招式音触发 0.15 秒音乐压低，较强的入场或死亡提示保有优先级。警告及解体期间压低仍在运行的音乐，进入新阵营或返航时交叠淡入淡出。技能按世界横坐标在 ±0.6 之间定位，爆炸根据战机到声源距离衰减，Boss 解体保留最低可听响度。暂停降低音乐和音效，静音保留播放位置。主音量独立保存在浏览器中。

## 重建

使用 Python 与 NumPy、[FluidSynth 2.6.2](https://github.com/FluidSynth/fluidsynth/releases/tag/v2.6.2)、[FFmpeg](https://ffmpeg.org/download.html) 和 [MuseScore General SF3](https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/)。制作环境为 FFmpeg 7.1-essentials，音色库 SHA-256 为 `5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3`。乐谱为原创，随游戏附上[音色库来源和许可证](../../assets/audio-LICENSE.md)。

```powershell
python tools/audio/render_bank.py --synth "C:/tools/fluidsynth/bin/fluidsynth.exe" --soundfont "C:/tools/MuseScore_General.sf3" --ffmpeg "C:/tools/ffmpeg/bin/ffmpeg.exe" --work "C:/tools/star-breaker-audio/base"
python tools/audio/render_factions.py --synth "C:/tools/fluidsynth/bin/fluidsynth.exe" --soundfont "C:/tools/MuseScore_General.sf3" --ffmpeg "C:/tools/ffmpeg/bin/ffmpeg.exe" --work "C:/tools/star-breaker-audio/factions"
```

两套脚本输出可编辑的 MIDI。循环轨连续渲染三次，保留中间一轮和边界处的混响，用短窗衔接后交给 FFmpeg 做均衡、限幅和 Opus 编码。资源内嵌在 JavaScript 中，双击 `index.html` 和在线版均可解码。浏览器在首次解锁声音和预警时提前逐层解码，缓存只常驻一套阵营音乐。切换期间旧声源只存活至淡出结束，合成音频在解码不可用时接替战斗配乐。

分轨创作使用 [Compose Game Music](https://github.com/sora16bit/codex-game-music-skill/blob/13e5236615871573f50effd75a24a7c5b5d19271/skills/compose-game-music/SKILL.md) 的动机变形、分句与打击优先级。混音和验证按 [Audio Design](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/dcf3bbbb83f365632402c086bf595048aa24aaa8/skills/disciplines/audio-design/SKILL.md) 的同一时间轴、分组增益、短时压低音乐与真实输出采样做了调整。

## 验证

`node work/audio-check.cjs` 检查回退合成、声音并发与暂停。安装 Playwright 后运行 `node work/audio-bank-browser.cjs <证据目录>`，实际打开双击版，记录两声道 PCM、各层起播时间、HP 阈值、循环接缝、左右声像、爆炸远近、暂停与结局恢复。`CHROME_PATH` 可指定本机 Chrome。
