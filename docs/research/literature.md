# literature

## KEY TAKEAWAYS
- 真实台球模拟必须自研 event-based 物理内核:解析运动方程 + 多项式求根预测事件(Leckie & Greenspan 2006、pooltool JOSS 2024),通用游戏引擎的微步长刚体方案精度与手感都不够。
- 手感分水岭四件套:速度相关球-球摩擦产生的 throw(最大约 5°)、endmass 模型的 squirt、速度相关有效恢复系数的库边模型、三系数独立的台呢摩擦(滑动/滚动/自旋独立衰减)。
- 球-台呢参数有一手实测:滑动 μs≈0.2(斯诺克实测 0.178-0.245 且随滑速变化)、滚动 μr≈0.01(实测 0.0127-0.0129)、自旋减速 5-15 rad/s²;滑动段轨迹是抛物线,massé/swerve 由此自然涌现(Coriolis 1835)。
- 球-球碰撞接触仅 100-600 μs、e=0.92-0.98,瞬时冲量近似成立;但必须叠加随相对滑速衰减的球间摩擦 μ(v)=0.009951+0.108e^(-1.088v)(Alciatore TP A-14 拟合,pooltool 默认)才能复现 CIT/SIT 与旋转传递。
- 库边最佳模型:日常用 Han 2005 解析模型(注意 pooltool 作者修正过原文两处公式错误),标定用 Mathavan 2010——接触高度 h=7R/5(0.7 倍球径,合 WPA 63.5% 规格)、ee=0.98、μw=0.14、刚性库假设仅在法向速度 <2.5 m/s 成立、滚动正碰等效 COR 0.818 且随速度按二次曲线下降。
- 击球接触约 1-2 ms;squirt 由杆端有效质量决定(Mb/Mtip≈20-100 → squirt 约 2.33°-0.49° @ b/R=3/8),刚性整杆模型会高估到 16°,必须用 endmass(~12 g)模型;miscue 上限为偏移 0.5R(Coriolis 理论 0.7R)。
- 袋口要用 WPA 真实几何(角袋 142°±1°、腰袋 104°±1° 切角,back-draft 12-15°,shelf 0-2.25 英寸),把袋角当库边段复用库边模型让 rattle 涌现;有效袋口大小随速度/入射角动态变化。
- 开球 15 球紧贴使瞬时两两冲量失效:工程主流是微小随机间隙(pooltool spacing_factor 默认 0.001 且不建议设 0),学术方案是非线性光滑接触力短时积分(Gismeros Moreno et al., Nonlinear Dynamics 2021)。
- 跳球/落台:合法跳球是向下击打后球从 slate 反弹(scoop 犯规),球-台面 COR 0.5-0.7;腾空段纯抛体,落地时用滑动摩擦冲量重新分配平动与旋转。
- 最重要的公开资产:Dr. Dave(Alciatore)的 Technical Proofs 与实测常数表、Loughborough Mathavan 系列高速摄影论文、以及可直接对照的开源实现 pooltool——建议把 TP 的 throw 曲线和 Mathavan 回弹曲线作为物理内核的回归测试基准。

## OPEN QUESTIONS
- 商业模拟器的内部物理实现(闭源)未找到任何一手资料;'商业参考级手感 = throw+squirt+库边速度相关性'是基于文献重要性与玩家感知的工程推断,非官方证实。
- Dr. Dave TP A-14 原始 PDF 为图像式排版无法直接提取,μ(v)=0.009951+0.108e^(-1.088v) 的常数经 pooltool 文档(AlciatoreBallBallFriction)间接引用,未与 TP 原文逐字核对。
- Han 2005 原文使用的恢复系数/摩擦取值未直接读到(koreascience 仅摘要页),模型结构与'两处公式错误'的依据是 pooltool 作者的复现与修正文档。
- Cross 2020《Impact force between two colliding billiard balls》全文付费,球-球接触时间与峰值力的具体测量值未核实(仅有摘要中的方法描述)。
- 球-球恢复系数是否随速度显著变化(0.92-0.98 区间的内部结构)未找到系统的一手测量。
- Marlow 书的内容均为二手引用(Dr. Dave 资源页、Mathavan 论文),未直接查阅原书;其 rail COR 0.55 与滚动摩擦测量已被 Mathavan 2009 质疑。
- 台呢绒毛方向(nap)对球路的影响:Williams 声称存在,Mathavan 2009 未发现证据,悬而未决(英式斯诺克台呢可能仍需建模开关)。
- 袋内/袋角三维几何(球撞 shelf 后弹回台面)的定量文献几乎空白,只有 WPA 几何规格与 Dr. Dave/Jewett 的行为级实验,自研时需要自行标定。

