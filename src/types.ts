// ============================================================================
// 梦幻西游 游戏日历 —— 全局类型契约
// 所有功能模块都依赖此文件中的类型。请勿在功能模块中重复定义这些类型。
// ============================================================================

/**
 * TODO 周期类型。
 * - 'once'：单次待办，做完即止，不会自动重置（可手动删除）；展示在每日之前，
 *   在「单次待办」分组内就地添加，不走底部「自定义添加」。
 * - 'daily' / 'weekly' / 'monthly'：跨天/周/月自动重置。
 */
export type TodoCycle = 'once' | 'daily' | 'weekly' | 'monthly'

/**
 * 一个角色（账号）。五开/多号玩家可为每个角色单独记录待办完成情况。
 */
export interface Character {
  id: string
  name: string
  /** 排序权重，越小越靠前 */
  order?: number
}

/**
 * 没有添加任何角色时使用的「保留角色 ID」，代表单人/全部，
 * 让单角色与多角色走同一套按角色完成的逻辑。
 */
export const SOLO_CHARACTER_ID = '_solo'

/**
 * 一条 TODO 任务。
 * 完成状态【按角色】记录：completions[角色ID] === 当前周期 Key 即该角色本周期已完成；
 * 跨天/跨周/跨月后周期 Key 变化，自动重置为未完成（无需定时任务）。
 * 主勾选框表示「全部角色都完成」。
 */
export interface TodoTask {
  id: string
  name: string
  cycle: TodoCycle
  /** 是否来自内置预设（仅用于 UI 标识，可被删除） */
  preset?: boolean
  /** 备注（可选） */
  note?: string
  /**
   * 按角色记录的完成情况：角色ID -> 该角色最近一次完成所属的周期 Key。
   * 无角色时使用保留键 SOLO_CHARACTER_ID。
   */
  completions?: Record<string, string>
  /** @deprecated 旧版单人完成字段，仅用于数据迁移到 completions */
  lastCompletedPeriodKey?: string
  /** 排序权重，越小越靠前 */
  order?: number
}

/** 内置预设 TODO（用于「常用任务」勾选添加） */
export interface PresetTodo {
  name: string
  cycle: TodoCycle
  /** 分类标签，例如 '日常' '帮派' '活动' */
  category?: string
}

// ----------------------------------------------------------------------------
// 攻略（副本 / 神器 / 奇遇 / 看戏）+ 用户自定义
// ----------------------------------------------------------------------------

/**
 * 攻略分类。内置类对应梦幻西游电脑版的副本、神器（按起/转/合分三组）、奇遇、看戏；
 * '自定义' 用于用户自行添加、展示在侧边的内容。
 * 神器拆成「神器·起 / 神器·转 / 神器·合」三组，让侧边导航更清晰。
 */
export type GuideCategory =
  | '天命副本'
  | '周六活动'
  | '周日活动'
  | '神器·起'
  | '神器·转'
  | '神器·合'
  | '奇遇'
  | '看戏'
  | '自定义'
  /**
   * 旧版「神器」总分类，已按起/转/合拆分；「副本」总分类已更名为「天命副本」。
   * 仅保留给未迁移的历史内置条目做兼容，不出现在分组元数据(GUIDE_CATEGORY_META)
   * 与编辑器分类中，因此不会在侧边渲染。
   */
  | '神器'
  | '副本'

/** 攻略正文的一个小节：可选小标题 + 若干要点行 */
export interface GuideSection {
  heading?: string
  /** 要点行（逐条展示，渲染为列表） */
  items: string[]
}

/**
 * 内置攻略的配图：已压缩后打包进应用（public/guide-img/），
 * src 为相对 BASE_URL 的路径，如 'guide-img/dgn-wujiguo-1.jpg'。
 */
export interface GuideImage {
  src: string
  /** 配图说明（同时用作 alt 文本） */
  caption?: string
}

/**
 * 一条攻略。
 * - 内置攻略（preset=true）来自资料整理，正文只读，不可编辑/删除；
 *   但可通过 GuideNote 补充用户自己的 Markdown 内容（另行存储，见 guideNotes）；
 * - 自定义攻略（preset 省略/false）由用户添加，可编辑/删除，与内置一并展示在侧边。
 */
