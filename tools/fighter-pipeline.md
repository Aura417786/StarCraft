# 战机模型和浏览器图集

`render-kestrel-atlases.py` 读取定稿的 Blender 模型，从游戏的正交机位为每架战机渲染五张侧倾图。游戏使用导出的 WebP 图集、透明机库图和锚点数据。

| 代号 | 模型识别特征 |
| --- | --- |
| `red` | 赤焰以短叉翼和中轴重炮突出舰首 |
| `blue` | 苍电使用淡蔚蓝长双叉和低轮廓座舱 |
| `yellow` | 曜金以金黄宽翼和两组三联炮突出覆盖火力 |

资产朝游戏右侧，Blender 的 `+X` 是机头方向，五个画面之间只绕飞行轴侧倾。每张图记录相机投影的中轴炮口、尾部喷口与受光点。战斗用原有的主炮坐标作为炮口锚点，推进尾焰跟随当前姿态的喷口。正中姿态另存为透明图，供机库、序章和低画质使用。碰撞使用原有的二维判定。

在项目根目录执行以下命令。`work/kestrel-models` 应包含定稿的 `kestrel-crimson.blend`、`kestrel-azure.blend` 和 `kestrel-auric.blend`。渲染使用 Blender 4.5 LTS，打包使用 Pillow。

```powershell
blender --background --factory-startup --python-exit-code 1 --python tools/render-kestrel-atlases.py -- work/kestrel-models work/fighter-render
python tools/pack-fighter-atlas.py work/fighter-render . --kestrel
```

可以在第一条命令末尾加 `--cpu` 选择 Cycles CPU 渲染。打包会检查透明留边以及中轴炮口是否与可见机体对齐，然后写入 `assets/fighters/atlas/`、`assets/fighters/kestrel/` 和 `fighter-atlas-data.js`。

打开游戏后可在出击配置中切换三架战机。分别用高、中、低画质出击，检查向上和向下移动时的侧倾、机头弹道和加速尾焰。通用浏览器测试见 [测试工具说明](testkit/README.md)。