## REPORT
# 台球物理文献综述:真实台球模拟器必须复现的现象清单与最佳已知模型

## 0. 执行摘要

台球物理有一条清晰的文献主线:Coriolis(1835,《Théorie mathématique des effets du jeu de billard》)→ Marlow(1995,《The Physics of Pocket Billiards》)→ Alciatore(Dr. Dave,Colorado State,1999 至今的 Technical Proofs + 高速摄影)→ Loughborough 的 Mathavan/Jackson/Parkin 系列(2009-2015,高速摄影定标的球-台呢、球-库边、球-球模型)→ Han 2005(卡罗姆库边解析模型)→ 开源仿真器 pooltool(Kiefl,JOSS 2024)把这些模型工程化并修正了原论文错误。**结论:一个"商业参考级手感"的模拟器不能用通用游戏物理引擎(瞬时刚体 + 常数恢复系数),必须自研 event-based 内核,并至少实现:速度相关的球-球摩擦(throw)、endmass 模型的 squirt、Mathavan/Han 级的库边模型(速度相关有效恢复系数 + 旋转耦合)、三系数独立的台呢摩擦(滑动/滚动/自旋)。** 这些正是文献中被高速摄影反复验证、也是玩家能直接感知的分水岭现象。

---

## 1. 现象 → 模型 → 参数 → 难度 对照总表

