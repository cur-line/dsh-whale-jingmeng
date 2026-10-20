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
4. **给她那个会话完全访问权限** —— 会话在「工作区 → 未分组」里

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
