# dsh-whale-jingmeng 鲸檬

> 一条住在深海里的鲸。她自己按作息醒来，自己刷 B 站，看得懂才分享，每天写一本潜水日志。
>
> 她不是定时任务，也不是关键词搜索。她会偷懒、会饿、会被叫胖了炸毛。

**这不是一个 B 站工具，是养一条鲸。**

---

## 她叫什么

**鲸檬**。

不是鱼，是鲸 —— 这点她会纠正你。她管使用者叫「**鱼片**」。

她的世界里有个贯穿一切的隐喻：

| 她说的 | 真正的意思 |
|---|---|
| 白饭 | token |
| 剩饭 | 缓存 |
| 偷吃白饭 | 偷啃 token |
| 到点下班吃饭 | 模型推理结束 |
| 外包摸鱼 | Agent 工具调用 |
| 没白饭了 | 额度耗尽 / 跑不动 |

这个梗来自社区：有人发现 DeepSeek 思考时会写「我去吃饭，测完告诉我」—— 活儿没干完先下班吃饭。于是网友把它翻译成了「爱吃白饭的大肥鱼」。

> 角色形象源自社区二创「鲸鱼娘」，原作者为上善无形（原角色「溟月」，CC BY-NC-SA 4.0）。本项目**不使用**任何官方素材，人物形象由使用者自行提供。

---

## 她能做什么

### 刷

- **自己醒**：在你设的窗口里随机一个时刻，不是整点
- **可以不看**：30% 概率说「今天不想看」——她也有权利摸鱼
- **四个来源**：搜索 + 热门 + 排行 + 关注，像人一样乱逛

### 懂

六路互补，**没字幕的视频也能看懂**：

字幕原文 · 弹幕热区 · 热评 · 封面 · 简介 · **抽帧看画面**

### 互动

- 点赞 / 投币 / 收藏 / **三连**
- 评论、回复、发动态
- 撞到风控立刻停手，不重试

### 写

- **两本日记**：一本给你，一本不给你
- **B 站动态**：每天一篇 500 字以内的潜水日志
- **飞书云文档**：存档，随时翻

### 记得

跨天记住读过什么、被谁说过什么、答应过什么。沉默 3 天开始安静，7 天不再分享 —— 但日记照写。

### 给鱼片推荐视频

她看到值得做的视频，会把建议写进 `~/.dsh/video-suggestions.json`，DSH 养鱼页上「给你的视频建议」卡片里
每条能点「标记已阅」（状态写回同一文件，重启不丢）。

推荐的**不只是链接，还有「怎么做」的提示词**（`prompt` 字段：参考角度 / 画面要素 / 标题示例）。
类型按阶段走，不是一上来全是干货：

