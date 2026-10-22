/**
 * dsh-whale-jingmeng —— 客户端半边：DSH「设置」里的 **养鱼** section（完整版）
 *
 * 历史（2026-10-18）：
 *   v1 只放了 6 个字段（owner/persona/作息窗口）→ 主人说"和微信端讲的不一样" ✗。
 *   真因：宿主半边那份独立页面 `settings.html` 有 25 个字段，但它被 DSH 的信任栅栏挡着打不开 ✗，
 *        而 section 是我另写的精简版 ✗ → 两套界面、一个配置，看着像两个插件。
 *   v2（本文件）：把那 25 个字段**按同一份配置结构**搬进 section ✓；渲染改成**数据驱动**
 *                （FIELDS 是唯一真相；加字段只改这个数组 ✓）。
 *
 * 数据流：section ⇄ `/dsh-bili/api/*`（同源 fetch ✓）⇄ `~/.dsh/bili-whale.config.json`
 *         —— 与 bilibili-tools 的 `lib/config.mjs` 读**同一份文件** ✓，不存在"两套配置"。
 *         ⚠️ 保存时提交**整份配置**（load 回来原样改几个键）→ 未显示的字段不会被抹掉 ✓
 */
window.__ModuleLoader__.load({
  id: "dsh-whale-jingmeng",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const { createElement: h, useCallback, useEffect, useRef, useState } = React;

    const API = "/dsh-bili/api";
    const CSS_TAG = "dsh-whale-jingmeng/section.css";
    const CSS = [
      // 2026-10-20：原 760px 太窄，控制台侧栏一占主区只剩 400px。
      // 控制台视图单独放开到 980，设置视图仍保持 780（表单太宽反而难读）。
      ".blw{max-width:780px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:6px}",
      ".blw.blw-wide{max-width:none;width:100%}",
      ".blw-title{margin:0;font-size:16px;font-weight:500;line-height:24px}",
      ".blw-intro{color:var(--dsw-alias-label-tertiary);margin:0 0 4px;font-size:13px;line-height:20px}",
      ".blw-group{margin-top:14px;font-size:13px;font-weight:600;line-height:20px}",
      ".blw-rows{display:flex;flex-direction:column}",
      ".blw-row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px 20px;padding:10px 0;border-bottom:.5px solid var(--dsw-alias-border-l2);flex-wrap:wrap}",
      ".blw-row:last-child{border-bottom:none}",
      ".blw-row>div:first-child{flex:1;min-width:190px}",
      ".blw-label{font-size:13px;line-height:19px}",
      ".blw-hint{color:var(--dsw-alias-label-tertiary);margin-top:3px;font-size:11.5px;line-height:17px}",
      ".blw-input,.blw-select{background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font-size:12.5px;height:28px;padding:0 8px;min-width:180px;outline:none}",
      ".blw-input:focus-visible,.blw-select:focus-visible{border-color:var(--dsw-alias-brand-primary)}",
      ".blw-input.blw-wide{min-width:260px}",
      ".blw-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:.5px solid var(--dsw-alias-border-l2)}",
      ".blw-btn{background:var(--dsw-alias-brand-primary);color:#fff;border:none;border-radius:6px;font-size:12.5px;height:30px;padding:0 12px;cursor:pointer}",
      ".blw-btn:disabled{opacity:.5;cursor:default}",
      ".blw-btn2{background:transparent;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}",
      ".blw-out{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary);background:rgba(127,127,127,.08);border-radius:8px;padding:10px 12px;max-height:240px;overflow:auto;margin-top:10px}",
      ".blw-err{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin-top:8px}",
      ".blw-badge{display:inline-block;font-size:11px;line-height:16px;padding:1px 7px;border-radius:999px;background:rgba(127,127,127,.14);color:var(--dsw-alias-label-secondary);margin-left:6px}",
      /* 待审里的平台标签（2026-10-21 加：B站回复 + 小红书评论同队列）*/
      ".blw-plat{display:inline-block;font-size:10.5px;line-height:15px;padding:1px 7px;border-radius:999px;margin-left:6px;font-weight:650}",
      ".blw-plat.bili{background:rgba(251,114,153,.15);color:#fb7299}",
      ".blw-plat.xhs{background:rgba(255,46,77,.14);color:#ff2e4d}",
      ".blw-cookie{display:flex;flex-direction:column;gap:8px;min-width:250px}",

      /* ── 顶部导航 ── */
      ".blw-nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 0 14px;border-bottom:.5px solid var(--dsw-alias-border-l1);margin-bottom:4px}",
      ".blw-nav-brand{display:flex;align-items:center;gap:8px}",
      ".blw-nav-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 3px rgba(63,185,80,.15)}",
      ".blw-nav-name{font-size:15px;font-weight:600;letter-spacing:.02em}",
      ".blw-nav-tabs{display:flex;gap:2px;background:var(--dsw-alias-bg-layer-2);padding:2px;border-radius:8px}",
      ".blw-navtab{background:transparent;border:none;color:var(--dsw-alias-label-secondary);font-size:12.5px;padding:5px 16px;border-radius:6px;cursor:pointer;transition:.15s;font-family:inherit}",
      ".blw-navtab:hover{color:var(--dsw-alias-label-primary)}",
      ".blw-navtab.on{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.12)}",

      /* ── 状态面板 ── */
      ".bwp{display:flex;flex-direction:column;gap:16px;padding-top:6px}",
      ".bwp-loading{padding:48px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:13px}",
      ".bwp-err{color:var(--dsw-alias-state-error-primary);font-size:12.5px;line-height:1.7;padding:14px;background:rgba(248,81,73,.08);border-radius:8px}",
      ".bwp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}",
      ".bwp-title{font-size:17px;font-weight:650;letter-spacing:-.01em}",
      ".bwp-sub{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-top:4px;font-family:ui-monospace,monospace}",
      ".bwp-actions{display:flex;gap:8px;flex-wrap:wrap}",

      /* 状态卡 */
      ".bwp-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}",
      "@media(max-width:760px){.bwp-cards{grid-template-columns:repeat(2,1fr)}}",
      ".bwp-card{background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;padding:13px 15px;position:relative;overflow:hidden}",
      ".bwp-card::before{content:\"\";position:absolute;left:0;top:0;bottom:0;width:2.5px;background:var(--dsw-alias-brand-primary);opacity:.6}",
      ".bwp-card.t-warn::before{background:var(--dsw-alias-state-warn-primary)}",
      ".bwp-card.t-ok::before{background:var(--dsw-alias-state-success-primary)}",
      ".bwp-card-k{font-size:11px;color:var(--dsw-alias-label-tertiary);letter-spacing:.05em;text-transform:uppercase;font-weight:600}",
      ".bwp-card-v{font-size:19px;font-weight:680;margin-top:6px;line-height:1.25;font-variant-numeric:tabular-nums}",
      ".bwp-card-n{font-size:11.5px;color:var(--dsw-alias-label-tertiary);margin-top:4px}",

      /* 页签 */
      ".bwp-tabs{display:flex;gap:2px;border-bottom:.5px solid var(--dsw-alias-border-l1)}",
      ".bwp-tab{background:transparent;border:none;border-bottom:2px solid transparent;color:var(--dsw-alias-label-secondary);font-size:12.5px;padding:9px 14px;cursor:pointer;font-family:inherit;transition:.15s;margin-bottom:-.5px}",
      ".bwp-tab:hover{color:var(--dsw-alias-label-primary)}",
      ".bwp-tab.on{color:var(--dsw-alias-brand-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}",

      /* 时间线 */
      ".bwp-timeline{display:flex;flex-direction:column;max-height:420px;overflow-y:auto;padding-right:4px}",
      ".bwp-ev{display:flex;align-items:baseline;gap:9px;padding:7px 8px;border-radius:6px;font-size:12.5px;line-height:1.6;flex-wrap:wrap}",
      ".bwp-ev:hover{background:rgba(127,127,127,.06)}",
      ".bwp-dot{width:6px;height:6px;border-radius:50%;flex:0 0 auto;transform:translateY(-1px)}",
      ".bwp-time{font-family:ui-monospace,monospace;font-size:11.5px;color:var(--dsw-alias-label-tertiary);flex:0 0 auto;font-variant-numeric:tabular-nums}",
      ".bwp-kind{font-size:11.5px;font-weight:600;flex:0 0 auto;min-width:52px}",
      ".bwp-text{flex:1;min-width:180px;color:var(--dsw-alias-label-secondary)}",
      ".bwp-tag{font-family:ui-monospace,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);background:rgba(127,127,127,.1);padding:1px 6px;border-radius:4px}",
      ".bwp-empty{padding:36px 20px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:13px;border:.5px dashed var(--dsw-alias-border-l1);border-radius:10px}",

      /* 日记卡 */
      ".bwp-diary{background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;padding:14px 16px;margin-bottom:10px}",
      ".bwp-diary-head{display:flex;align-items:center;gap:10px;margin-bottom:9px;flex-wrap:wrap}",
      ".bwp-st{font-size:11px;font-weight:650;padding:2px 9px;border-radius:999px}",
      ".bwp-st.s-pending{background:rgba(227,179,65,.15);color:var(--dsw-alias-state-warn-primary)}",
      ".bwp-st.s-approved{background:rgba(63,199,245,.15);color:var(--dsw-alias-brand-primary)}",
      ".bwp-st.s-published{background:rgba(63,185,80,.15);color:var(--dsw-alias-state-success-primary)}",
      ".bwp-st.s-rejected{background:rgba(248,81,73,.13);color:var(--dsw-alias-state-error-primary)}",
      ".bwp-meta{font-size:11.5px;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,monospace}",
      ".bwp-link{font-size:11.5px;color:var(--dsw-alias-brand-primary);text-decoration:none}",
      ".bwp-link:hover{text-decoration:underline}",
      ".bwp-diary-body{font-size:13px;line-height:1.85;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;max-height:200px;overflow-y:auto}",

      /* 自检 */
      ".bwp-checks{display:flex;flex-direction:column}",
      ".bwp-check{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:.5px solid var(--dsw-alias-border-l1);font-size:12.5px}",
      ".bwp-check:last-child{border-bottom:none}",
      ".bwp-check-ic{width:16px;flex:0 0 auto;text-align:center;font-weight:700}",
      ".bwp-check.ok .bwp-check-ic{color:var(--dsw-alias-state-success-primary)}",
      ".bwp-check.no .bwp-check-ic{color:var(--dsw-alias-state-warn-primary)}",
      ".bwp-check-nm{flex:0 0 auto;min-width:92px;color:var(--dsw-alias-label-secondary)}",
      ".bwp-check-dt{flex:1;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,monospace;font-size:11.5px}",

      /* 表格 */
      ".bwp-table{width:100%;border-collapse:collapse;font-size:12.5px}",
      ".bwp-table th{text-align:left;padding:8px 10px;font-size:11px;color:var(--dsw-alias-label-tertiary);font-weight:600;letter-spacing:.04em;text-transform:uppercase;border-bottom:.5px solid var(--dsw-alias-border-l1)}",
      ".bwp-table td{padding:8px 10px;border-bottom:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);vertical-align:top}",
      ".bwp-table td.mono{font-family:ui-monospace,monospace;font-size:11.5px}",
      ".bwp-table td.small{font-size:11.5px;line-height:1.65}",
      ".bwp-table tr:last-child td{border-bottom:none}",

      /* 想说没说 */
      ".bwp-wants{margin-top:14px;padding:14px 16px;background:var(--dsw-alias-bg-layer-2);border-radius:10px}",
      ".bwp-wants-t{font-size:11px;font-weight:650;color:var(--dsw-alias-label-tertiary);letter-spacing:.05em;text-transform:uppercase;margin-bottom:8px}",
      ".bwp-want{font-size:12.5px;line-height:1.75;color:var(--dsw-alias-label-secondary);margin-bottom:5px}",
      /* ═══ 鲸檬控制台（2026-10-20 重做）═══ */
      // 2026-10-20 重做：侧栏三种形态 —— 常规(212) / 紧凑(148) / 纯图标(58)
      //   原来固定 168px，窗口一窄主区只剩 400px，六张卡被挤成两列全部换行。
      ".jm{display:grid;grid-template-columns:auto 1fr;gap:0;min-height:480px;border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;overflow:hidden;background:var(--dsw-alias-bg-layer-1);container-type:inline-size}",
      ".jm.is-compact{grid-template-columns:auto 1fr}",

      /* 侧栏 */
      ".jm-side{display:flex;flex-direction:column;padding:14px 8px;gap:12px;background:var(--dsw-alias-bg-layer-2);border-right:.5px solid var(--dsw-alias-border-l1);min-width:0;width:196px;transition:width .18s ease;flex:0 0 auto;overflow:hidden}",
      ".jm-side.collapsed{width:54px;padding:14px 6px}",
      ".jm-side.collapsed .jm-side-name,.jm-side.collapsed .jm-side-id,.jm-side.collapsed .jm-nav span,.jm-side.collapsed .jm-side-brand>div:last-child{display:none}",
      ".jm-side.collapsed .jm-nav{justify-content:center;padding:8px}",
      ".jm-side.collapsed .jm-avatar{margin:0 auto}",
      ".jm-side.collapsed .jm-collapse{margin:0 auto}",
      ".jm-side-brand{display:flex;align-items:center;gap:9px;padding:0 6px}",
      ".jm-avatar{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#3a7bd5,#00d2ff);color:#fff;display:grid;place-items:center;font-size:13px;font-weight:700;flex:0 0 auto}",
      ".jm-side-name{font-size:13.5px;font-weight:650;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".jm-side-id{font-size:10px;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,monospace;margin-top:1px}",
      ".jm-side-nav{display:flex;flex-direction:column;gap:2px;flex:1}",
      ".jm-nav{display:flex;align-items:center;gap:9px;background:transparent;border:none;color:var(--dsw-alias-label-secondary);font-size:12.5px;padding:7px 9px;border-radius:7px;cursor:pointer;font-family:inherit;text-align:left;transition:background .13s,color .13s;white-space:nowrap}",
      ".jm-nav:hover{background:rgba(127,127,127,.09);color:var(--dsw-alias-label-primary)}",
      ".jm-nav.on{background:var(--dsw-alias-brand-primary);color:#fff;font-weight:600}",
      ".jm-side-foot{display:flex;flex-direction:column;gap:2px;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l1)}",
      ".jm-nav-quiet{font-size:12px;padding:6px 9px;color:var(--dsw-alias-label-tertiary)}",

      /* 主区 */
      ".jm-main{padding:18px 20px;min-width:0;overflow-x:hidden}",
      ".jm-loading{padding:60px 20px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:13px}",
      ".jm-err{color:var(--dsw-alias-state-error-primary);font-size:12.5px;line-height:1.7;padding:14px 16px;background:rgba(248,81,73,.08);border-radius:9px;margin-bottom:12px}",
      ".jm-hint-line{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-bottom:12px}",
      ".jm-btn{background:var(--dsw-alias-brand-primary);color:#fff;border:none;border-radius:7px;font-size:12.5px;height:30px;padding:0 14px;cursor:pointer;font-family:inherit}",
      ".jm-stack{display:flex;flex-direction:column;gap:14px}",

      /* 卡片 */
      // 2×3 网格最稳：600px 宽时每卡 ~215px，正好放"15 分钟"这种值不换行
      // ⚠️ 顺序要紧：基础规则在前，@container 在后；反过来会被基础规则覆盖
      ".jm-cards{display:grid;grid-template-columns:1fr 1fr;gap:8px}",
      "@container (min-width:880px){.jm-cards{grid-template-columns:1fr 1fr 1fr}}",
      "@container (max-width:430px){.jm-cards{grid-template-columns:1fr}}",
      ".jm-card{background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1);border-radius:9px;padding:11px 13px;position:relative;overflow:hidden;transition:border-color .15s}",
      ".jm-card:hover{border-color:var(--dsw-alias-border-l2)}",
      ".jm-card::after{content:\"\";position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--dsw-alias-brand-primary);opacity:.5}",
      ".jm-card.t-ok::after{background:var(--dsw-alias-state-success-primary);opacity:.8}",
      ".jm-card.t-warn::after{background:var(--dsw-alias-state-warn-primary);opacity:.8}",
      ".jm-card.t-bad::after{background:var(--dsw-alias-state-error-primary);opacity:.8}",
      ".jm-card-top{display:flex;align-items:center;justify-content:space-between;gap:6px}",
      ".jm-card-k{font-size:10.5px;color:var(--dsw-alias-label-tertiary);letter-spacing:.04em;font-weight:600;text-transform:uppercase}",
      ".jm-card-ic{color:var(--dsw-alias-label-tertiary);opacity:.7}",
      ".jm-card-v{font-size:17px;font-weight:680;margin-top:4px;line-height:1.2;font-variant-numeric:tabular-nums;letter-spacing:-.015em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".jm-card-n{font-size:10.5px;color:var(--dsw-alias-label-tertiary);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".jm-card-k{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",

      /* 面板 */
      ".jm-panel{background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;padding:13px 15px;min-width:0}",
      ".jm-panel-h{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;font-weight:650;color:var(--dsw-alias-label-primary);margin-bottom:10px;letter-spacing:.01em}",
      ".jm-link{background:none;border:none;color:var(--dsw-alias-brand-primary);font-size:11.5px;cursor:pointer;padding:0;font-family:inherit;text-decoration:none}",
      ".jm-link:hover{text-decoration:underline}",
      ".jm-split{display:grid;grid-template-columns:1.4fr 1fr;gap:12px;align-items:start}",
      "@container (max-width:700px){.jm-split{grid-template-columns:1fr}}",

      /* 事件流 */
      ".jm-feed{display:flex;flex-direction:column;gap:1px;max-height:300px;overflow-y:auto}",
      ".jm-feed-tall{max-height:none}",
      ".jm-ev{display:flex;align-items:baseline;gap:8px;padding:5px 6px;border-radius:5px;font-size:12px;line-height:1.65;flex-wrap:wrap}",
      ".jm-ev:hover{background:rgba(127,127,127,.07)}",
      ".jm-ev-dot{width:5px;height:5px;border-radius:50%;flex:0 0 auto;transform:translateY(-1px);background:var(--dsw-alias-state-idle-primary)}",
      ".jm-ev-dot.tone-ok{background:var(--dsw-alias-state-success-primary)}",
      ".jm-ev-dot.tone-brand{background:var(--dsw-alias-brand-primary)}",
      ".jm-ev-dot.tone-pink{background:#e879a6}",
      ".jm-ev-dot.tone-warn{background:var(--dsw-alias-state-warn-primary)}",
      ".jm-ev-dot.tone-bad{background:var(--dsw-alias-state-error-primary)}",
      ".jm-ev-dot.tone-xhs{background:#ff2e4d}",
      ".jm-ev-dot.tone-comment{background:var(--dsw-alias-state-success-primary)}",
      ".jm-ev-dot.tone-share{background:#e879a6}",
      ".jm-ev-time{font-family:ui-monospace,monospace;font-size:10.5px;color:var(--dsw-alias-label-tertiary);flex:0 0 auto;font-variant-numeric:tabular-nums}",
      ".jm-ev-kind{font-size:11px;font-weight:600;flex:0 0 auto;min-width:56px;color:var(--dsw-alias-label-secondary)}",
      ".jm-ev-kind.tone-ok{color:var(--dsw-alias-state-success-primary)}",
      ".jm-ev-kind.tone-brand{color:var(--dsw-alias-brand-primary)}",
      ".jm-ev-kind.tone-pink{color:#e879a6}",
      ".jm-ev-kind.tone-warn{color:var(--dsw-alias-state-warn-primary)}",
      ".jm-ev-kind.tone-bad{color:var(--dsw-alias-state-error-primary)}",
      ".jm-ev-kind.tone-xhs{color:#ff2e4d}",
      ".jm-ev-kind.tone-comment{color:var(--dsw-alias-state-success-primary)}",
      ".jm-ev-kind.tone-share{color:#e879a6}",
      ".jm-ev-text{flex:1;min-width:140px;color:var(--dsw-alias-label-secondary)}",
      ".jm-tag{font-family:ui-monospace,monospace;font-size:10px;color:var(--dsw-alias-label-tertiary);background:rgba(127,127,127,.11);padding:1px 5px;border-radius:3px;flex:0 0 auto}",
      ".jm-empty{padding:30px 16px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12.5px}",
      ".jm-empty-lg{padding:60px 20px;border:.5px dashed var(--dsw-alias-border-l1);border-radius:10px}",

      /* 平台卡 */
      ".jm-platforms{display:flex;flex-direction:column;gap:10px}",
      ".jm-plat{background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px 12px}",
      ".jm-plat-h{display:flex;align-items:center;gap:7px;margin-bottom:7px}",
      ".jm-plat-badge{font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:5px}",
      ".jm-plat-badge.bili{background:rgba(251,114,153,.16);color:#fb7299}",
      ".jm-plat-badge.xhs{background:rgba(255,46,77,.14);color:#ff2e4d}",
      ".jm-plat-name{font-size:12px;font-weight:600}",
      ".jm-plat-row{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;color:var(--dsw-alias-label-tertiary);padding:2.5px 0}",
      ".jm-plat-row code{font-family:ui-monospace,monospace;font-size:10.5px;color:var(--dsw-alias-label-secondary)}",
      ".jm-plat-row b{font-weight:650}",
      ".jm-plat-row b.on{color:var(--dsw-alias-state-success-primary)}",

      /* 评论双卡片（2026-10-21 加）：B站留言 / 小红书留言 */
      ".jm-cmt2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}",
      "@container (max-width:700px){.jm-cmt2{grid-template-columns:1fr}}",
      ".jm-cmt{background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;min-height:88px}",
      ".jm-cmt-h{display:flex;align-items:center;gap:7px;margin-bottom:7px;font-size:12px;font-weight:650;color:var(--dsw-alias-label-primary)}",
      ".jm-cmt-badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px}",
      ".jm-cmt-badge.bili{background:rgba(251,114,153,.16);color:#fb7299}",
      ".jm-cmt-badge.xhs{background:rgba(255,46,77,.14);color:#ff2e4d}",
      ".jm-cmt-n{font-size:11px;color:var(--dsw-alias-label-tertiary);margin-left:auto;font-variant-numeric:tabular-nums}",
      ".jm-cmt-list{display:flex;flex-direction:column;gap:5px;max-height:130px;overflow-y:auto}",
      ".jm-cmt-item{display:flex;gap:6px;align-items:flex-start;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary)}",
      ".jm-cmt-t{font-family:ui-monospace,monospace;font-size:10px;color:var(--dsw-alias-label-tertiary);flex:0 0 auto;padding-top:1px}",
      /* 留言可点（2026-10-21 加）：跳转到原页面 —— 小红书笔记 / B站视频 */
      ".jm-cmt-text{color:inherit;text-decoration:none;cursor:pointer}",
      ".jm-cmt-body{flex:1;min-width:0}",
      ".jm-cmt-quote{margin-top:3px;font-size:10.5px;line-height:1.6;color:var(--dsw-alias-label-tertiary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
      "a.jm-cmt-text:hover{text-decoration:underline;color:var(--dsw-alias-brand-primary)}",
      ".jm-cmt-go{font-size:10px;color:var(--dsw-alias-brand-primary);opacity:.85}",
      "a.jm-tag.link{cursor:pointer;color:var(--dsw-alias-brand-primary);background:rgba(63,199,245,.13)}",
      "a.jm-tag.link:hover{text-decoration:underline}",
      ".jm-cmt-empty{padding:14px 0;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:11.5px}",

      /* 潜水箱（2026-10-21 加）：收藏带理由 = 她的宝贝 */
      ".jm-treasure{display:flex;flex-direction:column;gap:7px;margin-top:12px}",
      ".jm-tres-item{display:flex;flex-direction:column;gap:4px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 11px}",
      ".jm-tres-top{display:flex;align-items:center;gap:7px;flex-wrap:wrap}",
      ".jm-tres-kind{font-size:10px;font-weight:700;padding:1px 7px;border-radius:5px;background:rgba(63,199,245,.15);color:var(--dsw-alias-brand-primary)}",
      ".jm-tres-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);text-decoration:none}",
      ".jm-tres-title:hover{text-decoration:underline}",
      ".jm-tres-up{font-size:10.5px;color:var(--dsw-alias-label-tertiary)}",
      ".jm-tres-reason{font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.6}",

      /* 今日心情（2026-10-21 加：每天第一句话不是模板） */
      ".jm-mood{display:flex;align-items:center;gap:9px;padding:10px 14px;border-radius:10px;background:linear-gradient(120deg,rgba(63,199,245,.10),rgba(232,121,166,.10));border:.5px solid var(--dsw-alias-border-l1);font-size:13px;line-height:1.7;color:var(--dsw-alias-label-primary);margin-bottom:10px}",
      ".jm-mood-ic{font-size:16px;flex:0 0 auto}",
      ".jm-mood-tag{font-size:10px;font-weight:700;padding:1px 7px;border-radius:999px;background:rgba(127,127,127,.12);color:var(--dsw-alias-label-tertiary);flex:0 0 auto}",
      ".jm-grow{display:flex;flex-direction:column;gap:8px;margin-top:12px}",
      ".jm-grow-row{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:13px}",
      ".jm-grow-k{flex:0 0 76px;color:var(--dsw-alias-label-tertiary);font-size:12px}",
      ".jm-grow-v{font-variant-numeric:tabular-nums}",
      ".jm-grow-v.warn{color:#e0564f}",
      ".jm-grow-n{color:var(--dsw-alias-label-tertiary);font-size:11px;flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      /* 视频建议（2026-10-21 加）：给老板的每日推荐 + 已阅标记 */
      ".jm-video{display:flex;flex-direction:column;gap:8px;margin-top:12px}",
      ".jm-video-item{display:flex;flex-direction:column;gap:5px;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;padding:9px 11px}",
      ".jm-video-item.seen{opacity:.62}",
      ".jm-video-top{display:flex;align-items:center;gap:7px;flex-wrap:wrap}",
      ".jm-video-date{font-size:10px;font-weight:700;padding:1px 7px;border-radius:5px;background:rgba(251,114,153,.15);color:#fb7299}",
      ".jm-video-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);text-decoration:none;line-height:1.5}",
      ".jm-video-title:hover{text-decoration:underline}",
      ".jm-video-why{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.65}",
      ".jm-video-act{font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:1.6}",
      ".jm-video-btns{display:flex;align-items:center;gap:7px;margin-top:2px}",
      ".jm-vbtn{font-size:10.5px;font-weight:650;padding:3px 10px;border-radius:999px;border:0;cursor:pointer;background:rgba(63,199,245,.16);color:var(--dsw-alias-brand-primary);transition:opacity .15s}",
      ".jm-vbtn:hover{opacity:.75}",
      ".jm-vbtn.done{background:rgba(63,185,80,.16);color:var(--dsw-alias-state-success-primary);cursor:default}",
      ".jm-video-empty{padding:14px 0;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:11.5px}",
      /* 每天要做的视频（2026-10-21 加）：鲸檬做视频的分镜提示词，折叠展开 */
      ".jm-vp{display:flex;flex-direction:column;gap:8px;margin-top:12px}",
      ".jm-vp-item{background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden}",
      ".jm-vp-item.todo{border-color:var(--dsw-alias-brand-primary)}",
      ".jm-vp-sum{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:9px 11px;cursor:pointer;font-size:12px;color:var(--dsw-alias-label-primary);list-style:none}",
      ".jm-vp-sum::-webkit-details-marker{display:none}",
      ".jm-vp-day{font-size:10px;font-weight:700;padding:1px 7px;border-radius:5px;background:rgba(63,199,245,.16);color:var(--dsw-alias-brand-primary);flex:0 0 auto}",
      ".jm-vp-topic{font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".jm-vp-flag{font-size:10px;font-weight:700;padding:1px 7px;border-radius:999px;background:rgba(227,179,65,.16);color:var(--dsw-alias-state-warn-primary);flex:0 0 auto}",
      ".jm-vp-st{font-size:10px;font-weight:650;padding:1px 7px;border-radius:999px;flex:0 0 auto;background:rgba(127,127,127,.13);color:var(--dsw-alias-label-tertiary)}",
      ".jm-vp-st.ready{background:rgba(63,185,80,.15);color:var(--dsw-alias-state-success-primary)}",
      ".jm-vp-st.done{background:rgba(63,199,245,.15);color:var(--dsw-alias-brand-primary)}",
      ".jm-vp-body{padding:0 11px 11px;border-top:.5px solid var(--dsw-alias-border-l1)}",
      ".jm-vp-kind{font-size:10.5px;color:var(--dsw-alias-label-tertiary);padding:8px 0 6px}",
      ".jm-vp-prompt{margin:0;font-family:inherit;font-size:11.5px;line-height:1.75;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary);max-height:260px;overflow-y:auto}",
      ".jm-vp-btns{display:flex;gap:7px;padding-top:9px}",
      /* 待审提醒条（2026-10-21 加）*/
      /* ══ 五类审批卡：每类一套视觉（2026-10-21 老板要求）══ */
      /* 视频 */
      ".jm-card-video{border-radius:12px;overflow:hidden;background:#000;margin:2px 0 4px;border:.5px solid var(--dsw-alias-border-l2)}",
      ".jm-cv-head{display:flex;align-items:baseline;gap:10px;padding:9px 13px;background:rgba(255,255,255,.04)}",
      ".jm-cv-title{font-size:13px;font-weight:700;color:var(--dsw-alias-label-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".jm-cv-spec{font-size:10.5px;color:var(--dsw-alias-label-tertiary);flex:0 0 auto;font-variant-numeric:tabular-nums}",
      ".jm-cv-player{display:block;width:100%;max-height:420px;background:#000;aspect-ratio:16/9}",
      ".jm-cv-foot{padding:7px 13px;background:rgba(255,255,255,.03)}",
      // 2026-10-22 加：视频播放降级/失败提示条
      ".jm-cv-note{font-size:10.5px;line-height:1.6;color:var(--dsw-alias-label-tertiary);padding:5px 13px 7px;background:rgba(255,255,255,.03)}",
      ".jm-cv-err{font-size:11px;line-height:1.7;color:var(--dsw-alias-state-error-primary);padding:7px 13px;background:rgba(248,81,73,.08)}",
      /* 回复：对话气泡 */
      ".jm-card-reply{padding:12px 14px;border-radius:12px;background:rgba(127,127,127,.055);border:.5px solid var(--dsw-alias-border-l1)}",
      ".jm-cr-line{display:flex;align-items:center;gap:8px;margin-bottom:6px}",
      ".jm-cr-tag{font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:5px;background:rgba(127,127,127,.16);color:var(--dsw-alias-label-secondary)}",
      ".jm-cr-tag-me{background:rgba(63,199,245,.18);color:var(--dsw-alias-brand-primary)}",
      ".jm-cr-who{font-size:11.5px;font-weight:650;color:var(--dsw-alias-label-primary)}",
      ".jm-cr-said{font-size:12px;line-height:1.75;color:var(--dsw-alias-label-secondary);padding:8px 11px;margin-bottom:10px;border-radius:9px;background:rgba(127,127,127,.09);border-left:2px solid var(--dsw-alias-border-l2)}",
      ".jm-cr-mine{margin-top:2px}",
      ".jm-cr-answer{font-size:13px;line-height:1.85;color:var(--dsw-alias-label-primary);padding:10px 12px;border-radius:9px;background:rgba(63,199,245,.10);border-left:2px solid var(--dsw-alias-brand-primary);white-space:pre-wrap}",
      /* B站动态 */
      ".jm-card-dynamic{padding:13px 15px;border-radius:12px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1)}",
      ".jm-cd-head{display:flex;align-items:center;gap:9px;margin-bottom:9px}",
      ".jm-cd-avatar{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#2b6fb5,#6fc7f0);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:0 0 auto}",
      ".jm-cd-name{font-size:12.5px;font-weight:700;color:var(--dsw-alias-label-primary)}",
      ".jm-cd-time{font-size:10.5px;color:var(--dsw-alias-label-tertiary)}",
      ".jm-cd-body{font-size:13px;line-height:1.9;color:var(--dsw-alias-label-primary);white-space:pre-wrap}",
      /* 小红书图文 */
      ".jm-card-note{padding:13px 15px;border-radius:12px;background:rgba(255,63,86,.055);border:.5px solid rgba(255,63,86,.22)}",
      ".jm-cn-title{font-size:13.5px;font-weight:750;color:var(--dsw-alias-label-primary);margin-bottom:8px;line-height:1.5}",
      ".jm-cn-body{font-size:12.5px;line-height:1.85;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}",
      ".jm-cn-imgs{margin-top:10px}",
      ".jm-cn-imgs-n{font-size:10.5px;color:var(--dsw-alias-label-tertiary)}",
      ".jm-cn-imgs-list{display:flex;gap:7px;margin-top:7px;flex-wrap:wrap}",
      ".jm-cn-thumb{width:76px;height:76px;object-fit:cover;border-radius:8px;border:.5px solid rgba(255,63,86,.2);background:#111}",
      ".jm-appr-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 4px}",
      ".jm-appr-tab{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s}",
      ".jm-appr-tab:hover{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}",
      ".jm-appr-tab.on{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}",
      ".jm-appr-tab.dim{opacity:.44}",
      ".jm-appr-tab-n{font-size:10px;font-weight:700;padding:1px 5px;border-radius:999px;background:rgba(127,127,127,.2)}",
      ".jm-appr-tab.on .jm-appr-tab-n{background:rgba(255,255,255,.26)}",
      ".jm-appr-group{display:flex;align-items:baseline;gap:9px;margin:16px 0 8px;padding-bottom:6px;border-bottom:.5px solid var(--dsw-alias-border-l1)}",
      ".jm-appr-group:first-child{margin-top:0}",
      ".jm-appr-group>span:first-child{font-size:12px;font-weight:700;color:var(--dsw-alias-label-primary);letter-spacing:.02em}",
      ".jm-appr-group-n{font-size:10.5px;color:var(--dsw-alias-label-tertiary)}",
      ".jm-pending-bar{display:flex;align-items:center;gap:11px;padding:13px 18px;border-radius:12px;cursor:pointer;background:linear-gradient(100deg,rgba(227,179,65,.14),rgba(63,199,245,.10));border:.5px solid rgba(227,179,65,.42);transition:border-color .15s}",
      ".jm-pending-bar:hover{border-color:rgba(227,179,65,.75)}",
      ".jm-pb-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);box-shadow:0 0 12px var(--dsw-alias-state-warn-primary);flex:0 0 auto}",
      ".jm-pb-text{font-size:13px;font-weight:700;color:var(--dsw-alias-label-primary);flex:0 0 auto}",
      ".jm-pb-parts{font-size:11.5px;color:var(--dsw-alias-label-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".jm-pb-go{font-size:11.5px;font-weight:650;color:var(--dsw-alias-brand-primary);flex:0 0 auto}",
      /* 审批卡里的引用/视频（2026-10-21 加）*/
      ".jm-appr-quote{margin:6px 0 8px;padding:8px 11px;border-left:2px solid var(--dsw-alias-border-l2);background:rgba(127,127,127,.06);border-radius:0 6px 6px 0;font-size:11.5px;line-height:1.7;color:var(--dsw-alias-label-secondary)}",
      /* 待审视频预览（2026-10-21 加）*/
      ".jm-vp-video{display:flex;gap:12px;margin-top:8px;align-items:flex-start}",
      ".jm-vp-cover{width:220px;height:124px;object-fit:cover;border-radius:8px;border:.5px solid var(--dsw-alias-border-l1);flex:0 0 auto;background:#04101f}",
      ".jm-vp-vmeta{flex:1;min-width:0;font-size:11.5px;line-height:1.75;color:var(--dsw-alias-label-secondary)}",
      ".jm-plat-row b.off{color:var(--dsw-alias-state-warn-primary)}",
      ".jm-plat-cap{font-size:10.5px;color:var(--dsw-alias-label-secondary);text-align:right}",
      ".jm-plat-live{margin-left:auto;font-size:10px;font-weight:650;padding:1.5px 7px;border-radius:999px}",
      ".jm-plat-live.on{background:rgba(63,185,80,.15);color:var(--dsw-alias-state-success-primary)}",
      ".jm-plat-live.off{background:rgba(227,179,65,.15);color:var(--dsw-alias-state-warn-primary)}",
      ".jm-plat-btn{font-size:10px;font-weight:650;padding:1px 7px;border-radius:999px;border:0;cursor:pointer;background:rgba(63,199,245,.16);color:var(--dsw-alias-brand-primary)}",
      ".jm-plat-btn:hover{opacity:.72}",

      /* 日记 */
      ".jm-diary{background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;padding:13px 15px}",
      ".jm-diary-h{display:flex;align-items:center;gap:9px;margin-bottom:8px;flex-wrap:wrap}",
      ".jm-st{font-size:10.5px;font-weight:650;padding:2px 8px;border-radius:999px}",
      ".jm-st.pending{background:rgba(227,179,65,.15);color:var(--dsw-alias-state-warn-primary)}",
      ".jm-st.approved{background:rgba(63,199,245,.15);color:var(--dsw-alias-brand-primary)}",
      ".jm-st.published{background:rgba(63,185,80,.15);color:var(--dsw-alias-state-success-primary)}",
      ".jm-st.rejected{background:rgba(248,81,73,.13);color:var(--dsw-alias-state-error-primary)}",
      ".jm-meta{font-size:10.5px;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,monospace}",
      ".jm-diary-b{font-size:12.5px;line-height:1.85;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;max-height:220px;overflow-y:auto}",
      ".jm-wants{background:var(--dsw-alias-bg-layer-2);border-radius:10px;padding:13px 15px}",
      ".jm-wants-t{font-size:10.5px;font-weight:650;color:var(--dsw-alias-label-tertiary);letter-spacing:.04em;text-transform:uppercase;margin-bottom:8px}",
      ".jm-want{font-size:12.5px;line-height:1.75;color:var(--dsw-alias-label-secondary);padding-left:10px;border-left:2px solid var(--dsw-alias-brand-primary);margin-bottom:6px}",

      /* 数据条 */
      ".jm-bars{display:flex;flex-direction:column;gap:5px}",
      ".jm-bar-row{display:grid;grid-template-columns:96px 1fr 32px;gap:9px;align-items:center;font-size:11.5px}",
      ".jm-bar-k{color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".jm-bar-track{height:6px;background:rgba(127,127,127,.13);border-radius:3px;overflow:hidden}",
      ".jm-bar-fill{display:block;height:100%;border-radius:3px;background:var(--dsw-alias-brand-primary);transition:width .3s}",
      ".jm-bar-fill.tone-ok{background:var(--dsw-alias-state-success-primary)}",
      ".jm-bar-fill.tone-warn{background:var(--dsw-alias-state-warn-primary)}",
      ".jm-bar-fill.tone-bad{background:var(--dsw-alias-state-error-primary)}",
      ".jm-bar-fill.tone-pink{background:#e879a6}",
      ".jm-bar-fill.tone-xhs{background:#ff2e4d}",
      ".jm-bar-v{text-align:right;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}",
      ".jm-kv{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}",
      ".jm-kv>div{display:flex;justify-content:space-between;padding:7px 10px;background:var(--dsw-alias-bg-layer-1);border-radius:7px;font-size:11.5px;color:var(--dsw-alias-label-tertiary)}",
      ".jm-kv b{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}",

      /* 自检 */
      ".jm-checks{display:flex;flex-direction:column}",
      ".jm-check{display:flex;align-items:flex-start;gap:9px;padding:7px 0;border-bottom:.5px solid var(--dsw-alias-border-l1);font-size:12px}",
      ".jm-check:last-child{border-bottom:none}",
      ".jm-check-ic{width:15px;flex:0 0 auto;text-align:center;font-weight:700;font-size:12px}",
      ".jm-check.ok .jm-check-ic{color:var(--dsw-alias-state-success-primary)}",
      ".jm-check.no .jm-check-ic{color:var(--dsw-alias-state-warn-primary)}",
      ".jm-check-nm{flex:0 0 auto;min-width:88px;color:var(--dsw-alias-label-secondary)}",
      ".jm-check-dt{flex:1;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,monospace;font-size:10.5px}",

      /* 表格 */
      ".jm-table{width:100%;border-collapse:collapse;font-size:12px}",
      ".jm-table th{text-align:left;padding:7px 9px;font-size:10.5px;color:var(--dsw-alias-label-tertiary);font-weight:600;letter-spacing:.04em;text-transform:uppercase;border-bottom:.5px solid var(--dsw-alias-border-l1)}",
      ".jm-table td{padding:7px 9px;border-bottom:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);vertical-align:top}",
      ".jm-table td.mono{font-family:ui-monospace,monospace;font-size:10.5px}",
      ".jm-table td.small{font-size:11px;line-height:1.6}",
      ".jm-table a{color:var(--dsw-alias-brand-primary);text-decoration:none}",
      ".jm-table a:hover{text-decoration:underline}",
      ".jm-table tr:last-child td{border-bottom:none}",
      ".jm-fill{max-height:560px;overflow-y:auto}",

      /* 七日趋势图 */
      ".jm-trend-sum{font-size:11px;font-weight:500;color:var(--dsw-alias-label-tertiary)}",
      ".jm-chart{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;height:110px;align-items:end;padding:6px 0 0}",
      ".jm-chart-col{display:flex;flex-direction:column;align-items:center;gap:5px;height:100%;justify-content:flex-end}",
      ".jm-chart-bar-wrap{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center;min-height:0}",
      ".jm-chart-bar{width:66%;max-width:34px;min-height:2px;border-radius:5px 5px 2px 2px;background:linear-gradient(to top,var(--dsw-alias-brand-primary),rgba(63,199,245,.55));transition:height .3s ease,opacity .15s}",
      ".jm-chart-col:hover .jm-chart-bar{opacity:.82}",
      ".jm-chart-bar.empty{background:rgba(127,127,127,.16)}",
      ".jm-chart-x{font-size:10px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}",
      ".jm-chart-v{font-size:10.5px;font-weight:650;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;height:13px}",
      ".jm-chart-legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-tertiary)}",

      /* ═══ 设置页打磨（2026-10-20 第三轮）═══
         控制台有 99 个样式类，设置页只有 23 个 —— 差距全在视觉。
         这里只覆盖样式、不动组件，风险最低。 */
      // 分组标题：加一道竖条 + 上间距，视觉分段明显
      ".blw-group{display:flex;align-items:center;gap:8px;margin-top:24px;margin-bottom:2px;font-size:12px;font-weight:700;color:var(--dsw-alias-label-primary);letter-spacing:.03em}",
      ".blw-group::before{content:'';width:3px;height:13px;border-radius:2px;background:var(--dsw-alias-brand-primary);flex:0 0 auto}",
      ".blw-group:first-of-type{margin-top:6px}",
      // 行：做成浅卡片，hover 提亮
      ".blw-rows{background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;padding:2px 14px;margin-top:8px;overflow:hidden}",
      ".blw-row{padding:13px 0;border-bottom:.5px solid var(--dsw-alias-border-l1);transition:background .13s;margin:0 -14px;padding-left:14px;padding-right:14px}",
      ".blw-row:last-child{border-bottom:none}",
      ".blw-row:hover{background:rgba(127,127,127,.05)}",
      ".blw-label{font-size:13px;font-weight:560;line-height:1.45}",
      ".blw-hint{color:var(--dsw-alias-label-tertiary);margin-top:4px;font-size:11.5px;line-height:1.6;max-width:46ch}",
      // 输入框：更高、圆角更大、聚焦有光晕
      ".blw-input,.blw-select{background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-primary);font-size:12.5px;height:32px;padding:0 11px;min-width:190px;outline:none;font-family:inherit;transition:border-color .15s,box-shadow .15s}",
      ".blw-input:hover,.blw-select:hover{border-color:var(--dsw-alias-label-tertiary)}",
      ".blw-input:focus-visible,.blw-select:focus-visible{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px rgba(63,199,245,.13)}",
      ".blw-input[readonly]{opacity:.6;cursor:not-allowed}",
      ".blw-input.blw-wide{min-width:300px}",
      // 复选框：做成开关
      ".blw-row input[type=checkbox]{appearance:none;-webkit-appearance:none;width:36px;height:20px;border-radius:10px;background:rgba(127,127,127,.28);position:relative;cursor:pointer;transition:background .18s;flex:0 0 auto;border:none;outline:none}",
      ".blw-row input[type=checkbox]::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .18s;box-shadow:0 1px 3px rgba(0,0,0,.25)}",
      ".blw-row input[type=checkbox]:checked{background:var(--dsw-alias-brand-primary)}",
      ".blw-row input[type=checkbox]:checked::after{transform:translateX(16px)}",
      ".blw-row input[type=checkbox]:disabled{opacity:.45;cursor:default}",
      ".blw-row input[type=checkbox]:focus-visible{box-shadow:0 0 0 3px rgba(63,199,245,.18)}",
      // 按钮：统一高度与圆角
      ".blw-btn{background:var(--dsw-alias-brand-primary);color:#fff;border:none;border-radius:8px;font-size:12.5px;height:32px;padding:0 15px;cursor:pointer;font-family:inherit;transition:opacity .14s,transform .1s}",
      ".blw-btn:hover:not(:disabled){opacity:.88}",
      ".blw-btn:active:not(:disabled){transform:scale(.98)}",
      ".blw-btn:disabled{opacity:.42;cursor:default}",
      ".blw-btn2{background:transparent;border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}",
      ".blw-btn2:hover:not(:disabled){background:rgba(127,127,127,.08);opacity:1}",
      // 操作区：粘在底部，滚动时也能点保存
      ".blw-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:22px;padding:14px 0 4px;border-top:.5px solid var(--dsw-alias-border-l1);align-items:center}",
      // 未保存提示更醒目
      ".blw-actions span{font-size:12px;font-weight:600}",
      // 只读徽章
      ".blw-badge{display:inline-block;font-size:10px;line-height:15px;padding:1px 7px;border-radius:999px;background:rgba(127,127,127,.16);color:var(--dsw-alias-label-tertiary);margin-left:7px;font-weight:600}",
      // 输出块
      ".blw-out{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:1.7;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1);border-radius:9px;padding:12px 14px;max-height:260px;overflow:auto;margin-top:12px}",
      ".blw-err{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.65;margin-top:9px;background:rgba(248,81,73,.08);border-radius:7px;padding:9px 12px}",
      ".blw-intro{color:var(--dsw-alias-label-tertiary);margin:6px 0 0;font-size:12.5px;line-height:1.7}",
      ".blw-intro code{font-family:ui-monospace,monospace;font-size:11.5px;background:rgba(127,127,127,.13);padding:1px 6px;border-radius:4px}",
      // cookie 区
      ".blw-cookie{display:flex;flex-direction:column;gap:8px;min-width:270px}",
      // 顶部导航条
      ".blw-nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 0 15px;border-bottom:.5px solid var(--dsw-alias-border-l1);margin-bottom:10px}",
      ".blw-nav-tabs{display:flex;gap:2px;background:var(--dsw-alias-bg-layer-2);padding:2.5px;border-radius:9px}",
      ".blw-navtab{background:transparent;border:none;color:var(--dsw-alias-label-secondary);font-size:12.5px;font-weight:560;padding:6px 17px;border-radius:6px;cursor:pointer;transition:.15s;font-family:inherit}",
      ".blw-navtab:hover{color:var(--dsw-alias-label-primary)}",
      ".blw-navtab.on{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:650;box-shadow:0 1px 3px rgba(0,0,0,.14)}",

      /* ── 主面板页（侧栏点开）── */
      // 2026-10-22 修（故障①：滚到底后面的内容看不了）：min-height:520px 是祸根 ✗
      //   窗口内容区矮于 520 时 page 被撑到 520，超出 .centerCol（overflow:hidden）的部分被永久剪掉
      //   → body 内部能滚到底，但页面最底那段永远在视口外（实测 470px 容器被剪 50px）✗
      //   现在 page 永远等于容器高，body 的 flex:1 + overflow-y:auto 全权负责滚动 ✓
      ".jm-page{display:flex;flex-direction:column;gap:0;height:100%;min-height:0}",
      ".jm-page-tabs{display:flex;gap:2px;padding:0 0 0 2px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex:0 0 auto}",
      ".jm-page-tab{position:relative;background:transparent;border:none;border-bottom:2px solid transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:600;padding:11px 18px;cursor:pointer;font-family:inherit;margin-bottom:-.5px;transition:color .14s,border-color .14s;display:flex;align-items:center;gap:6px}",
      ".jm-page-tab:hover{color:var(--dsw-alias-label-primary)}",
      ".jm-page-tab.on{color:var(--dsw-alias-brand-primary);border-bottom-color:var(--dsw-alias-brand-primary)}",
      ".jm-badge-dot{background:var(--dsw-alias-state-warn-primary);color:#1a1300;font-size:10px;font-weight:700;min-width:16px;height:16px;padding:0 4px;border-radius:8px;display:grid;place-items:center;line-height:1}",
      // 2026-10-22 顺手：overscroll-behavior:contain —— 内部滚动区滚到头不再把滚轮链给外层（防止整页跟着晃）
      ".jm-page-body{padding:16px 18px;overflow-y:auto;flex:1;min-height:0;overscroll-behavior:contain}",
      ".jm-page-body .jm{border:none;border-radius:0;min-height:0}",
      ".jm-page-body .jm-side{display:none}",

      /* ── 审批 ── */
      ".jm-approval{display:flex;flex-direction:column;gap:14px;max-width:900px}",
      ".jm-appr-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}",
      ".jm-appr-title{font-size:16px;font-weight:680;letter-spacing:-.01em}",
      ".jm-appr-sub{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-top:3px}",
      ".jm-ok-msg{font-size:12px;color:var(--dsw-alias-state-success-primary);background:rgba(63,185,80,.1);border-radius:7px;padding:8px 12px}",
      ".jm-appr-list{display:flex;flex-direction:column;gap:11px}",
      ".jm-appr-item{background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;padding:13px 15px;position:relative;overflow:hidden}",
      ".jm-appr-item.s-pending{border-color:rgba(227,179,65,.35)}",
      ".jm-appr-item.s-pending::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2.5px;background:var(--dsw-alias-state-warn-primary)}",
      ".jm-appr-item.s-approved::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2.5px;background:var(--dsw-alias-state-success-primary)}",
      ".jm-appr-item.s-rejected::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2.5px;background:var(--dsw-alias-state-error-primary)}",
      ".jm-appr-item-h{display:flex;align-items:center;gap:9px;margin-bottom:9px;flex-wrap:wrap}",
      ".jm-st2{font-size:10.5px;font-weight:650;padding:2px 8px;border-radius:999px}",
      ".jm-st2.warn{background:rgba(227,179,65,.16);color:var(--dsw-alias-state-warn-primary)}",
      ".jm-st2.ok{background:rgba(63,185,80,.15);color:var(--dsw-alias-state-success-primary)}",
      ".jm-st2.bad{background:rgba(248,81,73,.13);color:var(--dsw-alias-state-error-primary)}",
      ".jm-appr-kind{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary)}",
      ".jm-plat-mini{font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(127,127,127,.13);color:var(--dsw-alias-label-tertiary)}",
      ".jm-appr-body{font-size:13px;line-height:1.9;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;background:var(--dsw-alias-bg-layer-1);border-radius:8px;padding:11px 13px;max-height:300px;overflow-y:auto}",
      ".jm-appr-edit{width:100%;min-height:180px;font-size:13px;line-height:1.9;font-family:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-brand-primary);border-radius:8px;padding:11px 13px;resize:vertical;outline:none}",
      ".jm-appr-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:11px;align-items:center}",
      ".jm-btn{background:var(--dsw-alias-brand-primary);color:#fff;border:none;border-radius:7px;font-size:12.5px;height:30px;padding:0 14px;cursor:pointer;font-family:inherit;transition:opacity .14s}",
      ".jm-btn:hover{opacity:.88}",
      ".jm-btn:disabled{opacity:.45;cursor:default}",
      ".jm-btn-ghost{background:transparent;border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}",
      ".jm-btn-danger{background:transparent;border:.5px solid rgba(248,81,73,.45);color:var(--dsw-alias-state-error-primary)}",
      ".jm-btn-danger:hover{background:rgba(248,81,73,.1)}",
      ".jm-reject-box{margin-top:11px;padding:12px 13px;background:rgba(248,81,73,.06);border:.5px solid rgba(248,81,73,.25);border-radius:8px}",
      ".jm-reject-h{font-size:11.5px;color:var(--dsw-alias-state-error-primary);margin-bottom:8px;font-weight:600}",
      ".jm-input{width:100%;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l2);border-radius:7px;color:var(--dsw-alias-label-primary);font-size:12.5px;height:32px;padding:0 10px;outline:none;font-family:inherit}",
      ".jm-input:focus{border-color:var(--dsw-alias-brand-primary)}",
      ".jm-rejected-hint{font-size:11.5px;color:var(--dsw-alias-label-tertiary);line-height:1.7;padding-left:2px}",

      /* 她最近在想什么 */
      ".jm-thoughts{background:linear-gradient(135deg,rgba(63,199,245,.07),rgba(63,199,245,.02));border:.5px solid rgba(63,199,245,.22);border-radius:10px;padding:13px 15px}",
      ".jm-thoughts-h{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:650;color:var(--dsw-alias-brand-primary);letter-spacing:.04em;text-transform:uppercase;margin-bottom:9px}",
      ".jm-thoughts-ic{font-size:15px;line-height:1;opacity:.8}",
      ".jm-thought{font-size:12.5px;line-height:1.8;color:var(--dsw-alias-label-secondary);padding-left:11px;border-left:2px solid rgba(63,199,245,.35);margin-bottom:7px}",
      ".jm-thought:last-child{margin-bottom:0}",
      /* ── 视觉打磨（2026-10-20 第二轮）── */
      // 卡片：顶部一道微光，hover 时轻微抬起
      ".jm-card{transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}",
      ".jm-card:hover{transform:translateY(-1px);box-shadow:0 3px 12px rgba(0,0,0,.16)}",
      ".jm-card::after{filter:saturate(1.15)}",
      // 事件行：hover 时左侧出现指示条
      ".jm-ev{position:relative;border-left:2px solid transparent;transition:border-color .13s,background .13s}",
      ".jm-ev:hover{border-left-color:var(--dsw-alias-brand-primary)}",
      // 面板标题：加一道细横线，分区更清楚
      ".jm-panel-h{border-bottom:.5px solid var(--dsw-alias-border-l1);padding-bottom:8px}",
      // 概览里的平台卡：hover 提亮
      ".jm-plat{transition:border-color .15s,background .15s}",
      ".jm-plat:hover{border-color:var(--dsw-alias-border-l2)}",
      // 侧栏导航：选中项左侧一道竖条，更像控制台
      ".jm-nav{position:relative}",
      ".jm-nav.on::before{content:'';position:absolute;left:-8px;top:50%;transform:translateY(-50%);width:2.5px;height:16px;border-radius:2px;background:#fff;opacity:.9}",
      ".jm-side.collapsed .jm-nav.on::before{display:none}",
      // 滚动条：细一点，不抢视线
      ".jm-feed::-webkit-scrollbar,.jm-diary-b::-webkit-scrollbar,.jm-fill::-webkit-scrollbar{width:6px}",
      ".jm-feed::-webkit-scrollbar-thumb,.jm-diary-b::-webkit-scrollbar-thumb,.jm-fill::-webkit-scrollbar-thumb{background:rgba(127,127,127,.28);border-radius:3px}",
      ".jm-feed::-webkit-scrollbar-thumb:hover,.jm-diary-b::-webkit-scrollbar-thumb:hover,.jm-fill::-webkit-scrollbar-thumb:hover{background:rgba(127,127,127,.45)}",
      ".jm-feed::-webkit-scrollbar-track,.jm-diary-b::-webkit-scrollbar-track,.jm-fill::-webkit-scrollbar-track{background:transparent}",
      // 主区：小屏时收紧内边距
      "@container (max-width:520px){.jm-main{padding:12px 12px}}",
      // 卡片值：数字用等宽，跳动时不晃
      ".jm-card-v{font-feature-settings:'tnum' 1}",
      // 空状态：加图标感的虚线框
      ".jm-empty{border:.5px dashed var(--dsw-alias-border-l2);border-radius:9px;margin:4px 0}",
      // 快速操作按钮：按下反馈
      ".jm-qbtn:active{transform:scale(.97)}",
      // 表格：hover 高亮行
      ".jm-table tbody tr{transition:background .13s}",
      ".jm-table tbody tr:hover{background:rgba(127,127,127,.06)}",


      /* 快速操作 */
      ".jm-quick{background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;padding:12px 14px}",
      ".jm-quick-t{font-size:10.5px;font-weight:650;color:var(--dsw-alias-label-tertiary);letter-spacing:.04em;text-transform:uppercase;margin-bottom:9px}",
      ".jm-quick-btns{display:flex;gap:8px;flex-wrap:wrap}",
      ".jm-qbtn{background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font-size:12px;padding:6px 13px;border-radius:7px;cursor:pointer;font-family:inherit;transition:border-color .14s,background .14s}",
      ".jm-qbtn:hover{border-color:var(--dsw-alias-brand-primary);background:rgba(63,199,245,.08);color:var(--dsw-alias-brand-primary)}",
    ].join("");

    // ── 唯一真相：字段清单（加字段只改这里 ✓）────────────────────────────
    //   kind: text | number | list（逗号分隔数组）| switch | select
    const FIELDS = [
      { group: "她是谁", path: ["persona", "name"], label: "角色名", hint: "她怎么被称呼", kind: "text" },
      { group: "她是谁", path: ["persona", "ownerTitle"], label: "她怎么称呼你", hint: "例如「主人」", kind: "text" },
      { group: "她是谁", path: ["persona", "selfClaim"], label: "她怎么自称", hint: "例如「我」/「人家」", kind: "text" },

      { group: "你（主人）", path: ["owner", "mid"], label: "主人 mid", hint: "用来认「谁回过她 / 谁点了赞」", kind: "text" },
      { group: "你（主人）", path: ["owner", "name"], label: "主人昵称", hint: "@ 分享时写进正文", kind: "text" },
      { group: "你（主人）", path: ["self", "mid"], label: "她自己 mid", hint: "只读（来自 cookie）", kind: "text", readOnly: true },
      { group: "你（主人）", path: ["self", "name"], label: "她自己昵称", hint: "只读（来自 nav）", kind: "text", readOnly: true },

      { group: "作息", path: ["night", "skipChance"], label: "今晚不看的概率", hint: "0.3 = 三成", kind: "number" },
      { group: "作息", path: ["night", "maxVideos"], label: "单次醒来观看视频数量", hint: "初筛的候选数；筛完再挑 2–3 条深读", kind: "number" },

      { group: "口味", path: ["preferences", "like"], label: "爱看", hint: "逗号分隔", kind: "list" },
      { group: "口味", path: ["preferences", "dislike"], label: "不爱看", hint: "逗号分隔", kind: "list" },

      { group: "日记与推送", path: ["diary", "push"], label: "推送日记摘要", hint: "关掉 = 她照写两本日记，但不推给你（日记本身不能关 ✓）", kind: "switch" },

      { group: "工具链", path: ["toolsPath"], label: "工具目录", hint: "留空 = 用插件自带的 tools/ 或开发目录", kind: "text", wide: true },
    ];

    const getPath = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
    const setPath = (obj, path, value) => {
      let cur = obj;
      for (let i = 0; i < path.length - 1; i += 1) {
        const k = path[i];
        if (cur[k] == null || typeof cur[k] !== "object") cur[k] = typeof path[i + 1] === "number" ? [] : {};
        cur = cur[k];
      }
      cur[path[path.length - 1]] = value;
    };

    function useStyleOnce() {
      useEffect(() => {
        if (typeof document === "undefined") return;
        if (!document.getElementById(CSS_TAG)) {
          const el = document.createElement("style");
          el.id = CSS_TAG;
          el.textContent = CSS;
          document.head.appendChild(el);
        }
      }, []);
    }

    function Row({ f, cfg, set }) {
      const raw = getPath(cfg, f.path);
      const common = { className: "blw-input" + (f.wide ? " blw-wide" : "") };
      // 2026-10-18 修：list 字段以前"值 = 数组 join、改动 = split 回数组" ✗
      //   → 你一打逗号，join 立刻把它吞掉（输入框里根本打不出逗号 ✗）
      //   现在：本地文本 state 管显示 ✓ 数组只在解析时更新 ✓（逗号能打、末尾逗号也不会乱跳 ✓）
      const [listText, setListText] = useState(Array.isArray(raw) ? raw.join("，") : (raw ?? ""));
      useEffect(() => {
        setListText(Array.isArray(raw) ? raw.join("，") : (raw ?? ""));
      }, [JSON.stringify(raw ?? null)]);
      let control;
      if (f.kind === "list") {
        control = h("input", {
          ...common,
          value: listText,          // ← 显示用本地文本（逗号不会被吞 ✓）
          readOnly: !!f.readOnly,
          onChange: (e) => {
            const v = e.target.value;
            setListText(v);          // 先原样显示（中文逗号、英文逗号、末尾逗号都能打 ✓）
            // 再解析成数组写进配置（空项过滤掉，不会因为末尾逗号多出一个空串 ✓）
            set(f.path, v.split(/[,，]/).map((s) => s.trim()).filter(Boolean));
          },
        });
      } else if (f.kind === "number") {
        control = h("input", { ...common, type: "number", step: "any", value: raw ?? "", readOnly: !!f.readOnly,
          onChange: (e) => set(f.path, e.target.value === "" ? undefined : Number(e.target.value)) });
      } else if (f.kind === "switch") {
        control = h("input", { type: "checkbox", checked: !!raw, disabled: !!f.readOnly,
          onChange: (e) => set(f.path, e.target.checked) });
      } else if (f.kind === "select") {
        control = h("select", { className: "blw-select", value: raw ?? "", disabled: !!f.readOnly,
          onChange: (e) => set(f.path, e.target.value) },
          f.options.map((o) => h("option", { key: o, value: o }, o)));
      } else {
        control = h("input", { ...common, value: raw ?? "", readOnly: !!f.readOnly,
          onChange: (e) => set(f.path, e.target.value) });
      }
      return h("div", { className: "blw-row" },
        h("div", null,
          h("div", { className: "blw-label" }, f.label, f.readOnly ? h("span", { className: "blw-badge" }, "只读") : null),
          f.hint ? h("div", { className: "blw-hint" }, f.hint) : null),
        control);
    }

    // ── 作息窗口编辑器（2026-10-18 主人画的草图）─────────────────────────
    //   ①  07:00 – 09:00   （醒来 1 次）   [x]
    //   ②  17:00 – 18:00   （醒来 1 次）   [x]
    //   [ + 添加窗口 ]
    //   每个窗口自带"醒来几次"；保存时把总和写回 night.maxWakesPerDay（工具链读它 ✓）
    const NUMS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];
    function WindowsEditor({ cfg, set }) {
      const wins = getPath(cfg, ["night", "windows"]);
      const list = Array.isArray(wins) ? wins : [];
      const upd = (i, patch) => set(["night", "windows"], list.map((w, j) => (j === i ? { ...w, ...patch } : w)));
      const del = (i) => set(["night", "windows"], list.filter((_, j) => j !== i));
      const add = () => set(["night", "windows"], [...list, { start: "20:00", end: "22:00", wakes: 1 }]);
      const timeInput = (v, onChange) =>
        h("input", { className: "blw-input", style: { width: "86px", minWidth: "86px" }, value: v ?? "", onChange: (e) => onChange(e.target.value) });
      return h("div", null,
        h("div", { className: "blw-rows" },
          list.length === 0
            ? h("div", { className: "blw-hint" }, "（没有窗口 = 永远不醒；至少加一个）")
            : list.map((w, i) =>
                h("div", { className: "blw-row", key: i },
                  h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
                    h("span", { className: "blw-hint", style: { minWidth: "18px" } }, NUMS[i] ?? String(i + 1)),
                    timeInput(w.start, (v) => upd(i, { start: v })),
                    h("span", { className: "blw-hint" }, "–"),
                    timeInput(w.end, (v) => upd(i, { end: v })),
                    h("span", { className: "blw-hint" }, "醒来"),
                    h("input", { className: "blw-input", style: { width: "56px", minWidth: "56px" }, type: "number", min: 1,
                      value: w.wakes ?? 1, onChange: (e) => upd(i, { wakes: Number(e.target.value) || 1 }) }),
                    h("span", { className: "blw-hint" }, "次")),
                  h("button", { className: "blw-btn blw-btn2", disabled: list.length <= 1, onClick: () => del(i), title: "删掉这个窗口" }, "×"))),
        h("div", { style: { marginTop: "8px" } },
          h("button", { className: "blw-btn blw-btn2", onClick: add }, "+ 添加窗口"))));
    }

    // ── 开关行（复选框 + 说明）──────────────────────────────────────────
    function SwitchRow({ label, hint, value, onChange, disabled }) {
      return h("div", { className: "blw-row" },
        h("div", null,
          h("div", { className: "blw-label" }, label),
          hint ? h("div", { className: "blw-hint" }, hint) : null),
        h("input", { type: "checkbox", checked: !!value, disabled: !!disabled, onChange: (e) => onChange(e.target.checked) }));
    }

    // ── 【分享评论】（主动 @ 你）· 2026-10-18 主人给的排版 ────────────────
    function ShareEditor({ cfg, set }) {
      const s = cfg.share ?? {};
      const daily = cfg.quota?.shareDaily ?? 3;
      // 2026-10-19：分享方式二选一 —— comment=评论区公开 @ / dm=私信给你（必须带视频链接）
      const via = s.via === "dm" ? "dm" : "comment";
      const viaRadio = ([value, label, hint]) =>
        h("label", { key: value, style: { display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "10px", cursor: "pointer" } },
          h("input", { type: "radio", name: "blw-share-via", checked: via === value, style: { marginTop: "3px" }, onChange: () => set(["share", "via"], value) }),
          h("div", null,
            h("div", { className: "blw-label" }, label),
            h("div", { className: "blw-hint" }, hint)));
      return h("div", null,
        h("div", { className: "blw-group" }, "分享（主动告诉你 · 二选一）"),
        h("div", { className: "blw-rows" },
          h(SwitchRow, { label: "开启", hint: "关掉 = 她只看不说 ✓", value: s.enabled !== false, onChange: (v) => set(["share", "enabled"], v) }),
          h("div", { className: "blw-row" },
            h("div", null,
              h("div", { className: "blw-label" }, "分享方式（二选一）"),
              h("div", { className: "blw-hint" }, "只在「有值得分享的」时才发；一条都不值得就一条都不发 ✓")),
            h("div", null,
              viaRadio(["comment", "评论区 @ 你", "在视频评论区发一条带 @ 的公开评论 ✓（原功能 · 别人也看得到）"]),
              viaRadio(["dm", "B站私信", "不发公开评论 ✗ 直接把分享内容 + 视频链接私信给你 ✓（更干净 ✓ 需要互关 ✓）"]))),
          h("div", { className: "blw-row" },
            h("div", null,
              h("div", { className: "blw-label" }, "每天上限"),
              h("div", { className: "blw-hint" }, via === "dm"
                ? "私信：一天只锁定你一个收信人 ✓ 条数不限 ✓"
                : "同一视频 7 天内一次 · 只从「深读过的」里挑 · 调大时会弹警告")),
            h("input", { className: "blw-input", style: { width: "80px", minWidth: "80px" }, type: "number", min: 0,
              value: daily, onChange: (e) => set(["quota", "shareDaily"], Number(e.target.value)) }))));
    }

    // ── 【全天监听】（别人找她）· 2026-10-18 主人给的排版 ──────────────────
    function ListenEditor({ cfg, set }) {
      const L = cfg.listen ?? {};
      const mins = Math.max(1, Math.round((L.commentIntervalSec ?? 300) / 60));
      const sel = (value, options, onChange) =>
        h("select", { className: "blw-select", value, onChange: (e) => onChange(e.target.value) },
          options.map(([v, label]) => h("option", { key: v, value: v }, label)));
      const num = (value, onChange, w = "70px") =>
        h("input", { className: "blw-input", style: { width: w, minWidth: w }, type: "number", min: 0, value: value ?? "", onChange: (e) => onChange(Number(e.target.value)) });
      return h("div", null,
        h("div", { className: "blw-group" }, "全天监听（别人找她）"),
        h("div", { className: "blw-rows" },
          h(SwitchRow, { label: "评论区监听", hint: `每 ${mins} 分钟查一次「回复我的 / @我的」`, value: L.comment !== false, onChange: (v) => set(["listen", "comment"], v) }),
          h("div", { className: "blw-row" },
            h("div", null, h("div", { className: "blw-label" }, "查一次间隔（分钟）"),
              h("div", { className: "blw-hint" }, "别小于 1 分钟，免得像刷接口")),
            num(mins, (v) => set(["listen", "commentIntervalSec"], Math.max(60, v * 60)))),
          h("div", { className: "blw-row" },
            h("div", null, h("div", { className: "blw-label" }, "只回"), h("div", { className: "blw-hint" }, "哪种通知算「找她」")),
            sel(L.scope ?? "both", [["both", "直接回我的 + @我的"], ["reply", "只回直接回我的"]], (v) => set(["listen", "scope"], v))),
          h(SwitchRow, { label: "同一个人最多只回一条", hint: "30 天内只回一次同一人（默认开 ✓）", value: L.oncePerPerson !== false, onChange: (v) => set(["listen", "oncePerPerson"], v) }),
          h(SwitchRow, { label: "全天（我睡着时也回）", hint: "关掉 = 只在她醒着的窗口里回 ✓", value: !!L.allDay, onChange: (v) => set(["listen", "allDay"], v) }),

          h(SwitchRow, { label: "私信监听（只认主人）", value: !!L.dm, onChange: (v) => set(["listen", "dm"], v),
            hint: "每 60 秒看一次主人有没有给你发私信 —— 有就叫醒你，实时回 ✓ 他不说话就零开销 ✓" }),
          h(SwitchRow, { label: "直播间监听", hint: "蹲直播间弹幕里有没有叫她", value: !!L.live, onChange: (v) => set(["listen", "live"], v) }),
          h("div", { className: "blw-row" },
            h("div", null, h("div", { className: "blw-label" }, "直播间房间号"), h("div", { className: "blw-hint" }, "留空 = 不蹲直播")),
            h("input", { className: "blw-input", style: { width: "120px", minWidth: "120px" }, value: L.liveRoom ?? "", placeholder: "例如 12345", onChange: (e) => set(["listen", "liveRoom"], e.target.value) })),
          h("div", { className: "blw-row" },
            h("div", null, h("div", { className: "blw-label" }, "直播间只回"), h("div", { className: "blw-hint" }, "只回主人 = 观众的一律不理；只回艾特她的 = 只看有没有人叫她")),
            sel(L.liveScope ?? "owner", [["owner", "只回主人"], ["mention", "只回艾特她的"]], (v) => set(["listen", "liveScope"], v)))),
        h("div", { className: "blw-out" },
          "【风控护栏 · 不可关】撞到 12015 / 12051 / 10031 → 立刻停监听 + 报你\n" +
          "【权限说明 · 只读】这一轮只注册只读工具；「发评论」必须显式打开；\n不注册：上传视频、发动态、私信、抓全站"));
    }

    // ── 【待审核】（2026-10-18 主人选 B 档：她的回复先给你看，你点「发」才发）──────
    function PendingEditor() {
      const [items, setItems] = useState([]);
      const [busy, setBusy] = useState("");
      const [msg, setMsg] = useState("");

      const load = useCallback(async () => {
        try { const r = await fetch(`${API}/pending`, { headers: { accept: "application/json" } }); const j = await r.json(); setItems(j.items ?? []) } catch {}
      }, []);
      useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [load]);

      const act = async (id, what, platform = 'bili') => {
        setBusy(id + what); setMsg("");
        try {
          const r = await fetch(`${API}/pending/${what}`, {
            method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ id, platform }),
          });
          const j = await r.json().catch(() => ({}));
          setMsg(j.ok
            ? (what === "approve" ? `✓ 已发出${j.rpid ? " · rpid=" + j.rpid : ""}` : "✓ 已删掉（也记了一笔「否」✓）")
            : `✗ ${j.error ?? "失败"}`);
          await load();
        } catch (e) { setMsg("✗ " + e.message) } finally { setBusy("") }
      };

      return h("div", null,
        h("div", { className: "blw-group" }, "待审核" + (items.length ? `（${items.length} 条）` : "")),
        h("div", { className: "blw-hint", style: { marginTop: "2px" } }, "她**回复 / 评论 / 发动态 / 发图文 / 发视频**之前，都先到这儿 —— 你点「发」才发 ✓（B 站 + 小红书两边排队；否掉也会记一笔，她会学着改 ✓）"),
        h("div", { className: "blw-rows" },
          items.length === 0
            ? h("div", { className: "blw-hint", style: { padding: "8px 0" } }, "（队列是空的 ✓）")
            : items.map((x) => {
              // 四类待审（2026-10-21 老板定的）：B站回复 / 小红书评论 / B站动态 / 小红书图文
              const PLAT_LABEL = {
                'bili': 'B 站回复', 'xhs': '小红书评论', 'bili-dynamic': 'B 站动态',
                'xhs-note': '小红书图文', 'bili-video': 'B 站视频', 'xhs-video': '小红书视频',
              }
              const pName = PLAT_LABEL[String(x.platform ?? 'bili')] ?? 'B 站回复'
              const isReply = x.platform === 'bili' || x.platform === 'xhs'
              return h("div", { className: "blw-row", key: `${x.platform ?? 'bili'}:${x.id}` },
                h("div", null,
                  h("div", { className: "blw-label" },
                    pName,
                    h("span", { className: "blw-badge" }, String(x.at ?? "").slice(5, 16).replace("T", " "))),
                  isReply && h("div", { className: "blw-hint" }, `→ ${x.who || x.author || "对方"}`),
                  isReply && x.src ? h("div", { className: "blw-hint" }, `他说：${String(x.src).slice(0, 80)}`) : null,
                  isReply && h("div", { className: "blw-hint", style: { color: "var(--dsw-alias-label-primary)", marginTop: "4px" } }, `你要回：${String(x.message ?? x.text ?? '').slice(0, 160)}`),
                  x.platform === 'bili-dynamic' && h("div", { className: "blw-hint", style: { whiteSpace: "pre-wrap", color: "var(--dsw-alias-label-primary)", marginTop: "4px" } }, `你要发（动态）：${String(x.text ?? '').slice(0, 200)}`),
                  x.platform === 'xhs-note' && h("div", null,
                    h("div", { className: "blw-hint" }, `你要发（图文）· 标题：${String(x.title ?? '')}`),
                    h("div", { className: "blw-hint", style: { whiteSpace: "pre-wrap" } }, String(x.content ?? '').slice(0, 200)),
                    h("div", { className: "blw-hint" }, `配图 ${(x.images ?? []).length} 张`)),
                  (x.platform === 'bili-video' || x.platform === 'xhs-video') && h("div", null,
                    h("div", { className: "blw-hint", style: { color: "var(--dsw-alias-label-primary)", marginTop: "4px" } }, `你要发（视频）· ${String(x.title ?? '')}`),
                    h("div", { className: "jm-vp-video" },
                      // 2026-10-22 修：file:// 在 GUI 里必然加载失败（http 页面禁本地文件）✗ → 走 video-cover 接口 ✓
                      x.id ? h("img", {
                        className: "jm-vp-cover",
                        src: `${API}/video-cover?id=${encodeURIComponent(String(x.id))}`,
                        alt: "",
                        onError: (e) => { e.currentTarget.style.visibility = "hidden" },
                      }) : null,
                      h("div", { className: "jm-vp-vmeta" },
                        h("div", null, `${x.aspect ?? ''} · ${x.duration ?? '?'} 秒 · ${x.sizeMB ?? '?'} MB`),
                        x.note ? h("div", { className: "blw-hint" }, String(x.note)) : null,
                        h("div", { className: "blw-hint", style: { wordBreak: "break-all" } }, `文件：${String(x.file ?? '')}`))))),
                h("div", { style: { display: "flex", gap: "6px" } },
                  h("button", { className: "blw-btn", disabled: !!busy, onClick: () => act(x.id, "approve", x.platform ?? 'bili') }, busy === x.id + "approve" ? "发出中…" : "发"),
                  h("button", { className: "blw-btn blw-btn2", disabled: !!busy, onClick: () => act(x.id, "reject", x.platform ?? 'bili') }, "删")))})),
        msg ? h("div", { className: msg.startsWith("✓") ? "blw-hint" : "blw-err" }, msg) : null);
    }

    // ── 【消息推送】（她看完一轮，把摘要送到哪）· 2026-10-18 主人给的排版 ──────
    function NotifyEditor({ cfg, set, save }) {
      const n = cfg.notify ?? {};
      // 旧配置里可能是 stdout / file → 界面上按「不推送」显示（不误导 ✓），选新方式时会被覆盖 ✓
      const type = ["none", "desktop", "dm", "webhook", "command"].includes(n.type) ? n.type : "none";
      const [testing, setTesting] = useState(false);
      const [testOut, setTestOut] = useState("");
      const setType = (v) => set(["notify", "type"], v);
      const radio = ([value, label]) =>
        h("label", { key: value, style: { display: "inline-flex", alignItems: "center", gap: "6px", marginRight: "14px", cursor: "pointer", fontSize: "13px" } },
          h("input", { type: "radio", name: "blw-notify", checked: type === value, onChange: () => setType(value) }),
          label);
      const test = async () => {
        setTesting(true); setTestOut("…正在保存设置（测试前先落盘 ✓）\n");
        try {
          // 2026-10-19：测试前**先保存** ✓
          //   以前测试读的是磁盘上的旧配置 → "点了别的单选、测试却还发到旧通道" ✗
          //   现在"你看到的就是你测的" ✓
          await save();
          const r = await fetch(`${API}/notify-test`, { method: "POST", headers: { accept: "application/json" } });
          const j = await r.json().catch(() => ({}));
          setTestOut((j.ok ? "✓ 已发送（设置已自动保存 ✓）\n" : "✗ 失败（设置已自动保存 ✓）\n") + (j.out || "") + (j.err ? "\n" + j.err : ""));
        } catch (e) { setTestOut("✗ " + e.message); } finally { setTesting(false); }
      };
      const box = { className: "blw-out", style: { marginTop: "8px" } };
      return h("div", null,
        h("div", { className: "blw-group" }, "消息推送"),
        h("div", { className: "blw-hint", style: { marginTop: "2px" } }, "她看完一轮，把摘要送到哪？"),
        h("div", { className: "blw-rows" },
          h("div", { className: "blw-row" },
            h("div", null, h("div", { className: "blw-label" }, "方式"),
              h("div", { className: "blw-hint" }, "不推送 = 只写日记与事件流")),
            h("div", null, ["none", "desktop", "dm", "webhook", "command"].map((v, i) =>
              radio([v, ["不推送", "桌面通知", "B站私信", "Webhook", "自定义命令"][i]])))),

          type === "webhook" ? h("div", null,
            h("div", { className: "blw-row" },
              h("div", null, h("div", { className: "blw-label" }, "Webhook 地址"),
                h("div", { className: "blw-hint" }, "飞书 / 钉钉 / 企业微信 / QQ机器人 / WorkBuddy —— 把机器人给的地址贴进来就行（报文按域名自动适配 ✓）")),
              h("input", { className: "blw-input blw-wide", style: { minWidth: "300px" }, value: n.url ?? "", placeholder: "https://open.feishu.cn/open-apis/bot/v2/hook/…", onChange: (e) => set(["notify", "url"], e.target.value) })),
            h("div", { className: "blw-row" },
              h("div", null, h("div", { className: "blw-label" }, "模板"),
                h("div", { className: "blw-hint" }, "纯文本最稳；飞书/钉钉选 markdown 会漂亮一些")),
              h("select", { className: "blw-select", value: n.template ?? "text", onChange: (e) => set(["notify", "template"], e.target.value) },
                h("option", { value: "text" }, "纯文本"),
                h("option", { value: "markdown" }, "markdown")))) : null,

          type === "command" ? h("div", { className: "blw-row" },
            h("div", null, h("div", { className: "blw-label" }, "自定义命令"),
              h("div", { className: "blw-hint" }, "cmd = 可执行文件（如 node.exe）；消息**自动作为最后一个参数**传进去 ✓"),
              h("div", { className: "blw-hint" }, "⚠️ 不再支持 $MSG（2026-10-18 弃用：走 shell 有命令注入风险 ✗）")),
            h("input", { className: "blw-input blw-wide", style: { minWidth: "300px" }, value: n.cmd ?? "", placeholder: 'C:\\path\\to\\node.exe', onChange: (e) => set(["notify", "cmd"], e.target.value) }),
            h("div", { className: "blw-hint", style: { marginTop: "6px" } }, "参数（JSON 数组，可留空；比如 [\"C:/path/to/cli.js\"]）"),
            h("input", {
              className: "blw-input blw-wide", style: { minWidth: "300px" },
              value: JSON.stringify(n.args ?? []),
              onChange: (e) => {
                try { const v = JSON.parse(e.target.value); set(["notify", "args"], Array.isArray(v) ? v : []) } catch {}
              },
              placeholder: '["C:/path/to/cli.js"]',
            })) : null),

        h("div", { className: "blw-actions", style: { borderTop: "none", marginTop: "8px", paddingTop: "0" } },
          h("button", { className: "blw-btn blw-btn2", onClick: test, disabled: testing }, testing ? "发送中…" : "发条测试"),
          type === "none" ? h("span", { className: "blw-hint" }, "（方式=不推送时，测试只验证命令能跑通）") : null),
        testOut ? h("div", box, testOut) : null);
    }


    // ── 状态面板（2026-10-20 合并）：把独立运营面板收进 DSH 界面 ────────────
    // 数据来自 /dsh-bili/api/dashboard（实时采集，与 collect.mjs 同源）
    // ══════════════════════════════════════════════════════════════════
    // 鲸檬控制台（2026-10-20 重做）
    //
    // 设计取舍：
    //   · 左侧竖向导航，不是顶部页签 —— 区块多了以后横向页签会挤成一排小字
    //   · 首页是「她现在怎么样」，不是日志列表 —— 打开就想知道"活着没、在干嘛"
    //   · 所有颜色走 DSH 主题 token，深色浅色都跟着变
    //   · 双平台并列（B 站 + 小红书），不混在一起算
    // ══════════════════════════════════════════════════════════════════

    const ICONS = {
      home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
      timeline: "M3 6h18M3 12h18M3 18h18",
      book: "M4 4h7v16H4zM13 4h7v16h-7z",
      chart: "M4 20V10m5 10V4m5 16v-7m5 7V8",
      heart: "M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z",
      gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L14.5 3h-4l-.4 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4L6 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5a7 7 0 0 0 .1-1z",
      check: "M20 6L9 17l-5-5",
      spark: "M12 2l2.4 7.2H22l-6 4.4 2.3 7.2-6.3-4.6-6.3 4.6L8 13.6 2 9.2h7.6z",
      panel: "M3 4h18v16H3zM9 4v16",
    };

    function Icon({ name, size = 16 }) {
      return h("svg", {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none",
        stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round",
        style: { display: "block", flex: "0 0 auto" },
      }, h("path", { d: ICONS[name] || ICONS.spark }));
    }

    function StatCard({ label, value, note, tone, icon }) {
      return h("div", { className: `jm-card${tone ? " t-" + tone : ""}` },
        h("div", { className: "jm-card-top" },
          h("span", { className: "jm-card-k" }, label),
          icon ? h("span", { className: "jm-card-ic" }, h(Icon, { name: icon, size: 13 })) : null),
        h("div", { className: "jm-card-v" }, value),
        note ? h("div", { className: "jm-card-n" }, note) : null);
    }

    function StatusPanel({ onClose }) {
      const [d, setD] = useState(null);
      const [err, setErr] = useState("");
      const [busy, setBusy] = useState(false);
      const [nav, setNav] = useState("home");
      // 侧栏折叠：窄屏默认收起，只留图标，把宽度还给主区
      // 默认收起：DSH 设置页的内容区本来就不宽（约 600–760），
      // 侧栏展开会吃掉 1/3 宽度。收起后主区能多出 140px。
      const [collapsed, setCollapsed] = useState(true);

      const request = useRef({ mounted: false, controller: null });
      const load = useCallback(async () => {
        const state = request.current;
        if (!state.mounted || state.controller) return;
        const controller = new AbortController();
        state.controller = controller;
        const timeout = setTimeout(() => controller.abort(), 20000);
        setBusy(true); setErr("");
        try {
          const r = await fetch(`${API}/dashboard`, {
            headers: { accept: "application/json" }, cache: "no-store", signal: controller.signal,
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const j = await r.json();
          if (!j.ok || !j.data) throw new Error(j.error || "采集失败");
          if (state.mounted && state.controller === controller) setD(j.data);
        } catch (e) {
          if (state.mounted && state.controller === controller) {
            setErr(`读不到状态：${e.name === "AbortError" ? "请求超时" : e.message}`);
          }
        } finally {
          clearTimeout(timeout);
          if (state.controller === controller) {
            state.controller = null;
            if (state.mounted) setBusy(false);
          }
        }
      }, []);

      useEffect(() => {
        request.current.mounted = true;
        load();
        // 每 30 秒自动刷新 —— 面板是"看她活着没"，不该停在打开那一刻
        const timer = setInterval(() => { if (request.current.mounted) load(); }, 30000);
        return () => {
          clearInterval(timer);
          request.current.mounted = false;
          if (request.current.controller) request.current.controller.abort();
          request.current.controller = null;
        };
      }, [load]);

      const KIND_LABEL = {
        "night-plan": "生物钟", "night-wake": "醒来", "night-skip": "不看",
        "feed": "选题", "debrief": "读懂", "interact": "互动",
        "diary-draft": "写日记", "diary-push": "推审", "diary-approve": "批准",
        "diary-reject": "驳回", "diary-publish": "发布", "create-brief": "创作",
        "create-outline": "分镜", "risk": "风控", "error": "错误",
        "dynamic": "动态", "notify": "通知",
        "comment-post": "B站留言", "share-comment": "分享·@你", "xhs-comment": "小红书留言",
        "inspiration": "灵感",
        "xhs-feed": "小红书选题", "xhs-read": "小红书读懂", "xhs-interact": "小红书互动",
        "xhs-note": "小红书笔记", "xhs-diary": "小红书日记",
      };
      const KIND_TONE = {
        night: "idle", feed: "ok", debrief: "brand", interact: "pink",
        diary: "warn", risk: "bad", error: "bad", xhs: "xhs", comment: "ok", share: "pink",
      };
      const groupOf = (k) => {
        if (/^xhs/.test(k)) return "xhs";
        if (/^night/.test(k)) return "night";
        if (k === "feed") return "feed";
        if (k === "debrief") return "debrief";
        if (/^interact|^dynamic|^notify/.test(k)) return "interact";
        if (/^diary|^create/.test(k)) return "diary";
        if (/^comment|^share/.test(k)) return "comment";
        if (/^risk|^error/.test(k)) return "risk";
        return "other";
      };

      const navItems = [
        ["home", "总览", "home"],
        ["timeline", "活动流", "timeline"],
        ["diary", "潜水日志", "book"],
        ["data", "数据", "chart"],
        ["read", "读过什么", "heart"],
        ["health", "自检", "check"],
      ];

      const sidebar = h("div", { className: `jm-side${collapsed ? " collapsed" : ""}` },
        h("div", { className: "jm-side-brand" },
          h("div", { className: "jm-avatar" }, "鲸"),
          h("div", { style: { minWidth: 0 } },
            h("div", { className: "jm-side-name" }, d?.persona?.name || "鲸檬"),
            h("div", { className: "jm-side-id" }, d?.persona?.selfMid || "—"))),
        h("div", { className: "jm-side-nav" },
          navItems.map(([k, label, icon]) => h("button", {
            key: k,
            className: `jm-nav${nav === k ? " on" : ""}`,
            onClick: () => setNav(k),
          }, h(Icon, { name: icon, size: 15 }), h("span", null, label)))),
        h("div", { className: "jm-side-foot" },
          h("button", {
            className: "jm-nav jm-nav-quiet jm-collapse", title: collapsed ? "展开侧栏" : "收起侧栏",
            onClick: () => setCollapsed((v) => !v),
          }, h(Icon, { name: "panel", size: 15 }), h("span", null, "收起")),
          h("button", { className: "jm-nav jm-nav-quiet", onClick: load, disabled: busy },
            h(Icon, { name: "spark", size: 15 }), h("span", null, busy ? "刷新中" : "刷新")),
          onClose ? h("button", { className: "jm-nav jm-nav-quiet", onClick: onClose },
            h(Icon, { name: "gear", size: 15 }), h("span", null, "设置")) : null));

      if (err) {
        return h("div", { className: "jm" }, sidebar,
          h("div", { className: "jm-main" },
            h("div", { className: "jm-err" }, err),
            h("div", { className: "jm-hint-line" }, "插件新加的接口需要重启 DSH 才会生效。"),
            h("button", { className: "jm-btn", onClick: load, disabled: busy }, "重试")));
      }

      if (!d) {
        return h("div", { className: "jm" }, sidebar,
          h("div", { className: "jm-main" }, h("div", { className: "jm-loading" }, "读取她的状态…")));
      }

      const s = d.schedule?.current;
      const plat = d.platforms || {};
      const okCount = (d.checks || []).filter((c) => c.ok).length;
      const total = (d.checks || []).length;
      const warmup = d.switches?.warmup;

      let when = "未排期", whenNote = "", whenTone = "";
      if (s?.planAt) {
        const ms = s.msUntil;
        if (s.fired) { when = "已唤醒并入队"; whenNote = `计划 ${s.atText || ""}`; whenTone = "ok"; }
        else if (ms > 0) {
          const m = Math.round(ms / 60000);
          when = m < 60 ? `${m} 分钟` : `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
          whenNote = `预计 ${s.atText || ""} 醒来`;
        } else { when = "到点了"; whenNote = "等待触发"; whenTone = "warn"; }
      }
      if (s?.action === "skip") { when = s.fired ? "不看流程已入队" : "今天不看"; whenNote = "本轮计划跳过观看"; whenTone = "warn"; }

      const cards = h("div", { className: "jm-cards" },
        h(StatCard, { label: "下次醒来", value: when, note: whenNote, tone: whenTone, icon: "spark" }),
        h(StatCard, { label: "今日事件", value: d.stats?.todayEvents ?? 0, note: `累计 ${d.stats?.totalEvents ?? 0}`, icon: "timeline" }),
        h(StatCard, { label: "今天读过", value: (d.diary?.watched || []).filter((w) => String(w.date).slice(0, 10) === new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" })).length, note: `想说没说 ${(d.diary?.wants || []).length}`, icon: "book" }),
        h(StatCard, { label: "待审日记", value: d.diary?.statusCount?.pending ?? 0, note: `已发 ${d.diary?.statusCount?.published ?? 0}`, tone: (d.diary?.statusCount?.pending ?? 0) > 0 ? "warn" : "", icon: "check" }),
        h(StatCard, { label: "运行模式", value: warmup ? "养号期" : "正常", note: `分享${d.switches?.share ? "开" : "关"} · 评论监听${d.switches?.listenComment ? "开" : "关"}`, tone: warmup ? "warn" : "ok", icon: "gear" }),
        h(StatCard, { label: "自检", value: `${okCount}/${total}`, note: okCount === total ? "全部通过" : `${total - okCount} 项待处理`, tone: okCount === total ? "ok" : "warn", icon: "check" }));

      // 事件行渲染
      const renderEvent = (e, i) => {
        const g = groupOf(e.kind);
        const t = new Date(e.at);
        const hh = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
        const dd = t.toLocaleDateString("sv-SE");
        const isToday = dd === new Date().toLocaleDateString("sv-SE");
        return h("div", { key: i, className: "jm-ev" },
          h("span", { className: `jm-ev-dot tone-${KIND_TONE[g] || "idle"}` }),
          h("span", { className: "jm-ev-time" }, hh),
          h("span", { className: `jm-ev-kind tone-${KIND_TONE[g] || "idle"}` }, KIND_LABEL[e.kind] || e.kind),
          h("span", { className: "jm-ev-text" }, e.note || ""),
          e.url
            ? h("a", { className: "jm-tag link", href: e.url, target: "_blank", rel: "noreferrer", title: `打开原页面：${e.url}` },
              String(e.target).startsWith("BV") ? `去B站看 ${String(e.target).slice(0, 12)}` : `看原帖 ${String(e.target).slice(0, 8)} ↗`)
            : (e.target ? h("code", { className: "jm-tag" }, String(e.target).slice(0, 22)) : null),
          !isToday ? h("code", { className: "jm-tag" }, dd) : null);
      };

      const quickActions = h("div", { className: "jm-quick" },
        h("div", { className: "jm-quick-t" }, "快速操作"),
        h("div", { className: "jm-quick-btns" },
          [["现在跑一轮", "让她立刻醒一次"],
           ["同步日记", "把本地日记推到飞书"],
           ["依赖体检", "检查 cookie / ffmpeg / node"]]
            .map(([label, tip]) => h("button", {
              key: label, className: "jm-qbtn", title: tip,
              onClick: () => {
                fetch(`${API}/action`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ action: label }),
                }).then((r) => r.json()).then((j) => {
                  if (j.ok) load();
                }).catch(() => {});
              },
            }, label))));

      // 「她最近在想什么」—— 从「想说没说」里取，这是她最有内容的部分
      const thoughts = (d.diary?.wants || []).slice(0, 3);
      const thoughtsCard = thoughts.length ? h("div", { className: "jm-thoughts" },
        h("div", { className: "jm-thoughts-h" },
          h("span", { className: "jm-thoughts-ic" }, "❝"),
          h("span", null, "她最近在想什么")),
        h("div", { className: "jm-thoughts-b" },
          thoughts.map((w, i) => h("div", { key: i, className: "jm-thought" }, w)))) : null;

      // 今日心情（2026-10-21 加）
      const mood = d.mood || {};
      const moodCard = mood.line ? h("div", { className: "jm-mood" },
        h("span", { className: "jm-mood-ic" }, "🐳"),
        h("span", { className: "jm-mood-tag" }, mood.key === "proud" ? "得意" : mood.key === "lazy" ? "犯懒" : mood.key === "curious" ? "好奇" : mood.key === "hungry" ? "馋" : "闷"),
        h("span", null, mood.line)) : null;

      // ⚠️ 修复 TDZ（2026-10-21）：这三张卡片原先声明在 homeView **之后**，
      //    而 homeView 构造时就要引用它们 → `Cannot access 'commentsCards' before initialization`
      //    → StatusPanel 每次渲染都抛错 → 「养鱼」页面整块空白 ✗
      //    修法：把它们的声明整体前移到 homeView 之前（依赖只有 d.*，前移无副作用 ✓）
      // ── 评论双卡片（2026-10-21 加）：B站留言 / 小红书留言 ─────────────
      // 老板要求：评论直接发，不用审批，但要在「最近干了什么」里写清楚。
      // 两张独立卡片，分别列 B站留言（comment-post / share-comment）和小红书留言（xhs-comment）。
      const cmt = d.comments || {};
      const fmtCmtTime = (at) => {
        const t = new Date(at);
        if (!Number.isFinite(t.getTime())) return "";
        return String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
      };
      const cmtCard = (title, badgeCls, items) => h("div", { className: "jm-cmt" },
        h("div", { className: "jm-cmt-h" },
          h("span", { className: `jm-cmt-badge ${badgeCls}` }, title),
          h("span", { className: "jm-cmt-n" }, `${items.length} 条`)),
        items.length
          ? h("div", { className: "jm-cmt-list" },
            items.map((c, i) => h("div", { key: i, className: "jm-cmt-item" },
              h("span", { className: "jm-cmt-t" }, fmtCmtTime(c.at)),
              h("div", { className: "jm-cmt-body" },
                c.url
                  ? h("a", { className: "jm-cmt-text", href: c.url, target: "_blank", rel: "noreferrer", title: `打开原页面：${c.url}` },
                    c.note || "看原帖", h("span", { className: "jm-cmt-go" }, " ↗"))
                  : h("span", { className: "jm-cmt-text" }, c.note || ""),
                c.meta?.text ? h("div", { className: "jm-cmt-quote" }, String(c.meta.text)) : null))))
          : h("div", { className: "jm-cmt-empty" }, "还没有发过留言"));
      const commentsCards = h("div", { className: "jm-cmt2" },
        cmtCard("B站留言", "bili", cmt.bili || []),
        cmtCard("小红书留言", "xhs", cmt.xhs || []));

      // ── 养号进度（2026-10-21 加，借鉴 yangyu-bot）──
      // 特别关注配额 / 任务箱待办 / 写动作保险丝，一眼看养号健不健康。
      const grow = d.grow || {};
      const growVip = grow.vip || {};
      const growFuse = grow.fuse || {};
      const fuseEntries = Object.entries(growFuse).filter(([, f]) => f.blocked);
      const vipNames = (growVip.users || []).map((u) => u.name || u.uid).join("、") || "未配置";
      const growCard = h("div", { className: "jm-panel" },
        h("div", { className: "jm-panel-h" }, h("span", null, "养号进度")),
        h("div", { className: "jm-grow" },
          h("div", { className: "jm-grow-row" },
            h("span", { className: "jm-grow-k" }, "特别关注"),
            h("b", { className: "jm-grow-v" }, growVip.users?.length ? `${(growVip.doneToday || 0)} / ${growVip.dailyMax || 6} 今天 · 剩 ${growVip.left ?? "—"}` : "未配名单"),
            h("span", { className: "jm-grow-n" }, vipNames)),
          h("div", { className: "jm-grow-row" },
            h("span", { className: "jm-grow-k" }, "任务箱"),
            h("b", { className: "jm-grow-v" }, `${grow.taskPending ?? 0} 条待办`),
            h("span", { className: "jm-grow-n" }, grow.taskPending ? "等她醒来处理" : "没有积压")),
          h("div", { className: "jm-grow-row" },
            h("span", { className: "jm-grow-k" }, "风控保险丝"),
            h("b", { className: `jm-grow-v${fuseEntries.length ? " warn" : ""}` }, fuseEntries.length ? `${fuseEntries.length} 个动作被熔断` : "全部正常"),
            h("span", { className: "jm-grow-n" }, fuseEntries.length
              ? fuseEntries.map(([a, f]) => `${a}→${new Date(f.until).toLocaleString("zh-CN", { day: "numeric", hour: "2-digit", minute: "2-digit" })}`).join(" · ")
              : "点赞/投币/收藏等写动作都通着"))));

      // ── 潜水箱（2026-10-21 加）：收藏带理由 = 她的宝贝 ────────────────
      const treasure = d.treasure || [];
      const treasureCard = treasure.length
        ? h("div", { className: "jm-treasure" },
          treasure.map((t, i) => h("div", { key: i, className: "jm-tres-item" },
            h("div", { className: "jm-tres-top" },
              h("span", { className: "jm-tres-kind" }, t.kind || "其他"),
              t.url
                ? h("a", { className: "jm-tres-title", href: t.url, target: "_blank", rel: "noreferrer" }, t.title || t.bv)
                : h("span", { className: "jm-tres-title" }, t.title || t.bv),
              t.up ? h("span", { className: "jm-tres-up" }, t.up) : null),
            h("div", { className: "jm-tres-reason" }, t.reason || ""))))
        : h("div", { className: "jm-empty" }, "潜水箱还空着。她收藏带理由的东西会出现在这里。");

      // ── 给你的视频建议（2026-10-21 加）─────────────────────────────
      // 老板要看推荐了哪些视频 + 能标记「已阅」。状态写回 video-suggestions.json（API），
      // 30s 自动刷新后保持。
      const vids = d.videoSuggestions || [];
      const markVideo = (url, seen) => {
        fetch(`${API}/video/${seen ? "seen" : "unseen"}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url }),
        }).then((r) => r.json()).then((j) => { if (j.ok) load(); }).catch(() => {});
      };
      const videoCard = h("div", { className: "jm-panel" },
        h("div", { className: "jm-panel-h" },
          h("span", null, "给你的视频建议"),
          vids.some((v) => v.seen) ? h("span", { className: "jm-meta" }, `已阅 ${vids.filter((v) => v.seen).length}/${vids.length}`) : null),
        vids.length
          ? h("div", { className: "jm-video" },
            vids.map((v, i) => h("div", { key: i, className: `jm-video-item${v.seen ? " seen" : ""}` },
              h("div", { className: "jm-video-top" },
                h("span", { className: "jm-video-date" }, v.at || ""),
                v.url
                  ? h("a", { className: "jm-video-title", href: v.url, target: "_blank", rel: "noreferrer" }, v.title || v.url)
                  : h("span", { className: "jm-video-title" }, v.title || "")),
              v.why ? h("div", { className: "jm-video-why" }, v.why) : null,
              v.action ? h("div", { className: "jm-video-act" }, v.action) : null,
              h("div", { className: "jm-video-btns" },
                v.seen
                  ? h("button", { className: "jm-vbtn done", title: "点一下取消已阅" }, "✓ 已阅")
                  : h("button", {
                    className: "jm-vbtn",
                    title: "标记为已阅",
                    onClick: () => markVideo(v.url, true),
                  }, "标记已阅")))))
          : h("div", { className: "jm-video-empty" }, "还没有视频建议。她推荐后会出现在这里。"));
      // 「已阅」按钮点过 → 变灰并显示 ✓（默认不动，30s 刷新后从后端读回）

      // ── 每天要做的视频（2026-10-21 加，老板：放养鱼页里）─────────────
      // 鲸檬做视频用的分镜提示词。当前该做的那期高亮，点开看全文 / 复制。
      const vp = d.videoPrompts || { items: [] };
      const vpItems = vp.items || [];
      const todoIdx = vpItems.findIndex((p) => p.status !== "done");
      const copyText = (t) => { try { navigator.clipboard.writeText(t) } catch (e) {} };
      const promptCard = h("div", { className: "jm-panel" },
        h("div", { className: "jm-panel-h" },
          h("span", null, "每天要做的视频"),
          vpItems.length
            ? h("span", { className: "jm-meta" }, todoIdx >= 0 ? `下一步 Day ${vpItems[todoIdx].day ?? todoIdx + 1}` : "都做完了")
            : null),
        vpItems.length
          ? h("div", { className: "jm-vp" },
            vpItems.map((p, i) => h("details", { key: i, className: `jm-vp-item${i === todoIdx ? " todo" : ""}` },
              h("summary", { className: "jm-vp-sum" },
                h("span", { className: "jm-vp-day" }, `Day ${p.day ?? i + 1}`),
                h("span", { className: "jm-vp-topic" }, p.title || p.topic || ""),
                i === todoIdx ? h("span", { className: "jm-vp-flag" }, "该做这条") : null,
                h("span", { className: `jm-vp-st ${p.status || ""}` },
                  p.status === "done" ? "已完成" : p.status === "ready" ? "就绪" : "待选题")),
              h("div", { className: "jm-vp-body" },
                p.kind ? h("div", { className: "jm-vp-kind" }, p.kind) : null,
                h("pre", { className: "jm-vp-prompt" }, p.prompt || ""),
                h("div", { className: "jm-vp-btns" },
                  h("button", { className: "jm-vbtn", title: "只复制这一期的分镜提示词", onClick: () => copyText(p.prompt || "") }, "复制提示词"),
                  h("button", { className: "jm-vbtn", title: "角色锚点 + 统一规格 + 这一期，全复制", onClick: () => copyText([vp.roleAnchor, vp.spec, p.prompt].filter(Boolean).join("\n\n") + "\n") }, "复制全部"))))))
          : h("div", { className: "jm-video-empty" }, "还没有视频提示词。她排好会出现在这里。"));

      // ── AI 虚拟人标签（2026-10-21 老板确认）──────────────────────────────
      // 小红书 2026-08-07 新规：AI 虚拟人账号要在资料页亮明身份 + 展示「AI虚拟人」标签，
      // 未标识 → 限流（主动标识不影响流量，还有优先体验新功能的可能）。
      // 标签要在 App 里手动设 —— 插件做不了那一步，所以面板只负责：显示状态 + 指引，
      // 你亮完回来点一下「已亮」，插件记住（下次不会一直提醒你 ✗）。
      const saveXhsIdentity = async (declared) => {
        try {
          const r = await fetch(`${API}/settings`, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ xhs: { aiIdentity: declared } }),
          });
          const j = await r.json().catch(() => ({}));
          if (j.ok) load();
        } catch (e) {}
      };

      // 最新潜水日志（2026-10-21 老板要求：常驻显示）
      // 日记不再发 B 站动态，只留在养鱼页给主人看 —— 总览页直接显示最新一篇全文
      const diaryHomeCard = (() => {
        const entries = (d.diary?.queue || []).filter((e) => String(e.text || '').trim());
        const latest = entries[entries.length - 1];
        return latest ? h("div", { className: "jm-panel" },
          h("div", { className: "jm-panel-h" },
            h("span", null, "今天的潜水日志"),
            h("span", { className: "jm-meta" }, `${latest.date} · ${latest.chars} 字`),
            h("button", { className: "jm-link", onClick: () => setNav("diary") }, "全部 →")),
          h("div", { className: "jm-diary-b" }, latest.text)) : null;
      })();

      // 待审提醒条（2026-10-21）：控制台第一眼看到"有几件事等你点头"
      const pendingBar = (() => {
        const q = d.approvals || d.pendingSummary || null;
        const n = q?.pending ?? 0;
        if (!n) return null;
        const parts = [];
        if (q.biliReply) parts.push(`B站回复 ${q.biliReply}`);
        if (q.xhsComment) parts.push(`小红书评论 ${q.xhsComment}`);
        if (q.biliDynamic) parts.push(`B站动态 ${q.biliDynamic}`);
        if (q.xhsNote) parts.push(`小红书图文 ${q.xhsNote}`);
        if (q.biliVideo) parts.push(`视频 ${q.biliVideo}`);
        return h("div", { className: "jm-pending-bar", onClick: () => { try { window.dispatchEvent(new CustomEvent("dsh-jingmeng-approval")) } catch {} } },
          h("span", { className: "jm-pb-dot" }),
          h("span", { className: "jm-pb-text" }, `${n} 件事等你点头`),
          parts.length ? h("span", { className: "jm-pb-parts" }, parts.join(" · ")) : null,
          h("span", { className: "jm-pb-go" }, "去审批 →"));
      })();

      // ── 控制台重排（2026-10-21 老板要求：重新优化）──────────────────
      // 逻辑：① 先看"有事要做"（待审）→ ② 她现在什么状态 → ③ 她今天产出了什么
      //       → ④ 她看过/收藏了什么 → ⑤ 系统健康。
      const homeView = h("div", { className: "jm-stack" },
        // ① 待审提醒条（最上面：有事要做）
        pendingBar,
        // ② 她现在什么状态
        moodCard,
        cards,
        // ③ 她今天产出了什么
        diaryHomeCard,
        h("div", { className: "jm-split" },
          h("div", { className: "jm-panel" },
            h("div", { className: "jm-panel-h" },
              h("span", null, "最近在干什么"),
              h("button", { className: "jm-link", onClick: () => setNav("timeline") }, "全部 →")),
            h("div", { className: "jm-feed" },
              (d.events || []).length
                ? (d.events || []).slice(0, 8).map(renderEvent)
                : h("div", { className: "jm-empty" }, "还没有事件。她第一次醒来后会出现在这里。"))),
          h("div", { className: "jm-panel" },
            h("div", { className: "jm-panel-h" }, h("span", null, "平台状态")),
            h("div", { className: "jm-platforms" },
              h("div", { className: "jm-plat" },
                h("div", { className: "jm-plat-h" },
                  h("span", { className: "jm-plat-badge bili" }, "B 站"),
                  h("span", { className: "jm-plat-name" }, plat.bili?.name || d.persona?.name || "鲸檬"),
                  h("span", { className: `jm-plat-live${plat.bili?.logged ? " on" : " off"}` }, plat.bili?.logged ? "在线" : "未登录")),
                h("div", { className: "jm-plat-row" }, h("span", null, "mid"), h("code", null, plat.bili?.mid || "—")),
                h("div", { className: "jm-plat-row" }, h("span", null, "事件"), h("b", null, `${plat.bili?.todayEvents ?? 0} 今日 / ${plat.bili?.events ?? 0} 累计`)),
                h("div", { className: "jm-plat-row" }, h("span", null, "分享"), h("b", { className: plat.bili?.shareOn ? "on" : "off" }, plat.bili?.shareOn ? "开" : "关")),
                h("div", { className: "jm-plat-row" }, h("span", null, "评论"), h("b", { className: plat.bili?.commentOn ? "on" : "off" }, plat.bili?.commentOn ? "开" : "关"))),
              h("div", { className: "jm-plat" },
                h("div", { className: "jm-plat-h" },
                  h("span", { className: "jm-plat-badge xhs" }, "小红书"),
                  h("span", { className: "jm-plat-name" }, plat.xhs?.name || "鲸檬"),
                  h("span", { className: `jm-plat-live${plat.xhs?.logged ? " on" : " off"}` }, plat.xhs?.logged ? "在线" : "未登录")),
                h("div", { className: "jm-plat-row" }, h("span", null, "事件"), h("b", null, `${plat.xhs?.todayEvents ?? 0} 今日 / ${plat.xhs?.events ?? 0} 累计`)),
                h("div", { className: "jm-plat-row" }, h("span", null, "读懂"), h("b", null, `${plat.xhs?.readCount ?? 0} 条`)),
                h("div", { className: "jm-plat-row" }, h("span", null, "选题"), h("b", null, `${plat.xhs?.feedCount ?? 0} 轮`)),
                h("div", { className: "jm-plat-row" }, h("span", null, "AI虚拟人"),
                  h("b", { className: plat.xhs?.aiIdentity ? "on" : "off" }, plat.xhs?.aiIdentity ? "✓ 已亮" : "⚠ 未亮"),
                  h("button", { className: "jm-plat-btn", title: "去小红书 App：我的 → 编辑资料 → 职业 → 选「AI创作者」/「AI虚拟人」；亮完回来点这里",
                    onClick: () => saveXhsIdentity(!(plat.xhs?.aiIdentity ?? false)) },
                    plat.xhs?.aiIdentity ? "取消" : "已亮")),
                h("div", { className: "jm-plat-row" }, h("span", null, "命令"), h("code", null, "bili.mjs xhs …")))))),
        // ④ 她看过 / 收藏了什么
        videoCard,
        promptCard,
        treasureCard,
        commentsCards,
        thoughtsCard,
        // ⑤ 系统：养号进度 + 快速操作
        growCard,
        quickActions);


      const timelineView = h("div", { className: "jm-panel jm-fill" },
        h("div", { className: "jm-panel-h" },
          h("span", null, `全部活动（${(d.events || []).length}）`),
          h("button", { className: "jm-link", onClick: load }, busy ? "刷新中" : "刷新")),
        h("div", { className: "jm-feed jm-feed-tall" },
          (d.events || []).length
            ? (d.events || []).map(renderEvent)
            : h("div", { className: "jm-empty" }, "还没有事件。")));

      const diaryView = h("div", { className: "jm-stack" },
        !(d.diary?.queue || []).length
          ? h("div", { className: "jm-empty jm-empty-lg" }, "还没写过日记。")
          : (d.diary.queue).slice().reverse().map((e, i) => h("div", { key: i, className: "jm-diary" },
            h("div", { className: "jm-diary-h" },
              h("span", { className: `jm-st ${e.status}` },
                { pending: "待审", approved: "已批准", published: "已发布", rejected: "已驳回" }[e.status] || e.status),
              h("span", { className: "jm-meta" }, `${e.date} · ${e.chars} 字`),
              e.dynId ? h("a", { className: "jm-link", href: `https://t.bilibili.com/${e.dynId}`, target: "_blank", rel: "noreferrer" }, "B站动态") : null),
            h("div", { className: "jm-diary-b" }, e.text))),
        (d.diary?.wants || []).length
          ? h("div", { className: "jm-wants" },
            h("div", { className: "jm-wants-t" }, "她想说、还没说的"),
            (d.diary.wants).map((w, i) => h("div", { key: i, className: "jm-want" }, w)))
          : null);

      // 七日趋势：柱状图（事件数），下方标日期
      const trend = d.trend || [];
      const trendMax = Math.max(1, ...trend.map((x) => x.events));
      const trendView = h("div", { className: "jm-panel" },
        h("div", { className: "jm-panel-h" },
          h("span", null, "最近七天"),
          h("span", { className: "jm-trend-sum" },
            `共 ${trend.reduce((a, b) => a + b.events, 0)} 条事件`)),
        h("div", { className: "jm-chart" },
          trend.map((x, i) => {
            const pct = Math.round((x.events / trendMax) * 100);
            return h("div", { key: i, className: "jm-chart-col", title: `${x.date}：${x.events} 条事件 / 读 ${x.reads} / 日记 ${x.diaries}` },
              h("div", { className: "jm-chart-bar-wrap" },
                h("div", {
                  className: `jm-chart-bar${x.events === 0 ? " empty" : ""}`,
                  style: { height: `${Math.max(x.events ? 6 : 2, pct)}%` },
                })),
              h("div", { className: "jm-chart-x" }, x.label),
              h("div", { className: "jm-chart-v" }, x.events || ""));
          })),
        h("div", { className: "jm-chart-legend" },
          h("span", null, `读过 ${trend.reduce((a, b) => a + b.reads, 0)} 条`),
          h("span", null, `写日记 ${trend.reduce((a, b) => a + b.diaries, 0)} 篇`),
          h("span", null, `互动 ${trend.reduce((a, b) => a + b.interacts, 0)} 次`),
          h("span", null, `风控 ${trend.reduce((a, b) => a + b.risks, 0)} 次`)));

      const dataView = h("div", { className: "jm-stack" },
        trendView,
        h("div", { className: "jm-panel" },
          h("div", { className: "jm-panel-h" }, h("span", null, "事件分布")),
          h("div", { className: "jm-bars" },
            Object.entries(d.stats?.allByKind || {}).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => {
              const max = Math.max(...Object.values(d.stats.allByKind || { x: 1 }));
              return h("div", { key: k, className: "jm-bar-row" },
                h("span", { className: "jm-bar-k" }, KIND_LABEL[k] || k),
                h("span", { className: "jm-bar-track" },
                  h("span", { className: `jm-bar-fill tone-${KIND_TONE[groupOf(k)] || "brand"}`, style: { width: `${Math.max(3, (v / max) * 100)}%` } })),
                h("span", { className: "jm-bar-v" }, v));
            }))),
        h("div", { className: "jm-panel" },
          h("div", { className: "jm-panel-h" }, h("span", null, "今日 vs 累计")),
          h("div", { className: "jm-kv" },
            h("div", null, h("span", null, "今日事件"), h("b", null, d.stats?.todayEvents ?? 0)),
            h("div", null, h("span", null, "累计事件"), h("b", null, d.stats?.totalEvents ?? 0)),
            h("div", null, h("span", null, "读过视频"), h("b", null, (d.diary?.watched || []).length)),
            h("div", null, h("span", null, "日记总数"), h("b", null, (d.diary?.queue || []).length)))));

      const readView = h("div", { className: "jm-panel jm-fill" },
        h("div", { className: "jm-panel-h" }, h("span", null, `读过什么（${(d.diary?.watched || []).length}）`)),
        !(d.diary?.watched || []).length
          ? h("div", { className: "jm-empty" }, "还没读过任何视频。")
          : h("table", { className: "jm-table" },
            h("thead", null, h("tr", null,
              h("th", null, "日期"), h("th", null, "BV"), h("th", null, "标题"), h("th", null, "她的判断"))),
            h("tbody", null, (d.diary.watched).map((w, i) => h("tr", { key: i },
              h("td", { className: "mono" }, w.date),
              h("td", { className: "mono" },
                h("a", { href: `https://www.bilibili.com/video/${w.bv}/`, target: "_blank", rel: "noreferrer" }, w.bv)),
              h("td", null, w.title),
              h("td", { className: "small" }, w.thought))))));

      const healthView = h("div", { className: "jm-panel jm-fill" },
        h("div", { className: "jm-panel-h" }, h("span", null, `自检（${okCount}/${total}）`)),
        h("div", { className: "jm-checks" },
          (d.checks || []).map((c, i) => h("div", { key: i, className: `jm-check${c.ok ? " ok" : " no"}` },
            h("span", { className: "jm-check-ic" }, c.ok ? "✓" : "!"),
            h("span", { className: "jm-check-nm" }, c.name),
            h("span", { className: "jm-check-dt" }, c.detail || "")))));

      const views = {
        home: homeView, timeline: timelineView, diary: diaryView,
        data: dataView, read: readView, health: healthView,
      };

      return h("div", { className: "jm" }, sidebar,
        h("div", { className: "jm-main" }, views[nav] || homeView));
    }


    // ══════════════════════════════════════════════════════════════════
    // 审批视频播放器（2026-10-22 修，故障②）
    //
    // 根因两层：
    //   ① 宿主（0.2.1-rc.2）对插件注册的 prefix 路由不生效 → /video-file/<id> 一律 404
    //      → 改走 exact 路由（?id=xx），后端已双注册 ✓
    //   ② 兜底：<video> 标签的请求万一拿不到凭据（不同入口对媒体请求的 cookie 行为不可控）
    //      → onError 后用 fetch（自带同源凭据）整段拉 blob → objectURL 再播 ✓
    // objectURL 在组件卸载时 revoke，不漏内存 ✓
    // ══════════════════════════════════════════════════════════════════
    function VideoPlayer({ id, cover }) {
      const direct = `${API}/video-file?id=${encodeURIComponent(String(id ?? ""))}`;
      const [src, setSrc] = useState(direct);
      const [mode, setMode] = useState("direct");   // direct | loading | blob | error
      const blobUrl = useRef(null);
      const tried = useRef(false);
      useEffect(() => () => {
        if (blobUrl.current) { try { URL.revokeObjectURL(blobUrl.current) } catch {} blobUrl.current = null; }
      }, []);
      const fallback = async () => {
        if (tried.current) return;                  // 只降级一次，防止 404 循环
        tried.current = true;
        setMode("loading");
        try {
          const r = await fetch(direct, { headers: { accept: "*/*" }, credentials: "same-origin" });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const blob = await r.blob();
          const url = URL.createObjectURL(blob);
          blobUrl.current = url;
          setSrc(url); setMode("blob");
        } catch (e) { setMode("error"); }
      };
      return h("div", null,
        h("video", {
          className: "jm-cv-player",
          src,
          poster: cover ? `${API}/video-cover?id=${encodeURIComponent(String(id ?? ""))}` : undefined,
          controls: true, preload: "metadata", playsInline: true,
          onError: fallback,
        }),
        mode === "loading" ? h("div", { className: "jm-cv-note" }, "直连播放被拦了，正在整段下载后再播（本地文件，几秒内好）…") : null,
        mode === "blob" ? h("div", { className: "jm-cv-note" }, "已切换为整段下载播放 ✓ 拖动进度条请等下载完成") : null,
        mode === "error" ? h("div", { className: "jm-cv-err" }, "视频接口读不到（可能插件还没重载，视频路由是 2026-10-21 深夜新加的）。重载插件后回来点刷新；文件在队列里不会丢。") : null);
    }

    // ══════════════════════════════════════════════════════════════════
    // 审批视图 —— 她的产出要经你点头才发出去
    //
    // 三种状态：待审 / 已通过（待发布） / 已驳回（要重写）
    // 驳回时把理由写回去，她下一轮会看到，按理由重写。
    // ══════════════════════════════════════════════════════════════════
    function ApprovalView() {
      const [items, setItems] = useState([]);
      const [busy, setBusy] = useState("");
      const [msg, setMsg] = useState("");
      const [err, setErr] = useState("");
      const [editing, setEditing] = useState(null);   // { id, text }
      const [rejecting, setRejecting] = useState(null); // { id, reason }
      const [filter, setFilter] = useState("all");      // 审批分类筛选（2026-10-21）

      const [loading, setLoading] = useState(true);
      const actionLock = useRef(false);
      const itemKey = (it) => `${it.kind || "diary"}:${it.id}`;

      const load = useCallback(async () => {
        setErr(""); setLoading(true);
        try {
          const r = await fetch(`${API}/approvals`, { headers: { accept: "application/json" } });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const j = await r.json();
          if (!j.ok) throw new Error(j.error || "读取失败");
          if (!Array.isArray(j.items)) throw new Error("待审列表格式错误");
          setItems(j.items);
        } catch (e) { setErr(`读不到待审列表：${e.message}${/404/.test(e.message) ? "，接口尚未加载，请重启后重试" : ""}`); }
        finally { setLoading(false); }
      }, []);

      useEffect(() => { load(); }, [load]);

      const act = async (it, action, payload) => {
        if (actionLock.current) return false;
        if (action === "reject" && !String(payload?.reason || "").trim()) { setErr("请填写驳回理由"); return false; }
        actionLock.current = true;
        setBusy(itemKey(it) + action); setMsg(""); setErr("");
        try {
          const r = await fetch(`${API}/approvals/${action}`, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ id: it.id, kind: it.kind, ...(payload || {}) }),
          });
          const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
          if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
          setMsg(j.detail || "已完成");
          await load();
          return true;
        } catch (e) { setErr(`${action} 失败：${e.message}`); return false; }
        finally { actionLock.current = false; setBusy(""); }
      };

      const STATUS = {
        pending: { label: "待你审", cls: "warn" },
        approved: { label: "已通过", cls: "ok" },
        rejected: { label: "要重写", cls: "bad" },
        published: { label: "已发布", cls: "ok" },
      };

      const pendingCount = items.filter((x) => x.status === "pending").length;

      // 类型筛选 tab（2026-10-21 老板：审批里要分类）
      const FILTERS = (() => {
        const cnt = (k) => items.filter((x) => x.kind === k && x.status === "pending").length;
        const defs = [
          ["all", "全部", items.filter((x) => x.status === "pending").length],
          ["video", "视频", cnt("bili-video") + cnt("xhs-video")],
          ["reply", "回复/评论", cnt("bili-reply") + cnt("xhs-comment")],
          ["dynamic", "B站动态", cnt("bili-dynamic")],
          ["note", "小红书图文", cnt("xhs-note")],
          ["diary", "日志", cnt("diary") + cnt("xhs-diary")],
        ];
        return defs;
      })();
      const matchFilter = (it) => {
        if (filter === "all") return true;
        if (filter === "video") return it.kind === "bili-video" || it.kind === "xhs-video";
        if (filter === "reply") return it.kind === "bili-reply" || it.kind === "xhs-comment";
        if (filter === "dynamic") return it.kind === "bili-dynamic";
        if (filter === "note") return it.kind === "xhs-note";
        if (filter === "diary") return it.kind === "diary" || it.kind === "xhs-diary";
        return true;
      };

      // 2026-10-21：排序 —— 待审优先，同状态按类型聚在一起（视频/动态/图文/回复/日记）
      const KIND_ORDER = ['bili-video','xhs-video','bili-dynamic','xhs-note','bili-reply','xhs-comment','diary','xhs-diary'];
      const sortedItems = items.slice().sort((a, b) => {
        const sa = a.status === 'pending' ? 0 : 1;
        const sb = b.status === 'pending' ? 0 : 1;
        if (sa !== sb) return sa - sb;
        const ka = KIND_ORDER.indexOf(a.kind), kb = KIND_ORDER.indexOf(b.kind);
        return (ka < 0 ? 99 : ka) - (kb < 0 ? 99 : kb);
      });

      return h("div", { className: "jm-approval" },
        h("div", { className: "jm-appr-head" },
          h("div", null,
            h("div", { className: "jm-appr-title" }, "审批"),
            h("div", { className: "jm-appr-sub" },
              loading ? "读取中…" : err ? "读取失败，请重试" : pendingCount ? `${pendingCount} 条等你点头` : "暂时没有要审的")),
          h("button", { className: "jm-link", onClick: load, disabled: loading || !!busy }, "刷新")),

        // 分类筛选（2026-10-21 老板：审批里要分类，不然看着难受）
        items.length ? h("div", { className: "jm-appr-tabs" },
          FILTERS.map(([k, label, n]) => h("button", {
            key: k,
            className: `jm-appr-tab${filter === k ? " on" : ""}${n === 0 && k !== "all" ? " dim" : ""}`,
            onClick: () => setFilter(k),
          }, label, n > 0 ? h("span", { className: "jm-appr-tab-n" }, n) : null))) : null,

        err ? h("div", { className: "jm-err" }, err) : null,
        msg ? h("div", { className: "jm-ok-msg" }, msg) : null,

        loading && !items.length ? h("div", { className: "jm-empty" }, "正在读取待审列表…") : err && !items.length ? null : !items.length
          ? h("div", { className: "jm-empty jm-empty-lg" },
            "没有待审的东西。她写完日记、或准备好一条内容，会出现在这里。")
          : h("div", { className: "jm-appr-list" },
            sortedItems.filter(matchFilter).map((it, idx) => {
              const vis = sortedItems.filter(matchFilter);
              const prev = vis[idx - 1];
              const groupHead = (!prev || prev.kind !== it.kind)
                ? h("div", { className: "jm-appr-group" },
                    h("span", null, it.kindLabel || it.kind),
                    h("span", { className: "jm-appr-group-n" },
                      `${sortedItems.filter(x => x.kind === it.kind && x.status === 'pending').length} 待审`))
                : null;
              const st = STATUS[it.status] || { label: it.status, cls: "" };
              const isEditing = editing && editing.key === itemKey(it);
              const isRejecting = rejecting && rejecting.key === itemKey(it);
              // 五类各用各的版式（2026-10-21 老板：不能只换两个字，其他都一样）
              const isVideo = it.kind === "bili-video" || it.kind === "xhs-video";
              const isReply = it.kind === "bili-reply" || it.kind === "xhs-comment";
              const isDynamic = it.kind === "bili-dynamic";
              const isNote = it.kind === "xhs-note";
              const isDiary = it.kind === "diary" || it.kind === "xhs-diary";
              const card = h("div", { className: `jm-appr-item s-${it.status}` },
                h("div", { className: "jm-appr-item-h" },
                  h("span", { className: `jm-st2 ${st.cls}` }, st.label),
                  h("span", { className: "jm-appr-kind" }, it.kindLabel || "潜水日志"),
                  h("span", { className: "jm-meta" },
                    isVideo ? `${it.aspect || ""} · ${it.duration || "?"} 秒 · ${it.sizeMB || "?"} MB`
                      : isReply ? `${it.chars} 字回复`
                      : `${it.chars} 字 · ${it.date}`),
                  it.platform ? h("span", { className: "jm-plat-mini" }, it.platform) : null),

                // ══ 视频：直接内嵌播放器（老板：要么给链接，要么直接放上来）══
                // 2026-10-22：改用 VideoPlayer —— exact 路由 + blob 兜底（见组件注释）
                isVideo ? h("div", { className: "jm-card-video" },
                  h("div", { className: "jm-cv-head" },
                    h("span", { className: "jm-cv-title" }, it.title || "未命名视频"),
                    h("span", { className: "jm-cv-spec" },
                      `${it.aspect || ""} · ${it.duration || "?"}s · ${it.sizeMB || "?"}MB`)),
                  h(VideoPlayer, { id: it.id, cover: it.cover }),
                  h("div", { className: "jm-cv-foot" },
                    h("span", { className: "jm-meta" }, "↑ 点播放直接看，审完再点下面的「发」"))) : null,

                // ══ B站 / 小红书回复：对话回复样式 ══
                isReply ? h("div", { className: "jm-card-reply" },
                  h("div", { className: "jm-cr-line" },
                    h("span", { className: "jm-cr-tag" }, "他"),
                    h("span", { className: "jm-cr-who" }, it.who || "对方")),
                  it.src ? h("div", { className: "jm-cr-said" }, String(it.src).slice(0, 140)) : null,
                  h("div", { className: "jm-cr-line jm-cr-mine" },
                    h("span", { className: "jm-cr-tag jm-cr-tag-me" }, "我"),
                    h("span", { className: "jm-cr-who" }, "鲸檬回")),
                  h("div", { className: "jm-cr-answer" }, it.text)) : null,

                // ══ B站动态：像一条动态那样展示 ══
                isDynamic ? h("div", { className: "jm-card-dynamic" },
                  h("div", { className: "jm-cd-head" },
                    h("span", { className: "jm-cd-avatar" }, "鲸"),
                    h("div", null,
                      h("div", { className: "jm-cd-name" }, "鲸檬"),
                      h("div", { className: "jm-cd-time" }, `${it.date} · 待发`))),
                  h("div", { className: "jm-cd-body" }, it.text)) : null,

                // ══ 小红书图文：红书卡片样式 ══
                isNote ? h("div", { className: "jm-card-note" },
                  h("div", { className: "jm-cn-title" }, it.title || ""),
                  h("div", { className: "jm-cn-body" }, it.text),
                  (it.images || []).length ? h("div", { className: "jm-cn-imgs" },
                    h("span", { className: "jm-cn-imgs-n" }, `配图 ${it.images.length} 张`),
                    h("div", { className: "jm-cn-imgs-list" },
                      (it.images || []).slice(0, 6).map((src, i) =>
                        h("img", { key: i, className: "jm-cn-thumb", src, alt: "" })))) : null) : null,

                // ══ 日记（旧的两种）：正文样式 ══
                (isDiary) ? h("div", null,
                  it.title ? h("div", { className: "jm-cd-name", style: { marginBottom: "6px" } }, it.title) : null,
                  isEditing
                    ? h("textarea", {
                      className: "jm-appr-edit",
                      value: editing.text, maxLength: it.maxChars || 500,
                      onChange: (e) => setEditing({ ...editing, text: e.target.value }),
                    })
                    : h("div", { className: "jm-appr-body" }, it.text)) : null,
                isEditing && it.kind === "xhs-diary" ? h("input", { className: "jm-input", value: editing.title || "", placeholder: "笔记标题", maxLength: 20, onChange: (e) => setEditing({ ...editing, title: e.target.value }) }) : null,
                isEditing
                  ? h("textarea", {
                    className: "jm-appr-edit",
                    value: editing.text, maxLength: it.maxChars || (it.kind === "xhs-diary" ? 1000 : 500),
                    onChange: (e) => setEditing({ ...editing, text: e.target.value }),
                  })
                  : h("div", { className: "jm-appr-body" }, it.text),

                isRejecting
                  ? h("div", { className: "jm-reject-box" },
                    h("div", { className: "jm-reject-h" }, "哪里不对？请留下重写要求："),
                    h("input", {
                      className: "jm-input", autoFocus: true,
                      placeholder: "例如：太像报告了，再口语一点；开头那句太自夸",
                      value: rejecting.reason,
                      onChange: (e) => setRejecting({ ...rejecting, reason: e.target.value }),
                    }),
                    h("div", { className: "jm-appr-actions" },
                      h("button", {
                        className: "jm-btn jm-btn-danger", disabled: !!busy || !rejecting.reason.trim(),
                        onClick: async () => { if (await act(it, "reject", { reason: rejecting.reason.trim() })) setRejecting(null); },
                      }, "确认驳回并保存理由"),
                      h("button", { className: "jm-btn jm-btn-ghost", onClick: () => setRejecting(null) }, "算了")))
                  : null,

                h("div", { className: "jm-appr-actions" },
                  ["pending", "approved", "rejected"].includes(it.status) ? [
                    isEditing
                      ? h("button", {
                        key: "save", className: "jm-btn jm-btn-ghost", disabled: !!busy || !editing.text.trim(),
                        onClick: async () => { if (await act(it, "edit", { text: editing.text, ...(it.kind === "xhs-diary" ? { title: editing.title } : {}) })) setEditing(null); },
                      }, "保存修改，重新待审")
                      : h("button", {
                        key: "edit", className: "jm-btn jm-btn-ghost",
                        disabled: !!busy, onClick: () => setEditing({ key: itemKey(it), text: it.text || it.content || "", title: it.title || "" }),
                      }, "改一下"),
                    h("button", {
                      key: "ok", className: "jm-btn",
                      disabled: !!busy || !!editing || it.status !== "pending",
                      onClick: () => act(it, "approve"),
                    }, busy === itemKey(it) + "approve" ? "通过中…" : "通过，可以发"),
                    h("button", {
                      key: "no", className: "jm-btn jm-btn-danger",
                      disabled: !!busy || it.status !== "pending", onClick: () => setRejecting({ key: itemKey(it), reason: "" }),
                    }, "不通过"),
                  ].filter(Boolean) : null,

                  it.status === "approved" ? h("button", {
                    className: "jm-btn", disabled: !!busy || !!editing,
                    onClick: () => act(it, "publish"),
                  }, busy === itemKey(it) + "publish" ? "发布中…" : "现在发布") : null,

                  it.status === "rejected" ? h("div", { className: "jm-rejected-hint" },
                    it.reason ? `驳回理由：${it.reason}` : "已驳回，等待按要求重写") : null,

                  it.status === "published" && it.url
                    ? h("a", { className: "jm-link", href: it.url, target: "_blank", rel: "noreferrer" }, "看已发布的 →")
                    : null));
              return h("div", { key: itemKey(it) }, groupHead, card);
            })));
    }

    // ── 侧栏入口（2026-10-20）：挂在「自动化任务」下面 ──────────────
    // 顺序约定（来自 DSH 自身）：Plugins 0 · 自动化任务 10 · 看板 20 · 技能 30
    // 我们排在 11，紧跟「自动化任务」之后。
    const PANEL_ID = "jingmeng";
    const PANEL_ORDER = 11;

    function JingmengIcon({ size }) {
      const px = Number.isFinite(size) ? size : 16;
      // 一条鲸的剪影：背部弧线 + 尾鳍 + 水花
      return h("svg", {
        "data-dsh-panel-entry": PANEL_ID,
        viewBox: "0 0 16 16", width: px, height: px, fill: "none",
        stroke: "currentColor", strokeWidth: "1.3",
        strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true",
      },
        h("path", { key: "body", d: "M1.8 8.6c1.1-2.4 3.4-3.9 6.1-3.9 2.3 0 4.3 1.1 5.6 2.9l1.4-1.2v4.3l-1.4-1.2c-1.3 1.8-3.3 2.9-5.6 2.9-2.7 0-5-1.5-6.1-3.8z" }),
        h("path", { key: "eye", d: "M5.1 8.1h.01" }),
        h("path", { key: "spout", d: "M6.9 4.7c0-1 .6-1.8 1.5-2.1" }),
      );
    }

    // 主面板：控制台 + 审批两个页签
    function JingmengPanel() {
      useStyleOnce();
      const [tab, setTab] = useState("console");
      const [pending, setPending] = useState(0);

      // 控制台点「去审批 →」时切过来（2026-10-21）
      useEffect(() => {
        const go = () => setTab("approval");
        window.addEventListener("dsh-jingmeng-approval", go);
        return () => window.removeEventListener("dsh-jingmeng-approval", go);
      }, []);

      // 侧栏图标上显示待审数量，一眼能看到"有事要做"
      useEffect(() => {
        let alive = true;
        const check = async () => {
          try {
            const r = await fetch(`${API}/approvals`, { headers: { accept: "application/json" } });
            if (!r.ok) return;
            const j = await r.json();
            if (alive && j.ok) setPending((j.items || []).filter((x) => x.status === "pending").length);
          } catch { /* 读不到就算了，不打扰 */ }
        };
        check();
        const timer = setInterval(check, 30000);
        return () => { alive = false; clearInterval(timer); };
      }, []);

      return h("div", { className: "jm-page" },
        h("div", { className: "jm-page-tabs" },
          h("button", {
            className: `jm-page-tab${tab === "console" ? " on" : ""}`,
            onClick: () => setTab("console"),
          }, "控制台"),
          h("button", {
            className: `jm-page-tab${tab === "approval" ? " on" : ""}`,
            onClick: () => setTab("approval"),
          }, "审批",
          pending > 0 ? h("span", { className: "jm-badge-dot" }, pending) : null)),
        h("div", { className: "jm-page-body" },
          tab === "console" ? h(StatusPanel, { onClose: null }) : h(ApprovalView, null)));
    }

    function BiliWhaleSection() {
      useStyleOnce();
      const [cfg, setCfg] = useState(null);
      const [savedJson, setSavedJson] = useState("");   // 2026-10-19：用来判断"有没有未保存的改动" ✓
      const [out, setOut] = useState("");
      const [err, setErr] = useState("");
      const [busy, setBusy] = useState("");
      const [ck, setCk] = useState({ sessdata: "", bili_jct: "", buvid3: "" });
      const [ckMsg, setCkMsg] = useState("");
      // 2026-10-20：界面上半部是「她正在做什么」，下半部是设置 —— 两个视图切换
      const [view, setView] = useState("status");   // status | config

      const load = useCallback(async () => {
        setErr("");
        try {
          const r = await fetch(`${API}/settings`, { headers: { accept: "application/json" } });
          if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 403 ? "（被信任栅栏拒绝）" : ""}`);
          const j = await r.json();
          setCfg(j.config ?? {});
          setSavedJson(JSON.stringify(j.config ?? {}));
        } catch (e) { setErr(`读取配置失败：${e.message}`); }
      }, []);

      useEffect(() => { load(); }, [load]);

      const set = (path, value) => setCfg((c) => {
        const next = JSON.parse(JSON.stringify(c ?? {}));
        setPath(next, path, value);
        return next;
      });

      const save = async () => {
        setBusy("save"); setErr(""); setOut("");
        try {
          const wins = cfg?.night?.windows ?? [];
          const total = Math.max(1, wins.reduce((s, w) => s + (Number(w.wakes) || 1), 0));
          const body = { ...(cfg ?? {}), night: { ...(cfg?.night ?? {}), maxWakesPerDay: total } };
          const r = await fetch(`${API}/settings`, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            // 2026-10-18：宿主现在两种都收 ✓，这里显式包一层最稳（以前发裸对象 → 宿主 merge 到 {}
            body: JSON.stringify({ config: body }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
          setOut(`✓ 已保存${j.warn ? `\n⚠️ ${j.warn}` : ""}\n配置：${j.configPath ?? "~/.dsh/bili-whale.config.json"}`);
          if (j.config) { setCfg(j.config); setSavedJson(JSON.stringify(j.config)); }
        } catch (e) { setErr(`保存失败：${e.message}`); } finally { setBusy(""); }
      };

      const deps = async () => {
        setBusy("deps"); setErr(""); setOut("检查中…");
        try {
          const r = await fetch(`${API}/deps`, { headers: { accept: "application/json" } });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
          const lines = (j.items ?? []).map((i) => `${i.ok ? "✓" : "✗"} ${i.name} — ${i.detail ?? ""}`);
          // 2026-10-19：体检后顺手重读配置 ✓ 不然「她自己 mid/昵称」那两格永远显示旧值 ✗
          if (j.self) lines.push("", `她自己：${j.self.name}（mid ${j.self.mid}）✓`);
          await load();
          setOut([...lines, "", j.ok ? "全部可用 ✓" : "有项不可用 ✗"].join("\n"));
        } catch (e) { setErr(`依赖体检失败：${e.message}`); } finally { setBusy(""); }
      };

      const saveCookie = async () => {
        setBusy("cookie"); setErr(""); setCkMsg("");
        try {
          const r = await fetch(`${API}/cookie`, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(ck),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
          setCkMsg(`✓ ${j.detail ?? "已写入"}`);   // 永不回显 cookie ✓
          setCk({ sessdata: "", bili_jct: "", buvid3: "" });
        } catch (e) { setCkMsg(`✗ ${e.message}`); } finally { setBusy(""); }
      };

      // 2026-10-20：新控制台自带侧栏导航，不需要顶部页签
      const navBar = h("div", { className: "blw-nav" },
        h("div", { className: "blw-nav-brand" },
          h("span", { className: "blw-nav-dot" }),
          h("span", { className: "blw-nav-name" }, "鲸檬")),
        h("div", { className: "blw-nav-tabs" },
          [["status", "控制台"], ["config", "设置"]].map(([k, label]) => h("button", {
            key: k,
            className: `blw-navtab${view === k ? " on" : ""}`,
            onClick: () => setView(k),
          }, label))));

      if (!cfg) {
        return h("div", { className: "blw blw-wide" },
          navBar,
          err ? h("div", { className: "blw-err" }, err) : h("div", { className: "blw-hint" }, "读取中…"));
      }

      // 状态视图：整块交给 StatusPanel
      if (view === "status") {
        return h("div", { className: "blw blw-wide" },
          navBar,
          h(StatusPanel, { onClose: () => setView("config") }));
      }

      const groups = [];
      for (const f of FIELDS) {
        let g = groups.find((x) => x.name === f.group);
        if (!g) { g = { name: f.group, fields: [] }; groups.push(g); }
        g.fields.push(f);
      }
      // 渲染顺序（2026-10-18 主人定）：… → 口味 → 【分享评论 + 全天监听】→ 日记与推送 → …
      const renderGroup = (g) => h("div", { key: g.name },
        h("div", { className: "blw-group" }, g.name),
        g.name === "作息" ? h(WindowsEditor, { cfg, set }) : null,
        h("div", { className: "blw-rows" }, g.fields.map((f) => h(Row, { key: f.path.join("."), f, cfg, set }))));
      const cut = Math.max(0, groups.findIndex((g) => g.name === "口味") + 1) || groups.length;
      const groupsTop = groups.slice(0, cut);
      const groupsBottom = groups.slice(cut);
      const ci = { className: "blw-input" };

      return h("div", { className: "blw" },
        navBar,
        h("p", { className: "blw-intro" },
          "改动写进 ", h("code", null, "~/.dsh/bili-whale.config.json"),
          "（与工具链共用同一份；这里没显示的字段保存时原样保留）。"),

        ...groupsTop.map(renderGroup),

        h(ShareEditor, { cfg, set }),
        h(ListenEditor, { cfg, set }),

        ...groupsBottom.filter((g) => g.name !== "工具链").map(renderGroup),
        h(NotifyEditor, { cfg, set, save }),
        ...groupsBottom.filter((g) => g.name === "工具链").map(renderGroup),

        h("div", { className: "blw-group" }, "B 站 cookie"),
        h("div", { className: "blw-rows" },
          h("div", { className: "blw-row" },
            h("div", null,
              h("div", { className: "blw-label" }, "凭据"),
              h("div", { className: "blw-hint" }, "浏览器 F12 → Cookie 里复制（SESSDATA 是 HttpOnly，console 拿不到 ✗）；写入后永不回显 ✓")),
            h("div", { className: "blw-cookie" },
              h("input", { ...ci, placeholder: "SESSDATA", value: ck.sessdata, onChange: (e) => setCk((s) => ({ ...s, sessdata: e.target.value })) }),
              h("input", { ...ci, placeholder: "bili_jct", value: ck.bili_jct, onChange: (e) => setCk((s) => ({ ...s, bili_jct: e.target.value })) }),
              h("input", { ...ci, placeholder: "buvid3（可空）", value: ck.buvid3, onChange: (e) => setCk((s) => ({ ...s, buvid3: e.target.value })) }),
              h("button", { className: "blw-btn blw-btn2", onClick: saveCookie, disabled: !!busy || !ck.sessdata || !ck.bili_jct },
                busy === "cookie" ? "写入中…" : "写入凭据"),
              ckMsg ? h("div", { className: ckMsg.startsWith("✓") ? "blw-hint" : "blw-err" }, ckMsg) : null))),

        h("div", { className: "blw-actions" },
          h("button", { className: "blw-btn", onClick: save, disabled: !!busy }, busy === "save" ? "保存中…" : "保存"),
          cfg && savedJson && JSON.stringify(cfg) !== savedJson
            ? h("span", { style: { marginLeft: "10px", color: "#ffb020", fontSize: "13px" } }, "● 有改动还没保存（改了不点保存 = 没生效 ✗）")
            : null,
          h("button", { className: "blw-btn blw-btn2", onClick: deps, disabled: !!busy }, busy === "deps" ? "体检中…" : "依赖体检"),
          h("button", { className: "blw-btn blw-btn2", onClick: load, disabled: !!busy }, "重新读取")),

        err ? h("div", { className: "blw-err" }, err) : null,
        out ? h("div", { className: "blw-out" }, out) : null,
        h("div", { className: "blw-hint" }, "装完先点「依赖体检」：cookie / ffmpeg / node / 数据目录 都 ✓ 才算可用。"));
    }

    const inject = ["slots"];
    const NS = "bili-whale";
    const NAMES = { nav: "养鱼" };

    function apply(ctx) {
      // ① 设置页里的「养鱼」（保留 —— 配置项还在这儿）
      ctx.effect(
        () =>
          ctx.slots.inject("settings.section", () =>
            ctx.slots.register(
              { name: "settings.section", id: NS, order: 6, label: () => NAMES.nav },
              BiliWhaleSection,
            ),
            "bili-whale: settings section",
          ),
        "bili-whale: settings section",
      );

      // ② 侧栏入口（2026-10-20）：挂在「自动化任务」下面
      ctx.effect(
        () =>
          ctx.slots.inject("sidebar.panellist", () =>
            ctx.slots.register(
              { name: "sidebar.panellist", id: PANEL_ID, order: PANEL_ORDER, label: () => "养鱼" },
              JingmengIcon,
            ),
            "jingmeng: sidebar entry",
          ),
        "jingmeng: sidebar entry",
      );

      // ③ 侧栏点开后的主面板（与控制台同一个 id，DSH 靠这个配对）
      ctx.effect(
        () =>
          ctx.slots.inject("main", () =>
            ctx.slots.register(
              { name: "main", key: PANEL_ID },
              JingmengPanel,
            ),
            "jingmeng: main panel",
          ),
        "jingmeng: main panel",
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.BiliWhaleSection = BiliWhaleSection;
    exports.FIELDS = FIELDS;
    return module.exports;
  },
});
