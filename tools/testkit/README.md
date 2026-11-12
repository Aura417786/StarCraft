# 固定种子平衡测试

## v33 序章交接

```powershell
node tools/testkit/campaign-opening.cjs . ../v33-tests/opening
```

Chrome 从新档打开三架战机的序章，在 QA 页面推进到片尾，核对大招画面接入实战、首局教学和键盘接管。演出的发射与正常大招共用画面，但不改变生命、分数、储能或敌机血量。夹具还检查跳过、刷新后直接开始和机库重看。只测战斗时可在地址后加 `?intro=0`，机库的重看按钮仍可使用。

## v30 回溯、进化、难度与命中反馈

```powershell
node tools/testkit/boss-retry.cjs . ../v30-tests/boss-retry
node tools/testkit/evolution-routes.cjs . ../v30-tests/evolution
node tools/testkit/battle-rewind.cjs . ../v30-tests/rewind
node tools/testkit/difficulty.cjs . ../v30-tests/difficulty
node tools/testkit/hit-feedback.cjs . ../v30-tests/hit-feedback
node tools/testkit/v30-soak.cjs . ../v30-tests/soak
```

- `boss-retry`：实际死亡、DOM/Enter 重试，核对三战机、新路线、资源、随机状态、重复重试与结算隔离；普通战/终局死亡和中英小屏均覆盖。
- `evolution-routes`：路线互斥、100 级增长、真实 F 键，66 个 Boss 爆破样本及冻结占空比，保留护壳和终局部件机制。
- `battle-rewind`：同实体图恢复、WeakMap/WeakSet 和 Boss 延迟闭包、全场对象/分数/生命、外置冷却与账户数据保护；200 秒历史与容量压力检查。
- `difficulty`：54 组同配装对照，验证相同 POWER 对应相同 HP，困难原样、简单/普通只降低频率与弹速；真实状态机统计起手间隔，并检查旧档兼容。
- `hit-feedback`：实际 Web Audio 离线输出 WAV，验证普通命中/能量重击、音量与声部预算、静音和画面反馈限制。
- `v30-soak`：三条路线各 30 秒、1920×1080 高画质、真实 RAF/按键、无声 Canvas 录屏及 HUD 截图。夹具保活并防止 Boss 提前结束，仅用于画面与短时性能观察，不能称为自然通关或长期稳定性证明。

旧版混搭、三级专精和洗点已退休，对应断言保存在 `legacy/v29-evolution-checks.txt` 供历史查阅。现行回归验证新的一局单路线规则，不能再以旧路线可混搭作为通过条件。

## v29 连携与元素绝招

v29 连携、元素绝招与实机画面新增以下入口（使用相同 `NODE_PATH` / `CHROME_PATH` 配置）：

```powershell
node tools/testkit/pressure.cjs . ../v29-pressure
node tools/testkit/pressure-preview.cjs . ../v29-preview
```

`pressure.cjs --logic` 只执行固定步长战斗和碰撞合同。完整模式还截图十只 Boss 的蓄力、技能生效和最终冲击，并记录三档画质的真实 RAF/JS 帧耗时。报告保留实际几何、原始连携日志和连续输出窗口，不调整原九场验收门槛。

`pressure-preview.cjs` 以真实浏览器时钟录制十个独立 Canvas WebM，生成可打开的预览页。可在末尾追加 `1,3,6` 只录指定 Boss。录像为关闭主炮且延长伤害保护的视觉检查，不含 DOM HUD/音频，不用于声称正常通关或性能达标。

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

测试策略以 60 Hz 驱动独立 Chrome 页面，生产战斗逻辑在每次绘制之间按 120 Hz 固定步长推进。计时页面跳过绘制和 3D 模型预热，固定随机种子，逐帧采样。实机冒烟页面使用正常运行文件和浏览器键盘输入，确认进场、移动、切换姿态、暂停和恢复，另存一张截图。

