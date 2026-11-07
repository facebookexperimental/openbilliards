# softbody-cushion

## KEY TAKEAWAYS
- 真软体不值得做为 gameplay 物理:pooltool 作者明确判定 realistic soft-body cushion 'unfeasible',学术界连一篇台球库边 FEM 论文都找不到,所有高保真模拟器都用刚体冲量/参数化模型。
- Mathavan 2010(一手论文已全文核实)给出可直接使用的实测参数:energetic COR e=0.98、球-库摩擦 μw=0.14、球-呢摩擦 μs≈0.212,且刚体假设仅在法向速度 ≤2.5 m/s 内成立——这就是 speed-dependent rebound 的定量边界。
- 球-库接触时长没有公开实测值(未证实),但慢动作证据和冲量估算一致指向 5–15ms、压缩 5–10mm 量级——远长于球-球的 0.25ms,意味着 0.2–0.5ms 子步即可覆盖,算力不是真软体的瓶颈,K-66 材料标定数据缺失才是。
- K-66 鼻高约 64% 球径(WPA 规格 63.5%±1%):偏高 bank 变长、偏低 bank 变短且跳球;接触点高于球心把球压向台面再由台面弹起,hop 可以在刚体模型里通过'出射向下分量+ball-slate 事件'自然涌现,无需软体。
- 参数化模型可以实时跑到论文级精度:tailuge/billiards 在浏览器(甚至树莓派4)实时运行 Mathavan 数值模型并复现论文图表,证明'离线扫格点查表'甚至都不是必需的性能妥协。
- 混合方案足以骗过职业玩家:一款商业模拟器(内部实现未证实,但无软体迹象)的库边与旋转手感获得了职业内容创作者的好评——高手验收的是出射角/速度/旋转映射,不是解算器内部;视觉形变用冲量驱动的 vertex shader 鼓包即可,成本≈0。
- 分阶段建议:v1 用修正版 Han 2005 + e(v) 速度衰减 + shader 形变;v2 离线扫 Mathavan/penalty 模型 4D 格点做查表或小 MLP,并用 Dr. Dave 定量锚点(侧旋 1/2/3 diamonds)和自拍 240fps 数据校正;v3 真软体仅限纯视觉局部 XPBD 或离线 FEM 数据工厂。
- 如果要上实时软体视觉层,技术路线是 XPBD + Small Steps(Macklin 2019,已读原文):n 个子步×1 次迭代远优于 1 大步×n 次迭代;PhysX 5 FEM soft body 是 CUDA-only,跨平台台球游戏基本出局。
- 拟合数据最便宜的组合:Mathavan 论文 Figs 7–10 数字化 + Dr. Dave HSV 视频库(重点 HSV 6.1 库边压缩、B.41 速度效应)+ 240fps 手机拍入射/出射映射;只有接触相细节才需要 Chronos 级高速相机($2500–5000)。
- 注意参数口径差异:Mathavan 用 sinθ=2/5(70% 球径,偏 snooker),Han 用 0.1R–0.2R,美式 K-66 实际应取 sinθ≈0.27——照抄论文常数会把反弹角做错。

## OPEN QUESTIONS
- 球-库接触时长的直接实测值:未找到任何公开测量(论文均为冲量模型,Dr. Dave 亦无数字);报告中 5–15ms/5–10mm 为本人推算,建议用高速相机自测验证。
- 商业模拟器的物理实现细节完全未公开(自研引擎与否、cushion 模型类型均未证实),仅有营销页与职业玩家 testimonial 佐证其手感。
- 未找到针对台球库边的公开 FEM/超弹性论文(英文与中文关键词均搜索过);K-66 橡胶的具体配方、Shore 硬度及 Mooney-Rivlin/Ogden/Prony 参数无公开数据,若走离线 FEM 需自行做材料试验。
- Han 2005 原文为扫描版 PDF 无法提取文本,其 e/μ 具体取值未从一手来源核实,依赖 pooltool 的转述(该转述还修正了原文 2 处公式错误)。
- Dr. Dave 关于'速度对 bank 角的两种机制部分抵消'(rail throwback vs COR 变化)的解释被作者本人标注为 conjecture,尚无定量验证。
- Mathavan 模型在 vN>2.5 m/s 失效域的正确出射映射没有现成数据,需自拍高速视频或离线 FEM 补齐。