export interface GuideEntry {
  id: string
  category: GuideCategory
  title: string
  /** 一句话定位：等级/周期/难度/核心收益 */
  summary?: string
  /** 正文小节 */
  sections: GuideSection[]
  /** 配图（内置攻略用；图片压缩后随应用打包） */
  images?: GuideImage[]
  /** 资料出处 / 置信度备注（内置攻略用） */
  source?: string
  /** 是否内置（只读）。自定义为 false/省略 */
  preset?: boolean
  /** 排序权重，越小越靠前 */
  order?: number
  /** 自定义攻略的最近更新时间（epoch 毫秒） */
  updatedAt?: number
}

/**
 * 用户给某条内置攻略补充的自定义 Markdown 内容。
 * 以攻略 id 为键存储（Record<攻略id, GuideNote>），内置正文保持只读，
 * 补充内容展示在该攻略详情的「我的补充」区域。
 */
export interface GuideNote {
  /** Markdown 原文（渲染时按安全子集解析，不注入原始 HTML） */
  markdown: string
  /** 最近更新时间（epoch 毫秒） */
  updatedAt: number
}

// ----------------------------------------------------------------------------
// 物价（常见任务产出物品参考价）
// ----------------------------------------------------------------------------

/**
 * 一条物价条目。
 * - 内置参考条目（preset=true）来自 data/prices，联网整理，只读；
 * - 自定义条目（preset 省略/false）由用户添加，可编辑/删除；
 * 两类都可通过 priceComments（条目id -> 备注）附加用户自己的评论。
 * 说明：游戏物价随服务器与版本大幅波动，price 为「参考价」文本，最终以游戏内摊位为准。
 */
export interface PriceItem {
  id: string
  name: string
  /** 用户自定义分组名（自由文本，如「兽决」「五宝」，可任意新建/重命名）；空则归入「其它」 */
  category?: string
  /** 参考价（自由文本，如「约 80 万」「135–140 万」「1000 银/支」），因服而异 */
  price?: string
  /** 产出来源 / 用途 / 说明 */
  desc?: string
  /** 是否内置参考条目（只读，可被自定义备注补充） */
  preset?: boolean
  /** 排序权重，越小越靠前 */
  order?: number
}

/**
 * 用户给某条物价条目附加的备注/评论。
 * 以条目 id 为键存储（Record<物品id, PriceComment>），内置条目保持只读。
 */
export interface PriceComment {
  /** 备注文本 */
  text: string
  /** 最近更新时间（epoch 毫秒） */
  updatedAt: number
}

/** 价格观测来源：手动改价（按天记录）/ 游戏聊天频道 / 摊位 */
export type PriceSource = 'manual' | 'chat' | 'stall'

/**
 * 一次带时间戳的「价格观测」——来自对游戏聊天/摊位截图的 OCR 识别。
 * 多条观测按时间累积，即可绘制某物品的价格趋势。
 * 图片 OCR 在本机完成，观测数据仅存本地。
 */
export interface PriceObservation {
  id: string
  /** 关联的物价条目 id（内置或自定义）；未归类时可空 */
  itemId?: string
  /** 物品名（OCR 得到或用户校正后的显示名） */
  itemName: string
  /** 归一化后的价格数值（梦幻币）；用于趋势计算，解析失败时可空 */
  value?: number
  /** 原始价格文本，如 "80w" "3500万" "1.2亿" */
  priceText?: string
  /** 买卖方向：收(buy) / 卖(sell)；识别不到时可空 */
  side?: 'buy' | 'sell'
  /** 来源：聊天 / 摊位 */
  source: PriceSource
  /** 区服（聊天里常带，可选） */
  server?: string
  /** 采集时间（epoch 毫秒）——默认取导入时刻，可由用户改成截图时间 */
  capturedAt: number
  /** OCR 原始整行文本，便于回溯核对 */
  rawText?: string
}

// ----------------------------------------------------------------------------
// 算价（合成价格推算器的输入记忆）
// ----------------------------------------------------------------------------

