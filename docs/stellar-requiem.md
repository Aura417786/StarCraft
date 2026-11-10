
# Blender、资源规范与验收

《星际突围》v18「裂星回响」沿用网页横向射击和原有操作。碰撞与预警继续由二维战斗系统计算，展示层使用 Blender 制作的模型、动画和水面数据。浏览器可在高、中、低画质之间切换，低档保留全部战斗规则和提示。

## 从审查到实现

| 系统 | v17 基线 | v18 实现 |
| --- | --- | --- |
| 首领与普通敌人 | 固定招式序列、半血狂暴、独立终局 | 十一套破壳后的专属连招与核心暴露窗口，敌潮新增拦截俯冲，后期王牌二次锁定预判移动 |
| 首领外观 | 分区形变的二维原画，场景物件已有网格 | 十一只本体和十一种终局有独立 Blender 网格，使用实时光照、形变动画、组织材质和同一套横向构图 |
| 水面 | Canvas 绘制波前和泡沫 | 在准确的预警轮廓内叠加 Ocean 法线、泡沫与实时水面着色，保留青色泄压带 |
| 战机与界面 | 原有机体和独立 HUD | 三架战机各有五个 Blender 姿态，保留机头射击锚点。阶段、反击、终局与击坠原因有独立提示 |
| 音频 | Web Audio 动态合成 | FluidSynth 渲染可编辑配乐，FFmpeg 混音与编码，浏览器按阶段混合声部 |
| 性能 | Canvas 与场景 WebGL 备选 | 画质预算控制模型分辨率和特效，首领只保留近期三份模型，预警期间准备资源，硬件不支持时回退至 Canvas |

## 资源生产

- **模型。** 命名使用小写英文和连字符。Blender 以米计，Z 向上、视角朝负 Y，导出 glTF 时转换为 Y 向上。每只首领的模型按材质批处理。22 份 GLB 的最大单文件小于 1.5 MB，最多约 2.3 万三角面。优先从渲染构图校对轮廓。命中盒由战斗配置管理。
- **材质。** 网格保存顶点颜色，材质包含金属度、粗糙度和发光。组织细节使用一份 Blender 烘焙的 512×512 图，分别记录颜色变化、粗糙度和微表面高度。WebGL 用三向投影读图。应将新材质控制在现有预算内。
- **动画。** Blender 动画使用 Pulse 待机呼吸、Attack 和 Unfurl 形变。游戏按蓄力、出招、破壳和核心暴露采样。对外通过 GLB 导出，模型脚本保留可重新生成的源。
- **特效。** Blender Ocean 输出 12 个模拟时刻，采样每时刻 4,225 个网格顶点，打包成 384×288 法线与泡沫图。Shader 限定在战斗几何画出的区域内。镜头推近仅在最终击破演出中使用，可关闭震动，也遵守系统的减少动态效果设置。
- **音频。** 配乐保留可编辑 MIDI 和独立的巡航、交战、压迫与终局声部。使用单独的武器、打击、首领和环境总线。完整制作说明见 [音频流水线](../tools/audio/README.md)。许可证随试玩资产分发。

## 重建