## REPORT
# 台球库边(cushion)软体弹性模拟可行性调研报告

## TL;DR

**真软体(runtime FEM/XPBD)不值得做为 gameplay 物理**;学术界和最硬核的模拟器(商业模拟器、pooltool、tailuge/billiards)全部走"刚体冲量/参数化模型"路线,且已被职业玩家认可为"像真的"。推荐:**运行时参数化模型(Han 2005 修正版起步 → Mathavan 2010 离线扫格点查表)+ shader 顶点形变做视觉**。真软体只在两个位置有价值:(a) 离线生成查表数据,(b) 纯视觉的局部形变——而且 (a) 用实拍数据替代往往更便宜更准。

---

## 1. 真实库边物理:已证实的事实清单

### 1.1 材质与几何
- **K-66 profile**(美式池球标准):底座 1-3/16"(30mm),鼻高 1"(25mm),装好后 nose 距台面 1-7/16"(约 36.5mm,对 2-1/4"/57.15mm 球即约 64% 球径)。材质为 vulcanized rubber(gum 或 synthetic;Wikipedia 上该条标注 citation-needed,具体配方**未证实**)。开伦(carom)用 K-55,顶部 vulcanize 进帆布(canvas)控制层来调反弹;snooker 用 L 形(如 L77)。来源:https://en.wikipedia.org/wiki/Billiard_table 、https://www.legacybilliards.com/blogs/resources/rail-cushion-profiles-which-is-best-for-your-pool-table
- **鼻高标准**:WPA 规定 nose height 为球径的 63.5%±1%(62.5%–64.5%)。偏高 → 反弹变慢、bank 变"长";偏低 → 反弹变快、bank 变"短"且球更容易跳(hop)。0.5D 会明显跳球,0.7D(center of percussion)会把球压进台面、磨出 rail groove。来源:https://drdavepoolinfo.com/faq/table/cushion-nose-height/
- 注意口径差异:Mathavan 2010 论文中取接触点高度 h = 7R/5(即 70% 球径,sinθ = 2/5),偏向 snooker 库形;Han 2005 用 ε ≈ 0.1R–0.2R(约 55%–60% 球径)。做游戏时 θ 应按你选的规格(pool: sinθ≈0.27–0.29)设参,而不是照抄论文常数。
- **温度/湿度敏感**:橡胶反弹强依赖温度,所以国际开伦规则强制加热台面(33–37°C,有的到 45°C),snooker 职业台也加热。这本身就说明真实库边是速率+温度相关的黏弹性体。来源:https://en.wikipedia.org/wiki/Billiard_table 、https://surreysnookeracademy.com/why-are-snooker-tables-heated/

