# 固定种子平衡测试

此工具扩展原有 `.testkit` 的单场景观察。它可从源码或从任意已解压的 `Game` 目录运行，结果写入指定文件。游戏目录可以保持只读。

使用 Node.js、Playwright 和 Chrome。在当前机器没有 Playwright 时，先在单独的测试目录安装它，或者用 `NODE_PATH` 指向已有的 Playwright 目录。若没有 Playwright 自带的 Chromium，设置 `CHROME_PATH` 指向 Chrome 可执行文件。

```powershell
node tools/testkit/balance.cjs 'D:/星际争霸/Game' 'D:/星际争霸/AI_Development/Metrics/balance.json' --strict
```

- `--quick` 选择首领 1、3 及灼核三架战机短测。每组仍然使用三个固定种子。
- `--cases timing-,campaign-,rush` 选择匹配前缀的用例。
- `--trace` 记录前 240 个决策的动作、估计危险、血量和随机取值次数。
- `--no-live` 跳过真实键盘和截图冒烟检查。性能数据需用正常渲染模式独立采样。
- `--strict` 将伤害、攻速、弹道硬上限的违例标记为失败。不同战机耗时和胜率属于分析结果。

完整矩阵覆盖 11 只 Boss、四个同 Boss 机型对照、三条进化路线、深渊站桩压力、极端增益、三架战机自然战役和 11 关 Boss Rush。JSON 保留所有原始场次和每组统计，JSONL 可供单独分析。初始装备组以实际生命值验证生存。标记为 `timing` 的夹具增加到 14 条生命，用于测量完整击杀时间，正常伤害与受击照常结算。普通定点和计时夹具固定武器成长档位。自然战役和 Rush 走正常奖励、成长和模式状态。

测试策略使用 60 Hz 固定战斗步长，由独立 Chrome 页面执行原版战斗帧和输入处理。计时页面跳过绘制和 3D 模型预热，固定随机种子，逐帧采样。实机冒烟页面使用正常运行文件和浏览器键盘输入，确认进场、移动、切换姿态、暂停和恢复，另存一张截图。

击杀时间从 Boss 本体可伤害时开始，含本体和终局的有效战斗秒数。过场暂停不计入。每个场景输出失败原因和首个受击信息，防止只看成功样本。工具用相同种子复跑第一个场景，逐字段检查再现性。Boss 自身动作固定时，三个种子可产生相同的定点成绩。自然战役的补给、编队和出怪提供种子变化。自动走位属于测试策略，独立试玩需评估手操难度和躲避可读性。

所用流程来自仓库内的 [Headless Game Balance](../../.agents/skills/headless-game-balance/SKILL.md)，对应 [GitHub 固定版本](https://github.com/nitzangames/headless-game-balance/tree/0b0a759c5ad446d5d677da52721d2ce6203b503d)。可以直接用其中的统计工具读取 JSONL。

```powershell
python .agents/skills/headless-game-balance/scripts/summarize_runs.py 'D:/星际争霸/AI_Development/Metrics/balance.jsonl'
```

场景交互和精英单独复测时运行以下命令。它检查完整战役中的自然触发、近距地雷与护盾判定、可破坏掩体、引力和弹射。随后在正常渲染模式保存实机截图和 120 帧的浏览器帧间隔。

```powershell
node tools/testkit/field.cjs 'D:/星际争霸/Game' 'D:/星际争霸/AI_Development/Metrics/field'
```