击杀时间从 Boss 本体可伤害时开始，含本体和终局的有效战斗秒数。过场暂停不计入。每个场景输出失败原因和首个受击信息，防止只看成功样本。工具用相同种子复跑第一个场景，逐字段检查再现性。Boss 自身动作固定时，三个种子可产生相同的定点成绩。自然战役的补给、编队和出怪提供种子变化。自动走位属于测试策略，独立试玩需评估手操难度和躲避可读性。

## Boss 缩放验收

```powershell
node tools/testkit/boss-scaling.cjs . ../boss-scaling-fixture.json
node tools/testkit/boss-scaling-overlay.cjs . ../boss-scaling-overlay
```

夹具使用种子 4225、赤焰、困难难度（对应 v29 老兵强度）和同一套自动驾驶，分别挑战第 1、6、10 只 Boss。低配取该关的战役武器下限，中配取下限与满级的等级中点并四舍五入，满配用 24 级伤害、11 级射速和 5 道弹道。每场从 14 条生命和零进化开始，伤害、碰撞和阶段切换照常结算。九场各复跑一次并逐字段比较。

`ttk_seconds` 来自正式战斗记录，与 `?qa=1` 的 TTK 使用同一时钟。`active_ttk_seconds` 从本体首次可受伤开始计算。`health` 记录本体和终局各自的血量。`attack_interval_seconds` 是相邻本体预警起点或相邻终局出招起点之间实测间隔的中位数，`timing` 保存原始时间和生产调度值。`contract` 检查拾取后的锁定、`k` 边界、100 次读取的纯函数行为，以及难度血量乘子。

JSON 总会保留实测 TTK 和验收结果。加 `--strict` 时，未满足规格的项目会使进程退出码为 1，已写出的 JSON 可用于定位差距。

网址追加 `?qa=1` 即可查看单行叠层。战力和倍率取入场快照，击破后显示结算记录。TEMPO 是请求倍率，实际出招间隔还受预警、活跃判定和恢复窗口限制。