/**
 * 「算价」页的输入记忆：由 1 级材料单价 / 基准品质金丹价格推算高等级价。
 * 属于纯计算工具的输入，但和其它数据一样本地持久化并参与云同步，
 * 换设备也能找回填过的价（默认值见 utils/synth 的 DEFAULT_SYNTH_INPUTS）。
 */
export interface SynthInputs {
  /** 当前选中的宝石名（宝石各自单独存价） */
  gemName: string
  /** 每种宝石各自的 1 级单价：{ 宝石名: 价格文本 } */
  gemPrices: Record<string, string>
  /** 星辉石 1 级单价 */
  starPrice: string
  /** 五色灵尘 1 级单价 */
  dustPrice: string
  /** 九转金丹基准品质（整数文本） */
  pillQuality: string
  /** 九转金丹基准品质对应价格 */
  pillPrice: string
}

// ----------------------------------------------------------------------------
// 全局设置（周期重置点）
// ----------------------------------------------------------------------------

export interface AppSettings {
  /** 每日重置的小时（0-23），游戏内一般为 0 点 */
  dailyResetHour: number
  /** 每周重置的星期（1=周一 ... 7=周日） */
  weeklyResetWeekday: number
}

// ----------------------------------------------------------------------------
// 管理后台 + 签到答题「众包题库」（云端，需登录；数据在 Supabase，见 migrations/0002）
// ----------------------------------------------------------------------------

/** 众包题目的审核状态：待审核 / 已通过 / 已驳回。 */
export type QuizStatus = 'pending' | 'approved' | 'rejected'

/**
 * 一条云端签到答题（用户提交 → 管理员审核）。
 * 与内置只读题库（data/quizBank）分开：approved 的会并入答题页的搜索/识别。
 */
export interface QuizQuestion {
  id: string
  /** 题目 */
  q: string
  /** 正确答案 */
  a: string
  status: QuizStatus
  /** 审核备注 / 驳回理由（可选） */
  note?: string | null
  /** 提交者用户 id（可能因账号注销而为 null） */
  createdBy?: string | null
  /** 提交时间（ISO 字符串） */
  createdAt: string
  /** 最近更新时间（ISO 字符串） */
  updatedAt: string
}

/** 管理后台里展示的一个用户（含是否管理员）。 */
export interface AdminUser {
  id: string
  email: string | null
  isAdmin: boolean
  createdAt: string
}

// ----------------------------------------------------------------------------
// localStorage 存储 Key（集中管理，避免各模块写错）
// ----------------------------------------------------------------------------

export const STORAGE_KEYS = {
  todos: 'mhxy.todos.v1',
  settings: 'mhxy.settings.v1',
  characters: 'mhxy.characters.v1',
  /** 用户自定义攻略（内置攻略来自代码，不入库） */
  guides: 'mhxy.guides.v1',
  /** 内置攻略的用户补充内容（攻略id -> Markdown） */
  guideNotes: 'mhxy.guideNotes.v1',
  /** 用户给攻略打的自定义标签（攻略id -> 标签数组；内置/自定义均可） */
  guideTags: 'mhxy.guideTags.v1',
  /** 置顶的攻略 id 列表（内置/自定义均可，按置顶顺序，最新在前） */
  pinnedGuides: 'mhxy.pinnedGuides.v1',
  /** 用户自定义物价条目（内置参考条目来自代码，不入库） */
  priceItems: 'mhxy.priceItems.v1',
  /** 物价条目的用户备注（物品id -> 备注） */
  priceComments: 'mhxy.priceComments.v1',
  /** 价格观测（OCR 识别的带时间戳记录，用于趋势） */
  priceObservations: 'mhxy.priceObservations.v1',
  /** 算价页的输入记忆（宝石/星辉石/五色灵尘/九转金丹的基准价与品质） */
  synth: 'mhxy.synth.v1',
  /** 签到答题识别区域（相对视频帧的 0–1 比例框，记住后无需每次重选） */
  quizRegion: 'mhxy.quizRegion.v1',
} as const
