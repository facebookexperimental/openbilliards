# gap:开球 15 球多体碰撞:两条路线对散型保真度的定量对比与混合架构成本(Gismeros Moreno 论文细读 + pooltool 敏感度实验)

## KEY TAKEAWAYS
- Gismeros Moreno et al. (Nonlinear Dyn 107:1859–1886, 2022, DOI 10.1007/s11071-021-07117-4) 用 Lankarani–Nikravesh(ball-ball c_r=0.93)+ Hertz(ball-cloth)+ LN(ball-cushion c_r=0.98, μ=0.14),n=1.5,但开球只模拟了 cue+3 球,Matlab 下 3–4 s 物理时长要 23,613–104,252 s,且无 15 球散型实验验证。
- 光滑接触法自己也高度依赖初始间隙:论文测得有效 α 仅 10⁻⁹–10⁻⁷ m,间隙过小出现 z 向能量增益 artifact,取 2.13×10⁻⁴ m 时出射方向被 non-smooth 冲量模型证伪——compliant 不是保真度银弹。
- 本地 pooltool 40 局 15 球开球实测:进袋率、散型均距、总路径在 spacing_factor 1e-4→1e-2 三个量级内的差异小于 seed 方差,散型分布不是被 spacing 数值调出来的,无需用 footage 精调数值。
- 单局结果是纯混沌:apex 球移动 1 µm 就使终位置最大偏移 7.4 cm 并改变进袋数,100 µm 时最大偏移 1.5 m——任何方案都只能做分布匹配,不能复现具体某杆。
- 角球出射角被 rack lattice 几何锁死在 60°/120°(sf≤1e-2 时 sd 仅 0.02–0.2°),两条路线在方向上不会有大分歧,分歧在能量分配。
- pooltool 的 10% momentum-theft hack(ball_ball/core.py:133, theft_fraction=0.10 @ :188)在紧 rack(sf≤1e-3)开球中 25% 的局被触发 ~290 次/局,docstring 'practically a no-op' 的说法不成立——这是序列冲量方案真正的保真度风险点。
- 混合架构计算上完全可行(接触时长 ~100–300 µs,dt~1–2 µs 积分 2–5 ms 窗口,编译实现 <10 ms wall)且 fixed-step 下确定性代价低,但引入 K/c_r/接触期摩擦的标定负担。
- 最终建议:基线用序列冲量 + seeded 随机间隙(名义缝隙 0.05–0.5 mm,避开 ≤1e-4·R 病态区);用 frozen-cluster 迭代求解替换 10% hack;局部 compliant 积分作为 phase-2 可选增强(K≈3.5×10⁸ N/m^1.5, c_r=0.93),用事件驱动版本做回归 oracle。
- pooltool 事件驱动一次 15 球开球 wall time 252±226 ms(物理时长 ~9.3 s,~870 events),同 (sf, seed) 重跑 bitwise 一致。

## OPEN QUESTIONS
- 未找到 Gismeros Moreno 组 2022 年后单独的 billiard 后续论文;2000 fps 高速视频验证就在 2021/2022 原文的第三个实验里(且仅为视觉吻合,无数值误差指标)——任务中'2022 后续'可能即指本文或其 2020 会议先导文(Corral et al., Comput. Methods Appl. Sci. 53:79–86)。
- K ≈ 3.5×10⁸ N/m^1.5 是我按论文 Eq. 3.4–3.5 和 Table 1 材料参数推算的,论文本身未给数值。
- 本地实验每格仅 10 seeds,进袋率 0.6→1.1 的弱趋势(sf 1e-4→1e-1)统计功效不足以确认;总路径指标基于 dt=0.01 s 连续化折线近似。
- 只测了 pooltool 默认 FrictionalInelastic 模型,未对比 FrictionalMathavan;也未验证事件爆炸局(hack 触发 ~290 次)的散型分布是否与正常局系统性不同(样本仅 5 局)。
- '序列两两冲量 vs 同时多体积分'的直接定量散型对比在文献中不存在(论文只有单点定性证伪),要拿到这组数据需自己实现 compliant 参考积分器对拍。