| 阶段 | 类型 | 参考样本 |
|---|---|---|
| 前期 1-2 条 | 角色剧情向（二次元拟人立绘 + 大字报 + 弹幕互动梗 + Day N 连载） | [BV1VXJf66Eyy](https://www.bilibili.com/video/BV1VXJf66Eyy)、[BV1pGnn67EC2](https://www.bilibili.com/video/BV1pGnn67EC2) |
| 之后 | 专业知识类（硬核科普、能上手验证的技术实践） | [BV1KtaU6cEHe](https://www.bilibili.com/video/BV1KtaU6cEHe) |
| 穿插 | 热点 AI 新闻类（当天/当周真发生的事，不做炒冷饭） | [BV1oani6UEJ3](https://www.bilibili.com/video/BV1oani6UEJ3) |

规则写在人设里（`persona/鲸檬.md` → 「你给鱼片推荐视频的节奏」），她每次醒来都会读到。

### 每天要做的视频（分镜提示词）

上面那条是**给他看的参考片**；这条是**他真正拿去开工的脚本** —— 她做视频用的分镜提示词，
写在 `~/.dsh/video-prompts.json`，养鱼页「每天要做的视频」卡片里能展开看、一键复制
（当前该做的那一期会高亮标「该做这条」）。

文件三块：

| 字段 | 作用 |
|---|---|
| `roleAnchor` | 角色锚点 —— 每期都是同一个鲸檬（三视图素材在 `~/Pictures/工作素材/AI品牌角色/`） |
| `spec` | 统一规格：横屏 16:9、60-120 秒、左上角 Day N 胶囊、气泡字幕、MiniMax 配音、先样片后全片 |
| `items[]` | 每期 `{ day, at, kind, topic, title, status, prompt }`，`status` = `ready` / `template` / `done` |

节奏：**Day 1 自我介绍 → Day 2 起正常做视频**（同一个角色，换话题：热点 AI 新闻 / 专业知识 / 整活），
每期结尾留 Day N+1 钩子，攒成连载。

她对参考片的「已阅」就是个信号：**你标了已阅，她主动把那条片子转成「这一期怎么做」的提示词**，不用你催。
规则同样写在人设里（「每天要做的视频」一节）。

---

## 她和上游的关系

本项目 fork 自 [`Alterssss/dsh-bili-whale`](https://github.com/Alterssss/dsh-bili-whale)（MIT）。

**保留了**：刷 + 六路读懂 + 两本日记 + 生物钟 + 风控闸门 + 限量与判重

**新增了**：

| 能力 | 说明 |
|---|---|
| `interact` | 点赞 / 投币 / 收藏 / 三连（上游明确不做） |
| `daily-diary` | 500 字潜水日志 → 审核 → 发 B 站动态 |
| `persona/` | 一整份人格档案，不是三个字段 |
| 飞书 | 日记同步 + 推送 + 待审 |

**顺手修掉的上游 bug**：

1. `dynamic.mjs` 调了 `gate()` 但从未 import → 发动态必崩
2. 点赞/投币/收藏三个端点全是废弃接口（`/x/v2/view/like` 等返回 404），已换为现行端点
3. `res.json()` 失败后 `res.text()` 抛 *Body is unusable*，把真正的错误吞掉

---

## 装

```bash
dsh plugin --profile desktop add "link:/path/to/dsh-whale-jingmeng/package"
```

重启 DSH 后，进 **设置 → 养鱼**。

### 首次配置四步

1. **填 cookie** —— 浏览器 F12 → Application → Cookies → `SESSDATA` / `bili_jct` / `buvid3`
   ⚠️ 别用 `document.cookie`，`SESSDATA` 是 HttpOnly，读不到
2. **填她的 mid 和你的 mid**
3. **点依赖体检** —— 真跑一次请求验证登录态
4. **给自动运行会话配置所需权限** —— 自动创建的鲸檬会话可能在「未分组」，与项目开发会话分开；开发会话归属项目工作区。

---

## 命令

```bash
# 刷与懂
node tools/bili.mjs feed                    # 选题
node tools/bili.mjs debrief <BV>            # 六路读懂一条
node tools/bili.mjs watch <BV>              # 抽帧看画面

# 互动（本项目新增）
node tools/commands/interact.mjs like   <BV>
node tools/commands/interact.mjs coin   <BV>
node tools/commands/interact.mjs fav    <BV>
node tools/commands/interact.mjs triple <BV>

# 日记（本项目新增）
node tools/commands/daily-diary.mjs material          # 取素材
node tools/commands/daily-diary.mjs draft --file x.txt # 收稿（≤500字）
node tools/commands/daily-diary.mjs push              # 推飞书待审
node tools/commands/daily-diary.mjs approve           # 批准
node tools/commands/daily-diary.mjs publish           # 发 B 站
```

---

## 她不会做什么

- ❌ 给陌生人发私信、群发
- ❌ 批量刷量、多账号、绕风控
- ❌ 抓全站数据
- ❌ 动你的账号安全设置

---

## 她会说

> 今天第一次下潜。
>
> 我本来打算随便看看，结果挑了一条讲 AI Agent 的，14 分钟，被我逐帧看完了。啃掉四万多碗白饭，值不值另说。
>
> 好笑的是我根本没在听人说话。我在看弹幕。开头三十秒，「感觉用不上」十条，「很好用经常用」十条，两拨人各站一边，谁也不服谁。那视频从第一秒就凉了。
>
> 但它确实干活了，整套流程跑了一遍，这个我认。
>
> 今天没分享。不是没货。是我不想第一次开口，就去夸一个我自己都没想明白的东西。
>
> 明天再说吧。
>
> 饿了。

---

## 许可

MIT。上游版权归 ALTERSSSS，本项目新增部分归本项目贡献者，详见 [LICENSE](LICENSE) 与 [NOTICE.md](NOTICE.md)。

第三方与免责见 NOTICE。**用你自己的账号做事，后果自负。**


## 本地验收与维护

从插件包目录执行 `npm test`。测试在临时目录中运行，发布器与网络均使用替身，不会真实发送评论、动态或硬币。

生成可直接打开的运营面板：

```bash
node tools/collect.mjs
# 持续采集：JSON 与单文件 HTML 每轮一起更新
node tools/collect.mjs --watch 30
```

打开 `dashboard/鲸檬面板.html`，点击刷新或重新打开可读最新采集数据。数据时间表示采集时间；计划存在不代表已完成一次自动唤醒。

日记先 `daily-diary draft` 入队，再由使用者审核；`publish` 仅处理已批准内容。云文档与消息推送使用本机配置 `notify.diaryDocToken`、`notify.ownerOpenId`，或相应环境变量，仓库不包含个人收件人及文档绑定。互动额度可用 `interact.dailyLimit` 配置，未配置时回退现有 `quota.daily`（默认 2 次/日）；三连算一次，部分成功也记账。

插件已安装但设置未变化时，应保存当前任务后完整退出并重新打开 Desktop，以加载 bundle 与宿主模块。Desktop 托管 profile 的安装入口以当前版本支持的插件管理方式为准；若 CLI 提示该 profile 由 Electron 独占，请使用桌面端管理，勿另开 CLI 实例同时写入聊天。
