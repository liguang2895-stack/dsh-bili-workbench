/**
 * dsh-bili-workbench —— 浏览器半端
 * ============================================================================
 * 界面以 workbench-mockup/index.html 为准：
 *   · 左侧 196px 竖排导航（可折叠）+ 右侧内容区，每页自己的标题/副标题
 *   · 登录/二维码只在「我的」
 *   · 五个模块：素材库 / 刷B站 / 创作·出片 / 审核·发布 / 我的
 *
 * 数据全部走宿主 /api/bili-wb/*；没有假数据。
 * ============================================================================
 */
window.__ModuleLoader__.load({
  id: 'dsh-bili-workbench',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef } = React

    const API = '/api/bili-wb'
    const jget = async (p) => {
      try {
        const r = await fetch(API + p, { headers: { accept: 'application/json' } })
        return r.ok ? await r.json() : { ok: false, error: 'HTTP ' + r.status }
      } catch (e) { return { ok: false, error: String(e?.message ?? e) } }
    }
    const jpost = async (p, body) => {
      try {
        const r = await fetch(API + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
        return r.ok ? await r.json() : { ok: false, error: 'HTTP ' + r.status }
      } catch (e) { return { ok: false, error: String(e?.message ?? e) } }
    }

    /* ── 小工具 ── */
    const fmtNum = (n) => {
      const v = Number(n)
      if (!Number.isFinite(v)) return '-'
      if (v >= 1e8) return (v / 1e8).toFixed(1) + '亿'
      if (v >= 1e4) return (v / 1e4).toFixed(1) + '万'
      return String(v)
    }
    const fmtDur = (d) => {
      if (typeof d === 'string' && /:/.test(d)) return d
      const s = Number(d)
      if (!Number.isFinite(s) || s <= 0) return ''
      return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
    }
    const mmss = (t) => {
      const s = Math.max(0, Math.round(Number(t) || 0))
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    }
    const dayOf = (iso) => {
      try { return new Date(iso).toLocaleDateString('sv-SE') } catch { return String(iso || '').slice(0, 10) }
    }
    const errText = (r) => (r && (r.error?.message || r.error?.hint || (typeof r.error === 'string' ? r.error : '') || r.hint || r.text)) || ''
    const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)
    const baseName = (p) => String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || ''

    const STAGES = {
      draft: ['草稿', ''],
      rendering: ['渲染中', 'ok'],
      rendered: ['已完成 · 待审', 'ok'],
      approved: ['已通过', 'worth'],
      rejected: ['已打回', 'skip'],
      published: ['已发布', 'worth'],
      failed: ['失败', 'skip'],
      scripted: ['已排期', ''],
    }
    const stageOf = (s) => STAGES[s] || [s || '未知', '']
    const VOICES = {
      'zh-CN-YunxiNeural': '云希（男·青年）',
      'zh-CN-XiaoxiaoNeural': '晓晓（女·通用）',
      'zh-CN-XiaoyiNeural': '晓伊（女·年轻）',
      'zh-CN-YunxiaNeural': '云夏（少年）',
    }
    const voiceLabel = (v) => VOICES[v] || v || ''

    function useApi(path, { auto = true } = {}) {
      const [st, setSt] = useState({ loading: Boolean(auto), data: null, err: '' })
      const [tick, setTick] = useState(0)
      const pathRef = useRef(path)
      pathRef.current = path
      useEffect(() => {
        if (!path || !auto) return
        let live = true
        setSt((s) => ({ ...s, loading: true, err: '' }))
        jget(path).then((r) => {
          if (!live) return
          if (r && r.ok !== false) setSt({ loading: false, data: r, err: '' })
          else setSt({ loading: false, data: r, err: errText(r) || '取数失败' })
        })
        return () => { live = false }
      }, [path, tick, auto])
      return { ...st, reload: () => setTick((n) => n + 1) }
    }

    function usePoll(reload, ms, enabled) {
      const ref = useRef(reload)
      ref.current = reload
      useEffect(() => {
        if (!enabled) return
        const t = setInterval(() => ref.current(), ms)
        return () => clearInterval(t)
      }, [ms, enabled])
    }

    const copyText = async (text) => {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        try {
          const ta = document.createElement('textarea')
          ta.value = text
          ta.style.position = 'fixed'
          ta.style.opacity = '0'
          document.body.appendChild(ta)
          ta.select()
          const ok = document.execCommand('copy')
          document.body.removeChild(ta)
          return ok
        } catch { return false }
      }
    }

    const CSS = `
/* dsh-bili-workbench — 工作台样式（ui-refresh 分支）
   ============================================================================
   方向：Achromatic ledger（tasteskill v2, seed 1899652340）

   唯一的「强调」是明度，不是色相：
     · 主操作近黑 (#17191d)，整个界面只有这一个深色填充
     · 选中态是中性灰药丸，没有彩色导航、没有左侧竖条
     · 颜色只给状态（值得看 / 跳过）和错误，且只落在数据上

   脸（face）：冷灰地面 #f6f7f8 —— 素材是缩略图墙，冷灰让 16:9 封面自己跳出来。
   签名元素：胶片条 —— 关键帧横排 + 时间码，读作「这条视频哪几秒能被引用」。

   为什么保留 data-wb-* 选择器：这些属性和 client.js 的 JSX 绑在一起，
   改名等于重写整个视图层。这里只换外壳的视觉语言，不动任何一行 JS，
   因此所有交互、接口、状态都原样保留。

   主题：吃 DSH 的 --dsw-alias-* 六个变量，切换暗色自动跟随；
   其余明度阶梯在本文件内自持（暗色在 [data-theme] 下另给一套）。
   ========================================================================== */

[data-wb-root]{
  /* 地面 / 卡片 / 内嵌 / 悬停 / 选中 —— 五级明度，靠层次分区，不靠阴影和线条 */
  --g0:var(--dsw-alias-bg-base,#f6f7f8);
  --g1:var(--dsw-alias-bg-layer-1,#fff);
  --g2:color-mix(in srgb,var(--dsw-alias-label-primary,#14161a) 2.5%,var(--g1));
  --g3:color-mix(in srgb,var(--dsw-alias-label-primary,#14161a) 5%,var(--g1));
  --g4:color-mix(in srgb,var(--dsw-alias-label-primary,#14161a) 8%,var(--g1));

  --edge:color-mix(in srgb,var(--dsw-alias-label-primary,#14161a) 10%,transparent);
  --rule:color-mix(in srgb,var(--dsw-alias-label-primary,#14161a) 6%,transparent);
  --ctl:color-mix(in srgb,var(--dsw-alias-label-primary,#14161a) 18%,transparent);

  --ink:var(--dsw-alias-label-primary,#14161a);
  --muted:var(--dsw-alias-label-secondary,#5c6169);
  --faint:var(--dsw-alias-label-tertiary,#6b7078);
  --primary:var(--dsw-alias-label-primary,#17191d);
  --on-primary:var(--dsw-alias-bg-base,#fff);

  /* 状态：只在数据上出现 */
  --pos:#247b50; --pos-bg:#e8f3ec; --pos-ink:#143b28;
  --neg:#c4242a; --neg-bg:#fbeceb; --neg-ink:#6e1418;
  --warn:#8a5a00; --warn-bg:#fbf3e2; --warn-ink:#5c3c00;

  --r-card:8px; --r-ctl:6px; --r-chip:4px;
  --rail:232px;

  font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif;
  font-size:14px; line-height:1.5;
  color:var(--ink);
  background:var(--g0);
}
[data-wb-root] *{box-sizing:border-box}
/* 等宽数字：凡是会变、要比较的 */
[data-wb-root] time,[data-wb-root] .num{font-variant-numeric:tabular-nums}

/* 暗色：真中性黑，不做蓝调 */
[data-theme="dark"] [data-wb-root],
[data-wb-root][data-theme="dark"]{
  --g0:#0d0e10; --g1:#15171a;
  --g2:#1b1e21; --g3:#23262a; --g4:#2c3035;
  --edge:#2a2d32; --rule:#212429; --ctl:#3d4248;
  --ink:#f2f3f5; --muted:#a6acb4; --faint:#8d939b;
  --primary:#f2f3f5; --on-primary:#101215;
  --pos:#4fbb85; --pos-bg:#14261b; --pos-ink:#4fbb85;
  --neg:#e5727a; --neg-bg:#2a181a; --neg-ink:#e5727a;
  --warn:#d0a855; --warn-bg:#261f10; --warn-ink:#d0a855;
}

/* ══════════════ 外壳：左栏 + 画布 ══════════════ */
[data-wb-root]{
  display:flex;
  height:calc(100vh - 76px); max-height:calc(100vh - 76px);
  min-height:520px;
  position:relative; overflow:hidden;
  background:var(--g0);
}

[data-wb-rail]{
  width:var(--rail); flex:none;
  display:flex; flex-direction:column;
  padding:20px 12px 12px; gap:2px;
  border-right:1px solid var(--rule);
  background:var(--g0);
}

/* 产品名 + 作用域：屏幕必须能报出自己的名字 */
[data-wb-brand]{
  padding:0 10px 20px;
  font-size:14px; font-weight:600;
  letter-spacing:-.01em;
  white-space:nowrap; overflow:hidden;
  line-height:1.3;
}
[data-wb-brand] small{
  display:block;
  font-size:11px; font-weight:400;
  color:var(--faint);
  margin-top:2px; letter-spacing:0;
}

/* 导航：中性灰药丸。无彩色、无左侧竖条。 */
[data-wb-nav]{
  display:flex; align-items:center; gap:9px;
  width:100%; height:32px; padding:0 10px;
  margin:0; border:0; border-radius:var(--r-ctl);
  background:transparent; color:var(--muted);
  font:inherit; font-size:13.5px; text-align:left;
  cursor:pointer; position:relative; white-space:nowrap;
}
[data-wb-nav]:hover{background:var(--g3); color:var(--ink)}
[data-wb-nav][aria-selected="true"]{
  background:var(--g4); color:var(--ink); font-weight:500;
}
/* 取消原设计的蓝色左侧条 */
[data-wb-nav][aria-selected="true"]::before{display:none}
[data-wb-nav] .ico{
  width:16px; height:16px; flex:none;
  display:inline-flex; align-items:center; justify-content:center;
  font-size:14px; opacity:.7;
}
[data-wb-nav][aria-selected="true"] .ico{opacity:1}

/* 计数：只出现在需要处理的队列上 */
[data-wb-nav] .badge{
  margin-left:auto;
  font-size:11px; color:var(--muted);
  background:transparent; padding:0;
  font-variant-numeric:tabular-nums;
}
[data-wb-nav][aria-selected="true"] .badge{color:var(--ink)}

[data-wb-rail-foot]{margin-top:auto; padding-top:12px}
[data-wb-ghost]{
  width:100%; height:30px; padding:0 10px;
  border-radius:var(--r-ctl); border:1px solid transparent;
  background:transparent; color:var(--muted);
  font:inherit; font-size:13px; text-align:left; cursor:pointer;
}
[data-wb-ghost]:hover{background:var(--g3); color:var(--ink)}

/* 折叠：只留图标 */
[data-wb-root][data-collapsed] [data-wb-rail]{width:56px; padding-left:10px; padding-right:10px}
[data-wb-root][data-collapsed] [data-wb-label],
[data-wb-root][data-collapsed] [data-wb-brand] small,
[data-wb-root][data-collapsed] [data-wb-nav] .badge{display:none}
[data-wb-root][data-collapsed] [data-wb-brand]{
  font-size:0; padding:0 0 20px;
}
[data-wb-root][data-collapsed] [data-wb-brand]::after{
  content:"WB"; font-size:12px; font-weight:700; letter-spacing:-.02em;
}
[data-wb-root][data-collapsed] [data-wb-nav]{justify-content:center; padding:0}

/* ══════════════ 画布 ══════════════ */
[data-wb-main]{
  flex:1; min-width:0;
  padding:24px; overflow:auto;
}
[data-wb-page]{max-width:1204px}

/* 标题行：名词，不是问候语 */
[data-wb-head]{
  display:flex; align-items:flex-end; gap:12px;
  margin-bottom:4px; flex-wrap:wrap;
}
[data-wb-title]{
  margin:0;
  font-size:24px; font-weight:600;
  letter-spacing:-.02em; line-height:1.2;
}
/* 标题下那句：这一屏的发现，不是界面说明 */
[data-wb-sub]{
  font-size:13px; color:var(--muted);
  margin-top:5px; max-width:64ch; line-height:1.55;
}
[data-wb-grow]{flex:1}

/* ══════════════ 控件 ══════════════ */
[data-wb-btn]{
  height:32px; padding:0 12px;
  border-radius:var(--r-ctl);
  border:1px solid var(--ctl);
  background:var(--g1); color:var(--ink);
  font:inherit; font-size:13px;
  cursor:pointer; white-space:nowrap;
  display:inline-flex; align-items:center; gap:6px;
}
[data-wb-btn]:hover{background:var(--g3)}
[data-wb-btn]:active{background:var(--g4)}
[data-wb-btn]:focus-visible{outline:2px solid var(--ink); outline-offset:1px}
[data-wb-btn][disabled]{color:var(--faint); border-color:var(--edge); background:var(--g2); cursor:not-allowed}
/* 主操作：近黑。整个应用只有这一个填充色。 */
[data-wb-btn][data-primary]{
  background:var(--primary); border-color:var(--primary);
  color:var(--on-primary); font-weight:500;
}
[data-wb-btn][data-primary]:hover{opacity:.88}
[data-wb-btn][data-primary][disabled]{opacity:.4; color:var(--on-primary)}
[data-wb-btn][data-sm]{height:26px; padding:0 9px; font-size:12px}

[data-wb-chip]{
  display:inline-flex; align-items:center; gap:5px;
  height:24px; padding:0 9px;
  border-radius:var(--r-chip);
  border:1px solid transparent;
  background:var(--g3); color:var(--muted);
  font-size:12px; white-space:nowrap; flex:none;
}
[data-wb-chip][data-sel]{background:var(--g4); color:var(--ink); font-weight:500}
[data-wb-chip][data-ok]{background:var(--pos-bg); color:var(--pos-ink)}
[data-wb-chip][data-warn]{background:var(--warn-bg); color:var(--warn-ink)}

/* 判定档位 */
[data-wb-tier]{
  display:inline-flex; align-items:center;
  height:22px; padding:0 8px;
  border-radius:var(--r-chip);
  font-size:11.5px; font-weight:500;
  background:var(--g3); color:var(--muted);
  white-space:nowrap; flex:none;
}
[data-wb-tier="值得看"],[data-wb-tier][data-tone="worth"],[data-wb-badge][data-tone="worth"]{
  background:var(--pos-bg); color:var(--pos-ink);
}
[data-wb-tier="可以看"],[data-wb-tier][data-tone="ok"],[data-wb-badge][data-tone="ok"]{
  background:var(--g3); color:var(--muted);
}
[data-wb-tier="跳过"],[data-wb-tier][data-tone="skip"],[data-wb-badge][data-tone="skip"]{
  background:var(--g2); color:var(--faint);
}
[data-wb-badge]{
  display:inline-flex; align-items:center;
  height:22px; padding:0 8px;
  border-radius:var(--r-chip);
  font-size:11.5px; font-weight:500;
  background:var(--g3); color:var(--muted);
  white-space:nowrap; flex:none;
}

/* 输入 */
[data-wb-input]{
  height:32px; padding:0 10px;
  border-radius:var(--r-ctl);
  border:1px solid var(--ctl);
  background:var(--g1); color:var(--ink);
  font:inherit; font-size:13px;
  width:100%;
}
[data-wb-input]:focus{outline:0; border-color:var(--ink); box-shadow:0 0 0 2px var(--g3)}
[data-wb-input][data-area]{height:auto; padding:8px 10px; line-height:1.55; resize:vertical}
[data-wb-input][data-num]{width:auto; min-width:72px}

[data-wb-search]{
  height:32px; padding:0 12px;
  border-radius:var(--r-ctl);
  border:1px solid var(--ctl);
  background:var(--g1); color:var(--ink);
  font:inherit; font-size:13px; width:100%;
}
[data-wb-search]:focus{outline:0; border-color:var(--ink); box-shadow:0 0 0 2px var(--g3)}
[data-wb-searchwrap]{position:relative; display:flex; align-items:center; width:100%; max-width:420px}
[data-wb-searchwrap] .kbd{
  position:absolute; right:8px;
  font-size:11px; color:var(--faint);
  border:1px solid var(--edge); border-radius:3px;
  padding:1px 4px; pointer-events:none;
}

[data-wb-toggle]{display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-size:13px}
[data-wb-toggle] input{width:16px; height:16px; accent-color:var(--ink); flex:none; margin:0}

/* ══════════════ 面板与网格 ══════════════ */
[data-wb-sec]{
  display:flex; flex-direction:column; gap:12px;
  padding:16px;
  border:1px solid var(--edge); border-radius:var(--r-card);
  background:var(--g1);
}
[data-wb-h]{
  font-size:16px; font-weight:600;
  letter-spacing:-.01em; line-height:1.35;
}
[data-wb-col]{display:flex; flex-direction:column; gap:12px; min-width:0}

[data-wb-grid]{
  display:grid; gap:12px;
  grid-template-columns:repeat(auto-fill,minmax(244px,1fr));
}
[data-wb-card]{
  display:flex; flex-direction:column; overflow:hidden; min-width:0;
  border-radius:var(--r-card);
  border:1px solid var(--edge);
  background:var(--g1);
}
[data-wb-card]:hover{border-color:var(--ctl)}
[data-wb-cover]{
  position:relative; aspect-ratio:16/9; overflow:hidden;
  background:var(--g3);
  display:flex; align-items:center; justify-content:center;
  color:var(--faint); font-size:11px; font-family:ui-monospace,Consolas,monospace;
}
[data-wb-cover] img{width:100%; height:100%; object-fit:cover; display:block}
[data-wb-cover] [data-wb-tier]{position:absolute; top:7px; left:7px}
[data-wb-cover] [data-wb-dur]{
  position:absolute; right:5px; bottom:5px;
  padding:1px 5px; border-radius:3px;
  background:rgba(0,0,0,.72); color:#fff;
  font-size:11px; font-variant-numeric:tabular-nums;
}
[data-wb-body]{padding:11px 13px 13px; display:flex; flex-direction:column; gap:6px; flex:1; min-width:0}
[data-wb-cardtitle]{
  font-size:13.5px; font-weight:500; line-height:1.45;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
}

/* ══════════════ 素材行：一行只回答「这条要不要用」 ══════════════ */
[data-wb-mat]{
  display:grid; grid-template-columns:168px 1fr;
  gap:16px; padding:16px 0;
  border-bottom:1px solid var(--rule);
}
[data-wb-mat]:last-child{border-bottom:0}
[data-wb-mat] [data-wb-thumb]{
  position:relative; aspect-ratio:16/9;
  border-radius:6px; overflow:hidden;
  background:var(--g3);
}
[data-wb-mat] [data-wb-thumb] img{width:100%; height:100%; object-fit:cover; display:block}
[data-wb-mat] [data-wb-thumb] [data-wb-dur]{
  position:absolute; right:5px; bottom:5px;
  padding:1px 5px; border-radius:3px;
  background:rgba(0,0,0,.72); color:#fff;
  font-size:11px; font-variant-numeric:tabular-nums;
}
[data-wb-mat] .body{min-width:0}

/* 判定：整条的核心结论。靠字号和左侧细条立层级，不靠色块。 */
[data-wb-why]{
  font-size:13.5px; color:var(--muted);
  margin-top:7px; padding-left:10px;
  border-left:2px solid var(--g4);
  line-height:1.55; max-width:80ch;
}

[data-wb-quotes]{display:flex; flex-direction:column; gap:3px; margin-top:8px}
[data-wb-quote]{
  display:flex; gap:8px; align-items:baseline;
  font-size:13px; color:var(--muted); line-height:1.5;
}
[data-wb-quote] b{
  font-family:ui-monospace,Consolas,monospace;
  font-size:11.5px; font-weight:400; color:var(--faint); flex:none;
}

/* 已评论：紧贴标题，不飘到行尾 */
[data-wb-cmt]{
  display:inline-flex; align-items:center;
  height:22px; padding:0 8px; border-radius:var(--r-chip);
  background:var(--warn-bg); color:var(--warn-ink);
  font-size:11.5px; white-space:nowrap; flex:none;
}

/* 签名元素：胶片条 —— 关键帧紧贴成一条，时间码在帧下方 */
[data-wb-frames]{display:flex; gap:3px; margin-top:12px; overflow:hidden}
[data-wb-frames] img{
  width:112px; height:63px; flex:none;
  object-fit:cover; border-radius:4px;
  background:var(--g3); display:block;
}
[data-wb-frames] img:first-child{box-shadow:0 0 0 1.5px var(--ink)}

/* ══════════════ 文本层级 ══════════════ */
[data-wb-row]{display:flex; align-items:center; gap:8px; flex-wrap:wrap}
[data-wb-meta]{font-size:12.5px; color:var(--faint); line-height:1.55}
[data-wb-meta] b{font-weight:500; color:var(--muted)}
[data-wb-note]{font-size:12px; color:var(--faint); line-height:1.55}
[data-wb-field]{display:flex; flex-direction:column; gap:6px; margin-bottom:16px}
[data-wb-field]:last-child{margin-bottom:0}
[data-wb-field] > span{font-size:13px; font-weight:500}
[data-wb-projtitle]{font-size:15px; font-weight:600; letter-spacing:-.01em; line-height:1.4}
[data-wb-label]{font-size:12px; color:var(--faint)}

/* 分段控件 */
[data-wb-split]{display:grid; grid-template-columns:1fr 344px; gap:12px; align-items:start}
@media (max-width:1180px){[data-wb-split]{grid-template-columns:1fr}}

/* 统计 */
[data-wb-stat]{display:flex; flex-direction:column; gap:2px; padding:14px 16px; min-width:0}
[data-wb-stat] .v{font-size:28px; font-weight:400; letter-spacing:-.02em; line-height:1.25; font-variant-numeric:tabular-nums}
[data-wb-stat] .v .u{font-size:13px; color:var(--faint); margin-left:3px; letter-spacing:0}
[data-wb-stat] .k{font-size:12px; color:var(--muted)}

/* 进度 */
[data-wb-bar]{height:6px; border-radius:3px; background:var(--g3); overflow:hidden; position:relative}
[data-wb-bar] > i{display:block; height:100%; border-radius:3px; background:var(--ink); transition:width .3s ease}

[data-wb-pre]{
  margin:0; padding:10px;
  font-family:ui-monospace,Consolas,monospace;
  font-size:11.5px; line-height:1.6;
  color:var(--muted); background:var(--g2);
  border-radius:var(--r-ctl);
  overflow:auto; max-height:260px;
}

[data-wb-err]{
  font-size:12.5px; color:var(--neg-ink);
  background:var(--neg-bg);
  border-radius:var(--r-ctl);
  padding:8px 10px; line-height:1.55;
}
[data-wb-okmsg]{
  font-size:12.5px; color:var(--pos-ink);
  background:var(--pos-bg);
  border-radius:var(--r-ctl);
  padding:8px 10px;
}
[data-wb-loading]{
  padding:28px 16px; text-align:center;
  font-size:13px; color:var(--muted);
  border:1px dashed var(--edge);
  border-radius:var(--r-card);
  background:var(--g2);
}

/* 二维码 */
[data-wb-qr]{
  width:150px; height:150px; flex:none;
  border-radius:6px;
  background:var(--g1);
  border:1px solid var(--edge);
  overflow:hidden;
}
[data-wb-qr] img{width:100%; height:100%; display:block; object-fit:contain}
[data-wb-login]{
  display:flex; gap:18px; align-items:flex-start;
  padding:16px;
  border:1px solid var(--edge);
  border-radius:var(--r-card);
  background:var(--g1);
}

/* 视频浮层 */
[data-wb-overlay]{
  position:absolute; inset:0; z-index:20;
  display:flex; align-items:center; justify-content:center;
  background:rgba(8,9,11,.92);
  border-radius:var(--r-card);
}
[data-wb-overlay] video{max-width:92%; max-height:92%; border-radius:6px}
[data-wb-overlay] .x{
  position:absolute; top:14px; right:14px;
  width:32px; height:32px; border-radius:var(--r-ctl);
  border:1px solid rgba(255,255,255,.28);
  background:rgba(0,0,0,.5); color:#fff;
  font-size:15px; line-height:1; cursor:pointer;
}
[data-wb-overlay] .x:hover{background:rgba(255,255,255,.14)}

/* 减少动态 */
@media (prefers-reduced-motion:reduce){
  [data-wb-root] *{transition:none !important; animation:none !important}
}
`

    /* ── 小组件 ── */
    const Btn = ({ primary, sm, children, ...rest }) => h('button', {
      ...rest, 'data-wb-btn': '', 'data-primary': primary ? '' : undefined, 'data-sm': sm ? '' : undefined,
    }, children)
    const Chip = ({ sel, ok, warn, children, ...rest }) => h('span', { ...rest, 'data-wb-chip': '', 'data-sel': sel ? '' : undefined, 'data-ok': ok ? '' : undefined, 'data-warn': warn ? '' : undefined }, children)
    const Tier = ({ t }) => t ? h('span', { 'data-wb-tier': t }, t) : null
    const PageHead = ({ title, sub, children }) => h('div', { 'data-wb-head': '' },
      // h1 而不是 div：每屏必须有一个标题元素，读屏器和键盘导航靠它定位
      h('div', {}, h('h1', { 'data-wb-title': '' }, title), sub ? h('div', { 'data-wb-sub': '' }, sub) : null),
      h('div', { 'data-wb-grow': '' }),
      children)
    const Field = ({ label, children }) => h('div', { 'data-wb-field': '' }, h('span', {}, label), children)
    const Note = ({ children }) => h('div', { 'data-wb-note': '' }, children)
    const Sec = ({ title, children, style }) => h('div', { 'data-wb-sec': '', style },
      title ? h('div', { 'data-wb-h': '' }, title) : null, children)
    const Err = ({ children }) => children ? h('div', { 'data-wb-err': '' }, children) : null
    const OkMsg = ({ children }) => children ? h('div', { 'data-wb-okmsg': '' }, children) : null

    /* ═══════════════════ ① 素材库 ═══════════════════ */
    function StoreRow({ r, onDetail, onBasket, inBasket }) {
      const quotes = r.quotes || []
      const frames = r.frames || []
      return h('div', { 'data-wb-mat': '' },
        h('div', { 'data-wb-thumb': '' },
          h('img', { src: API + '/store/media?kind=cover&bv=' + r.bvid, alt: '', loading: 'lazy', onError: (e) => { e.target.style.display = 'none' } }),
          r.duration ? h('span', { 'data-wb-dur': '' }, fmtDur(r.duration)) : null),
        h('div', { className: 'body' },
          h('div', { 'data-wb-row': '' },
            h('div', { 'data-wb-cardtitle': '', style: { flex: '1 1 260px' } }, r.title || '(无标题)'),
            r.commented ? h('span', { 'data-wb-cmt': '' }, '已评论') : null),
          h('div', { 'data-wb-meta': '' },
            [r.up?.name, fmtDur(r.duration), `采集于 ${dayOf(r.fetchedAt)}`, `${quotes.length} 条可用片段`].filter(Boolean).join(' · ')),
          r.judge ? h('div', { 'data-wb-why': '' }, `💬 ${r.judge.why || '（没写理由）'}`)
            : h('div', { 'data-wb-note': '' }, '还没判定 —— 去「刷B站 → 设置」跑一轮'),
          quotes.length
            ? h('div', { 'data-wb-quotes': '' }, ...quotes.map((x, i) => h('div', { key: i, 'data-wb-quote': '' },
              h('b', {}, mmss(x.t)), x.text, x.kind ? h('span', { 'data-wb-meta': '', style: { marginLeft: '6px' } }, `· ${x.kind}`) : null)))
            : h('div', { 'data-wb-note': '' }, '（这条没有可用片段 —— 无字幕或无信息量）'),
          (r.memes || []).length ? h('div', { 'data-wb-meta': '' }, '热梗：' + r.memes.slice(0, 4).join(' · ')) : null,
          (r.hotComments || []).length ? h('div', { 'data-wb-note': '' }, '热评：' + r.hotComments.slice(0, 2).map((x) => x.text).join(' / ')) : null,
          (r.hotDanmaku || []).length ? h('div', { 'data-wb-note': '' }, '弹幕：' + r.hotDanmaku.slice(0, 4).map((x) => `${x.text}(${x.count})`).join(' · ')) : null,
          frames.length
            ? h('div', { 'data-wb-frames': '' }, ...frames.slice(0, 6).map((f, i) => h('img', {
              key: i,
              src: `${API}/store/media?kind=frame&bv=${r.bvid}&name=${encodeURIComponent(String(f.file || '').split('/').pop())}`,
              alt: '', loading: 'lazy', onError: (e) => { e.target.style.display = 'none' },
            })))
            : null,
          h('div', { 'data-wb-row': '' },
            h(Btn, { sm: true, onClick: () => onDetail(r.bvid) }, '逐字稿 / 详情'),
            h(Btn, { sm: true, onClick: () => onBasket(r.bvid) }, inBasket ? '已加入创作篮' : '加入创作篮'),
            h('div', { 'data-wb-grow': '' }),
            r.stat ? h('span', { 'data-wb-meta': '' }, `播放 ${fmtNum(r.stat.view)} · 点赞 ${fmtNum(r.stat.like)}`) : null)))
    }

    function TabStore({ basket, setBasket }) {
      const [q, setQ] = useState('')
      const [view, setView] = useState('list')
      const [open, setOpen] = useState('')
      const list = useApi('/store/list?limit=300')
      const detail = useApi(open ? '/store/item?bv=' + encodeURIComponent(open) : '', { auto: Boolean(open) })
      const rows = (list.data?.rows || []).filter((r) => {
        if (!q.trim()) return true
        const k = q.trim().toLowerCase()
        return [r.title, r.up?.name, r.judge?.why, ...(r.quotes || []).map((x) => x.text)]
          .some((s) => String(s || '').toLowerCase().includes(k))
      })
      const rec = detail.data?.record
      const sub = detail.data?.subtitles

      const toggleBasket = (bv) => setBasket(basket.includes(bv) ? basket.filter((x) => x !== bv) : [...basket, bv])

      return h('div', { 'data-wb-page': '' },
        h(PageHead, { title: '素材库', sub: '从视频里收集的素材：点评 + 时间点片段 + 关键帧' },
          h('input', { 'data-wb-search': '', style: { maxWidth: '260px' }, placeholder: '在库里搜标题 / 点评 / 金句…', value: q, onChange: (e) => setQ(e.target.value) }),
          h(Btn, { sm: true, onClick: list.reload }, '刷新'),
          h(Btn, { sm: true, onClick: () => setView(view === 'list' ? 'cards' : 'list') }, view === 'list' ? '卡片视图' : '列表视图')),
        h('div', { 'data-wb-row': '' },
          h(Chip, {}, `库内 ${list.data?.stats?.videos ?? rows.length} 条 · ${list.data?.stats?.mb ?? '-'} MB`),
          basket.length ? h(Chip, { ok: true }, `创作篮 ${basket.length}`) : null,
          h('div', { 'data-wb-grow': '' }),
          h(Note, {}, '素材库不显示档位标签 —— 档位只属于「刷B站」')),
        h(Err, {}, list.err),
        list.loading ? h('div', { 'data-wb-loading': '' }, '读素材库…') : null,
        !list.loading && !rows.length ? h(Note, {}, q ? '没搜到 —— 换个词试试' : '库还是空的 —— 去「刷B站」采几条，或点「看懂视频」') : null,

        view === 'list'
          ? h('div', { 'data-wb-col': '' }, ...rows.map((r) => h(StoreRow, {
            key: r.bvid, r, inBasket: basket.includes(r.bvid),
            onDetail: (bv) => setOpen(open === bv ? '' : bv),
            onBasket: toggleBasket,
          })))
          : h('div', { 'data-wb-grid': '' }, ...rows.map((r) => h('div', { key: r.bvid, 'data-wb-card': '' },
            h('div', { 'data-wb-cover': '' },
              h('img', { src: API + '/store/media?kind=cover&bv=' + r.bvid, alt: '', loading: 'lazy', onError: (e) => { e.target.style.display = 'none' } }),
              r.duration ? h('span', { 'data-wb-dur': '' }, fmtDur(r.duration)) : null),
            h('div', { 'data-wb-body': '' },
              h('div', { 'data-wb-row': '' },
                h('div', { 'data-wb-cardtitle': '', style: { flex: 1 } }, r.title || '(无标题)'),
                r.commented ? h('span', { 'data-wb-cmt': '' }, '已评论') : null),
              h('div', { 'data-wb-meta': '' }, [r.up?.name, `${(r.quotes || []).length} 条片段`].filter(Boolean).join(' · ')),
              (r.quotes || [])[0] ? h('div', { 'data-wb-note': '' }, `${mmss(r.quotes[0].t)}「${String(r.quotes[0].text).slice(0, 26)}」`) : null,
              h('div', { 'data-wb-row': '' },
                h(Btn, { sm: true, onClick: () => setOpen(r.bvid) }, '详情'),
                h(Btn, { sm: true, onClick: () => toggleBasket(r.bvid) }, basket.includes(r.bvid) ? '已加入' : '加入创作篮')))))),

        rec ? h(Sec, { title: '素材详情' },
          h('div', { 'data-wb-row': '' },
            h('div', { 'data-wb-cardtitle': '' }, rec.title),
            rec.judge ? h(Tier, { t: rec.judge.tier }) : null,
            rec.commented ? h('span', { 'data-wb-cmt': '' }, '已评论') : null,
            h('div', { 'data-wb-grow': '' }),
            h(Btn, { sm: true, onClick: () => setOpen('') }, '收起')),
          h('div', { 'data-wb-meta': '' }, [rec.up?.name, fmtDur(rec.duration), rec.zone, dayOf(rec.fetchedAt)].filter(Boolean).join(' · ')),
          rec.judge ? h('div', { 'data-wb-why': '' }, `判定：${rec.judge.tier} — ${rec.judge.why}`) : null,
          (rec.memes || []).length ? h('div', { 'data-wb-meta': '' }, '热梗：' + rec.memes.join(' · ')) : null,
          (rec.hotComments || []).length ? h('div', { 'data-wb-col': '' },
            h('div', { 'data-wb-h': '' }, '热评'),
            ...rec.hotComments.slice(0, 8).map((x, i) => h('div', { key: i, 'data-wb-note': '' }, `👍 ${x.like ?? 0} · ${x.user || ''}：${x.text}`))) : null,
          (rec.hotDanmaku || []).length ? h('div', { 'data-wb-meta': '' }, '热门弹幕：' + rec.hotDanmaku.slice(0, 10).map((x) => `${x.text}(${x.count})`).join(' · ')) : null,
          (rec.quotes || []).length ? h('div', { 'data-wb-col': '' },
            h('div', { 'data-wb-h': '' }, `可用片段 ${rec.quotes.length} 条`),
            h('div', { 'data-wb-quotes': '' }, ...rec.quotes.map((x, i) => h('div', { key: i, 'data-wb-quote': '' },
              h('b', {}, mmss(x.t)), x.text, x.kind ? h('span', { 'data-wb-meta': '', style: { marginLeft: '6px' } }, `· ${x.kind}`) : null)))) : null,
          sub?.items?.length ? h('div', { 'data-wb-col': '' },
            h('div', { 'data-wb-h': '' }, `逐字稿（共 ${sub.total} 句，显示前 ${sub.items.length}）`),
            h('pre', { 'data-wb-pre': '' }, sub.items.map((x) => `${mmss(x.from)} ${x.content}`).join('\n'))) : null) : null)
    }

    /* ═══════════════════ ② 刷B站 ═══════════════════ */
    /** 评论 / 回复 / 私信共用：先生成草稿，再看原文，再决定 dry-run 还是真发 */
    function InteractComposer({ kind, target, onClose, onSent }) {
      const [text, setText] = useState('')
      const [gen, setGen] = useState(true)
      const [busy, setBusy] = useState('')
      const [dump, setDump] = useState('')
      const [real, setReal] = useState(false)
      const label = kind === 'comment' ? '评论' : kind === 'reply' ? '回复' : '私信'

      const genText = async () => {
        setGen(true); setDump('')
        const r = await jpost('/interact/preview', { kind, ...(target.ctx || {}) })
        setGen(false)
        if (r.ok) {
          setText(r.text || '')
          if (r.cap) setDump('注意：' + r.cap)
        } else setDump('生成失败：' + (errText(r) || ''))
      }
      useEffect(() => { genText() }, [])
      const send = async () => {
        if (!text.trim()) return
        setBusy('send')
        const r = await jpost('/interact/send', { kind, text, confirm: true, dryRun: !real, ...(target.ids || {}) })
        setBusy('')
        if (r.ok) {
          setDump(`${r.dryRun ? 'dry-run（没有真的发）' : '已发送'}\n${(r.command || []).join(' ')}`)
          if (!r.dryRun) onSent?.()
        } else setDump('失败：' + (errText(r) || ''))
      }

      return h('div', { 'data-wb-composer': '' },
        h('div', { 'data-wb-row': '' },
          h('div', { 'data-wb-h': '' }, `${label} ${target.label || ''}`),
          h('div', { 'data-wb-grow': '' }),
          h(Btn, { sm: true, onClick: onClose }, '收起')),
        gen ? h('div', { 'data-wb-loading': '' }, `AI 正在写${label}…（一般 10–40 秒）`) : null,
        h('textarea', {
          'data-wb-input': '', 'data-area': '', value: text,
          onChange: (e) => setText(e.target.value), placeholder: gen ? '生成中…' : `${label}内容`,
        }),
        h('div', { 'data-wb-row': '' },
          h('label', { 'data-wb-toggle': '' },
            h('input', { type: 'checkbox', checked: real, onChange: (e) => setReal(e.target.checked) }),
            h('span', {}, '真的发（不勾=只 dry-run）')),
          h('div', { 'data-wb-grow': '' }),
          h(Btn, { sm: true, primary: true, disabled: gen || busy === 'send' || !text.trim(), onClick: send }, busy === 'send' ? '发送中…' : '发送'),
          h(Btn, { sm: true, disabled: gen || busy === 'p', onClick: async () => { setBusy('p'); await genText(); setBusy('') } }, '重新生成')),
        dump ? h('pre', { 'data-wb-pre': '' }, dump) : null)
    }

    function VideoCard({ it, tier, commented, onWatch, onComment }) {
      const bv = it.bvid
      const view = it.stat?.view ?? it.play
      const like = it.stat?.like ?? it.like
      const up = it.author?.name || it.up?.name || it.owner?.name || ''
      return h('div', { 'data-wb-card': '' },
        h('div', { 'data-wb-cover': '' },
          h('span', {}, bv),
          h('img', { src: `${API}/cover?bv=${bv}`, alt: '', loading: 'lazy', onError: (e) => { e.target.style.display = 'none' } }),
          tier ? h(Tier, { t: tier }) : null,
          it.duration ? h('span', { 'data-wb-dur': '' }, fmtDur(it.duration)) : null),
        h('div', { 'data-wb-body': '' },
          h('div', { 'data-wb-cardtitle': '' }, it.title || '(无标题)'),
          h('div', { 'data-wb-meta': '' }, [up, view ? `播放 ${fmtNum(view)}` : '', like ? `点赞 ${fmtNum(like)}` : ''].filter(Boolean).join(' · ')),
          h('div', { 'data-wb-row': '' },
            commented ? h('span', { 'data-wb-cmt': '' }, '已评论') : null,
            h('div', { 'data-wb-grow': '' }),
            h(Btn, { sm: true, onClick: () => onComment(it) }, '评论'),
            h(Btn, { sm: true, primary: true, onClick: () => onWatch(bv) }, '看懂视频'),
            h(Btn, { sm: true, onClick: () => window.open(it.url || ('https://www.bilibili.com/video/' + bv), '_blank') }, '打开'))))
    }

    function SubVideo({ storeMap, cfg, onCommented, onKeywordsChanged }) {
      const [q, setQ] = useState('')
      const [key, setKey] = useState('')
      const [detail, setDetail] = useState('')
      const [comment, setComment] = useState(null)
      const [editTags, setEditTags] = useState(false)
      const pressRef = useRef(null)
      const suppressRef = useRef(false)
      const hot = useApi(key ? '' : '/hot?size=24', { auto: !key })
      const search = useApi(key ? `/search?q=${encodeURIComponent(key)}&size=24` : '', { auto: Boolean(key) })
      const watch = useApi(detail ? '/video?bv=' + encodeURIComponent(detail) : '', { auto: Boolean(detail) })
      const items = key ? (search.data?.items || []) : (hot.data?.items || [])
      const loading = key ? search.loading : hot.loading
      const err = key ? search.err : hot.err
      const d = watch.data?.data

      const keywords = cfg?.keywords || []
      const cancelPress = () => {
        if (pressRef.current) { clearTimeout(pressRef.current); pressRef.current = null }
      }
      const startPress = () => {
        cancelPress()
        pressRef.current = setTimeout(() => { suppressRef.current = true; setEditTags(true) }, 550)
      }
      const saveKeywords = async (next) => {
        const r = await jpost('/config', { keywords: next })
        if (!r.ok) return false
        onKeywordsChanged?.()
        return true
      }
      const delKeyword = async (k) => {
        const next = keywords.filter((x) => x !== k)
        if (await saveKeywords(next) && key === k) { setKey(''); setQ('') }
      }
      const addKeyword = async () => {
        const v = String(prompt('加一个关注关键词：') || '').trim()
        if (!v) return
        if (!keywords.includes(v)) {
          if (!await saveKeywords([...keywords, v])) return
        }
        setQ(v); setKey(v)
      }
      const openComment = (it) => {
        const rec = storeMap[it.bvid] || {}
        setComment({
          label: it.title || it.bvid,
          ctx: { title: it.title || '', up: it.author?.name || it.up?.name || '', quotes: rec.quotes || [] },
          ids: { bv: it.bvid },
        })
      }
      return h('div', {
        'data-wb-col': '',
        onClick: (e) => {
          if (!editTags) return
          if (e.target?.closest?.('[data-wb-tag]')) return
          setEditTags(false)
        },
      },
        h('div', { 'data-wb-searchwrap': '' },
          h('input', {
            'data-wb-search': '', placeholder: '搜视频、UP、关键词…', value: q,
            onChange: (e) => setQ(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter') setKey(q.trim()) },
          }),
          h('span', { className: 'kbd' }, 'Enter')),
        h('div', { 'data-wb-row': '', style: { justifyContent: 'center', marginBottom: '6px' } },
          h('span', { 'data-wb-chip': '', 'data-sel': key ? undefined : '', style: { cursor: 'pointer' }, onClick: () => { if (editTags) return; setKey(''); setQ('') } }, '热门'),
          ...keywords.map((k) => h('span', {
            key: k, 'data-wb-chip': '', 'data-wb-tag': '',
            'data-sel': key === k ? '' : undefined,
            style: {
              cursor: 'pointer', position: 'relative',
              borderStyle: editTags ? 'dashed' : undefined,
              paddingRight: editTags ? '18px' : undefined,
            },
            onPointerDown: startPress,
            onPointerUp: cancelPress,
            onPointerLeave: cancelPress,
            onContextMenu: (e) => e.preventDefault(),
            onClick: () => {
              if (suppressRef.current) { suppressRef.current = false; return }
              if (editTags) return
              setKey(k); setQ(k)
            },
          }, k, editTags ? h('span', {
            'data-wb-tagdel': '',
            style: {
              position: 'absolute', top: '-7px', right: '-7px', width: '14px', height: '14px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%', background: 'var(--dsw-alias-label-primary, #0f1115)',
              color: 'var(--dsw-alias-bg-base, #fff)', fontSize: '11px', lineHeight: 1,
            },
            onPointerDown: (e) => e.stopPropagation(),
            onClick: (e) => { e.stopPropagation(); delKeyword(k) },
          }, '×') : null)),
          h('span', { 'data-wb-chip': '', style: { cursor: 'pointer' }, onClick: () => { if (!editTags) addKeyword() } }, '+ 关键词')),
        editTags ? h(Note, {}, '点标签右上角 × 删除 · 点空白处退出') : null,
        h('div', { 'data-wb-row': '' },
          h(Note, {}, key ? `搜索：${key}` : '综合热门'),
          h('div', { 'data-wb-grow': '' }),
          h(Btn, { sm: true, onClick: key ? search.reload : hot.reload }, '刷新')),
        comment ? h(InteractComposer, {
          key: comment.ids?.bv || 'comment',
          kind: 'comment', target: comment,
          onClose: () => setComment(null),
          onSent: () => { setComment(null); onCommented?.() },
        }) : null,
        h(Err, {}, err),
        loading ? h('div', { 'data-wb-loading': '' }, '读取中…') : null,
        d ? h(Sec, { title: '看懂视频' },
          h('div', { 'data-wb-row': '' },
            h('div', { 'data-wb-cardtitle': '' }, d.title || detail),
            h('div', { 'data-wb-grow': '' }),
            h(Btn, { sm: true, onClick: () => setDetail('') }, '收起')),
          h('div', { 'data-wb-meta': '' }, [d.owner?.name, d.stat ? `播放 ${fmtNum(d.stat.view)} · 点赞 ${fmtNum(d.stat.like)}` : '', fmtDur(d.duration)].filter(Boolean).join(' · ')),
          d.ai_summary ? h('div', { 'data-wb-why': '' }, d.ai_summary) : null,
          d.transcript?.text ? h('pre', { 'data-wb-pre': '' }, String(d.transcript.text).slice(0, 2500)) : h(Note, {}, '这条没有字幕；已落库，但创作时引用不到原句。')) : null,
        h('div', { 'data-wb-grid': '' }, ...items.map((it) => h(VideoCard, {
          key: it.bvid, it,
          tier: storeMap[it.bvid]?.tier || '',
          commented: Boolean(storeMap[it.bvid]?.commented),
          onWatch: setDetail,
          onComment: openComment,
        }))),
        !loading && !items.length ? h(Note, {}, key ? '没搜到，换个词' : '热门拉不到（看看 bili 是否登录）') : null)
    }

    function SubInbox({ onCommented }) {
      const inbox = useApi('/inbox')
      const [composer, setComposer] = useState(null)
      const items = inbox.data?.items || []
      const c = inbox.data?.counts || {}

      const replyTarget = (m) => ({
        kind: 'reply', label: m.user?.name || '',
        ctx: { message: m.content || '', replyingTo: m.replying_to || '', video: m.on?.title || '' },
        ids: { bv: m.on?.bvid, rpid: m.rpid, root: m.root },
      })
      const dmTarget = (m) => ({
        kind: 'dm', label: m.user?.name || '',
        ctx: { message: m.content || '', video: m.on?.title || '' },
        ids: { uid: String(m.user?.mid || '') },
      })

      return h('div', { 'data-wb-col': '' },
        h('div', { 'data-wb-row': '' },
          h(Chip, {}, `回复 ${c.replies ?? 0}`),
          h(Chip, {}, `@ ${c.mentions ?? 0}`),
          h(Chip, {}, `私信 ${c.private_messages ?? 0}`),
          h(Chip, {}, `赞 ${c.likes ?? 0}`),
          h('div', { 'data-wb-grow': '' }),
          h(Btn, { sm: true, onClick: inbox.reload }, '刷新')),
        h(Note, {}, '默认由 AI 写草稿；发出前一定先给你看原文，默认 dry-run。'),
        h(Err, {}, inbox.err),
        inbox.loading ? h('div', { 'data-wb-loading': '' }, '读取中…') : null,
        composer ? h(InteractComposer, {
          key: composer.kind + (composer.ids?.rpid || composer.ids?.uid || composer.label || ''),
          kind: composer.kind, target: composer,
          onClose: () => setComposer(null),
          onSent: () => { setComposer(null); inbox.reload(); onCommented?.() },
        }) : null,
        !inbox.loading && !items.length ? h(Note, {}, inbox.data?.note || '没有新回复。') : null,
        ...items.map((m, i) => h('div', { key: i, 'data-wb-sec': '' },
          h('div', { 'data-wb-row': '' },
            h(Chip, {}, '回复'),
            h('b', {}, m.user?.name || '?'),
            h('span', { 'data-wb-meta': '' }, [dayOf(m.time), m.on?.bvid].filter(Boolean).join(' · ')),
            h('div', { 'data-wb-grow': '' }),
            h(Btn, { sm: true, onClick: () => setComposer(replyTarget(m)) }, 'AI 写回复'),
            m.user?.mid ? h(Btn, { sm: true, onClick: () => setComposer(dmTarget(m)) }, '私信') : null),
          h('div', { 'data-wb-why': '' }, String(m.content || '')))))
    }

    function SubSettings({ onRunRound, onSaved }) {
      const cfgRes = useApi('/config')
      const cfg = cfgRes.data?.config
      const sched = cfgRes.data?.schedule || {}
      const [draft, setDraft] = useState(null)
      const [msg, setMsg] = useState('')
      const [busy, setBusy] = useState('')

      useEffect(() => {
        if (cfg && draft === null) {
          setDraft({
            ...cfg,
            keywordsText: (cfg.keywords || []).join('\n'),
            modelChainText: (cfg.modelChain || []).join('\n'),
            tagsText: (cfg.defaultTags || []).join(','),
          })
        }
      }, [cfg, draft])
      if (cfgRes.loading || !draft) return h('div', { 'data-wb-loading': '' }, '读设置中…')

      const set = (k, v) => setDraft({ ...draft, [k]: v })
      const save = async () => {
        setBusy('save'); setMsg('保存中…')
        const r = await jpost('/config', {
          enabled: draft.enabled, scheduleRanges: draft.scheduleRanges, perDay: draft.perDay,
          keywords: String(draft.keywordsText || '').split('\n').map((s) => s.trim()).filter(Boolean),
          llmKey: draft.llmKey,
          personaPrompt: draft.personaPrompt, reportLevel: draft.reportLevel, favFolderId: draft.favFolderId,
          autoComment: draft.autoComment, autoReply: draft.autoReply,
          mentionName: draft.mentionName, replyPerDay: draft.replyPerDay,
          dmWatch: draft.dmWatch, dmWatchMinutes: draft.dmWatchMinutes,
          voice: draft.voice, modelChain: String(draft.modelChainText || '').split('\n').map((s) => s.trim()).filter(Boolean),
        })
        setBusy('')
        if (r.ok) {
          setMsg('已保存')
          setDraft({ ...r.config, keywordsText: (r.config.keywords || []).join('\n'), modelChainText: (r.config.modelChain || []).join('\n'), tagsText: (r.config.defaultTags || []).join(',') })
          cfgRes.reload(); onSaved?.()
        } else setMsg('保存失败：' + (errText(r) || ''))
      }
      const run = async () => {
        setBusy('run'); setMsg('跑一轮中…（采集 + 判定 + 抽句 / 弹幕 / 热梗 / 热评 + 日报，可能一两分钟）')
        const r = await jpost('/run-round')
        setBusy('')
        setMsg(r.ok ? `跑完了（${r.seconds}s）· 库里 ${r.stats?.videos ?? '?'} 条` : '跑失败：' + (errText(r) || ''))
      }

      return h('div', { 'data-wb-col': '' },
        h('div', { 'data-wb-row': '' },
          h(Note, {}, sched.lastRunAt ? `上次：${new Date(sched.lastRunAt).toLocaleString('zh-CN')} · ${sched.lastResult || ''}` : '还没跑过'),
          h('div', { 'data-wb-grow': '' }),
          h(Btn, { primary: true, sm: true, disabled: busy === 'save', onClick: save }, busy === 'save' ? '保存中…' : '保存设置'),
          h(Btn, { sm: true, disabled: busy === 'run', onClick: run }, '立即跑一轮'),
          msg ? h('span', { 'data-wb-note': '' }, msg) : null),
        h('div', { 'data-wb-split': '' },
          h(Sec, { title: '日常 · 定时自动刷' },
            h('label', { 'data-wb-toggle': '' },
              h('input', { type: 'checkbox', checked: Boolean(draft.enabled), onChange: (e) => set('enabled', e.target.checked) }),
              h('span', {}, '定时自动刷（总开关）')),
            h(Field, { label: '时段' },
              h('input', { 'data-wb-input': '', style: { maxWidth: '240px' }, value: draft.scheduleRanges, onChange: (e) => set('scheduleRanges', e.target.value) }),
              h(Note, {}, '全天写 00:00-24:00；可多段，如 09:00-12:00, 20:00-23:30')),
            h(Field, { label: '每天上限' },
              h('input', { 'data-wb-input': '', 'data-num': '', type: 'number', min: 1, max: 500, value: draft.perDay, onChange: (e) => set('perDay', e.target.value) }),
              h('span', {}, '条')),
            h(Field, { label: '来源' },
              h('span', {}, '综合热门 + 关注关键词（按时间自动混合）')),
            h(Note, {}, `今天已采 ${sched.todayCount ?? '?'} / 目标 ${sched.target ?? '?'} 条 · ${sched.inWindow === false ? '不在时段内' : '在时段内'}${sched.estMinutes ? ` · 约每 ${sched.estMinutes} 分钟 1 条` : ''} · 每条约 10 帧由 AI 挑`)),

          h(Sec, { title: '偏好 · 它按什么说话' },
            h('div', { 'data-wb-col': '' },
              h('div', { 'data-wb-h': '' }, '关注关键词（一行一个；和视频页标签同步，采集时与热门混合）'),
              h('textarea', { 'data-wb-input': '', 'data-area': '', rows: 4, value: draft.keywordsText, onChange: (e) => set('keywordsText', e.target.value) })),
            h('div', { 'data-wb-col': '' },
              h('div', { 'data-wb-h': '' }, '人设（判定 / 方案 / 评论都用它）'),
              h('textarea', { 'data-wb-input': '', 'data-area': '', rows: 3, value: draft.personaPrompt || '', onChange: (e) => set('personaPrompt', e.target.value), placeholder: '例：叫我老弟，说话像贴吧老哥，犀利不客气，控制在 40 字内' })),
            h(Field, { label: '日报粒度' },
              h('select', { 'data-wb-input': '', style: { width: '120px' }, value: draft.reportLevel, onChange: (e) => set('reportLevel', e.target.value) },
                h('option', { value: 'full' }, '完整'),
                h('option', { value: 'brief' }, '薄版'),
                h('option', { value: 'off' }, '不写'))),
            h(Field, { label: '自动收藏到' },
              h('input', { 'data-wb-input': '', style: { maxWidth: '180px' }, value: draft.favFolderId || '', onChange: (e) => set('favFolderId', e.target.value), placeholder: '收藏夹 ID / 名称（留空不收藏）' }))),

          h(Sec, { title: '互动 · 自动评论与回复' },
            h('label', { 'data-wb-toggle': '' },
              h('input', { type: 'checkbox', checked: Boolean(draft.autoComment), onChange: (e) => set('autoComment', e.target.checked) }),
              h('span', {}, '自动评论并 @ 我（每条采到的视频都留一条）')),
            h(Field, { label: '@我' },
              h('input', { 'data-wb-input': '', style: { maxWidth: '180px' }, value: draft.mentionName || '', onChange: (e) => set('mentionName', e.target.value), placeholder: 'UID / 昵称，留空=自己' }),
              h('Note', {}, '只发在评论区，不私信')),
            h('div', { 'data-wb-row': '', style: { marginTop: '4px' } },
              h('label', { 'data-wb-toggle': '' },
                h('input', { type: 'checkbox', checked: Boolean(draft.autoReply), onChange: (e) => set('autoReply', e.target.checked) }),
                h('span', {}, '有人回复就自动回'))),
            h(Field, { label: '每天最多回复' },
              h('input', { 'data-wb-input': '', 'data-num': '', type: 'number', min: 0, max: 200, value: draft.replyPerDay, onChange: (e) => set('replyPerDay', e.target.value) }),
              h('span', {}, '条（0=不限）')),
            h('div', { 'data-wb-row': '' },
              h('label', { 'data-wb-toggle': '' },
                h('input', { type: 'checkbox', checked: Boolean(draft.dmWatch), onChange: (e) => set('dmWatch', e.target.checked) }),
                h('span', {}, '私信监听（默认关，每')),
              h('input', { 'data-wb-input': '', 'data-num': '', type: 'number', min: 3, max: 240, value: draft.dmWatchMinutes, onChange: (e) => set('dmWatchMinutes', e.target.value) }),
              h('span', {}, '分钟看一眼）'))),

          h(Sec, { title: '模型链（判定 / 方案 / 互动都用它）' },
            h('textarea', {
              'data-wb-input': '', 'data-area': '', rows: Math.max(4, (draft.modelChainText || '').split('\n').length),
              value: draft.modelChainText, onChange: (e) => set('modelChainText', e.target.value),
            }),
            h(Note, {}, '一行一个；失败自动换下一个，429 退避重试。'),
            h(Field, { label: '默认音色' },
              h('select', { 'data-wb-input': '', style: { width: '190px' }, value: draft.voice, onChange: (e) => set('voice', e.target.value) },
                h('option', { value: 'zh-CN-YunxiNeural' }, '云希（男·青年）'),
                h('option', { value: 'zh-CN-XiaoxiaoNeural' }, '晓晓（女·通用）'),
                h('option', { value: 'zh-CN-XiaoyiNeural' }, '晓伊（女·年轻）'),
                h('option', { value: 'zh-CN-YunxiaNeural' }, '云夏（少年）')))),
        ),
        h(Err, {}, cfgRes.err))
    }

    function TabScroll({ basket }) {
      const [sub, setSub] = useState('video')
      const [running, setRunning] = useState(false)
      const [runMsg, setRunMsg] = useState('')
      const cfgRes = useApi('/config')
      const store = useApi('/store/list?limit=500')
      const storeMap = useMemo(() => {
        const m = {}
        for (const r of (store.data?.rows || [])) {
          m[r.bvid] = {
            tier: r.judge?.tier || '',
            commented: Boolean(r.commented),
            title: r.title || '',
            up: r.up?.name || '',
            quotes: (r.quotes || []).slice(0, 3).map((x) => x.text),
          }
        }
        return m
      }, [store.data])
      const today = store.data?.stats?.videos ?? 0
      const runRound = async () => {
        setRunning(true)
        setRunMsg('跑一轮中…（采集 + 判定 + 日报，一般 1–2 分钟）')
        const r = await jpost('/run-round')
        setRunning(false)
        setRunMsg(r.ok ? `跑完了（${r.seconds}s）· 库里 ${r.stats?.videos ?? '?'} 条` : ('跑失败：' + (errText(r) || '')))
        cfgRes.reload(); store.reload()
      }
      return h('div', { 'data-wb-page': '' },
        h(PageHead, { title: sub === 'msg' ? '刷B站 · 消息' : sub === 'set' ? '刷B站 · 设置' : '刷B站', sub: sub === 'msg' ? '未读、回复、@、私信 —— 回复先给草稿' : sub === 'set' ? '原插件的 日常 / 偏好 / 互动，全搬到这里' : '看视频、挑视频、采集成素材' },
          h('span', { 'data-wb-chip': '' }, `今日已采 ${cfgRes.data?.schedule?.todayCount ?? '?'} 条`),
          h(Btn, { sm: true, primary: true, disabled: running, onClick: runRound }, running ? '跑一轮中…' : '立即跑一轮'),
          sub === 'video' ? h(Btn, { sm: true, onClick: () => { cfgRes.reload(); store.reload() } }, '刷新') : null),
        runMsg ? h(Note, {}, runMsg) : null,
        h('div', { 'data-wb-row': '' },
          ...[['video', '视频'], ['msg', '消息'], ['set', '刷B站设置']].map(([k, l]) =>
            h('button', { key: k, 'data-wb-btn': '', 'data-sm': '', 'data-primary': sub === k ? '' : undefined, onClick: () => setSub(k) }, l)),
          sub === 'video' && basket.length ? h(Chip, {}, `创作篮 ${basket.length}`) : null),
        sub === 'video' ? h(SubVideo, { storeMap, cfg: cfgRes.data?.config, onCommented: store.reload, onKeywordsChanged: cfgRes.reload }) : null,
        sub === 'msg' ? h(SubInbox, { onCommented: store.reload }) : null,
        sub === 'set' ? h(SubSettings, { onRunRound: () => store.reload(), onSaved: cfgRes.reload }) : null)
    }

    /* ═══════════════════ ③ 创作 / 出片 ═══════════════════ */
    function ProjectCard({ p, basket, onChange }) {
      const [inst, setInst] = useState('')
      const [busy, setBusy] = useState('')
      const [msg, setMsg] = useState('')
      const [showShots, setShowShots] = useState(false)
      const [viewV, setViewV] = useState(0)
      const [viewPlan, setViewPlan] = useState(null)
      const [preview, setPreview] = useState('')
      const [logOpen, setLogOpen] = useState(false)
      const plan = viewV ? (viewPlan || p.plan) : p.plan
      const job = p.job
      const stage = job?.stage === 'running' ? 'rendering' : p.stage
      const [label, tone] = stageOf(stage)
      const pct = job?.stage === 'running' ? (job.pct || 0) : (['rendered', 'approved', 'published'].includes(p.stage) ? 100 : 0)
      const runId = baseName(p.runDir)
      const shots = plan?.shots || []
      const picks = plan?.picks || []
      const currentPlan = p.plan
      const versions = p.versions || []
      const curV = p.currentVersion || 1

      const showVersion = async (v) => {
        if (!v || v === curV) { setViewV(0); setViewPlan(null); return }
        setViewV(v); setBusy('v')
        const r = await jget(`/create/plan?id=${encodeURIComponent(p.id)}&v=${v}`)
        if (r.ok) setViewPlan(r.plan)
        setBusy('')
      }
      const revise = async () => {
        if (!inst.trim()) return
        setBusy('revise'); setMsg('改版中…（模型重写方案，20–60 秒）')
        const r = await jpost('/create/revise', { id: p.id, instruction: inst })
        setBusy('')
        setMsg(r.ok ? `已生成 v${r.project.currentVersion}：${r.plan.changed || ''}` : ('失败：' + (errText(r) || '')))
        if (r.ok) { setInst(''); setViewV(0); setViewPlan(null); onChange?.() }
      }
      const render = async () => {
        setBusy('render'); setMsg('开始渲染…')
        const r = await jpost('/render/start', { id: p.id, version: viewV || curV })
        setBusy('')
        setMsg(r.ok ? '已在后台渲染（配音 → 渲染 → 合音轨 → 烧字幕 → 封面）' : ('失败：' + (errText(r) || '')))
        if (r.ok) { setLogOpen(true); onChange?.() }
      }
      const promptGo = async () => {
        setBusy('prompt')
        const r = await jget(`/create/prompt?id=${encodeURIComponent(p.id)}&v=${viewV || curV}`)
        setBusy('')
        if (!r.ok) return setMsg('取提示词失败：' + (errText(r) || ''))
        const ok = await copyText(r.prompt)
        setMsg(ok ? '提示词已复制 —— 粘到 dsh 对话里继续聊' : '复制失败，可以展开手动复制')
      }
      const togglePreview = () => {
        if (!runId) return
        setPreview(preview ? '' : `/api/bili-wb/review/media?runId=${encodeURIComponent(runId)}&kind=video`)
      }

      return h('div', { 'data-wb-sec': '' },
        h('div', { 'data-wb-row': '' },
          h('div', { 'data-wb-projtitle': '', style: { flex: '1 1 240px' } }, plan?.title || p.title || '未命名'),
          h('span', { 'data-wb-badge': '', 'data-tone': tone }, label),
          h('div', { 'data-wb-grow': '' }),
          h(Chip, { sel: true }, `v${viewV || curV}（${viewV ? '查看' : '当前'}）`),
          versions.length > 1 ? versions.filter((x) => x.v !== (viewV || curV)).slice(-3).map((x) =>
            h('span', { key: x.v, 'data-wb-chip': '', style: { cursor: 'pointer' }, onClick: () => showVersion(x.v) }, `v${x.v}`)) : null),
        h('div', { 'data-wb-meta': '' },
          [plan?.stats?.estSeconds ? `${plan.stats.estSeconds} 秒` : '', p.renderVoice ? `音色 ${voiceLabel(p.renderVoice)}` : '', `${shots.length} 镜`, `引用素材 ${picks.length} 处`].filter(Boolean).join(' · ')),
        h('div', { 'data-wb-bar': '' }, h('i', { style: { width: pct + '%' } })),
        h('div', { 'data-wb-meta': '' }, job?.stage === 'running'
          ? `渲染中 ${job.pct || 0}% · ${baseName(job.runDir)}${job.frameCount ? ` · 真实帧 ${job.frameCount}` : ''}`
          : pct === 100 ? '渲染完成，等你在「审核/发布」点通过' : '还没渲染'),
        h('div', { 'data-wb-shots': '' }, ...shots.map((s, i) => h('span', { key: i, 'data-wb-shot': '' },
          h('b', {}, s.kind), ' ', s.headline || String(s.narration || '').slice(0, 12)))),
        h('div', { 'data-wb-row': '', style: { borderTop: '1px solid var(--wb-line)', paddingTop: '10px' } },
          h('span', { 'data-wb-note': '' }, (p.versions || []).filter((x) => x.v === curV)[0]?.changed || '初版'),
          h('div', { 'data-wb-grow': '' }),
          h(Btn, { sm: true, disabled: busy === 'prompt', onClick: promptGo }, '在对话里接着聊'),
          h(Btn, { sm: true, disabled: busy === 'v', onClick: () => showVersion(curV) }, '回到当前版')),
        h('div', { 'data-wb-row': '' },
          h('input', { 'data-wb-search': '', style: { flex: '1 1 200px', width: 'auto' }, placeholder: '接着改：第 5 条换个素材 / 标题再短点 / 别太标题党', value: inst, onChange: (e) => setInst(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter') revise() } }),
          h(Btn, { sm: true, primary: true, disabled: busy === 'revise' || !inst.trim(), onClick: revise }, busy === 'revise' ? '改版中…' : '改一版')),
        h('div', { 'data-wb-row': '' },
          h(Btn, { sm: true, onClick: () => setShowShots(!showShots) }, showShots ? '收起分镜' : '看分镜'),
          h(Btn, { sm: true, disabled: busy === 'render' || job?.stage === 'running', onClick: render }, job?.stage === 'running' ? '渲染中…' : (pct === 100 ? '重新渲染' : '开始渲染')),
          h(Btn, { sm: true, disabled: !pct || !runId, onClick: togglePreview }, '预览成片'),
          h('div', { 'data-wb-grow': '' }),
          h('span', { 'data-wb-meta': '' }, `引用素材 ${picks.length} 处${basket.length ? ` · 创作篮 ${basket.length}` : ''}`)),
        showShots ? h('div', { 'data-wb-col': '' }, ...shots.map((s, i) => h('div', { key: i, 'data-wb-quote': '' },
          h('b', {}, `${i + 1}. ${s.kind}`), ' ', s.headline || '', s.body ? ` — ${s.body}` : '',
          h('div', { 'data-wb-meta': '', style: { marginTop: '3px' } },
            [s.narration, s.source ? `引用 ${s.source.bv} @${mmss(s.source.t)}` : ''].filter(Boolean).join(' · '))))) : null,
        msg ? h(Note, {}, msg) : null,
        job?.log ? h('div', { 'data-wb-col': '' },
          h('div', { 'data-wb-row': '' },
            h(Btn, { sm: true, onClick: () => setLogOpen(!logOpen) }, logOpen ? '收起渲染日志' : '看渲染日志'),
            job.error ? h('span', { 'data-wb-note': '', style: { color: '#f87171' } }, job.error.slice(0, 160)) : null),
          logOpen ? h('pre', { 'data-wb-pre': '' }, job.log.slice(-2600)) : null) : null,
        preview ? h('div', { 'data-wb-overlay': '' },
          h('button', { className: 'x', onClick: () => setPreview('') }, '✕'),
          h('video', { src: preview, controls: true, autoPlay: true })) : null)
    }

    function TabCreate({ basket, setBasket }) {
      const [brief, setBrief] = useState('')
      const [busy, setBusy] = useState('')
      const [log, setLog] = useState('')
      const list = useApi('/create/plans')
      const projects = list.data?.projects || []
      const anyRunning = projects.some((p) => p.job?.stage === 'running')
      usePoll(list.reload, 4000, true)

      const go = async () => {
        if (!brief.trim()) return
        setBusy('go'); setLog('① 检索素材库 → ② 挑料 → ③ 写分镜（一般 20–60 秒）')
        const r = await jpost('/create/plan', { brief })
        setBusy('')
        if (r.ok) { setLog(`已生成 v1：${r.plan.title}`); setBrief(''); list.reload() }
        else setLog('失败：' + (errText(r) || '') + (r.log ? '\n' + r.log : ''))
      }
      return h('div', { 'data-wb-page': '' },
        h(PageHead, { title: '创作 / 出片', sub: '一句需求 → 出方案 → 继续改（每改一次一个版本）；深聊就点「在对话里接着聊」' }),
        h(Sec, {},
          h('div', { 'data-wb-projtitle': '' }, '想做什么样的片子？'),
          h('input', {
            'data-wb-search': '', placeholder: '比如：做一期 iPhone 折叠屏耐用性的实测盘点，轻松点，90 秒以内',
            value: brief, onChange: (e) => setBrief(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) go() },
          }),
          h('div', { 'data-wb-row': '' },
            h(Btn, { primary: true, disabled: busy === 'go' || !brief.trim(), onClick: go }, busy === 'go' ? '正在从素材库找料…' : '让 AI 开始'),
            h('span', { 'data-wb-note': '' }, '它会自己检索素材库、挑料、写分镜（Ctrl+Enter 发送）'),
            basket.length ? h('span', { 'data-wb-note': '' }, `创作篮里还有 ${basket.length} 条，可以在下面手动指认`) : null),
          log ? h('pre', { 'data-wb-pre': '' }, log) : null),
        h('div', { 'data-wb-row': '' },
          h(Note, {}, `共 ${projects.length} 个方案${anyRunning ? ' · 有项目在渲染' : ''}`),
          h('div', { 'data-wb-grow': '' }),
          h(Btn, { sm: true, onClick: list.reload }, '刷新')),
        h(Err, {}, list.err),
        list.loading ? h('div', { 'data-wb-loading': '' }, '读方案…') : null,
        !list.loading && !projects.length ? h(Note, {}, '还没有方案 —— 上面写一句需求，让 AI 开始') : null,
        h('div', { 'data-wb-col': '' }, ...projects.map((p) => h(ProjectCard, {
          key: p.id, p, basket, onChange: list.reload,
        }))),
        h(Sec, { title: '创作篮（手动指定素材，可选）' },
          basket.length
            ? h('div', { 'data-wb-row': '' },
              ...basket.map((bv) => h(Chip, { key: bv }, bv)),
              h(Btn, { sm: true, onClick: () => setBasket([]) }, '清空'))
            : h(Note, {}, '没选料也行 —— 上面那句需求足够它自己去库里找。'),
          h(Note, {}, '出片设置（音色 / 时长 / 是否用真实帧）在「刷B站 → 设置」和每张卡片的「开始渲染」里调。')))
    }

    /* ═══════════════════ ④ 审核 / 发布 ═══════════════════ */
    function TabReview() {
      const list = useApi('/review/list')
      const [busy, setBusy] = useState('')
      const [dump, setDump] = useState('')
      const [preview, setPreview] = useState('')
      const runs = list.data?.runs || []
      const publishEnabled = Boolean(list.data?.publishEnabled)
      usePoll(list.reload, 5000, true)

      const decide = async (runId, state) => {
        setBusy(runId + state)
        const r = await jpost('/review/decision', { runId, state })
        setBusy('')
        setDump(r.ok ? `已${state === 'approved' ? '通过' : '打回'}：${runId}` : ('失败：' + (errText(r) || '')))
        list.reload()
      }
      const upload = async (run, dryRun) => {
        if (!dryRun && !window.confirm('真要投稿到 B站？这会公开发布。')) return
        setBusy(run.runId + (dryRun ? 'dry' : 'real'))
        const r = await jpost('/review/upload', { runId: run.runId, dryRun, confirm: !dryRun })
        setBusy('')
        setDump(r.ok
          ? `${dryRun ? '投稿 dry-run（没有真的发）' : '已投稿'}${r.data?.bvid ? ` · BV ${r.data.bvid}` : ''}\n$ ${(r.command || []).join(' ')}\n${JSON.stringify(r.data || {}, null, 2).slice(0, 2000)}`
          : ('失败：' + (errText(r) || '')))
        list.reload()
      }
      const showStats = async (run) => {
        setBusy(run.runId + 'stats')
        const r = await jget('/review/stats?runId=' + encodeURIComponent(run.runId))
        setBusy('')
        setDump(r.ok ? JSON.stringify(r.data || {}, null, 2).slice(0, 3000) : ('失败：' + (errText(r) || '')))
      }
      return h('div', { 'data-wb-page': '' },
        h(PageHead, { title: '审核 / 发布', sub: '成片必须你点通过才会发布；投稿前先 dry-run 看全文' },
          h('span', { 'data-wb-chip': '', 'data-ok': publishEnabled ? '' : undefined }, publishEnabled ? '真投稿已允许' : '真投稿未开启'),
          h(Btn, { sm: true, onClick: list.reload }, '刷新')),
        h(Err, {}, list.err),
        dump ? h('pre', { 'data-wb-pre': '' }, dump) : null,
        list.loading ? h('div', { 'data-wb-loading': '' }, '读成片…') : null,
        !list.loading && !runs.length ? h(Note, {}, '还没有成片 —— 去「创作/出片」渲染一期') : null,
        h('div', { 'data-wb-grid': '' }, ...runs.map((r) => {
          const [label, tone] = stageOf(r.stage)
          const published = r.stage === 'published' || r.review?.state === 'published'
          return h('div', { key: r.runId, 'data-wb-card': '' },
            h('div', { 'data-wb-cover': '' },
              h('span', {}, published ? '已发布成片' : r.stage === 'rendered' ? '待审成片' : r.title || r.runId),
              r.hasCover ? h('img', { src: `/api/bili-wb/review/media?runId=${encodeURIComponent(r.runId)}&kind=cover`, alt: '', loading: 'lazy', onError: (e) => { e.target.style.display = 'none' } }) : null,
              h('span', { 'data-wb-badge': '', 'data-tone': tone, style: { position: 'absolute', left: '8px', top: '8px', zIndex: 2 } }, label),
              h('span', { 'data-wb-dur': '' }, r.seconds ? `${Math.round(r.seconds)}s` : '')),
            h('div', { 'data-wb-body': '' },
              h('div', { 'data-wb-cardtitle': '' }, r.title || r.runId),
              h('div', { 'data-wb-meta': '' }, [r.projectVersion ? `v${r.projectVersion}` : '', r.shots ? `${r.shots} 镜` : '', r.realFrames ? `真实帧 ${r.realFrames}` : '', r.builtAt ? dayOf(r.builtAt) : ''].filter(Boolean).join(' · ')),
              h('div', { 'data-wb-row': '' },
                published
                  ? h(Btn, { sm: true, primary: true, disabled: busy === r.runId + 'stats', onClick: () => showStats(r) }, '看数据')
                  : h(Btn, { sm: true, primary: true, disabled: busy === r.runId + 'approved', onClick: () => decide(r.runId, 'approved') }, '通过'),
                published ? null : h(Btn, { sm: true, disabled: busy === r.runId + 'rejected', onClick: () => decide(r.runId, 'rejected') }, '打回重做'),
                h('div', { 'data-wb-grow': '' }),
                h(Btn, { sm: true, disabled: !r.hasVideo, onClick: () => setPreview(`/api/bili-wb/review/media?runId=${encodeURIComponent(r.runId)}&kind=video`) }, '预览')),
              h('div', { 'data-wb-row': '' },
                h(Btn, { sm: true, disabled: busy === r.runId + 'dry' || !r.hasVideo, onClick: () => upload(r, true) }, '投稿 dry-run'),
                r.stage === 'approved'
                  ? h(Btn, { sm: true, disabled: !publishEnabled || busy === r.runId + 'real', onClick: () => upload(r, false) }, '真投稿')
                  : null,
                h('div', { 'data-wb-grow': '' }),
                r.review?.state ? h('span', { 'data-wb-meta': '' }, `审核：${r.review.state}`) : null)))
        })),
        preview ? h('div', { 'data-wb-overlay': '' },
          h('button', { className: 'x', onClick: () => setPreview('') }, '✕'),
          h('video', { src: preview, controls: true, autoPlay: true })) : null)
    }

    /* ═══════════════════ ⑤ 我的 ═══════════════════ */
    function TabMine() {
      const [auth, setAuth] = useState(null)
      const [qr, setQr] = useState(false)
      const [busy, setBusy] = useState('')
      const [msg, setMsg] = useState('')
      const [log, setLog] = useState('')
      const [health, setHealth] = useState('')
      const cfgRes = useApi('/config')
      const stats = useApi('/stats')
      const cfg = cfgRes.data?.config
      const [draft, setDraft] = useState(null)

      const refreshAuth = async () => {
        const r = await jget('/status')
        if (r.ok) setAuth(r)
      }
      useEffect(() => { refreshAuth() }, [])
      useEffect(() => {
        if (cfg && draft === null) setDraft({ publishEnabled: cfg.publishEnabled, tagsText: (cfg.defaultTags || []).join(','), defaultZone: cfg.defaultZone })
      }, [cfg, draft])
      usePoll(async () => {
        const r = await jget('/status')
        if (r.ok) { setAuth(r); if (r.loggedIn) setQr(false) }
      }, 2500, qr)

      const login = async () => {
        setBusy('login'); setMsg('生成二维码…')
        const r = await jpost('/login/start')
        setBusy('')
        if (r.ok) { setQr(true); setMsg('手机 B站 扫码，确认时选「记住我 / 长期」') }
        else setMsg('生成二维码失败：' + (errText(r) || ''))
      }
      const logout = async () => {
        setBusy('logout')
        await jpost('/logout')
        setBusy(''); setQr(false); refreshAuth()
      }
      const showLog = async () => {
        setBusy('log')
        const r = await jget('/duty-log')
        setBusy(''); setLog(r.ok ? (r.text || '（空）') : ('读取失败：' + (errText(r) || '')))
      }
      const checkModel = async () => {
        setBusy('model')
        const r = await jget('/model/health')
        setBusy('')
        setHealth(JSON.stringify(r.data || { error: r.error }, null, 2))
      }
      const savePublish = async () => {
        if (!draft) return
        setBusy('save')
        const r = await jpost('/config', {
          publishEnabled: draft.publishEnabled,
          defaultTags: String(draft.tagsText || '').split(',').map((s) => s.trim()).filter(Boolean),
          defaultZone: draft.defaultZone,
        })
        setBusy('')
        setMsg(r.ok ? '发布设置已保存' : ('保存失败：' + (errText(r) || '')))
        cfgRes.reload()
      }
      const d = stats.data?.data
      const n = (o, k) => (o && Number.isFinite(Number(o[k])) ? Number(o[k]) : 0)
      const store = cfgRes.data?.store || {}
      const [storePath, setStorePath] = useState('')
      useEffect(() => { if (store.path) setStorePath(store.path) }, [store.path])
      const relocate = async () => {
        const p = String(storePath || '').trim()
        if (!p) { setMsg('先填一个素材库目录'); return }
        setBusy('store'); setMsg('切换素材库位置中…')
        const r = await jpost('/store/relocate', { path: p, copy: true })
        setBusy('')
        if (r.ok) {
          setMsg(`已切换 · ${r.path} · ${r.store?.videos ?? 0} 条${r.copied ? '（已复制现有素材）' : ''}`)
          setStorePath(r.path || p)
          cfgRes.reload(); stats.reload()
        } else setMsg('切换失败：' + (errText(r) || ''))
      }

      return h('div', { 'data-wb-page': '' },
        h(PageHead, { title: '我的', sub: '登录、用户信息、账号数据、全局设置' },
          auth?.loggedIn ? null : h(Btn, { primary: true, sm: true, disabled: busy === 'login', onClick: login }, busy === 'login' ? '生成二维码…' : '扫码登录')),

        !auth?.loggedIn
          ? h('div', { 'data-wb-login': '' },
            h('div', { 'data-wb-qr': '' }, qr ? h('img', { src: API + '/qr.png?t=' + Date.now(), alt: '二维码' }) : h('div', { className: 'ph' })),
            h('div', { 'data-wb-col': '', style: { flex: 1 } },
              h('div', { 'data-wb-projtitle': '' }, '扫码登录 bili-cli'),
              h(Note, {}, '手机 B站 App 扫码，确认时选「记住我 / 长期」。登录成功后这里会变成：昵称 · UID · LV · 登出按钮。'),
              h('div', { 'data-wb-row': '' },
                h(Chip, { warn: true }, '未登录'),
                h(Btn, { sm: true, onClick: qr ? () => setQr(false) : login }, qr ? '刷新二维码' : '生成二维码'),
                msg ? h('span', { 'data-wb-note': '' }, msg) : null),
              h(Note, {}, '⚠️ 工作台统一用这一份登录；别再装老「刷B站」插件，会有两套账。')))
          : h(Sec, {},
            h('div', { 'data-wb-row': '' },
              h(Chip, { ok: true }, `已登录 · ${auth.user?.name || auth.user?.mid || ''} · LV${auth.user?.level ?? '?'}`),
              h(Chip, {}, `UID ${auth.user?.mid ?? '-'}`),
              h('div', { 'data-wb-grow': '' }),
              h(Btn, { sm: true, onClick: refreshAuth }, '刷新'),
              h(Btn, { sm: true, disabled: busy === 'logout', onClick: logout }, '登出'))),

        d ? h('div', { 'data-wb-grid': '', style: { gridTemplateColumns: 'repeat(2,minmax(0,1fr))' } },
          h('div', { 'data-wb-stat': '' }, h('b', {}, fmtNum(n(d.plays, 'now'))), h('span', {}, `播放 · 上期 ${fmtNum(n(d.plays, 'previous'))}`)),
          h('div', { 'data-wb-stat': '' }, h('b', {}, fmtNum(n(d.visitors, 'now'))), h('span', {}, '访客')),
          h('div', { 'data-wb-stat': '' }, h('b', {}, `+${fmtNum(n(d.new_fans, 'now'))}`), h('span', {}, `涨粉 · 总粉丝 ${fmtNum(d.fans?.total)}`)),
          h('div', { 'data-wb-stat': '' }, h('b', {}, `${d.beats_similar_ups_percent?.play ?? '-'}%`), h('span', {}, '播放超过同类 UP'))) : null,

        h('div', { 'data-wb-split': '' },
          h(Sec, { title: '素材库与运行' },
            h('div', { 'data-wb-kv': '' },
              `库路径：${store.path || '—'}`,
              h('br'),
              `库内：${store.videos ?? '-'} 条 · ${store.mb ?? '-'} MB · ${store.files ?? '-'} 个文件`,
              h('br'),
              `定时：${cfg?.enabled ? '开' : '关'}（${cfg?.scheduleRanges || '00:00-24:00'} · 每天上限 ${cfg?.perDay || 48} · 约每 ${cfgRes.data?.schedule?.estMinutes || '?'} 分钟 1 条）`,
              h('br'),
              `模型链：${(cfg?.modelChain || []).length} 个，当前 ${(cfg?.modelChain || [])[0] || '-'}`),
            h(Field, { label: '素材库位置' },
              h('input', {
                'data-wb-input': '', style: { maxWidth: '430px' }, value: storePath,
                placeholder: '~/.dsh-bili-workbench/store',
                onChange: (e) => setStorePath(e.target.value),
              }),
              h(Btn, { sm: true, disabled: busy === 'store', onClick: relocate }, busy === 'store' ? '切换中…' : '保存并切换'),
              h(Note, {}, '默认 ~/.dsh-bili-workbench/store；新目录为空时会复制现有素材，已有数据则直接切换')),
            h('div', { 'data-wb-row': '' },
              h(Btn, { sm: true, disabled: busy === 'log', onClick: showLog }, '看运行日志'),
              h(Btn, { sm: true, onClick: () => jpost('/open-folder', { what: 'store' }) }, '打开库目录'),
              h(Btn, { sm: true, onClick: () => jpost('/open-folder', { what: 'runs' }) }, '打开成片目录'),
              h(Btn, { sm: true, disabled: busy === 'model', onClick: checkModel }, '测模型')),
            health ? h('pre', { 'data-wb-pre': '' }, health) : null,
            log ? h('pre', { 'data-wb-pre': '' }, log) : null),

          h(Sec, { title: '发布权限（真投稿）' },
            h('label', { 'data-wb-toggle': '' },
              h('input', { type: 'checkbox', checked: Boolean(draft?.publishEnabled), onChange: (e) => setDraft({ ...draft, publishEnabled: e.target.checked }) }),
              h('span', {}, '允许真投稿（默认关）')),
            h(Note, {}, '关着的时候，「审核/发布」只能 dry-run；打开后仍会二次确认。'),
            h(Field, { label: '默认标签' },
              h('input', { 'data-wb-input': '', value: draft?.tagsText || '', onChange: (e) => setDraft({ ...draft, tagsText: e.target.value }), placeholder: 'AI,资讯,盘点' })),
            h(Field, { label: '默认分区 ID' },
              h('input', { 'data-wb-input': '', 'data-num': '', type: 'number', value: draft?.defaultZone ?? 0, onChange: (e) => setDraft({ ...draft, defaultZone: e.target.value }) }),
              h(Note, {}, '0 = 让 bili 自动预测')),
            h('div', { 'data-wb-row': '' },
              h(Btn, { sm: true, primary: true, disabled: busy === 'save', onClick: savePublish }, '保存发布设置'),
              msg ? h('span', { 'data-wb-note': '' }, msg) : null)),

          h(Sec, { title: '模型链' },
            h('div', { 'data-wb-kv': '' }, (cfg?.modelChain || []).map((m, i) => h('div', { key: i }, `${i + 1}. ${m}`))),
            h(Note, {}, '在「刷B站 → 设置 → 模型链」里改。失败自动换下一个。'))),
        h(Err, {}, cfgRes.err))
    }

    /* ═══════════════════ 外壳 ═══════════════════ */
    // 图标用内联 SVG 而不是 emoji：emoji 依赖系统字体、跨平台不一致，
    // 且作为导航图标会和界面里的其他文字抢注意力。
    const ICONS = {
      store: h('path', { d: 'M2.5 3.5h5v9h-5zM8.5 3.5h5v9h-5z' }),
      scroll: [h('rect', { key: 'r', x: 2, y: 3.5, width: 12, height: 9, rx: 1.5 }),
        h('path', { key: 'p', d: 'M6.8 6.6v2.8l2.4-1.4z', fill: 'currentColor', stroke: 'none' })],
      create: h('path', { d: 'M3 13.5V9.5M6.3 13.5V5M9.7 13.5V7.5M13 13.5V3' }),
      review: h('path', { d: 'M3 2.5h10v11L8 11l-5 2.5z' }),
      mine: [h('circle', { key: 'c', cx: 8, cy: 5.5, r: 2.5 }),
        h('path', { key: 'p', d: 'M3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4' })],
    }
    const Icon = ({ k }) => h('svg', {
      viewBox: '0 0 16 16', width: 16, height: 16,
      fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5,
      'stroke-linejoin': 'round', 'aria-hidden': 'true',
    }, ICONS[k] || null)

    const NAV = [
      ['store', '素材库'],
      ['scroll', '刷B站'],
      ['create', '创作/出片'],
      ['review', '审核/发布'],
      ['mine', '我的'],
    ]

    function Shell() {
      const [tab, setTab] = useState('store')
      const [collapsed, setCollapsed] = useState(false)
      const [basket, setBasket] = useState([])
      return h('div', { 'data-wb-root': '', 'data-collapsed': collapsed ? '' : undefined },
        h('aside', { 'data-wb-rail': '' },
          h('div', { 'data-wb-brand': '' }, 'B站工作台', h('small', {}, '素材 → 出片 → 发布')),
          h('nav', { style: { display: 'flex', flexDirection: 'column' } },
            ...NAV.map(([k, label]) => h('button', {
              key: k, 'data-wb-nav': '', 'aria-selected': tab === k ? 'true' : 'false',
              title: collapsed ? label : undefined,
              onClick: () => setTab(k),
            },
            h('span', { className: 'ico' }, h(Icon, { k })),
            h('span', { 'data-wb-label': '' }, label),
            k === 'create' && basket.length ? h('span', { className: 'badge' }, String(basket.length)) : null))),
          h('div', { 'data-wb-rail-foot': '' },
            h('button', { 'data-wb-ghost': '', onClick: () => setCollapsed(!collapsed) }, collapsed ? '»' : '« 收起'))),
        h('main', { 'data-wb-main': '' },
          tab === 'store' ? h(TabStore, { basket, setBasket }) : null,
          tab === 'scroll' ? h(TabScroll, { basket }) : null,
          tab === 'create' ? h(TabCreate, { basket, setBasket }) : null,
          tab === 'review' ? h(TabReview) : null,
          tab === 'mine' ? h(TabMine) : null))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const style = document.createElement('style')
        style.setAttribute('data-plugin-css', 'dsh-bili-workbench')
        style.textContent = CSS
        document.head.appendChild(style)
        ctx.effect(() => () => style.remove(), 'dsh-bili-workbench: 样式')
        const slots = (typeof ctx.get === 'function' ? ctx.get('slots') : undefined) || ctx.slots
        if (!slots) return
        try {
          slots.inject('conversation.view', () => slots.register({
            name: 'conversation.view', id: 'bili-wb', order: 30, label: 'B站工作台', scope: 'session',
          }, () => h(Shell)))
        } catch (e) { /* 没有这个槽位就算了 */ }
      },
    }
  },
})