| # | 现象 | 最佳已知模型 | 关键参数(来源) | 工程难度 | 手感关键度 |
|---|------|------------|----------------|---------|-----------|
| 1a | 台呢滑动摩擦(sliding) | 点接触库仑摩擦,摩擦方向沿接触点相对滑动速度 û,解析解(轨迹为抛物线) | μs=0.15-0.4(典型 0.2,Dr. Dave);斯诺克实测 0.178-0.245,均值 0.212,且随滑动速度变化(Mathavan AJP 2009) | 低 | ★★★(draw/follow/stun 的基础) |
| 1b | 台呢滚动阻力(rolling) | 恒定减速度模型(台呢变形导致,和速度无关) | μr=0.005-0.015(Dr. Dave);斯诺克实测减速度 0.124-0.126 m/s² → μr=0.0127-0.0129;Marlow 池球 0.011-0.024 均值 0.016 | 低 | ★★★(走位距离感) |
| 1c | 侧旋(英式)独立衰减 | 竖轴自旋独立线性衰减 ω̇z = -5μsp·g/(2R),μsp 为唯象系数(点接触理论上无自旋摩擦,须用接触面积解释) | 自旋减速 5-15 rad/s²(Dr. Dave properties 页) | 低 | ★★★(晚到库边的侧旋量决定走位) |
| 2a | 球-球碰撞(基线) | 瞬时碰撞;接触时间 100-600 μs(Marlow)/ 250-300 μs(Sorokin);弹性+无摩擦 → 90° 分离规则 | e(球-球)=0.92-0.98;球质量 5.5-6 oz、直径 2.25"(WPA/Dr. Dave) | 低 | ★★ |
| 2b | Throw(CIT/SIT)与 spin transfer | 碰撞冲量期间球间库仑摩擦;摩擦系数随接触点相对滑速衰减:μ(v)=a+b·e^(-c·v),Alciatore 拟合 a=0.009951, b=0.108, c=1.088(pooltool 默认);完整数值模型:Mathavan 2014 Sports Engineering(pooltool 的 frictional_mathavan) | μ(球-球)=0.03-0.08;最大 throw ≈5°,出现在慢速+stun+约 1/2 球厚度或 ~50% 侧旋;<20° 切角时速度对 CIT 几乎无影响;gearing 外塞可消除 throw(Dr. Dave TP A-14/A-17/A-26/B-31) | 中 | ★★★★(公认的真实感分水岭) |
| 3 | 球-库边 | 首选 Han 2005(解析冲量模型,含黏着/滑动两分支,pooltool 默认,注意 Kiefl 修正过原文两处公式错误);高保真参考 Mathavan 2010(冲量域数值积分,高速摄影验证) | 接触高度 h=7R/5(=0.7 倍球径;WPA 规定库鼻高 63.5%±1% 球径),sinθ=2/5;能量恢复系数 ee=0.98、球-库摩擦 μw=0.14(RMS 拟合);刚性库假设仅在法向速度 <2.5 m/s 成立;滚动球正碰的"运动学等效 COR"=0.818,且回弹-入射速度呈二次关系 y=-0.0877x²+1.131x-0.0953(0.28-3.5 m/s)→ 有效恢复系数随速度下降;大侧旋时回弹速度可超过入射速度 | 中-高 | ★★★★(速度相关性 + 旋转耦合是分水岭) |
| 4a | 击球(杆-球) | 冲量域(Stronge 能量恢复系数)滑动→黏着两阶段模型;接触 ~1-2 ms(Shepard ~1 ms;Cross 压电实测 2.1 ms) | 皮头-球 μ≈0.6;皮头 COR 0.71-0.75(皮)/0.81-0.87(酚醛)(Dr. Dave) | 中 | ★★★ |
| 4b | Squirt(杆法偏移) | Endmass 理论(Shepard 2001):tanψ 只取决于 Mb/Mtip 比;刚性整杆模型会高估到 ~16°,必须用"只有杆端 ~12 g 参与碰撞"的柔性模型(Kim 2021 arXiv;Cross 2008 AJP 实验) | 实际球杆 Mb/Mtip≈20(高 squirt)~100(低 squirt);b/R=3/8 时 squirt 角 2.33°~0.25°;对应 pivot length 10-49";真实杆间差异约 4-5 倍 | 中(参数化后很简单) | ★★★★(瞄准手感分水岭) |
| 4c | 杆法上限(miscue) | 静摩擦条件:tip 不打滑要求 μ ≥ tanφ;实践上限 = 中心偏移 0.5R(Coriolis 理论极限 0.7R) | b_max=0.5R(Dr. Dave FAQ);Cross:F/N 超约 0.7 即滑走 | 低 | ★★ |
| 4d | 扎杆/弧线(massé/swerve) | Coriolis 1835(Nadler 2005 英译):滑动阶段摩擦方向恒定 → 台面轨迹为抛物线;Coriolis/BAR 瞄准系统(RA 线上任意瞄点给出相同终向角);工程上由"抬杆击球产生 ωx 分量 + 滑动摩擦解析解"自然涌现 | 由 1a 的 μs 和击球模型的初始 (v,ω) 决定;TP A-19 | 中(若 1a/4a 做对则免费获得) | ★★★ |
| 5 | 腾空与落台 | 腾空 = 抛体运动(解析);落台反弹用球-台面(经台呢的 slate)恢复系数 + 落地时滑动摩擦重新分配旋转;合法跳球 = 向下击打、球从 slate 反弹(scoop 为犯规) | e(球-台面)=0.5-0.7(Dr. Dave);pooltool 约定:球-球/球-库事件不直接产生腾空,由紧随其后的 ball-slate 事件处理 | 中 | ★★(跳球、高速冲袋跳出) |
| 6 | 袋口物理 | 几何 + 袋角(jaw)按库边段处理:pooltool 把 jaw 建成直线+圆弧库边段并复用 Han 模型,rattle 自然涌现;判进球用真实几何而非圆形触发器 | WPA:角袋口 4.5-4.625"、腰袋口 5-5.125"、水平切角 142°±1(角)/104°±1(腰)、竖直 back-draft 12-15°、shelf 角袋 1-2.25"/腰袋 0-0.375";有效袋口大小随速度和入射角变化(慢球可借库边滚入,快球有效袋口显著变小,Dr. Dave TP 3.5-3.8) | 中-高(几何建模+调参) | ★★★★(rattle 真实性肉眼可辨) |
| 7 | 开球(15 球紧贴) | 瞬时两两冲量模型在同时多接触下失效。工程主流:(a)微小随机间隙——pooltool 的 spacing_factor 默认 0.001R 且"设 0 不推荐",物理依据是真实摆球也从不完全 frozen;(b)光滑非线性接触力(Hertz/Hunt-Crossley 族)短时数值积分——Gismeros Moreno et al., Nonlinear Dynamics 2021 专门用台球开球做了系统研究与实验验证 | 时间步长量级:要保证 10 m/s 下穿透 <R/100 需 ~30 μs 步长(pooltool-alg 博文) | 高 | ★★★(开球散型可信度) |
| 8 | 事件驱动仿真架构 | Leckie & Greenspan 2006《An Event-Based Pool Physics Simulator》(PoolFiz 血统):状态间解析演化 + 事件时间求根(球-球为四次多项式、球-库为二次/四次、状态转移为闭式),只在事件处解算 | 每步 16 球约 521 个候选事件;一杆 10-50 个事件,误差仅浮点级(pooltool-alg) | 中 | ★★★(精度+性能地基) |

