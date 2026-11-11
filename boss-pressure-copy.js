"use strict";

const bossUltimateKinds = ["tideWalls", "boneNova", "magmaRift", "silkCage", "pincer", "mirrorArray", "stormRing", "sporeBloom", "voidCollapse", "neuralGrid", "fusion"];

// Actionable bilingual cues, kept beside the encounter data rather than in VFX.
const bossComboHints = {
  "wave-vortex": ["穿过浪墙缺口，立即脱离缺口内的漩涡", "Cross the wave gap, then thrust out of the vortex inside it"],
  "vortex-ring": ["先逆流脱离涡心，再避开扩散水环", "Escape the undertow, then clear the expanding pressure ring"],
  "cage-bonefall": ["从骨笼开口脱身，再离开落骨标记", "Exit the rib gap, then leave the crownfall marker"],
  "bone-ring-filament": ["退出合拢骨环，再跨过斜向骨矛", "Leave the closing jaw, then cross away from the diagonal spear"],
  "cover-eruption": ["先借石脊挡热浪，再离开背面的喷发点", "Block the heat with the crust, then leave the eruption behind it"],
  "furnace-ring": ["离开高炉喷流，绕开随后爆开的熔环", "Clear the furnace plume, then skirt the molten detonation"],
  "loom-bind": ["切断丝结解除减速，再穿出收紧的丝环", "Cut a knot to shed the slow, then escape the closing silk ring"],
  "silk-cross": ["穿过第一根丝线，再变向避开反向剪切", "Cross the first strand, then turn away from the reverse shear"],
  "pincer-seam": ["从钳口穿出，随后横移避开竖直断层", "Exit through the jaws, then strafe off the vertical fault"],
  "anchor-ring": ["挣脱锚点牵引，再避开向外扩散的震荡", "Escape the anchor pull, then clear its expanding shock ring"],
  "mirror-portals": ["换高度避开镜盾反弹，留意左右夹光", "Change altitude off the reflecting shield; watch both firing edges"],
  "decoys-beam": ["打碎空心假影，再离开汇聚的镜光线", "Break the hollow decoys, then leave their converging light"],
  "conduit-plasma-tide": ["射断尾端电极，跟住随后电潮的缺口", "Sever the tail electrode, then track the opening in the surge"],
  "plasma-tide-filament": ["穿过电潮缺口，立即变向避开逆向电弧", "Cross the current gap, then turn away from the reverse arc"],
  "nests-pollen-ring": ["打破孢囊离开菌毯，再避开孢粉环", "Break the sacs and leave the bloom before its pollen ring"],
  "spore-vortex-tide": ["挣脱孢涡，转身寻找后方孢浪缺口", "Escape the spore pull, then find the opening in the rear front"],
  "rift-seam": ["侧绕偏折火力的引力场，再横移避开裂缝", "Flank the shot-bending well, then strafe off the seam"],
  "void-well-ring": ["逆着旋流远离中心，再冲出收缩的虚空环", "Thrust against the spiral and escape the collapsing void ring"],
  "relay-nerve-tide": ["按序射断发光节点，再跟住未通电缺口", "Sever lit nodes in order, then follow the unpowered opening"],
  "nerve-ring-scan": ["先退出神经环，再离开反向扫描线", "Exit the neural ring, then move off the reverse scan"],
};

const bossUltimateNames = [
  ["渊潮合涌", "Hadal Confluence"], ["万骨王冠", "Crown of a Thousand Bones"],
  ["吞星熔裂", "Star-Eater Rift"], ["万维天罗", "Dimensional Cocoon"],
  ["双锚碎界", "Worldbreaker Vice"], ["万镜归光", "Convergence of Mirrors"],
  ["环渊雷狱", "Abyssal Thunder Cage"], ["梦魇孵界", "Nightmare Germination"],
  ["无光坍缩", "Lightless Collapse"], ["神经寂灭", "Terminal Synapse"],
  ["终末汇流", "Extinction Confluence"],
];