所用流程来自仓库内的 [Headless Game Balance](../../.agents/skills/headless-game-balance/SKILL.md)，对应 [GitHub 固定版本](https://github.com/nitzangames/headless-game-balance/tree/0b0a759c5ad446d5d677da52721d2ce6203b503d)。可以直接用其中的统计工具读取 JSONL。

```powershell
python .agents/skills/headless-game-balance/scripts/summarize_runs.py 'D:/星际争霸/AI_Development/Metrics/balance.jsonl'
```

场景交互和精英单独复测时运行以下命令。它检查完整战役中的自然触发、近距地雷与护盾判定、可破坏掩体、引力和弹射。随后在正常渲染模式保存实机截图和 120 帧的浏览器帧间隔。

```powershell
node tools/testkit/field.cjs 'D:/星际争霸/Game' 'D:/星际争霸/AI_Development/Metrics/field'
```

v22 增加 `--release-matrix`，在原三种子样本之外，以种子 4225 跑完 11×3×3 的 Boss、战机、难度组合。实机浏览器检查通过正常输入触发功能，并另行保存截图和测量结果。

```powershell
./tools/testkit/regression.ps1 -Game . -Out ../v22-qa-output -Browser -Full
```

`-Browser` 启用 Chrome 界面、战斗、视觉、教学、存档和兼容模式测试。加上 `-Full` 还会运行完整种子矩阵。性能与 30 分钟浸泡建议单独运行，避免同时运行多套 Chrome 污染帧时间；具体入口见 `performance.cjs` 和 `soak.cjs`。

从工作台的独立测试工具目录运行时，使用 `-SkipUnit -Browser`，并用 `-Game` 指向冻结包里的 `Game`。源码单元测试由正式仓库运行。

键位、手柄和显示辅助有两个浏览器入口。界面短测覆盖键位冲突、刷新、手动开火、形状提示及模拟手柄操作。完整战役使用真实浏览器时间、生产渲染和正常初始生命值，策略只向标准手柄接口送出输入值。实际型号手柄另做人工验证。

```powershell
node tools/testkit/controls-browser.cjs . 'D:/星际争霸/AI_Development/Metrics/controls'
node tools/testkit/gamepad-campaign.cjs . 'D:/星际争霸/AI_Development/Metrics/gamepad-campaign'
```

键盘自然战役用真实浏览器时间和正常出击入口。自动驾驶策略读取战场状态，通过键盘事件移动、开盾、蓄力和发射，并点击正常的进化卡片。样本固定种子、使用新档的初始生命和改装值，保留自然出现的敌人、补给和首领。运行时间与完整战役相同。

```powershell
node tools/testkit/natural-campaign.cjs . 'D:/星际争霸/AI_Development/Metrics/natural-4225' 4225
```

首领定点验收在实际 Chrome 中逐一渲染 11 只首领，保存平静、预备和场内画面。测试实际碰撞、镜盾反弹、丝结切断等规则，同时检查预备动作确实改变模型画面。30 分钟浸泡使用浏览器实时时钟和正常战役节奏，额外保留生命以覆盖晚期资源。它每分钟记录游戏推进、资源池、场景缓存和 JS 堆。建议先关闭其他性能测试和实机战役，再测首次水潮以及三档画质帧时间。

```powershell
node tools/testkit/boss-mechanics.cjs . 'D:/星际争霸/AI_Development/Metrics/boss-mechanics'
node tools/testkit/performance.cjs . 'D:/星际争霸/AI_Development/Metrics/performance'
node tools/testkit/soak.cjs . 'D:/星际争霸/AI_Development/Metrics/soak' 30
```

## v23-rc1 专项复现

先运行上述完整回归，再按需复现专项。输出目录必须不同于历史证据目录。浏览器性能测试应串行执行，关闭其他重型测试。

```powershell
node tools/testkit/final-core.cjs . ../qa-v23/core
node tools/testkit/final-layout.cjs . ../qa-v23/layout
node tools/testkit/final-boss.cjs . ../qa-v23/boss
node tools/testkit/final-gameplay.cjs . ../qa-v23/gameplay
node tools/testkit/final-gameplay-live.cjs . ../qa-v23/ships
node tools/testkit/final-ultimate.cjs . ../qa-v23/ultimate
node tools/testkit/final-audio.cjs . ../qa-v23/audio
node tools/testkit/final-endurance.cjs . ../qa-v23/endurance 30
node tools/testkit/final-performance.cjs . ../qa-v23/performance
```

`final-core` 检查可见暂停、显式恢复、辅助成绩与双语改键提示。`final-layout` 覆盖三分辨率、两种语言、三机与界面比例。`final-boss` 使用真实 GLB 轮廓检查 132 个构图状态，并验证拆招反击窗口不无限续期。`final-gameplay` 与 `final-ultimate` 使用固定目标测量命中和伤害；它们支持与 v22 冻结目录对照，不能冒充自然战役。

`final-endurance` 使用生产时钟与绘制，新档三生命、零改装，依次选择三架战机，由读取状态的自动驾驶通过 Playwright 发送可信键盘事件。它不注入血量、胜利、敌人或加速时钟；保留失败尝试、结局和完整录屏，并对战斗停止推进设置 30 秒 watchdog。测试为避开教学重复先标记教学已读，教学本身另由 training 回归覆盖。每五分钟主动 GC，报告要注明，不能将这些堆数据当作未经干预的内存曲线。它不等价于人手自然通关。

`final-performance` 分开报告 RAF 帧间隔、JavaScript 绘制/物理步长耗时与 CDP 主线程任务时长；不声称测量了 GPU 完成时间或物理键盘到显示器延迟。`final-audio` 记录实际音频样本和客观电平，不能替代耳机试听。实体手柄、人工初见可读性与主观听感另行标注。
