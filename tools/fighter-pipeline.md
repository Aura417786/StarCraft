# 战机模型和浏览器图集

`author-fighters.py` 在 Blender 中创建三架战机的封闭曲面机身、翼梁、装甲、发动机喷口和 PBR 材质，并从正交游戏镜头渲染五张侧倾图。Blender 脚本是可重新运行和编辑的资产源，游戏只需要生成的 WebP 图集与锚点数据。

| 代号 | 模型识别特征 |
| --- | --- |
| `red` | 赤焰的红色流线机身、低轮廓驾驶舱和青白色双喷口 |
| `blue` | 苍电的窄翼和独立感应翼尖，强调快速机动 |
| `yellow` | 曜金的宽翼和翼内弹仓，强调覆盖火力 |

资产朝游戏右侧，Blender 的 `+X` 是机头方向，五个画面之间只绕飞行轴侧倾。浏览器采用五张固定视图和少量角度插值。每张图记录相机投影的机鼻、喷口与受光点，机鼻和主炮在五个姿态都共用同一个屏幕锚点。它们仅用于绘制，碰撞继续使用原来的二维规则。低画质、图集加载中和加载失败时使用已有战机图像。

在项目根目录执行以下命令。`blender` 是 Blender 4.5 LTS 或更高版本的可执行文件，打包脚本使用 Pillow。

```powershell
blender --background --factory-startup --python-exit-code 1 --python tools/author-fighters.py -- work/fighter-render
python tools/pack-fighter-atlas.py work/fighter-render .
```

可以在第一条命令末尾加 `--preview`，用三个中立姿态低分辨率图检查轮廓、材质和照明。正式图集需要完整运行五个姿态。遇到无法启动 EEVEE 的设备可追加 `--cycles` 走 CPU 渲染。打包会检查透明留边、机头坐标与画面边缘的偏差，再写入 `assets/fighters/atlas/` 和 `fighter-atlas-data.js`。临时 PNG 供评审使用，不随游戏发布。

浏览器测试可用 `node work/visual-qa.cjs` 运行，已安装系统 Chrome 时可设置 `CHROME_PATH`。可选命令行参数是截图输出目录。可切换高、中、低画质以验证图集与原画回退。