### 1.2 接触时长与压缩深度
- **球-球碰撞**实测 0.1–0.6ms(Marlow),Sorokin 测得 250–300µs。来源:https://drdavepoolinfo.com/faq/ball/contact-time/
- **球-库接触时长:没有找到公开的直接实测数值(未证实)**。但间接证据一致指向**毫秒级、比球-球长一个数量级以上**:pooltool 作者根据慢动作footage 明确写道"rail deforms substantially……collision持续时间远长于 ball-ball"(https://ekiefl.github.io/2020/04/24/pooltool-theory/);Gismeros Moreno 2022 用 2000fps 视频复现了 2.724 m/s 撞库过程(接触跨多帧);Dr. Dave 有专门的 HSV 6.1 "Cushion deformation during high-speed bank" 慢动作片段(https://drdavepoolinfo.com/high-speed-video/)。用冲量-动量估算(m=0.17kg,vₙ=2m/s,半正弦接触):接触时长 ~5–15ms、压缩深度 ~5–10mm、中速撞库平均力 ~50–100N——**这是本报告的推算,非实测**。
- 关键推论:接触时长 5–15ms 意味着 runtime 软体并非需要"亚毫秒物理帧"那么恐怖(0.2–0.5ms 子步即可覆盖),**算力不是真软体的主要障碍,标定数据才是**(见 §3)。

### 1.3 反弹参数(Mathavan 2010 实测拟合,一手来源)
论文全文免费:https://drdavepoolinfo.com/physics_articles/Mathavan_IMechE_2010.pdf (Proc. IMechE Part C, 224, 2010, DOI:10.1243/09544062JMES1964)。要点(我从 PDF 全文提取核实):
- 在 Riley Renaissance snooker 台上用高速相机实测,拟合出 **energetic COR eₑ = 0.98、球-库滑动摩擦 μw = 0.14、球-呢滑动摩擦 μs ≈ 0.178–0.245(取 0.212)**;snooker 球 M=0.1406kg、R=26.25mm。
- **刚性库边假设只在法向入射速度 ≤2.5 m/s 内成立**:V₀>2.5m/s 时数值预测系统性偏离实验——这正是"打得越狠、库边行为越偏离刚体模型"的定量边界,也是 speed-dependent rebound 的直接证据。
- 数值解法:把冲量离散成 N≈5000 个增量迭代积分(impulse-space ODE),压缩相/恢复相分开,能算出 stick/slip 转换。
- 结果图(Figs 8–10,可数字化做拟合源):纯滚动无侧旋时,**反弹角在刚性域内只依赖入射角、与速度无关**;速度损失在入射角约 40° 时最大;top spin 抬高反弹速度;侧旋显著改变反弹角,陡角入射时侧旋方向甚至会被库边反转。

### 1.4 玩家可感知的现象(Dr. Dave 汇总,附 HSV/NV 视频编号)
来源:http://drdavepoolinfo.com/faq/bank-kick/effects/
- **速度越快 bank 越短**(NV 6.6/6.7),机制至少有二:快速时球来不及恢复 natural roll(roll 会把反弹路径拉长);以及库边大变形的"rail throwback"效应。但 HSV B.41 显示也存在反例——deformation 缩角与 COR 随速度变化的拉长效应可部分抵消(Dr. Dave 自己标注 "This is all conjecture")。
- **侧旋**:running spin 拉长反弹角并加速,reverse spin 缩短并减速;直入直出的 kick 上,1/3、2/3、满侧旋分别造成约 1、2、3 个 diamond 的横向偏移(难得的定量锚点)。
- **上/下旋**:topspin 拉长 kick,draw 缩短;贴库近距/大力击打因"少 roll"而缩短 bank。
- **跳跃(pop-up/hop)**:接触点高于球心 → 出射速度带向下分量 → 台面法向力把球顶起微跳;nose 过低的台子跳球更明显。pooltool 明确把它拆成"ball-cushion 事件产生向下速度 + 随后 ball-slate 事件弹起"两步(https://ekiefl.github.io/2020/04/24/pooltool-theory/)。
- **器材相关**:更弹的库(法向 COR 高)bank 更短;Diamond 品牌台明显 bank 短;新/滑的呢让 bank 变长。

## 2. 库边模型光谱:能复现什么、花多少算力

| 模型 | 能复现 | 不能复现 | 算力 | 现成实现 |
|---|---|---|---|---|
| 镜面反射+常数 e | 无 | 一切速度/旋转效应 | ~0 | 一切休闲游戏 |
| **Han 2005** 瞬时冲量(解析) | 侧旋改角、top/draw、stick/slip 两分支、向下分量→hop | 速度相关 COR、>2.5m/s 大变形域、接触过程细节 | 每次碰撞几十条标量运算(纳秒级) | pooltool(修正了原文 2 处公式错误):https://ekiefl.github.io/2020/04/24/pooltool-theory/ 、https://github.com/ekiefl/pooltool (JOSS: https://joss.theoj.org/papers/10.21105/joss.07301) |
| **Mathavan 2010** 冲量域数值积分 | 上述全部 + 压缩/恢复分相、slip 角连续演化,实验吻合(≤2.5m/s) | >2.5m/s 软化域;接触时长(模型仍视为瞬时) | N≈5000 次增量迭代,每次碰撞微秒~毫秒级;**浏览器里实时跑没问题**(tailuge 在 Raspberry Pi 4 上跑) | https://github.com/tailuge/billiards (TypeScript,含 Mathavan 数值模型 + Stronge 柔性接触模型,还带参数调优页和复现 Mathavan 图表的验证脚本;注意 GPL-3.0) |
| **弹簧-阻尼 penalty**(Hertz/Lankarani–Nikravesh) | 连续接触过程、多球同时碰撞、贴库球 double-kiss、frozen-ball 场景 | 橡胶超弹/速率细节仍是标定出来的 | 需要 dt=1e-4~1e-5 s(仅接触期间),Matlab ODE 可跑;游戏内做事件驱动局部小步进完全可行 | Gismeros Moreno et al., Nonlinear Dyn. 107 (2022),open access:https://link.springer.com/article/10.1007/s11071-021-07117-4 ——球-库用 LN 模型,直接沿用 Mathavan 的 cr=0.98/μ=0.14,复现 2000fps 实拍"几乎一致",且同样在 >2.5m/s 处开始偏离 |
| **实时软体(XPBD/PhysX FEM)** | 视觉形变、原则上可涌现速度相关行为 | 精确反弹角(依赖网格/迭代数,难标定)、确定性 | 见 §3 | 无台球先例(**未找到**) |
| **离线 FEM(Abaqus/LS-Dyna)超弹+黏弹** | 全部现象原则上可复现,含 >2.5m/s 软化、接触时长、压缩深度 | — | 单次撞击分钟级~小时级,仅离线 | **未找到任何专门针对台球库边的公开 FEM 论文**(英文/中文关键词均搜过);最接近的先例是乒乓球拍橡胶 FEM 反弹研究(JSME 2019:https://www.jstage.jst.go.jp/article/jsmeshd/2019/0/2019_C-35/_article/-char/en)和运动球类 FEM(如 https://ssl.wsu.edu/documents/2015/10/dynamic-characterization-of-rigid-foam-used-in-finite-element-sports-ball-simulation.pdf/),说明技术路线成熟但没人替你做好 K-66 的材料卡 |

## 3. 实时软体技术盘点与"局部高频子步"可行性

- **XPBD + Small Steps**(Macklin et al., SCA'19, https://mmacklin.com/smallsteps.pdf ,已读原文核实):核心结论是"n 个子步 × 1 次迭代"远优于"1 大步 × n 次迭代",能大幅降低约束误差和数值阻尼,对刚硬材料稳定。这正好适配"接触只有 ~10ms"的场景:120Hz 渲染帧内,仅在球进入库边 broad-phase 后切 20–50 个子步(dt≈0.2–0.5ms),对一段 2–3 球径宽的局部 tet 网格(~1–2k tets)做 XPBD——**算力完全可控**(GPU 上 <1ms/帧,CPU 也撑得住)。
- **PhysX 5 FEM soft body**:真 FEM + 双 tet 网格,但 **CUDA-only、无 CPU fallback**,Poisson ratio<0.5,刚硬材料要堆迭代(https://nvidia-omniverse.github.io/PhysX/physx/5.1.1/docs/SoftBodies.html )。跨平台台球游戏(手机/网页)基本出局。
- Jolt soft body 是 PBD 顶点软体(偏布料/软胶级别),Zibra 主打流体,MPM 实时方案对这种"薄条橡胶高速接触"没有优势。
- **真正的障碍不是算力,而是三件事**:
  1. **材料标定**:没有公开的 K-66 超弹(Mooney-Rivlin/Ogden)+ 速率阻尼(Prony)参数;自己做要切样条上万能试验机/DMA。橡胶 COR 随撞速下降是普遍规律(如 https://frontiersin.org/journals/mechanical-engineering/articles/10.3389/fmech.2020.00003/full ),不标定速率项就模拟不对"打得狠反而短"。
  2. **结果可控性/确定性**:反弹角对网格分辨率、子步数、迭代序敏感;联网对局、回放、AI 击球规划都需要 bit-level 或至少高度可复现的轨迹——软体解算器在这点上天然吃亏。
  3. **验收标准**:职业玩家感知的是"出射角/速度/旋转随入射条件的映射"是否像真台,而不是解算器内部是不是软体。一个未标定的软体模拟大概率比标定过的冲量模型**更假**。
- 结论:**"仅在撞库瞬间对局部做高频软体子步"在工程上可行,但只建议用于视觉层,不建议让它决定出射轨迹。**

## 4. 混合方案评估(推荐路线)

**运行时参数化 + 视觉形变,能骗过职业玩家吗?——证据显示能。**
- 这款商业模拟器的官方从未公开物理实现细节(**内部实现未证实**),宣传材料只有营销话术和职业内容创作者对其手感的好评。没有任何迹象表明它跑软体;这类产品的帧率预算和联网对局都指向参数化模型。也就是说:**市场上"最能骗过高手"的产品,大概率就是参数化模型 + 好的视听反馈**。
- pooltool 作者直接断言 realistic soft-body cushion "unfeasible",并采用修正版 Han 2005;tailuge/billiards 则证明 Mathavan 数值模型可以直接实时跑并复现论文图表。
- 骗过"眼睛"的关键不是形变本身(接触只有 ~10ms,肉眼几乎只能看到一两帧的鼓包),而是:速度相关的 bank 缩短、侧旋改角、hop、正确的速度损失曲线、以及撞库音效/呢面微动等次级线索。视觉形变用 **vertex shader 局部鼓包**(幅度∝法向冲量,宽度 ~2 球径,10–20ms 半正弦 + 短暂 ring-down)即可,成本≈0,慢动作回放里非常加分。

## 5. 数据来源(拟合参数模型用)

1. **Mathavan 2010 论文本身**:免费 PDF,Figs 7–10 给了不同速度/上旋/侧旋下的 rebound speed & angle 曲线,可数字化直接当训练/拟合数据;参数 eₑ=0.98、μw=0.14、μs=0.212 直接可用(snooker 器材;pool 需重标定)。
2. **Dr. Dave 资源库**:HSV 高速视频索引(https://drdavepoolinfo.com/high-speed-video/ ,重点 HSV 6.1、6.2–6.14、A.128–A.141"最大压缩时刻击球"、B.20、B.25、B.41)+ FAQ 定性方向(https://drdavepoolinfo.com/faq/bank-kick/effects/ 的 1/2/3-diamond 侧旋定量锚点)+ 物理文献页(https://drdavepoolinfo.com/physics/ ,含 Han 2005 扫描版 https://drdavepoolinfo.com/physics_articles/Han_paper.pdf )。
3. **开源实现**:tailuge/billiards(GPL-3.0,商用需注意,可照论文重写)自带"复现 Mathavan 图"的验证工具;pooltool 有修正版 Han 公式推导 worksheet。
4. **自拍高速视频**:拟合参数模型只需要"入射(v, 角度, 旋转)→ 出射(v', 角度', 旋转')"映射,**240fps 手机 + 俯视机位 + 球面标记**就够标出入射/出射速度与角度(旋转要靠标记点跟踪);只有想看接触相细节(压缩深度、接触时长)才需要 1000fps+:Chronos 1.4 约 $2500–3500(1050fps@720p,https://www.dpreview.com/news/8747302245/chronos-1-4-is-a-2500-camera-that-can-shoot-at-21-650-fps )、Chronos 2.1-HD 约 $5000(1000fps@1080p)。Gismeros Moreno 2022 用的也只是 2000fps。

## 6. 推荐分阶段方案

**v1(1–2 周,直接达到"高级模拟器"底线)**
- 事件驱动刚体框架 + **修正版 Han 2005**(照 pooltool 的 corrected 公式,注意 stick/slip 两分支),θ 按 K-66 实际 nose height(sinθ≈0.27,而非论文的 2/5)。
- 叠加一条 **e(vₙ) 经验曲线**(vₙ>2.5m/s 起衰减)near-empirically 复现"打狠变短";保留出射向下分量 → 用 ball-slate 弹跳自然涌现 hop。
- 视觉:contact event 驱动的 vertex shader 鼓包 + 音效分层(速度映射)。此层就足以支撑慢动作回放。

**v2(增强,2–6 周)**
- 离线跑 **Mathavan 冲量 ODE(或 LN penalty 模型)扫 4D 参数格点**(vₙ, v_t, 侧旋, 上下旋),每点输出 6 维出射量 → 查表(20⁴≈16 万格点,几 MB)或 4→6 的小 MLP;运行时插值,纳秒级开销、完全确定、可联网同步。
- 用 Dr. Dave 的定量锚点(3 档侧旋 = 1/2/3 diamonds 等)+ 自拍 240fps 数据对表做残差校正;>2.5m/s 域必须用实拍数据外推(刚体模型在那里失效)。
- 把 v1 的 shader 形变幅度/时长也从表里查(冲量→形变),视觉与物理自洽。

**v3(真软体:默认不做;两个例外)**
- **不建议**把 runtime FEM/XPBD 作为权威 gameplay 物理:标定数据缺失、确定性/联网/回放困难、职业玩家验收的是出射映射而非解算器身份;学界连一篇台球库边 FEM 论文都没有,你会是第一个踩坑的。
- 例外 A(视觉奢侈品):局部 XPBD 条带(Small Steps 子步)做纯视觉软体,轨迹仍由 v2 查表决定——低风险高观感。
- 例外 B(数据工厂):如果实拍受限,可做一次性离线 FEM(Abaqus/LS-Dyna,Ogden+Prony,材料参数需自测 K-66 样条)来生成 >2.5m/s 域的查表数据和形变动画资产;但先评估"买台 Chronos 拍一天"是否更便宜——多数情况是。

## 主要来源
- Mathavan/Jackson/Parkin 2010(全文已提取核实):https://drdavepoolinfo.com/physics_articles/Mathavan_IMechE_2010.pdf
- pooltool 理论页(Han 2005 修正、soft-body 不可行论断、pop-up 机制):https://ekiefl.github.io/2020/04/24/pooltool-theory/
- Gismeros Moreno et al. 2022(penalty 路线 + 2000fps 验证):https://link.springer.com/article/10.1007/s11071-021-07117-4
- Macklin et al. "Small Steps in Physics Simulation"(原文已读):https://mmacklin.com/smallsteps.pdf
- PhysX 5 Soft Bodies 文档:https://nvidia-omniverse.github.io/PhysX/physx/5.1.1/docs/SoftBodies.html
- Dr. Dave:nose height FAQ、bank/kick effects FAQ、HSV 索引、contact time FAQ(URL 见上文)
- tailuge/billiards(实时 Mathavan 实现):https://github.com/tailuge/billiards ;pooltool:https://github.com/ekiefl/pooltool
- Wikipedia Billiard table(K-66 尺寸、加热台):https://en.wikipedia.org/wiki/Billiard_table
- Chronos 相机价格:https://www.dpreview.com/news/8747302245/chronos-1-4-is-a-2500-camera-that-can-shoot-at-21-650-fps 、https://petapixel.com/2023/11/15/the-new-affordable-chronos-4k12-and-q12-shoot-at-nearly-30000-fps/