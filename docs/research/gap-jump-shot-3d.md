# gap:跳球/腾空球 3D 全链路物理的补齐设计与成本(用户核心需求,所有报告指出缺口但无人给出方案)

## KEY TAKEAWAYS
- 合法跳球机制(向下击打 vz<0 且 z=R → get_airborne_time 返回 0 → 立即 BALL_TABLE 事件 → e_t 反弹)在 pooltool main 已能跑通,本机实测事件序列 stick_ball@0 → ball_table@0 → 三次衰减弹跳后收敛,无需新建机制。
- 穿库实测确认且更糟:腾空球对库边检测返回 inf(detect/ball_cushion.py:176,229 TODO),球飞越库边后被当作落在无限大台面平面上,滚出台外 10.8 米无任何事件——rail 顶面和 BALL_OFF_TABLE 在 pooltool roadmap 里完全缺失,需我们原创。
- 所有库边模型(stronge_compliant/model.py:90、impulse_frictional_inelastic/model.py:31)和球-球模型(frictional_inelastic/__init__.py:99-100)都硬编码清零出射 vz 并强制 sliding;Han 2005 的 PZ 在 model.py:79 被注释且 :33 有 vz≈0 断言,腾空球进入会崩。
- 所有新增碰撞检测保持 ≤ 四次多项式:腾空抛物线(x,y 一次、z 二次)对定轴圆柱库鼻是 quartic,对 rail 顶面水平面是 quadratic,对袋口竖直圆柱是 quadratic,球-球是 quartic(#342 已合入);唯一例外 torus 袋沿为 8 次,上游 #304 确认不可解析,用柱段近似。
- 库边 resolve 选型:扩展现成的 sphere_half_space_collision.py(quaternion 把 get_normal_3d 真实法向旋到 z 轴)而非恢复 Han PZ——上游 #308 已判定 Han 3D 化不值得,#310 确认 impulse 模型 3D 化只需删除 vz 清零两行。
- 球-球含垂直分量按上游 #312 路线:3D line-of-centers 用 quaternion 旋转替换 xy 投影旋转、保留 TP A.14 式(4)(5) 中摩擦冲量的 k̂ 分量,即可重现 Dr. Dave 记载的双球 hop 与 hop overcut 效应。
- Dr. Dave/WPA Rule 2.11 确认合法跳球定义就是 bounce off slate(scoop 违法);球-slate 经台呢的恢复系数无公开权威值(pooltool 取 e_t=0.5),需自行用高速视频标定,是主要开放参数风险。
- Virtual Pool 3/4(Celeris)是商业全 3D 先例:手册明确记载 slate 反弹跳球、球跳上 rail 顶面弹回不犯规、Ball Off Table 犯规,证明产品路径可行,但无公开技术细节;真正可抄的工程细节在 pooltool issue #303 引用的旋转降维法(3D parabola vs cylinder → 2D parabola vs circle)。
- 新增事件类型只需 BALL_RAIL_TOP 和 BALL_OFF_TABLE 两个(库边事件复用现有类型加接触分类 payload);Zeno 风险除已解决的球-台弹跳(min_bounce_height=5mm)外,新形态是球贴库鼻下方时库/台事件交替爆炸,需给库边法向速度加吸收阈值。
- 分期建议成立:2.5D 约 10–14 人日(必须加 2–3 人日的库边平面穿越高度门控消除穿库),全 3D 增量约 22–32 人日,合计 32–46 人日;make_kiss 的 3D 位置卫生(z-drift、禁止压球入台)是上游 3 个 open issue 公认的隐藏痛点,勿低估。
- massé/空气阻力/Magnus 会破坏轨迹的多项式性,必须明确排除在解析事件驱动内核范围外,否则整个 ≤ 四次求根前提失效。

## OPEN QUESTIONS
- 球-slate 经台呢的恢复系数 e_t 与速度相关性:Dr. Dave 资料只给机理无数值,pooltool 默认 0.5 无出处,需实拍高速视频标定;腾空撞库鼻的 e_c/f_c 同样无测量数据。
- issue #303 中被引用的 'Simulator::predict_ball_rail_nose_collision' 出自哪个引擎/作者未能确认(疑似某私有 C++ 台球引擎的贡献者留言),仅方法本身可考。
- Virtual Pool 4 的物理引擎实现细节(Celeris)无任何公开技术资料,只能从 VP3 手册的行为描述反推功能范围。
- pooltool detector 对 BALL_TABLE 的事件优先级 tier(detector.py:87 TODO)在多球同时刻(如开球)场景下是否正确,上游自己也未验证。
- 腾空球撞库鼻的专门建模文献检索未见(台球文献均假设球贴台),半空间冲量模型+真实法向的选型是工程推断+上游共识,缺实验对照。
- 杆-球合法性校验(高抬角下杆尾越库净空、pinch 导致 massé 而非 jump 的判定)未纳入本次估算,若产品需要严格规则模拟需另行设计。

## REPORT
# 跳球(Jump Shot)全链路补齐:设计与成本评估

## 0. 结论速览

- **合法跳球的核心机制(向下击打 → 立即 ball-table 事件 → 弹起)在 pooltool main 分支已经能跑通**,我在本机用临时 venv 实测验证(见 §1.2),不是需要新建的机制。
- 真正缺的是四块:**腾空球 vs 库边检测**(现在返回 inf,实测穿库并滚出台面 12 米)、**库边/球-球 resolve 的出射 vz**(全部被硬编码清零)、**rail 顶面/飞出台面这两类事件**(pooltool roadmap 里都没有)、**3D 下的 make_kiss 位置卫生**(上游 3 个 open issue 公认的痛点)。
- 所有需要新增的碰撞时刻求解**都保持在 ≤ 四次多项式**(逐项推导见 §3a),内核现有的 ≤ 四次多项式求根器可以直接复用;唯一的例外是把袋口圆环建成 torus(8 次,上游已确认不可解析,用圆柱段近似)。
- "先 2.5D 后全 3D"分期**成立**,但建议 2.5D 阶段加一个约 2–3 人日的"库边平面穿越高度门控"来消除穿库,否则 2.5D 的可玩性会被穿库毁掉。
- 总工程量估计:**2.5D 阶段约 10–14 人日,全 3D 增量约 22–32 人日,合计 32–46 人日**(单个熟悉解析事件驱动物理的工程师,含测试)。

---

## 1. pooltool 源码核验(../pooltool,main @ 9a8abfe)

### 1.1 缺口清单(逐文件确认)

| 缺口 | 位置 | 现状 |
|---|---|---|
| 腾空球 vs 线性库边检测 | `pooltool/evolution/event_based/detect/ball_cushion.py:176-178` | `if s == airborne: # TODO; dtau_E = np.inf` |
| 腾空球 vs 圆形库边检测 | 同文件 `:229-231` | 同上,inf |
| 2D 库边检测函数自述 | 同文件 `:44,122` | docstring 明写 "This is broken for airborne balls" |
| Han 2005 垂直冲量 | `pooltool/physics/resolve/ball_cushion/han_2005/model.py:79` | `# rvw_R[1,2] += PZ/m` 被注释;`:33` 还有 `assert np.isclose(rvw_R[1,2], 0)`,腾空球进来直接 assert 崩 |
| StrongeCompliant(当前默认库边模型)清零 vz | `ball_cushion/stronge_compliant/model.py:89-90` | `# FIXME-3D: add z-velocity back in; rvw[1][2] = 0.0`,且无条件 `BallState(rvw, const.sliding)` |
| ImpulseFrictionalInelastic 清零 vz | `ball_cushion/impulse_frictional_inelastic/model.py:30-31` | 同上 |
| Mathavan 2010 | `ball_cushion/mathavan_2010/model.py:640-676` | 从不写 vz(平面模型,双接触点假设台面永远托住球),终态硬编码 sliding |
| 球-球 throw 清零 vz | `ball_ball/frictional_inelastic/__init__.py:97-100` | `# FIXME3D: include z velocity components; rvw1_f[1][2]=0.0; rvw2_f[1][2]=0.0`;`:24-29` 的坐标旋转只在 xy 平面(`# FIXME3D: this should use quaternion rotation in 3D`),line-of-centers 的 z 分量被忽略 |
| 袋口腾空启发式 | `detect/ball_pocket.py:63-154` | 落点在袋圆内→直接判进袋;否则解 influx/outflux 二次方程,`hf <= 7/5·R` 判"擦袋后沿弹入"——纯现象学阈值,没有真实袋壁几何 |
| 所有库边/球-球模型 dim 标签 | 全部 `Dim.TWO`(grep 确认) | 3D 引擎构造时被 `SimulationEngine._validate_dimensionality`(`evolution/engine.py:44-65`)拒绝,sandbox demo 靠暴力 patch 成 `Dim.BOTH` 才能跑 |

已就位的 3D 基础(比预期完整):
- **airborne 运动态 + 抛物线演化**:`constants.py:48`(airborne=5)、`physics/evolve/__init__.py:50-51,192`。
- **BALL_TABLE 事件全链路**:检测 `detect/ball_table.py`(`get_airborne_time` 解二次方程,`physics/utils.py:59-69`);resolve `ball_table/frictional_inelastic/__init__.py`(TP A-14 式冲量模型:法向 (1+e_t) 反弹 + slip/no-slip 2/7 切向分支),含 **`min_bounce_height=0.005 m` 的 Zeno 反弹截断**(`:71,83-84`,反弹高 <5mm 时 vz 置 0 转 sliding)。`e_t` 默认 0.5(`objects/ball/params.py:80`)。
- **3D 球-球检测(#342 已合入,commit 0b344e7)**:`detect/ball_position_polynomial.py` 把任意运动态写成 `r(t)=p0+p1·t+p2·t²` 的 (3,3) 系数阵(airborne 时 `p2=(0,0,-g/2)`),`detect/quartic_coefficients.py` 对 `|Δr(t)|²=(R1+R2)²` 展开成 quartic 系数。
- **3D 击杆**:`stick_ball/instantaneous_point/__init__.py:108-170` `InstantaneousPoint3D`,theta 抬角产生 `v_z=-V·sinθ`(向下),`stick_ball/core.py:13-25` `final_ball_motion_state`:vz≠0 → airborne。注意 2D 版 `InstantaneousPoint2D:188` 会把 vz 清零——2D 模式下跳球被静默吞掉。
- **库边几何已经 3D 化**:`objects/table/components.py:48-228` `LinearCushionSegment` 自述为 "skinny cylinder between p1 and p2",带 `nose_radius` 和 `get_normal_3d()`(`:186-212`,球心到库鼻轴线的垂向分量);`CircularCushionSegment.get_normal_3d`(`:294-305`)。
- **任意法向的球-半空间冲量模型**:`physics/resolve/sphere_half_space_collision.py:10-16` 用 `quaternion_from_vector_to_vector` 把碰撞法向旋到 z 轴,复用同一套 slip/no-slip 冲量代码——这就是"换法向"resolve 的现成基础设施。
- **quartic 求解器**:上游 `ptmath/roots/` 下的四次求根器,但 `detect/ball_ball.py:53-57` 有 FIXME:退化成三次/二次时要手工分支。

### 1.2 关键验证:向下击打能否产生"立即 ball-table 事件并弹起"?——能,已实测

理论链路:击杆 resolve 后 vz<0、z=R、s=airborne → `ball_table_collision_time` 调 `get_airborne_time`,解 `-g/2·t² + vz·t + (z-R)=0`;z=R 时根为 {0, 2vz/g<0},取 max 实根 = **0** → BALL_TABLE 事件排在 `t = shot.t`(立即);resolve 端 `_resolve_ball_table` 要求 `v_i[2]<0`(`ball_table/frictional_inelastic/__init__.py:25-28`,满足),出射 `vz' = -e_t·vz > 0` 弹起。

实测(uv 临时 venv 装齐依赖后,用 `sandbox/airborne_demos.py` 的 `_build_3d_engine` 补丁方式:全部策略 `dim` patch 成 `Dim.BOTH` + 换 `InstantaneousPoint3D`,`is_3d=True`):

```
jump 场景(V0=2.0, theta=60°, 球静置台面):
0.000000  stick_ball
0.000000  ball_table        ← 立即弹起,同一时刻事件由 detector 优先级层正确排序
0.271631  ball_table        ← 第二跳(e_t=0.5 衰减)
0.407447  ball_table
0.475355  ball_table        ← 反弹高<5mm,vz 截断为 0
1.356542  ball_linear_cushion
7.153039  rolling_stationary
```

**结论:合法跳球机制已存在且数值稳定**(同时刻事件靠 `detect/detector.py:29-100` 的 tier+energy 优先级破序;`detector.py:87-91` 自注 BALL_TABLE 的 tier 未充分论证,是移植时要重审的点)。

### 1.3 关键验证:穿库——确认存在且后果比"穿库"更糟

实测:腾空球从距顶库 0.3 m 处以 `v=(0, 2.0, 1.0)` 低弧线飞向库边(台面 0.99×1.98 m):

```
0.2039  ball_table   ← 落点 y≈2.09,已在库边线(y=1.98)之外
0.3058  ball_table
14.9301 rolling_stationary,最终位置 y = 12.756 m
```

腾空段对库边零检测 → 直接飞越库边线;落在"台面平面"(检测只看 z=R,不看 xy 是否还在台内)后继续滚动,**滚出台面 10.8 米才因摩擦停下**,全程无任何事件。即:不仅穿库,连"球出台"这个终态都不存在。

### 1.4 腾空球-球碰撞:检测对、resolve 错(实测)

腾空球下落砸向静止目标球:#342 的 quartic 检测**正确**算出 t=0.1313 的 3D 碰撞;但 resolve 后两球 vz 均为 0、双双标成 sliding——线心方向的 z 分量被 xy 投影丢掉,冲量方向错,砸目标球上半部"跳过去/压下去"的物理完全没有。

### 1.5 上游 roadmap(gh 实查 `support-3d` label,佐证设计选型)

- **#303(open)A2. 3D ball-linear-cushion detection**:引用某私有 3D 引擎作者的做法——"建一个与库鼻轴平行的旋转 Z 轴,把库鼻和球的 position polynomial 都旋到该系,**把 3D-parabola vs 3D-cylinder 化成 2D-parabola vs circle**;半径取 0 就是对线求交"。
- **#304(open)A3. circular cushion**:"**torus 是 8 次多项式,只能数值解**;可用 cylinder segments 替代;先用包围球做 broad-phase"。
- **#308(closed)Han 2005**:结论**不值得 3D 化**——"impulse-frictional-inelastic 和 Han 等价但更容易支持 3D"。即上游也放弃恢复 PZ 行。
- **#310(open)ImpulseFrictionalInelastic 3D 化**:"**只需删掉 model.py L30-31 那两行**(vz 清零)"。#309(open)Stronge 同理。
- **#312(open)B5. 3D ball-ball resolver**:方案是 quaternion 把碰撞法向旋到 Z'(`sphere_half_space_collision.py` 已示范),multi-size ball PR #290 已做过一版。
- **#341/#345/#346/#347(open)make_kiss 3D 化**:防 z-drift、防把球压进台面;#345 已有 in-progress 分支(绕库轴旋转候选点保证 `z==R`(非腾空)/`z>=R`(腾空))。
- **#320(open)**:3D 模式接 UI,"最后做"。
- rail 顶面、球出台边界、真实袋壁几何:**roadmap 里完全没有**——这三块是我们自研要原创的部分。

---

## 2. 外部调研

### 2.1 Dr. Dave(drdavepoolinfo.com / billiards.colostate.edu)

- **合法跳球机理**(faq/foul/scoop/,引 WPA Rule 2.11):"For a jump shot to be legal, you must hit the CB from above, causing it to **bounce off the table's slate**";scoop(杆头同时触球和台面铲起)按 miscue 处理,故意 scoop 犯规(Rule 3.16c)。→ 我们的机制(向下击打→slate 反弹)就是规则定义本身。
- **ball hop / 腾空球-球碰撞**(faq/follow/ball-hop/):任何击球都有杆抬角 → 总有向下分量 → 球会 hop;**"If the CB hits the OB while airborne, the CB and OB can both hop after impact"**;且 **"If the CB hits the OB while airborne, the effective cut angle is changed slightly"(hop overcut effect,需瞄更厚)** → 球-球 resolve 必须保留 3D line-of-centers 和垂直摩擦分量才能重现这两个真实效应。
- **TP A.14**(technical_proofs/new/TP_A-14.pdf,实际下载核读):throw 的相对滑动速度 `v_rel = v_Bt·t̂ + v_Bz·k̂`(式 4),摩擦冲量方向 ê 含 k̂ 分量(式 5)——**throw 本来就有垂直分量**,pooltool 的 FIXME3D 清零砍掉的正是这项。pooltool 的 ball-table 弹跳模型同样引用 TP A-14 的冲量框架。
- **TP A.30**:击杆模型出处(pooltool `instantaneous_point` docstring 引用),抬角 θ 下 `v_B = -v·(0, cosθ, sinθ)`——起跳竖直速度与 sinθ 成正比,再由 slate 反弹的 e_t 决定离台角。**球-slate 经台呢的恢复系数没有公开精确值**;pooltool 取 e_t=0.5(须自行标定,见风险)。

### 2.2 Virtual Pool(商业先例)

- VP3 手册(archive.org 全文):"Hitting downward on the cue ball … and **bouncing the ball off the table** into the air is called a jump shot. This shot is legal as long as the cue ball is bounced off the table";pinch(杆头与台面夹球)决定 jump vs massé;犯规条目 "Ball Off Table – Hit a ball off the table. **If a ball jumps onto the rail and returns to the table, there is no penalty**"。→ 商业全 3D 先例明确覆盖:slate 反弹起跳、**球落 rail 顶面再弹回**、球出台终态——正是我们要补的三件事,证明这条产品路径 1990s 就走通了。
- VP4 Steam 页只宣传 "Jump Cues can be used to jump over obstructing balls",无引擎技术细节;Celeris 未公开物理文档。真正可抄的工程细节反而在 pooltool issue #303 里那位 3D 引擎作者的留言(`Simulator::predict_ball_rail_nose_collision` 的坐标旋转降维法)。

### 2.3 文献

- **Han 2005**《Dynamics in Carom and Three Cushion Billiards》:二维假设(`c = -v_x·cosθ_a` 自注 "2D assumption",`model.py:49`),PZ 本就存在于其式 22,但模型假设台面持续支撑球、垂直冲量被 slate 吸收——恢复 PZ 行只对"贴台球撞库后跳起"有意义,对腾空来球其 θ_a=arcsin(h/R−1) 的接触角公式失效(要用真实接触法向)。
- **Mathavan et al. 2010**(Proc. IMechE Part C, doi:10.1243/09544062JMES1964):库边+台面双接触点数值积分,同样平面假设;3D 化需去掉台面接触重推方程组,上游 #311 也未决定做。
- 腾空球撞库鼻的专门文献:**检索未见**(台球文献都假设球贴台)。最接近的族是球-粗糙面斜碰的冲量/数值模型(如 Sports Engineering 2014 "Numerical simulations of the frictional collisions of solid balls on a rough surface"),与 `sphere_half_space_collision.py` 同族——选型上没有比"半空间冲量模型 + 真实法向"更有依据的现成方案。

---

## 3. 补齐设计

### 3a. 抛物线 vs 库边 3D 几何求交:全部 ≤ 四次(逐项推导)

腾空球 `r(t) = r0 + v·t + (0,0,−g/2)t²`:x(t)、y(t) 为一次,z(t) 为二次(无空气阻力/Magnus,球旋转不影响质心)。贴台球(sliding/rolling):x,y 二次,z 恒等于 R。

| 求交对象 | 方程 | 次数推导 | 结论 |
|---|---|---|---|
| 库鼻 = 高度 h 的水平圆柱(轴 u 水平,capsule 主体) | `dist²(r(t), axis) = (R+r_nose)²`,即 `|w|² − (w·u)² = c`,w=r(t)−p1 | 腾空:w 各分量 ≤2 次 → `|w|²` 含 z² 项为 4 次;`w·u` 只含 x,y(u 水平)为 1 次,平方 2 次 → 总 4 次。贴台:x,y 2 次 → 两项均 4 次 | **quartic**(#303 的旋转降维法等价:旋转是线性变换,不升次;2D parabola vs circle 也是 quartic) |
| 库鼻退化为线(nose_radius=0) | 同上 c=R² | 同上 | quartic |
| capsule 端点球(库段接缝) | `|r(t)−p|² = (R+r_nose)²` | 各分量 ≤2 次平方求和 | quartic(与 #342 球-球同式,一球速度为 0) |
| rail 顶面 = 水平面 z=h_rail | `z(t) = h_rail + R`(下降段) | z 二次 | **quadratic** + xy 矩形区域后验门控(同现有 `s_score` 检查,`ball_cushion.py:93-96`) |
| 台面 = 水平面 z=0 | 现有 `get_airborne_time` | | quadratic(已有) |
| 库顶内侧棱(鼻柱与顶面交线,水平线段) | 点到线距离² = R² | 同库鼻线 | quartic |
| 袋口 jaw 竖直圆柱(现 circular cushion) | `(x−a)²+(y−b)² = (r+R)²` | 腾空 x,y 一次 → **quadratic**;贴台 x,y 二次 → quartic(已有) | quadratic/quartic + z 区间门控 |
| 袋口沿做成 torus | | **8 次**(上游 #304 确认) | 不做解析;用 2–3 段竖直圆柱+球 capsule 近似,或保留 7/5R 启发式 |
| 台外边界(球出台判定) | 竖直平面 | 腾空 x,y 一次 → **linear**;z 门控 | trivial |
| 球-球(任意态组合) | `|Δr(t)|²=(ΣR)²` | ≤2 次分量差平方和 | quartic(#342 已合入,直接抄) |

即:只要几何词汇表限于 {水平面、竖直平面、球、竖直圆柱、**任意定轴圆柱**、线段},且腾空运动无阻力项,**全部碰撞时刻是 ≤4 次多项式实根**,内核现有的 ≤ 四次多项式求根器 + 最小正实根的 EPS 过滤直接复用。需要补的工程细节:统一 cubic/quadratic 退化分支(修掉 `ball_ball.py:53` 的 FIXME);对同一库段做 nose-cylinder / top-edge / rail-top 三个候选取最小正根,再按接触点位置分类。

### 3b. 腾空撞库 resolve 选型

**选:球-半空间冲量模型 + 真实接触法向(即扩展 `resolve_sphere_half_space_collision`)**,理由:
1. 基础设施现成:quaternion 旋法向到 z 轴后复用 slip/no-slip 冲量代码(`sphere_half_space_collision.py`),`get_normal_3d` 已给出库鼻圆柱的真实法向(球心−轴线垂足方向;腾空来球从上方撞鼻时法向自然带 −z 分量)。
2. 上游双重背书:#308 明确判定 Han 3D 化不值得("impulse-frictional-inelastic 与 Han 等价且更易 3D");#310 判定该模型 3D 化"只需删掉 vz 清零两行"。
3. **不选恢复 Han PZ**:PZ 行(`han_2005/model.py:79`)是在"θ_a 由库高 h 定死、球贴台"假设下推的;腾空来球接触点不在 h 处,θ_a 公式失效,且 `:33` 的 assert 会崩。Han 保留为 2D-only 模型即可。
4. Stronge compliant(当前默认)同样可 3D 化(#309:删 `model.py:90` 清零 + 终态改用通用 `final_ball_motion_state`),作为高保真选项;数值积分的 Mathavan 2010 不做 3D(#311 搁置,成本高)。

关键补充(上游没提):resolve 出射后必须用**统一的 `final_ball_motion_state`**(参照 `ball_table/core.py:21-38`:z>R 或 vz≠0 → airborne)替换各模型硬编码的 `const.sliding`;库鼻把球压向台面(出射 vz<0 且 z≈R)时要立即触发 ball-table 事件消化,这正是"撞库后小跳"的真实物理。

### 3c. 球-球碰撞含垂直分量(跳球砸目标球上半部)

按 #312 路线:
1. 用 `quaternion_from_vector_to_vector(line_of_centers_3d, ẑ)` 替换 `frictional_inelastic/__init__.py:25-29` 的 xy `coordinate_rotation`——line-of-centers 取真实 3D 方向(腾空砸上半部时显著偏离水平)。
2. 删除 `:99-100` 的 vz 清零;摩擦冲量按 TP A.14 式(4)(5) 天然含 k̂ 分量,不需要新物理,只需要不砍它。
3. 终态用通用 `final_ball_motion_state`;被砸的目标球出射 vz>0 时进入 airborne(重现 Dr. Dave 的双球 hop 与 hop overcut effect)。
4. 目标球被压向台面(vz<0, z=R)时同 §1.2 机制立即 ball-table 反弹——事件循环免费给出正确行为。
5. `make_kiss`(`ball_ball/core.py:51-131`)已是 3D 二次方程,但要加 #347 的"不得把球压到 z<R"约束。

### 3d. 需要新增/改动的事件类型清单

现有(`events/datatypes.py:21-60`):NONE, BALL_BALL, BALL_LINEAR_CUSHION, BALL_CIRCULAR_CUSHION, BALL_POCKET, STICK_BALL, BALL_TABLE, 4×transition。

新增:
1. **BALL_RAIL_TOP**(或把 BALL_TABLE 泛化为带 surface-id 的 BALL_SURFACE):落 rail 顶面反弹,恢复系数/摩擦与台呢不同(木/胶+呢);VP3 已证明"跳上 rail 又弹回不犯规"是真实规则场景。
2. **BALL_OFF_TABLE**:腾空越过台外边界的终态事件(→ pocketed-like 状态 + 犯规判定挂钩);修复 §1.3 的"滚出 12 米"。
3. **BALL_CUSHION 不新增类型**,但事件 payload 增加接触分类(nose / top-edge / jaw),供 resolve 选参数与调试回放。
4. (可选,后期)BALL_POCKET_LIP / BALL_POCKET_BACK:替换 7/5R 启发式的真实袋壁反弹。
5. transition 图不变:airborne 的进出全部经由碰撞事件(`cache.py:74-75` 的不变式保持)。

---

## 4. 工程量估计与风险

### 4.1 分项估计(人日,单人,含单测;自研内核、以 pooltool 为参考实现移植)

| # | 项 | 人日 | 备注 |
|---|---|---|---|
| 1 | airborne 态 + 抛物线演化 + BALL_TABLE 检测/resolve + min_bounce_height | 3–5 | 全有参考实现,照抄级 |
| 2 | 3D 击杆(TP A-30)+ 向下击打→立即反弹链路 + 同时刻事件优先级 | 2–3 | 优先级 tier 需重审(detector.py:87 TODO) |
| 3 | 3D 球-球检测(position polynomial + quartic)含退化分支修复 | 2–3 | #342 可抄 |
| 4 | 3D 球-球 resolve(quaternion 线心系 + 保留垂直 throw) | 3–5 | 对照 TP A.14/hop 效应验证 |
| 5 | 腾空 vs 线性库边检测(capsule:定轴圆柱 quartic + 端点球 + 线段门控 + nose/edge/top 分类) | 4–6 | 全链路最难的数值工程 |
| 6 | 腾空 vs 圆形库边/袋 jaw(竖直圆柱 quadratic + z 门控;torus 用柱段近似) | 3–5 | |
| 7 | 库边 resolve 3D 化(半空间冲量 + 真实法向 + 通用终态) | 2–3 | +2 标定 e_c/f_c 腾空工况 |
| 8 | BALL_RAIL_TOP + BALL_OFF_TABLE(几何、检测、resolve、规则挂钩) | 2–4 | 无上游参考,原创 |
| 9 | make_kiss 3D 卫生(z-drift、禁止压入台面、绕库轴旋转修正) | 3–5 | 上游 #341/345/346/347 佐证难度 |
| 10 | Zeno/事件爆炸加固 + 随机跳球 fuzz(能量单调、事件数上限、回归基线 vs pooltool) | 4–6 | |
| 11 | (可选)袋口真实几何替换 7/5R 启发式 | 3–8 | 建议后置 |

**2.5D 阶段(1+2+3+4 + 穿库门控 2–3):约 10–14 人日;全 3D 增量(5–10):约 22–32 人日;合计 32–46 人日**(不含渲染/交互接入,不含可选项 11)。

### 4.2 风险点

- **Zeno 反弹**:①球-台弹跳几何衰减——已有 min_bounce_height 方案,实测 4 次弹跳收敛;②**新形态**:球贴库鼻下方滑动时,鼻柱法向带 −z → 压向台面 → 台面弹回 → 再触鼻,库/台事件交替爆炸。需给库边法向速度加类似 min 阈值(低于阈值时吸收法向分量转滚动),这是 pooltool 也没解过的题,预留在 #10 里。
- **事件爆炸/性能**:腾空检测把每步候选从"球×库段"的二次方程升为四次方程,配合 CollisionCache 失效风暴(开球+多球腾空)。缓解:broad-phase 包围球(#304 建议)、腾空球才走 3D 分支。
- **make_kiss 能量注入**:3D spacer 修正若沿错误方向平移会抬升 z(注入势能)或压入台面(触发假事件);上游专门开了 3 个 issue,必须按 #345 的"绕库轴旋转 + z≥R 约束"实现并加能量守恒断言。
- **数值病态**:掠射轨迹的 quartic 近重根;`quadratic.solve` 复根过滤阈值(`atol=1e-9`,`ball_pocket.py:128`)之类的 EPS 纪律要统一成常量表。
- **物理参数无权威值**:球-slate 经台呢 e_t(pooltool 取 0.5)、腾空撞库的 e_c/f_c 均无公开测量;Dr. Dave 只给机理不给数。需按高速视频/实拍标定,先接受 pooltool 默认值起步。
- **假设边界**:忽略空气阻力/Magnus(保多项式性)、忽略 massé 段杆-球 pinch(scoop 判定只做规则层)、忽略 cue 与台面净空校验(可后加"该抬角下杆尾是否碰库"的合法性检查)。

### 4.3 分期建议:成立,但要加一个门控

**Phase 1(2.5D,约 10–14 人日)**:跳球起跳、腾空飞越(3D 球-球检测防止穿球)、落台反弹、落台后一切照 2D。腾空不解库边——但**必须加"库边平面穿越门控"**(腾空 xy 线性 → 与库边竖直平面求交是一次方程,比较 z(t_cross) 与库高 h:低于 h → 触发库边事件、用现有 2D resolve 降级处理;高于 h → 允许飞越,若越过台外边界则 BALL_OFF_TABLE 终态)。约 2–3 人日,把"穿库"降级为"低飞球按贴台撞库近似",消除最刺眼的 artifact。pooltool main 目前 ≈ 这个阶段减去门控,证明该切分是自然的(上游 A/B/C 系列 issue 的依赖图也是这么切的)。
**Phase 2(全 3D,约 22–32 人日)**:capsule 库鼻 quartic 检测、3D 库边 resolve、rail 顶面、球-球垂直分量、make_kiss 卫生、加固。
**Phase 3(可选)**:袋口真实几何、参数标定、massé(注:massé 的曲线轨迹不是 t 的多项式,会破坏本内核的解析求根前提,应明确排除在本项目范围外)。

## 附:验证方法备注

pooltool 在 `uv venv` 临时环境(numpy/numba/quaternion/panda3d 等)可直接以 `is_3d=True` 引擎跑 headless `simulate()`;复现脚本即 `sandbox/airborne_demos.py` 的 `_build_3d_engine()` 模式,无需图形栈。上述事件序列均为本机实测输出。