使用 [Blender 4.5 LTS](https://download.blender.org/release/Blender4.5/) 的 Windows 便携版。本版使用 4.5.14，并与官方 SHA-256 校验表核对。资产命令从项目根目录运行。把示例中的 Blender 路径换成本机路径。

```powershell
$blender = 'C:/tools/blender/blender.exe'
& $blender -b --factory-startup -t 8 --python-exit-code 1 -P tools/art/build_boss_models.py
& $blender -b --factory-startup -t 8 --python-exit-code 1 -P tools/art/bake_hadal_surface.py
& $blender -b --factory-startup -t 8 --python-exit-code 1 -P tools/art/bake_organic_material.py
```

模型命令可加 `-- --only 1 12 --review-dir C:/review`，输出渊潮母体与胚卵的可编辑 Blender 工程和预览。三架战机的命令与枪口校验见 [战机制作流程](../tools/fighter-pipeline.md)。浏览器依赖固定为 Three.js 0.180.0 和 esbuild 0.25.12。仅在需要重建第三方浏览器包时安装，随后执行 `node tools/art/build_web_renderer.mjs <依赖目录>`。试玩者直接访问网页即可。

## 软件和开源说明

- **建模、雕刻、材质、动画和模拟。** 采用 Blender 的网格、形变、PBR 和 Ocean 工具链。Houdini Apprentice 的非商业限制不适合作为可继续商业化资产的生产依赖。Substance Painter 与 ZBrush 作为可选的专用工具评估，本版用 Blender 完成了对应的实际制作。 [SideFX 许可说明](https://www.sidefx.com/faq/question/apprentice-restrictions/) · [Adobe 产品说明](https://www.adobe.com/products/substance3d/apps/painter.html)
- **引擎和部署。** 使用 Three.js 和原生网页维持离线入口、静态托管和现有游戏逻辑。UE5 的 Pixel Streaming 路线需要额外运行游戏和串流服务。现有文件体积适合 Git，资源按需加载。 [Three.js](https://threejs.org/docs/) · [Epic Pixel Streaming](https://dev.epicgames.com/documentation/unreal-engine/overview-of-pixel-streaming-in-unreal-engine)
- **音频与分析。** 使用 FluidSynth、FFmpeg 与原有 Web Audio 负责渲染、处理和实时混音。Chrome 实机和 DevTools 指标用于本版渲染和性能验证。
- **Skill。** 引入固定版本的 Scenario Blender Expert、Sculpting、Animation、Export、Lighting 与 Hard Surface，实际用于体块与轮廓检查、姿态形变、GLB 导出与 EEVEE 光照。Compose Game Music 用于分轨、音色与实时层级。v17 引入的战斗、特效和浏览器测试 Skill 继续用于可读预警和实机验证。 [Scenario 技能与许可证](https://github.com/scenario-labs/skills/tree/b96506d77c8595a4fe9c66eddb0bf9b5953a1d45/skills/dcc/blender) · [Compose Game Music](https://github.com/sora16bit/codex-game-music-skill/tree/13e5236615871573f50effd75a24a7c5b5d19271/skills/compose-game-music)

## 验收方法

1. 用电脑浏览器选高画质进入游戏。首战在约 1 分 05 秒出现。看渊潮母体破壳后如何给双向潮墙和水柱预警，躲开后打暴露核心。第一条血条耗尽后，继续击碎胚卵。
2. 换成低画质。预警、安全区、受击与清场逻辑应当相同，首领改用平面图。浏览器直接打开本地 `index.html` 时也能完整游玩，静态服务器入口启用实时模型。
3. 测试三种大招与切换英文，失败后查看结算中的击坠来源。浏览器测试可运行 `node work/model-browser-check.cjs`、`node work/boss-pressure-browser.cjs`、`node work/boss-finales-browser.cjs` 与 `node work/audio-bank-browser.cjs`。需要 Playwright，可用 `CHROME_PATH` 指向电脑的 Chrome。

## 本次实测记录

- 在 RTX 5060 Laptop、Chrome、1440×900 高画质下逐个实际渲染 22 份模型。胚卵与海啸场景的 180 次帧回调采样中，p95 为 5.7 ms，单次最大约 27.9 ms。采样期间 DevTools 记录主线程任务约 331 ms。跨首领切换后，模型缓存为 3，渲染器登记的网格几何为 8。结果适用于本机和这段场景。
- 在 1280×720、640×450、640×360 用实际方向键躲过两段潮墙。正确走位保住三命，原地停留会损失一到两命。浏览器也逐一测试了十一场终局及其结算。
- 四组固定随机种子的完整流程由脚本驾驶。三组通过全战役，战斗计时约 11 至 13 分钟，一组在合生体终局倒下。鼠标与键盘交互验收聚焦于预警和躲避等关键机制。
- Chromium 本地双击版能播放新的分轨音频，验证了静音恢复、首领音色与终局声部同步。模拟与集成检查包括 283 项战斗、80 项场景、67 项音频、25 项成长和 21 项战术检查。
