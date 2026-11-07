# gap:美式 pool(K-66)库边参数基准表 + 报告间参数矛盾仲裁

## KEY TAKEAWAYS
- Mathavan 2010 的 h=7R/5 (sinθ=2/5) 是论文中无引用的断言(原句称 'In both snooker and pool'),对 snooker 大致成立,对 pool 明确错误;pool v1 必须用 WPA 规格 63.5%±1% 球径,即 h=36.3mm、sinθ=0.27、θ≈15.7°。
- 用错口径的后果量级:Han 2005 数值实验显示 h=1.4R 相比 1.27R 使滚动球反弹角系统性偏长 4.7–5.8°、垂直回弹速度比 0.69 vs 0.81,跨台 bank 落点误差约 0.86 个 diamond。
- pooltool 自身用的是 WPA 口径:specs.py:108 的 cushion_height=0.64×2R(64% 球径,在 WPA 容差内),han_2005 与 stronge_compliant 两模型均由此推 θ;7R/5 只在 ekiefl 博客中用作 pocket 后沿高度。
- pooltool 两处矛盾属实:han_2005/properties.py:21 的 e(v) 是不可达死代码且常数项 0.50 与 Han 原文 0.39 不符;omega_ratio 类默认 1.7(model.py:126)但 default_resolver 传 1.8(resolver.py:79),运行时实际生效 1.8。
- 美式 pool 口径不存在一手的 K-66 库边 COR/摩擦实测公开数据;最接近的是 Dr. Dave TP B.28(2023)的 5 张台 sliding bank 实测 through-diamond 表(7' Diamond 比 'on system' 台短近 1 个 diamond)。
- 可用的半一手定量锚点:1/3、2/3、满侧旋垂直 kick ≈ 1/2/3 diamonds 横移(Dr. Dave effects FAQ);Diamond 系统修正约 10% 或 1/4 diamond(Diamond FAQ);TP 7.3 算例 e=0.7@1.5m/s、μ_rail=0.17;WPA §8 lag 4–4.5 台长。
- 速度相关 COR 两条现成曲线均不采纳:Mathavan 二次拟合不在论文正文且与其自述 0.818 平均等效 COR 数值矛盾、系 snooker 器材;Han 2005 e(v) 形状反物理且 van Balen 在同类 carom 器材上证伪(常数 0.85 更好)。
- v1 落地公式:e_c 取常数 0.85(Diamond/Artemis 可上探至 ~0.9),暴露 e_c(v_n)=clamp(e0+k·(v_n−1), 0.6, 0.98) 钩子且 k 默认 0 待标定;μw 取 0.20(区间 0.14–0.22);有效域法向分速 ≤2.5 m/s(Mathavan 刚性假设上限)。
- 标定优先级:垂直滚动入库回弹比曲线(定 e_c 与 k)→ 慢速斜入库反弹角(验 θ)→ 快速 sliding bank 复刻 TP B.28(联合验证+品牌偏置)→ 三档侧旋 kick(锁 μw)→ 侧旋保留率(锁切向柔顺参数)。
- 鼻高≠接触点高:计入 K-66 圆鼻半径 5mm 后几何接触角 sinθ_eff≈0.23,TP 7.3 有效作用线甚至低至 0.08R,建议 sinθ∈[0.23,0.28] 作为标定区间而非定死。

## OPEN QUESTIONS
- 二次拟合 y=−0.0877x²+1.131x−0.0953 的确切出处未能核实:不在 Mathavan 2010 正文、pooltool 代码/git 历史或 ekiefl 两篇博文中,推测是对论文 Fig. 7 的数字化拟合;且其隐含速度比(0.87–0.95)与论文自述的 0.818 平均等效 COR 存在数值张力,需要拿到 Fig. 7 原始数据点才能裁决。
- 未找到 K-66(或 Artemis)库胶的厂商 COR/硬度(durometer)datasheet,也未找到任何 pool 台库边的一手高速摄影 COR/摩擦实测;champbilliards 的鼻高试验只有定性结论。
- snooker 台的官方鼻高数值未获得(WPBSA 规则不含百分比),故 7R/5 对 snooker 的准确性只能算'与 Mathavan 自身实验自洽',未独立证实。
- TP 7.3 中有效作用线 a=0.08R 与几何鼻高 0.27R 的矛盾(库胶压缩期间法向冲量作用线位置)没有权威解答,直接影响 θ 的'有效值'应取多少。
- billiards.colostate.edu 域名多个页面返回 403(如 Diamond FAQ 旧址、HSV B.41),部分内容系经 drdavepoolinfo.com 镜像与摘要获取,未逐字核对原页;Dr. Dave 速度对 bank 角影响的 HSV B.41 定量数据未取得。
- pooltool resolver 默认 omega_ratio=1.8 的标定依据在 CHANGELOG/PR(#240、#256)中未记录,1.7→1.8 的差异对 pool 侧旋保留率的影响未量化。
- Han 2005 原始论文 PDF 未直接取得,e(v)=0.39+0.257v−0.044v² 系经 van Balen 论文转引核实(与 pooltool 死代码的 0.50 常数不一致这一点已双源确认)。

## REPORT
# 美式 Pool 库边碰撞模型 v1 参数仲裁与推荐报告

目标器材:K-66 库胶 + 2.25"/57.15mm Aramith 球 + Simonis 860;仲裁依据:Mathavan 2010 原文、WPA 官方规格 PDF、Dr. Dave FAQ/TP 原文、pooltool 源码与 git 历史、van Balen 学位论文,以及用 Han 2005 方程做的数值敏感性实验。

---

## 1. 仲裁一:接触高度口径 —— 7R/5 是论文的无引用断言,pool 必须用 WPA 口径 sinθ≈0.27

**Mathavan 2010 原文核实**(全文 PDF 已提取文本):论文原句为 *"According to Fig. 3, the height of the contact point at the rail (i.e. I) is h. In both snooker and pool h = 7R/5, where R is the ball radius. … thus, sinθ = 2/5."* —— 这是**无任何引用的断言**,不是对其实验台(Riley Renaissance snooker 台)的实测,也没有区分 snooker 和 pool。对 snooker(L 型库胶、3/8" 高的平直鼻面,球 52.5mm)这一取值大致可信(其自身实验拟合一致);**对 pool 则明确错误**。

**WPA 一手规格**(RECOMMENDED-EQUIPMENT-SPECIFICATIONS, Nov 2001, https://wpapool.com/wp-content/uploads/2024/01/RECOMMENDED-EQUIPMENT-SPECIFICATIONS.pdf §7,原文逐字):*"Rail height (nose-line to table-bed) should be 63 ½% (+1%) or between 62 ½% and 64 ½% of the diameter of the ball."* 即鼻高 h = 0.635D = 36.30mm(2.25" 球),h/R = 1.27,**sinθ = 0.27,θ ≈ 15.66°**,容差带 sinθ ∈ [0.25, 0.29]。

**K-66 实际安装鼻高**:champbilliards K-66 页面给出鼻高-角度对照表(61%→1-3/8"、62%→1-13/32"、63%→1-27/64"、64%→1-7/16",对应型面角 22°30′–23°30′),其自测结论偏好 1-13/32"(62%);legacybilliards 称标准鼻高应在 1-3/8"~1-7/16"(61%~64%)。即 K-66 装好后落在 WPA 容差带内,**绝不会到 70%(7R/5)**。Dr. Dave cushion nose height FAQ(https://drdavepoolinfo.com/faq/table/cushion-nose-height/)同样引 WPA 63.5%±1%,并解释 0.7D(恰为击打中心 center of percussion,TP 4.2)会把球压进台面、磨出 rail groove 并跳球,0.635D 是经验折中。

**两个细化口径(标定时注意)**:
- 鼻高 ≠ 接触点高。考虑 K-66 圆鼻半径 r_n≈5mm(pooltool `cushion_nose_radius=0.005`),几何接触角 sinθ_eff = (h−R)/(R+r_n) ≈ 7.7/33.6 ≈ 0.23(θ≈13.3°),略低于 0.27。
- Dr. Dave TP 7.3 自己的算例甚至用 a = 0.08R(法向冲量有效作用线高于球心 0.08R),暗示压缩过程中有效作用线可能远低于几何鼻高。v1 建议按主流约定 sinθ = h/R−1 = 0.27,把 sinθ ∈ [0.23, 0.28] 留作标定区间。

**用错口径的后果量级**(用 Han 2005 方程做的数值实验,e=0.85、μ=0.2、滚动球):
- 反弹角(自法线量):入射 30°/45°/60° 时,h=1.4R 比 h=1.27R 分别偏长 **+4.7° / +5.8° / +4.8°**(与速度无关,系统性偏差);
- 垂直入射滚动球回弹速度比:h=1.27R 为 **0.811**,h=1.4R 为 **0.690**,即回弹速度系统性偏低约 15%(相对);
- 换算成 bank 误差:9 尺台横向 bank(台宽 50"),45° 入射时 tan(49.5°)−tan(43.7°)≈0.21,落点偏差 ≈ 10.7 英寸 ≈ **0.86 个 diamond** —— 足以让所有 bank/kick 系统性失真。

**结论:pool v1 采用 θ = arcsin(0.27) ≈ 15.7°(h = 36.3mm = 0.635D),7R/5 仅当模拟 snooker 时使用。**

## 2. 仲裁二:pooltool 实现核对 —— pooltool 用的就是 WPA 口径;死代码与 omega_ratio 矛盾均属实

- **接触高度**:`pooltool/objects/table/specs.py:108` `cushion_height = 0.64 * 2 * 0.028575`(= 0.036576m,球径的 64%,在 WPA 容差内;`collection.py:34` 同值)。`han_2005/model.py:40` 用 `theta_a = arcsin(h/R − 1)`(h 取 `cushion.height`,model.py:100);`stronge_compliant/model.py:33` 经 `cushion.get_normal_3d`(`components.py:186-212`)取 3D 法线,而 `layout.py:27,74` 把库边线端点 z 设为 cushion_height,故两个模型同样隐含 sinθ = 0.28。**确认:pooltool 用 WPA 口径,不用论文的 7R/5**(7R/5 在 ekiefl 博客里只用于 pocket 后沿高度 h_M,与库边无关)。
- **死代码**:`han_2005/properties.py:20-21` —— `return e_c` 之后紧跟不可达的 `return max([0.40, 0.50 + 0.257*v − 0.044*v²])`。且注意:**常数项 0.50 与 Han 2005 原文不符**。van Balen 论文(p.24)引 Han 原式为 **e = 0.39 + 0.257·v_x0 − 0.044·v_x0²**;pooltool 版本把 0.39 改成 0.50 并加 0.40 下限,改动无出处。docstring 引 van Balen 建议常数 0.85。
- **omega_ratio 矛盾属实**:类默认 1.7(`stronge_compliant/model.py:126,142`),但 `resolver.py:79,82` 的 `default_resolver()` 显式传 1.8 —— **运行时实际生效 1.8**(resolver.yaml VERSION=11)。CHANGELOG 确认 Stronge Compliant 已取代 Mathavan 2010 成为默认库边模型([#256]),但未记录 1.7→1.8 的调参依据。
- 球参数默认:`objects/ball/params.py:81-82` e_c=0.85、f_c=0.2(POOL_GENERIC 同,params.py:169-170),并自注 "nothing here is well-researched"。

## 3. 美式 pool 口径的一手/半一手库边数据清单

**半一手定量数据(Dr. Dave,pool 器材实测):**
- **TP B.28**(2023-08,https://drdavepoolinfo.com/technical_proofs/new/TP_B-28.pdf):5 张台的 sliding bank 实测 through-diamond 表(aim = 0.5/1/1.5/2/2.5/3):9' Olhausen meas=[1.38,2.72,3.89,5.07,6.38,7.74];9' Diamond Red Label=[1.40,2.93,4.52,5.60,6.92,8.30];7' Valley=[1.51,2.74,4.12,5.19,6.52,7.54];9' Brunswick GC=[1.27,2.88,4.38,5.38,6.56,7.96];7' Diamond bar box=[1.6,3.31,4.94,6.22,7.55,8.59]。结论原文:*"The 7' Diamond bar-box banked almost a diamond shorter than typical 'on system' tables!"*(注意表中数值越大 = 反弹越"短")。这是目前公开的最接近一手的 pool 库边定量数据集。
- **Dr. Dave bank/kick effects FAQ**(https://drdavepoolinfo.com/faq/bank-kick/effects/)定量锚点:垂直入库 kick 时 *"1/3, 2/3 and 3/3 of maximum spin result in approximately 1, 2 or 3 diamonds of cross-table change"*;速度越快 bank 越短(机制主要是快速→无滚顶旋→sliding 状态,及 rail throwback);"bouncier cushions(更高法向 COR)使 kick/bank 更短"。
- **Diamond 'bank 短' 的量化说法**(https://drdavepoolinfo.com/faq/bank-kick/diamond/):Diamond 用 Artemis 库胶 "very bouncy";鼻高 "often lower than normal and angled down slightly";系统修正量:2-to-1 与 Corner-5 系统约 **10%**(瞄 0.9 代替 1、2.7 代替 3),Plus Two 系统约 **1/4 diamond**;Blue Label 仍比其他品牌 bank 短。
- **TP 7.3**(https://drdavepoolinfo.com/technical_proofs/TP_7-3.pdf):算例采用 rail COR **e = 0.7**(v = 5 ft/s ≈ 1.52 m/s)、球-库摩擦 **μ = 0.17**、有效作用高 a = 0.08R。TP 6.3 证明:因 e<1,忽略摩擦时反弹角必大于入射角(θr>θa)。
- **WPA §8 功能性速度规格**:发球点中杆平击 firm stroke,球须在不跳的情况下走满 **4~4.5 个台长** —— 可作 e_c 与 u_r 联合标定的约束。

**论文/学位论文迁移数据(非 pool 器材):**
- Mathavan 2010(snooker,Riley 台):最优拟合 **e_e = 0.98(Stronge 能量型 COR)、μw = 0.14**;滚动球垂直入库的等效速度比 **0.818**(平均);刚性假设有效域 **V0(法向) < 2.5 m/s**;μs(球-呢)实测 0.178–0.245,取 0.212。
- Marlow《The Physics of Pool》(经 Mathavan 转引):pool 库边 e_e = **0.55**(定义偏"有效值",与 0.98 的能量型定义不可直接比较)。
- van Balen 学位论文(carom 台,https://essay.utwente.nl/59134/1/scriptie_J_van_Balen.pdf p.24-25):实现 Han e(v) 后 15 条三库路径复现很差,改用**常数 e = 0.85** 明显更好;μs=0.2(Marlow)、μsp 由 0.044 调至 0.022。
- champbilliards 的 K-66 鼻高对比试验:仅有定性结论(62% 鼻高 "maximum performance in rebound and consistency"),无 COR 数值。

**一手 K-66/pool 台库边 COR、摩擦系数的公开实测(高速摄影、力学台架):经多轮检索未找到 —— 判定为"无"。** 最接近的是 TP B.28 的 bank 落点数据与 Dr. Dave 的 HSV 视频(未提供数值表)。这意味着 e_c、μw 对 K-66+860 布的精确值必须自标定。

## 4. 速度相关 COR:两条现成曲线都不应作为 pool 默认,落地为"常数基值 + 待标定线性修正"

- **Mathavan 二次拟合 y = −0.0877x² + 1.131x − 0.0953**:该式**不在论文正文中**(全文文本已检索;论文对 Fig. 7 的自述只有 "等效 COR 平均 0.818" 与 e_e=0.98/μw=0.14 的 RMS 拟合),也不在 pooltool 代码、git 历史或 ekiefl 两篇博文中 —— 应是对 Fig. 7 的数字化拟合,出处待查。且数值上有张力:按 m/s 代入,该式给出的速度比在 0.87–0.95(0.5–2.5 m/s),显著高于论文自述的 0.818 平均。即便成立,它也是 **snooker 器材(L 型库胶+羊毛呢+52.5mm 球)在 h=1.4R 几何下的观测**,与 pool 的 θ、库胶、包布都不同,**不可直接迁移**。
- **Han 2005 e(v) = 0.39 + 0.257v − 0.044v²(carom)**:v=0 时 e=0.39、2.9 m/s 处峰值 0.77 —— "COR 随速度先升后降"违背橡胶常识,更像是把几何/摩擦效应混进了拟合;van Balen 在**同类 carom 器材**上都无法用它复现路径(常数 0.85 更好);pooltool 中本来就是死代码且常数被改。**弃用。**
- **落地建议**:v1 用常数 e_c;暴露参数化钩子 `e_c(v_n) = clamp(e0 + k·(v_n − v_ref), e_min, e_max)`,默认 k=0、v_ref=1 m/s、clamp [0.6, 0.98],k 由自拍 240fps 的"垂直滚动入库回弹比 vs 入射速度"曲线标定。理由:(a) 无 pool 一手数据支持任何非常数形状;(b) "打得越狠 bank 越短"在冲量模型里主要由 sliding/滚动状态与 μw 解释,不需要靠 e(v) 硬凑(Dr. Dave HSV B.41 甚至猜测 rail throwback 与 COR 速度效应互相抵消);(c) 二次式在外推端(v→0、v>3 m/s)行为病态,线性+clamp 更稳。

## 5. 美式 pool v1 库边参数推荐表

| 参数 | 推荐值 (v1) | 依据/来源 | 可信度 |
|---|---|---|---|
| 接触高度 h | 0.635D = 36.30mm(h/R=1.27) | WPA 规格 §7 逐字;K-66 安装实践 61–64% | **一手规格** |
| θ(法线下倾角) | arcsin(0.27) ≈ 15.7°;标定区间 sinθ∈[0.23, 0.28](鼻半径/有效作用线不确定性) | WPA + 几何推导 + TP 7.3 旁证 | 规格+推导;区间待标定 |
| e_c 基值(法向 COR,Han/Stronge 型模型口径) | 0.85(Diamond/Artemis 可上探 0.88–0.92;旧 K-66 下探 0.75) | van Balen carom 路径拟合;pooltool 默认;TP 7.3 的 0.7 与 Marlow 0.55 为不同定义下界旁证 | **论文迁移,必须标定** |
| e_c(v) 曲线 | 常数;钩子 e0 + k·(v_n−1),k 默认 0,clamp [0.6, 0.98] | 本报告 §4 论证;Mathavan 有效域启发 | **待标定** |
| μw(球-库摩擦) | 0.20(区间 0.14–0.22) | Mathavan snooker 拟合 0.14(下界);TP 7.3 0.17;pooltool/Marlow 惯例 0.2(布包 K-66 摩擦更高) | 论文迁移,待标定 |
| 有效速度域 | 法向分速 v_n ≤ 2.5 m/s 内模型可信;2.5–5 m/s 标注"外推",预期回弹变短、球陷入库胶 | Mathavan 2010 原文(V0>2.5 m/s 实验偏离刚性假设) | 论文迁移(snooker),pool 域待验证 |
| 行为校验锚点 | 滚动球 2:1 through-diamond;sliding bank 对齐 TP B.28;1/3 / 2/3 / 满侧旋垂直 kick → 1/2/3 diamonds;WPA 4–4.5 台长 lag | Dr. Dave FAQ/TP + WPA §8 | 半一手实测 |
| Diamond 台品牌偏置(可选) | bank 角"变短"偏置:7' Diamond ≈ −1 diamond @ aim 3(或系统修正 −10%) | TP B.28 实测表;Diamond FAQ | 半一手实测 |

**pooltool 侧应同步修正**:(1) 删除 `han_2005/properties.py:21` 死代码或恢复 Han 原式 0.39 并注明弃用原因;(2) 统一 omega_ratio(类默认 1.7 vs resolver 1.8),补记 1.8 的标定依据;(3) 0.64D 可保留(在 WPA 容差内),若追求名义值改 0.635D。

## 6. 需自拍 240fps 视频标定的项(按优先级)

1. **垂直入库滚动球回弹速度比 vs 入射速度**(0.5–4 m/s,≥8 个速度点,每点 ≥5 次):直接标定 e_c 与 e(v) 斜率 k;同时观察 >2.5 m/s 是否出现"陷库"拐点(定有效速度域)。
2. **无侧旋滚动球斜入库反弹角**(15°/30°/45°/60°,慢速):验证 θ/h 口径(反弹角对 θ 最敏感,对速度不敏感 —— Mathavan Fig. 8 与本报告数值实验均如此)。
3. **停击(stun/sliding)球斜入库**:快速横台 bank,复刻 TP B.28 的 aim→meas 表,标定 μw 与 e_c 的联合效应,并量化自家台相对 "on system" 的品牌偏置。
4. **垂直 kick + 1/3、2/3、满侧旋**:验证 1/2/3 diamonds 锚点,单独锁定 μw。
5. **侧旋保留率**:入库前后侧旋角速度比(高速特写球面标记),约束切向柔顺参数(omega_ratio / beta_t)。
6. **lag 测试**:WPA §8 的 4–4.5 台长,联合校验 e_c 与滚动阻力 u_r(避免把台呢损耗错算进库边)。
7. (可选)**库鼻接触特写**:接触时长与鼻部下压量随速度的变化,支撑 h_eff(v) 的后续建模。

## 附:关键源文件与行号
- `../pooltool/pooltool/physics/resolve/ball_cushion/han_2005/properties.py:20-21`(死代码)
- `../pooltool/pooltool/physics/resolve/ball_cushion/han_2005/model.py:40,100`(θ=arcsin(h/R−1),h=cushion.height)
- `../pooltool/pooltool/physics/resolve/ball_cushion/stronge_compliant/model.py:126,142`(omega_ratio=1.7)与 `../pooltool/pooltool/physics/resolve/resolver.py:79,82`(默认 resolver 用 1.8)
- `../pooltool/pooltool/objects/table/specs.py:108`(0.64×2R)、`layout.py:27,74`、`components.py:186-212`
- `../pooltool/pooltool/objects/ball/params.py:81-82,163-172`(e_c=0.85、f_c=0.2)