## REPORT
# 开球(break)实现方案对比:序列两两冲量 vs 非线性光滑接触积分

## 1. 一手论文精读:Gismeros Moreno et al., *Nonlinear Dynamics* 107:1859–1886 (2022)

论文:Raúl Gismeros Moreno, Eduardo Corral Abad, Jesús Meneses Alonso, María Jesús Gómez García, Cristina Castejón Sisamón, "Modelling multiple-simultaneous impact problems with a nonlinear smooth approach: pool/billiard application", published online 2021-12-14, open access, DOI 10.1007/s11071-021-07117-4(https://link.springer.com/article/10.1007/s11071-021-07117-4)。以下所有数字均直接取自全文 PDF(已抓取本地精读)。

### 1.1 接触力与摩擦模型
- **Ball-ball**:Lankarani–Nikravesh (LN) 模型,F_N = K·δ^1.5 + χ·δ^1.5·δ̇,χ = 3(1−c_r²)/(4·δ̇⁻)·K;c_r = 0.93(Table 2)。摩擦两种:Threlfall 常数 μ = 0.06,或 Alciatore 速度相关 μ(v) = 9.951×10⁻³ + 0.108·e^(−1.088v)。
- **Ball-cloth**:纯 Hertz(F_N = K·δ^1.5,理由是近似永久接触、可忽略弹性伸长耗散),摩擦用 Ambrósio 模型,μ = 0.2。
- **Ball-cushion**:LN,c_r = 0.85(无摩擦版)或 Mathavan et al. 标定值 c_r = 0.98、μ = 0.14 + Ambrósio 摩擦。
- 指数 n = 1.5;材料参数(Table 1):球 phenol-formaldehyde resin,E = 3800 MPa,ν = 0.375;库边 rubber E = 7 MPa,ν = 0.50;台呢 wool E = 3100 MPa,ν = 0.38。论文未给 K 数值,按其 Eq. 3.4–3.5 用 Table 1 值可推算 ball-ball K ≈ 3.5×10⁸ N/m^1.5(我方推算,非论文原文)。球:直径 57.15 mm,质量 170 g,J = 5.5×10⁻⁵ kg·m²。

### 1.2 规模、时间步长与计算成本(对我们最关键)
- **开球只模拟了 cue + 前 3 颗 rack 球,不是 15 球**。击球速度 10.729 m/s (24 mph)。
- Matlab ODE 积分器,默认步长 0.01 s 时结果不自洽(对称问题出现 y 向漂移),改 1×10⁻⁵ s 后才收敛;积分器在接触起始时刻自动缩步。
- 计算成本(Fig. 16,3–4 s 物理时长、仅 4 球):Standard Lagrange 23,613 s;Baumgarte 24,876 s;Augmented Lagrangian @1e-5 s 步长 80,413 s;Direct correction @1e-5 s 104,252 s。去掉重力/台呢法向力的"调优版"也要 440–1,730 s。即一次 4 球开球要跑数小时到一天(Matlab 实现,量级参考)。

### 1.3 初始间隙 α 研究(光滑法自己也要"调间隙")
球心距 d = 2R + α,测试 α ∈ {10⁻⁹, 10⁻⁸, 10⁻⁷, 10⁻⁶, 2.1325735×10⁻⁴} m(Table 3):
- α 过小:cue 和 yellow 球在滚动中出现非物理的 z 向爬升(能量增益 artifact);
- α = 10⁻⁶:yellow 球在 t≈0.7 s 多撞了 red/blue 两球,x 向轨迹整体改变;
- α = 2.13×10⁻⁴(random):yellow 球首撞后沿 −x 运动,**"This was later checked in a non-smooth model and proved to be wrong"**——即光滑法在大间隙下给出定性错误的出射方向,反而被冲量法证伪;
- 结论:有效区间 α ∈ 10⁻⁹–10⁻⁷ m。**光滑接触法对初始间隙同样高度敏感,并没有消除"间隙调参"问题,只是把可行区间推到了更小的量级。**

### 1.4 实验验证的定量程度
- Ball-cushion:2000 frames/s 高速视频(来自第三方拍摄者),入射速度 2.724 m/s,结论仅为 "results almost identical to the real shot"(Fig. 20)——**视觉吻合,无数值误差指标**;对 Mathavan et al. 实验数据,低速吻合好,≥2.5 m/s 出现 "slight deviation"。
- Ball-ball:对 Alciatore "30° rule" 偏转角数据,3 mph 下 "quite similar",最大偏转角出现在 hit fraction f ≈ 0.7–0.9。
- **没有任何 15 球开球散型的实验验证;没有系统性的"序列两两冲量 vs 同时多体积分"定量对比**——唯一交叉点就是 1.3 中那次方向性证伪,且方向是"冲量法证伪光滑法"。注:任务提示中提到的"2022 年后续 2000fps 验证"即本文第三个实验,不存在该组后续单独的 billiard 验证论文(该组 2020 年有先导会议文 Corral, Gismeros et al., "Dynamic modeling and analysis of pool balls interaction", Comput. Methods Appl. Sci. vol 53, pp 79–86;2021 年另有 contact 综述)。

## 2. 本地 pooltool 实验(序列冲量 + spacing_factor)

### 2.1 setup
源码 ../pooltool(v0.6.0,editable 安装于 /tmp/ptbreak)。脚本 /tmp/ptbreak/break_sweep.py、/tmp/ptbreak/analyze.py,原始数据 /tmp/ptbreak/results.json。15 球 8-ball rack,cue 固定在 head spot (w/2, 0.25l),V0 = 8 m/s,phi = 90°,中心击打(a=b=θ=0),击球参数跨所有 run 完全一致;默认物理:`FrictionalInelastic` + `AlciatoreBallBallFriction(a=0.009951, b=0.108, c=1.088)`(pooltool/physics/resolve/resolver.py 的 default_resolver;摩擦参数与论文 Eq. 3.8 同源 Alciatore)。spacing_factor ∈ {1e-4, 1e-3, 1e-2, 1e-1} × seed 0–9。注意 pooltool 的间隙实现:layouts.py:246 把 lattice 半径放大为 R(1+sf),layouts.py:263/280-284 再在半径 sf·R 的圆盘内随机 wiggle;另外每次碰撞 resolve 前 make_kiss 会强制加 MIN_DIST = 1e-6 m 的 spacer(ball_ball/core.py:86,constants.py:16)。

### 2.2 结果(每格 10 seeds,mean±sd)

| sf | 进袋数 | 散型(在台球两两均距 m) | 总滚动路径 m | ball-ball 事件数(中位) | 触发 momentum-hack 的 run | 角球出射角 sd(左/右, °) |
|---|---|---|---|---|---|---|
| 1e-4 | 0.60±0.80 | 0.639±0.120 | 20.1±3.2 | 41 | 2/10 | 0.194 / 0.021 |
| 1e-3 | 0.70±0.78 | 0.650±0.074 | 20.8±3.4 | 41 | 3/10 | 0.192 / 0.025 |
| 1e-2 | 0.90±0.70 | 0.545±0.165 | 21.1±4.7 | 38 | 0/10 | 0.191 / 0.131 |
| 1e-1 | 1.10±0.94 | 0.653±0.145 | 21.0±3.8 | 36 | 0/10 | 0.895 / 1.375 |

补充测量:
- **微扰混沌**(sf=1e-3, seed=0,只动 apex 球 x 坐标):1 µm → 终位置平均偏移 1.5 cm、最大 7.4 cm、进袋数 0→1;10 µm → 平均 11.4 cm、最大 46.6 cm;100 µm → 平均 37.6 cm、最大 1.5 m、进袋 0→2。单次开球对初始几何的放大系数 ~10⁴–10⁵。
- **matched-seed 跨 sf 对比**:同 seed 下 sf 从 1e-4 换到 1e-3/1e-2/1e-1,单球终位置平均移动 0.44/0.43/0.54 m——即改 spacing 一个量级,单局结果就完全换了一局,但分布统计(上表)几乎不动。
- **确定性**:同 (sf, seed) 重跑逐球 bitwise 一致。
- **性能**:一次完整 15 球 break(物理时长 ~9.3 s,~870 events)wall time 252±226 ms(高方差来自事件爆炸 run)。

### 2.3 resolve_continually_touching(10% momentum-theft hack)实测
代码在 pooltool/physics/resolve/ball_ball/core.py:133,`theft_fraction = 0.10` 在 core.py:188;每次 ball-ball resolve 都会走一遍(core.py:240),当两球沿球心连线相对速度 <1 mm/s 且速度方向余弦相似度 >0.9 时,被追球"偷走"追球者 10% 的径向动量。docstring(core.py:171-174)声称 "practically speaking, this is a no-op method for all but the most contrived simulation conditions"。**实测在开球中不成立**:monkeypatch 计数显示,sf ≤ 1e-3 的 20 个 run 中有 5 个(25%)发生 Newton's-cradle 式事件爆炸(ball-ball 事件从正常 ~40 涨到 333–354),其中 hack 实际改写速度 288–313 次/局;sf ≥ 1e-2 时 20 局共触发 ≤1 次。即**rack 越紧、序列冲量法越依赖这个无理论根据的 phenomenological hack 来维持仿真前进**,这些局的后续动力学被 ~290 次 10% 动量转移实质性塑形。

### 2.4 对散型敏感度的解读
- **分布层面不敏感**:进袋率、散型均距、总路径在 sf 跨三个量级(1e-4→1e-2)内的组间差异都小于组内 seed 方差(n=10,进袋率 0.6→0.9 约 1 个标准误)。sf=1e-1(名义缝隙 ~5.7 mm,已是明显松 rack)才开始出现可辨趋势(进袋率升至 1.1,角球角度 sd 涨一个量级)。
- **单局层面极端敏感**:纯混沌,1 µm 都能改变进袋结果。所以"复现某一杆真实开球"对任何方案都不可能,有意义的只有分布匹配。
- **散型的一阶结构由 lattice 几何锁定**:两颗后排角球出射角在所有 sf ≤ 1e-2 下钉死在 60.0°/120.0°(±0.02–0.2°)——序列冲量沿球心连线传递动量,方向由 rack 几何决定,与 spacing 取值基本无关;这与 Hertz 链的一阶物理(力沿球心连线)一致,方向上两条路线不会有大分歧,**分歧主要在能量/速度在各球间的分配**(论文 1.3 的证伪案例正是分配/方向在病态间隙下出错)。

## 3. 结论输出

### (a) 序列冲量方案对 spacing 的敏感度结论
散型**不是**被 spacing_factor 的数值"调出来的":在 1e-4–1e-2(缝隙 5.7 µm–0.57 mm,覆盖真实 rack 的紧/松范围)内,分布统计对 sf 稳健;真正被 spacing 决定的是(i)单局的具体实现(纯混沌种子)和(ii)是否落入事件爆炸病态区(sf ≤ 1e-3 时 25% 概率触发 momentum-theft hack)。因此**不需要用真实 footage 去精调 spacing 的数值大小**,但建议:用 seeded RNG 从一个量级合理的分布(建议名义缝隙 0.05–0.5 mm,即 sf ~ 1e-3–1e-2)采样,如追求统计保真,可用真实开球 footage 的**分布指标**(进袋率、散型半径直方图、球速衰减)做一次性校验而非逐参数标定。真实的保真度风险点不是 spacing 数值,而是紧 rack 下的 hack 依赖(见 2.3)。

### (b) 混合架构(平时事件驱动、开球头几毫秒切局部 compliant 积分)评估
- **计算成本:完全可行**。Hertz 理论下 billiard ball-ball 接触时长 ~100–300 µs(随 v^(-1/5)),取 dt = 1–2 µs、积分开球后 2–5 ms 的接触窗口,~10³–10⁴ 步 × 16 球 ~30 接触对,编译型实现 wall time <10 ms,与事件驱动主循环的 ~百 ms 相比可忽略。论文的小时级成本是 Matlab 全程(3–4 s)积分 + 约束求解器造成的,不代表局部混合方案的成本。
- **确定性代价:低**。fixed-step + 固定接触遍历顺序即可单平台 bit-reproducible;跨平台浮点确定性问题(FMA、libm)与事件驱动内核本身面临的问题同级,不新增本质困难。反而比"随机 spacing"少一个 RNG 依赖(但 rack 摆放本身仍需 seeded 扰动,否则完美 lattice 是零测度的非物理输入)。
- **实现复杂度:中等**。需要:碰撞时刻的 frozen-cluster 检测(接触图);局部 compliant 积分器(LN/Hertz 力 + 接触期摩擦,velocity-Verlet 或 RK4);回切逻辑(以全部 δ<0 且相对速度分离为退出条件,把 (r,v,ω) 交还事件队列)。参数负担是真实成本:K(可由 E=3800 MPa、ν=0.375 推出 ~3.5×10⁸ N/m^1.5)、c_r=0.93、接触期摩擦模型都要标定,且论文表明光滑法自己对初始间隙(有效区间仅 10⁻⁹–10⁻⁷ m)和步长敏感、在参数不当时会给出被冲量法证伪的定性错误——**compliant 不是保真度银弹,只是把 hack 换成有物理语义的参数**。
- **收益**:消除两个 hack(spacing 的动力学角色、10% momentum-theft),多体同时接触的力传播(Newton's cradle 类场景)物理正确,能量分配有依据。

### (c) 给自研引擎的最终建议
1. **基线采用 pooltool 式序列冲量 + 微小随机间隙,这是性价比最优解**:分布层面散型对 spacing 稳健(本地 40 局实测)、确定性好(同 seed bitwise 复现)、单局 <300 ms。spacing 用 seeded 分布,名义缝隙取 0.05–0.5 mm(物理上对应真实 rack 的紧密度),避开 ≤ 1e-4·R 的病态区。
2. **不要照抄 resolve_continually_touching 的 10% momentum-theft**:它在紧 rack 开球中不是 edge case(25% 局触发、每局 ~290 次)。替代方案按复杂度递增:(i) 检测到 frozen chain 时用迭代序列冲量至收敛(Newton's cradle 可解);(ii) 小规模 LCP/impulse-propagation 求解 cluster;(iii) 即混合架构的局部 compliant 积分——只对"同一时刻接触图连通分量 >2 球"的事件启用。
3. **混合架构作为 phase-2 可选增强(feature flag)**,动机是移除 hack 与正确的多体力传播,而非"更准的散型"——散型分布两条路线在可标定范围内难分伯仲,且学术侧(Gismeros Moreno et al. 2022)也没有 15 球散型的实验验证可背书;真要主张保真度,唯一路径是自采高速 footage 做分布级校验,这对两条路线是同一笔成本。
4. 若做混合:K ≈ 3.5×10⁸ N/m^1.5、c_r = 0.93、n = 1.5、Alciatore μ(v)(pooltool 默认摩擦与论文同源,可直接对拍),dt ≤ 2 µs,积分窗口 ≤ 5 ms,fixed-step 保确定性;用事件驱动版本作为回归 oracle(方向性大偏差即报警,呼应论文中冲量法证伪光滑法的先例)。
