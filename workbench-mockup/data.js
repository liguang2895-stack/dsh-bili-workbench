// tasteskill mockup dataset — real records from D:\Bilibili\store, trimmed to what the screens show.
// Figures are the store's own values; nothing invented. Cover images are copied from the store.

export const STORE = [
  {
    bvid: 'BV12Jnb6yEmd',
    title: '独自在北极草原露营3天，采蘑菇、钓肥鱼，过上富足生活',
    up: '蜀犬吠日SCFR',
    duration: 4218,
    tier: '值得看',
    why: '真实现场感的户外长片，节奏慢但信息密度够，蘑菇与钓鱼两段可各取一处做实证画面',
    fetched: '2026-10-23',
    quotes: 4,
    frames: 10,
    view: 53391,
    like: 8069,
    commented: true,
    memes: ['失踪人口回归', '时长感人', '爹，你终于更新了', '被北极熊抓走'],
    comments: 2,
  },
  {
    bvid: 'BV12Vns6AEna',
    title: 'kimi Ai大模型编写PLC程序，建议学习',
    up: '俊杰工控PLC',
    duration: 345,
    tier: '可以看',
    why: '选题切中，但画面是录屏、讲述偏平，适合当论据不适合当主视觉',
    fetched: '2026-10-23',
    quotes: 4,
    frames: 10,
    view: 165,
    like: 7,
    commented: true,
    memes: ['看置顶评论', '价值巨大'],
    comments: 1,
  },
  {
    bvid: 'BV166nW6REyR',
    title: '“大肥鱼适合做女朋友吗？”',
    up: '学姐圆',
    duration: 196,
    tier: '跳过',
    why: '纯情绪向整活，没有可引用的信息点',
    fetched: '2026-10-23',
    quotes: 3,
    frames: 0,
    view: 203518,
    like: 16415,
    commented: false,
    memes: ['这跟谈了有什么区别', '鱼喂鱼', '全站进入痞老板时代'],
    comments: 3,
  },
]

// Totals are summed from the rows, never typed in separately.
export const STORE_TOTAL = {
  videos: 21,
  mb: 12,
  files: 187,
  commented: STORE.filter((r) => r.commented).length,
}

// The workbench's one question: what needs me today.
export const TODAY = {
  collected: 4,
  target: 48,
  inWindow: true,
  estMinutes: 6,
  lastRun: '今天 19:02',
  lastResult: '新采 1 条',
}

export const REVIEW = [
  { runId: '2026-10-22-2110', title: 'AI 折叠屏耐用性盘点', stage: 'rendered', version: 3, shots: 9, frames: 10, seconds: 84, date: '10-22' },
  { runId: '2026-10-21-1930', title: '国产大模型这半年', stage: 'rendered', version: 2, shots: 11, frames: 10, seconds: 96, date: '10-21' },
  { runId: '2026-10-20-1545', title: '户外长片里的真实感', stage: 'approved', version: 1, shots: 8, frames: 10, seconds: 72, date: '10-20' },
]

export const PROJECTS = [
  {
    id: 'p-1',
    title: 'AI 折叠屏耐用性盘点',
    stage: 'rendered',
    currentVersion: 3,
    versions: [1, 2, 3],
    estSeconds: 84,
    shots: 9,
    picks: 4,
    job: null,
  },
  {
    id: 'p-2',
    title: '国产大模型这半年',
    stage: 'rendering',
    currentVersion: 2,
    versions: [1, 2],
    estSeconds: 96,
    shots: 11,
    picks: 3,
    job: { pct: 62, frameCount: 6 },
  },
]

export const ACCOUNT = {
  loggedIn: true,
  name: '出齊東门',
  mid: 414587709,
  level: 6,
  plays: { now: 244000, previous: 198000 },
  visitors: { now: 1832 },
  newFans: { now: 47 },
  fans: { total: 1206 },
  beats: 78,
}

export const CONFIG = {
  enabled: true,
  keywords: ['ai', 'AI', '模型'],
  perDay: 48,
  scheduleRanges: '00:00-24:00',
  autoComment: false,
  autoReply: false,
  dmWatch: false,
  modelChain: ['cbai/deepseek-v4.1-flash'],
  voice: 'zh-CN-YunxiNeural',
  storePath: 'D:\\Bilibili\\store',
}