(手感关键度为综合文献重要性与玩家可感知度的工程判断;★★★★ = 商业参考级真实感的分水岭。)

---

## 2. 分现象详述与来源

### 2.1 球-台呢(现象 1)
球在台呢上有 4+1 种运动状态:静止、原地自旋、滑动、滚动、腾空,每种都有解析运动方程(轨迹按时间是二次式,滑动时摩擦方向沿接触点相对速度 û 恒定,故滑动段轨迹是抛物线——这正是 Coriolis 时代已知的结果,也是 swerve/massé 曲线的来源)。三个摩擦系数**必须独立**:
- 滑动 μs:Dr. Dave 常数表 0.15-0.4(典型 0.2)https://drdavepoolinfo.com/faq/physics/physical-properties/;Mathavan 等用高速摄影测得斯诺克台呢 0.178-0.245(均值 0.212),且**随滑动速度变化**(AJP 2009,https://drdavepoolinfo.com/physics_articles/ajp_09_hsv_article.pdf)。
- 滚动 μr:斯诺克实测减速度 0.124-0.126 m/s²(μr≈0.0128,恒定、与速度无关,源于台呢变形);Marlow 书中池球台呢 0.011-0.024、均值 0.016——同一论文还指出 Marlow 的"米尺+秒表"测法误差大,并且**未发现台呢绒毛方向(nap)影响的证据**。
- 自旋 μsp:竖轴旋独立线性衰减 ωz(t)=ω0z−(5μsp·g/2R)t;真实点接触理论上不产生自旋力矩,μsp 是唯象参数(pooltool 理论页明说这是"cheating",https://ekiefl.github.io/2020/04/24/pooltool-theory/)。Dr. Dave 给出自旋减速 5-15 rad/s²。
经典教材:Marlow《The Physics of Pocket Billiards》(1995,ISBN 9780964537002,https://www.abebooks.com/9780964537002/Physics-Pocket-Billiards-Wayland-Marlow-0964537001/plp);但注意 Kiefl 和 Mathavan 都指出 Marlow 对库边的处理"不完整、不自洽"。

### 2.2 球-球碰撞(现象 2)
- 接触时间:Marlow 实测 100-600 μs,Sorokin 实测 250-300 μs,速度越快越短(https://drdavepoolinfo.com/faq/ball/contact-time/)→ 瞬时冲量近似对单对碰撞完全成立。Cross 2020(Physics Education 55, 065002, https://iopscience.iop.org/article/10.1088/1361-6552/aba207)用弹簧模型+刚性面实验估计了接触力(全文付费,数值未核)。
- 恢复系数:e=0.92-0.98(Dr. Dave 常数表)。
- **Throw(碰撞感应偏移)与旋转传递**:球间摩擦 μ=0.03-0.08,且随接触点相对滑速指数衰减。pooltool 默认的 AlciatoreBallBallFriction(a=0.009951, b=0.108, c=1.088)即 Dr. Dave TP A-14 的拟合(https://pooltool.readthedocs.io/en/latest/resources/custom_physics.html)。行为要点(https://drdavepoolinfo.com/faq/throw/maximum/):最大 throw ≈5°(约每英尺偏 1 英寸);CIT 在慢速+stun+半球厚度时最大;SIT 在慢速+stun+约 50% 侧旋时最大;切角 <20° 时速度对 CIT 几乎无影响;跟/缩杆都会削弱 throw;外塞到 gearing 比例时 throw 归零。完整数值模型:Mathavan, Jackson, Parkin,《Numerical simulations of the frictional collisions of solid balls on a rough surface》,Sports Engineering 2014(https://link.springer.com/article/10.1007/s12283-014-0158-y),即 pooltool 的 frictional_mathavan(默认,迭代 1000 步)。Dr. Dave 的 TP 索引(TP A-14、A-17、A-26、A-27、A-28、B-31 等,https://drdavepoolinfo.com/technical-proof/)提供了全部推导与标定曲线。
- 近年补充:Hyeong-Chan Kim 关于带旋球-球碰撞的 2024 论文与 2021/2022 击球后运动论文(Dr. Dave 资源页收录,https://drdavepoolinfo.com/physics/)。

### 2.3 球-库边(现象 3)
两个互补模型:
- **Han 2005**《Dynamics in carom and three cushion billiards》(J. Mech. Sci. Tech. 19(4),https://koreascience.kr/article/JAKO200531935952675.pub):瞬时冲量、刚性库边、黏着/滑动两分支的解析模型,计算成本低,是 pooltool 的默认库边模型(han_2005)。**注意:Kiefl 在复现时发现并修正了 Han 原文两处公式错误**(修正推导:https://ekiefl.github.io/images/pooltool/pooltool-theory/ball_cushion_inhwan_han.pdf)。
- **Mathavan/Jackson/Parkin 2010**《A theoretical analysis of billiard ball dynamics under cushion impacts》(Proc. IMechE Part C 224,https://drdavepoolinfo.com/physics_articles/Mathavan_IMechE_2010.pdf):库鼻接触高度 h=7R/5(斯诺克与池球通用;即 0.7 倍球径,与 WPA 63.5%±1% 规格一致),sinθ=2/5;以冲量为自变量数值积分(Stronge 能量恢复系数框架);拟合实验得 **ee=0.98、μw=0.14**;**刚性库假设只在法向入射速度 <2.5 m/s 有效**;滚动球正碰的等效 COR=0.818(包含摩擦与三维冲量效应),且回弹-入射速度是二次曲线(y=-0.0877x²+1.131x-0.0953,0.28-3.5 m/s)——即**有效恢复系数随速度下降**,这是"库边速度相关性"的一手实验依据;大侧旋时回弹速度可超入射速度(旋转能量注入)。
- 库鼻高度效应(玩家可感知):偏高→回弹慢、bank 变长;偏低→回弹快、bank 变短、跳球(https://drdavepoolinfo.com/faq/table/cushion-nose-height/)。Marlow 给的 rail COR 0.55 被 Mathavan 2009 质疑。TP 6.3/7.3 处理 bank 角随 COR 与纵旋的变化。
- 球压库(ball frozen to cushion)时与台面同时接触:Mathavan 2010 的模型显式含台面接触点 C 与库边接触点 I 两处冲量(PIx/PIy 与 PCx/PCy),是处理该问题的正确参考;Han 模型无此项。

### 2.4 击球(现象 4)
- 接触时长:Shepard 给 ~1 ms;Cross 2008 压电实测一次典型碰撞 2.1 ms,滑动会把接触拉长到 1-2 ms,铝棒杆 3.0 ms(http://www.physics.usyd.edu.au/~cross/PUBLICATIONS/39.%20squirt.pdf)。
- **Squirt/endmass**:Ron Shepard 2001《Everything You Always Wanted to Know About Cue Ball Squirt》(https://drdavepoolinfo.com/physics_articles/Shepard_squirt.pdf):侧向动量守恒 Mtip·Vtip,y + Mb·Vb,y = 0,**只有 Mb/Mtip 比值重要**;b/R=3/8 时,Mb/Mtip=20→ψ=2.33°(pivot 10.28"),Mb/Mtip=100→ψ=0.49°(pivot 49.11");实际球杆 Mb/Mtip≈20-100,真实杆间 squirt 差约 4-5 倍;实用范围内 squirt 与 b/R 近似线性。Cross 2008(Am. J. Phys. 76(3), 205-212)实验确认:抹巧克后 tip 全程"咬住"球,F/N 升到约 0.7 才滑走;近失杆时 squirt 可达 6°。Kim 2021(arXiv:2104.11232,https://arxiv.org/abs/2104.11232)给出基于 Stronge 冲量动力学的完整解析:滑移相是 squirt 的物理起源;**刚性整杆模型会把半径一半偏移的 squirt 高估到 ~16°,必须采用只有杆端(~12 g、~12 cm)参与的柔性/endmass 模型**——这也解释了低偏移碳纤维杆。工程结论:squirt 用 endmass 一个参数就能调,pooltool 的 instantaneous_point 模型甚至直接给了 squirt_throttle/english_throttle 旋钮。
- **Miscue 上限**:最大有效偏移 = 0.5R(超过即失杆;条纹球条纹宽度恰为 0.5D 可作参照)(http://drdavepoolinfo.com/faq/sidespin/maximum/);Coriolis 理论极限 0.7R(Kim 2021 引述)。
- **跳球**:合法跳球 = 抬杆向下击打,球被压入台面后从 slate 反弹起跳;铲球(scoop)犯规(https://drdavepoolinfo.com/faq/jump/)。
- **Massé**:Coriolis 1835(Nadler 2005 英译,Dr. Dave 资源页有出处)——滑动摩擦方向恒定 → 弧线为抛物线;Coriolis/BAR 瞄准系统:"RA 线上任意瞄点理论上给出相同的最终方向角"(https://drdavepoolinfo.com/faq/masse/aiming/,TP A-19)。工程上,若台呢滑动摩擦与击球初始 (v,ω) 都建对了,massé/swerve 自然涌现,无需专门模型。

### 2.5 腾空与落台(现象 5)
腾空段是纯抛体(可加空气阻力,但文献普遍忽略);落台用球-台面恢复系数 e=0.5-0.7(经台呢缓冲的 slate,Dr. Dave 常数表),反弹瞬间以滑动摩擦冲量重新分配平动/转动。pooltool 的架构约定值得借鉴:球-球/球-库事件本身不置球为腾空态,而由紧随的 ball-slate 事件(二次方程求根)统一处理(https://ekiefl.github.io/2020/12/20/pooltool-alg/)。带旋硬球在柔性面上的反弹建模可参考 arXiv:2208.11685(point-contact bounce 模型分析)。

### 2.6 袋口(现象 6)
几何一手来源是 WPA 器材规格(https://www.cuesight.com/wpa/tournament-table-equipment-specifications/):角袋口 4.5-4.625"、腰袋口 5-5.125"、水平切角 142°±1°(角)/104°±1°(腰)、竖直 back-draft 12°-15°、shelf 深度角袋 1-2.25"/腰袋 0-0.375"。行为层面(https://drdavepoolinfo.com/faq/pocket/size-and-center/,TP 3.5-3.12):**有效袋口大小和"袋心"都随球速与入射角动态变化**——慢球浅角可先蹭库再滚入(有效袋口大增),快球则明显变小;理想瞄点偏移可达 0.6"(角袋)/0.3"(腰袋)。rattle 的正确工程做法不是写专门逻辑,而是把袋角(jaw)建成真实几何的库边段:pooltool 用直线+圆弧库边段平滑连接并复用 Han 模型,rattle 自然涌现;其默认 ball-pocket 判定仍是"圆形触发器+移除",作者自己标注这是粗糙点——自研内核应改为真实几何判定(球心越过袋口沿+低于 lip 高度 h≈7R/5)。

### 2.7 开球:多球同时碰撞(现象 7)
15 球紧贴时瞬时两两冲量模型失效(牛顿摆问题:结果依赖处理顺序,能量/动量分配不唯一)。文献与工程处理:
1. **微小间隙 + 顺序事件**(主流游戏做法):pooltool 的 generate_layout/get_rack 带 spacing_factor(默认 0.001,即千分之一球半径量级的随机间隙),文档明确"设为 0 不推荐"(https://pooltool.readthedocs.io/en/latest/autoapi/pooltool/layouts/index.html)。物理正当性:真实摆球也从不完全 frozen。
2. **光滑(compliant)接触力模型**:Gismeros Moreno, Corral Abad, Meneses Alonso, Gómez García, Castejón Sisamón,《Modelling multiple-simultaneous impact problems with a nonlinear smooth approach: pool/billiard application》,Nonlinear Dynamics 2021(https://link.springer.com/article/10.1007/s11071-021-07117-4,被引 23):用非线性接触力(Hertz/Hunt-Crossley 族)+ 摩擦对整个开球做短时数值积分,系统比较了各接触力模型与求解器的精度/成本并做了实验验证;明确指出光滑法在同时多接触下"探测接触开始"等坑。
3. 若坚持离散时间:10 m/s 下要把穿透控制在 R/100 需 ~30 μs 步长(pooltool-alg 博文)。推荐混合架构:平时 event-based,开球瞬间局部切换到 compliant 接触积分。

### 2.8 近年文献与学术仿真器(现象 8)
- **Mathavan 系列**:AJP 2009 高速摄影方法学(上文);IMechE 2010 库边;Sports Engineering 2014 球-球摩擦碰撞数值模型;2015 IEEE/ASME Trans. Mechatronics 斯诺克机器人(http://irep.ntu.ac.uk/id/eprint/31391/1/PubSub8899_Mathavan.pdf);其 2009 博士论文收录于 Dr. Dave 资源页。
- **仿真器谱系**:Leckie & Greenspan《An Event-Based Pool Physics Simulator》(Advances in Computer Games 2006,https://link.springer.com/chapter/10.1007/11922155_19),PoolFiz/FastFiz 属这一支(用于计算台球锦标赛,Archibald et al. 2009);现役最佳开源实现 **pooltool**(Kiefl, JOSS 9(101):7301, 2024,https://joss.theoj.org/papers/10.21105/joss.07301;理论与算法长文 https://ekiefl.github.io/2020/04/24/pooltool-theory/ 与 https://ekiefl.github.io/2020/12/20/pooltool-alg/):event-based、模型可插拔(球-球:frictionless_elastic / frictional_inelastic / frictional_mathavan;库边:han_2005;击球:instantaneous_point),是自研内核最好的架构参考和对照实现。
- **AI/数据方向**:Billiards Sports Analytics 数据集与任务综述(arXiv:2407.19686);CueTip 物理感知台球助手(arXiv:2501.18291);Learning Visual Predictive Models of Physics for Playing Billiards(arXiv:1511.07404)。
- **综述**:Strafford, Bell & Stone《Snooker Science: A Cross-Discipline Scoping Review》,Communications in Kinesiology 2025(https://shura.shu.ac.uk/36336/):261 条检索仅 14 篇入选,证实台球学术文献整体稀疏——物理内核可依赖的一手文献就是上面这批。
- Kim(Korea Nat'l Univ. of Transportation)2021-2024 的击球与带旋碰撞解析系列(arXiv:2104.11232 等)。

---

## 3. 工程建议(按优先级)

1. **架构**:采用 Leckie-Greenspan/pooltool 式 event-based 内核(解析演化 + 多项式求根事件),精度浮点级、性能远超微步长积分;开球单独走 compliant-contact 数值积分或 spacing_factor 方案。
2. **手感分水岭四件套**(商业参考级真实感的最小充分集,均有一手实验数据可标定):速度相关球-球摩擦 → throw/spin transfer(Alciatore μ(v) 拟合或 Mathavan 2014);endmass squirt + 台呢滑动解析解产生的 swerve(Shepard/Cross/Kim);Han 2005(修正版)库边 + Mathavan 2010 的速度相关有效 COR 曲线(可用其二次拟合直接查表);三系数独立台呢摩擦与侧旋独立衰减。
3. **袋口用真实几何**(WPA 规格 + jaw 当库边段),不要圆形触发器;rattle 必须是涌现行为。
4. **参数全部可调且有文献默认值**(见对照表),用 Dr. Dave 的 TP 曲线(throw vs 切角/速度/旋)和 Mathavan 的回弹曲线作回归测试基准。