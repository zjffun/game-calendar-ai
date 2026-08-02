// ============================================================================
// 梦幻西游 游戏日历 —— 全局类型契约
// 所有功能模块都依赖此文件中的类型。请勿在功能模块中重复定义这些类型。
// ============================================================================

/** TODO 周期类型 */
export type TodoCycle = 'daily' | 'weekly' | 'monthly'

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
// 庭院种子倒计时 / 生长周期
// ----------------------------------------------------------------------------

/**
 * 种子计时方式：
 * - 'cycle'：按梦幻西游电脑版真实「生长周期」推进 —— 以种下当天为第 1 天，
 *   在固定的「结果(可收获)天」产出，到「清除天」永久休眠后清除重种；期间每日需养护。
 *   日程由等级对应的 SeedGrowthCycle 推导，无需手填时长。
 * - 'timer'：单次倒计时（自定义种子 / 一级 / 旧数据），成熟时刻 = plantedAt + durationMs。
 */
export type SeedMode = 'cycle' | 'timer'

/**
 * 一株正在生长的庭院种子。
 * - timer 模式：成熟时刻 = plantedAt + durationMs。
 * - cycle 模式：日程由 plantedAt + 等级生长周期(SeedGrowthCycle) + 每日重置点推导。
 */
export interface SeedTimer {
  id: string
  /** 种子名称/等级，例如 '二级种子' '三级种子' 或自定义 */
  seedName: string
  /** 种子等级（用于配色/分组与查找生长周期）：1/2/3/4，自定义可为 0 */
  level: number
  /** 种植时间（epoch 毫秒） */
  plantedAt: number
  /** 单次计时（timer 模式）所需时长（毫秒）。cycle 模式不使用，可为 0 */
  durationMs: number
  /** 计时方式；缺省视为 'timer'（兼容旧数据） */
  mode?: SeedMode
  /**
   * cycle 模式：最近一次完成「今日养护」所属的每日周期 Key（与待办同机制，跨日自动重置）。
   * 等于当前每日周期 Key 即视为今日已养护。
   */
  lastCareDayKey?: string
  /** 备注，例如种在哪个花盆 */
  note?: string
}

/** 种子预设（用于快速添加） */
export interface SeedPreset {
  seedName: string
  level: number
  /** 计时方式：cycle=真实生长周期，timer=单次倒计时 */
  mode: SeedMode
  /** timer 模式的默认生长时长（毫秒，可在界面调整）；cycle 模式忽略 */
  defaultDurationMs?: number
}

/**
 * 一种庭院种子等级的真实生长周期（参考梦幻西游电脑版资料）。
 * 计时以「种下当天 = 第 1 天」为准；结果与清除均在当日 0 点(每日重置点)生效。
 */
export interface SeedGrowthCycle {
  /** 种子等级：2/3/4（一级与自定义走 timer 模式，不在此表） */
  level: number
  /** 结果(可收获)的天数，升序，例如二级 [7, 8, 12, 13] */
  harvestDays: number[]
  /** 永久休眠 / 可用「如意符」清除并开启下一批种植的天数 */
  clearDay: number
  /** 循环间的休整(休眠)天，仅用于时间轴展示（可选） */
  restDays?: number[]
  /** 最早可能「早熟」的天数（可选，提示用） */
  earlyRipenDay?: number
}

// ----------------------------------------------------------------------------
// 副本刷新与完成追踪
// ----------------------------------------------------------------------------

export type DungeonCycle = 'daily' | 'weekly' | 'every4days'

/**
 * 一个副本。
 * - 通过 resetCycle + 周期重置点 计算「下次刷新倒计时」。
 * - lastCompletedPeriodKey 与当前周期 Key 相等即视为「本周期已完成」，刷新后自动回到未完成。
 */
export interface Dungeon {
  id: string
  name: string
  /** 刷新周期：每日 / 每周 */
  resetCycle: DungeonCycle
  /** 是否为「本期需要完成」的目标副本 */
  required: boolean
  /** 最近一次完成所属的周期 Key */
  lastCompletedPeriodKey?: string
  preset?: boolean
  note?: string
  order?: number
}

/** 副本预设 */
export interface DungeonPreset {
  name: string
  resetCycle: DungeonCycle
  note?: string
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
  /** 关键词标签（用于搜索与展示） */
  tags?: string[]
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
  /** 分类：兽决 / 五宝 / 宝石 / 珍宝 / 材料 / 其它 */
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

/** 价格观测来源：游戏聊天频道 / 摊位 */
export type PriceSource = 'chat' | 'stall'

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
// 房屋清洁度 / 耐久度（参考梦幻西游电脑版「房屋属性」）
// ----------------------------------------------------------------------------

/**
 * 房屋状态。清洁度与耐久度随时间衰减：
 *   当前值 = baseValue - decayPerDay * (距 updatedAt 的天数)，并截断到 [0, 100]。
 * 玩家指使佣人「打扫」提升清洁度、「修理」提升耐久度（两者各自独立、按佣人房等级增量）。
 *   - 耐久度官方分档：≥80 满效果(100%)，60-79=80%，30-59=60%，<30=40%，0 有几率倒塌。
 *   - 清洁度=100 时环境指数最高，卧室每日休息次数最多。
 */
export interface HouseState {
  /** 房屋名称（可选，用于多套房产场景） */
  name: string
  /** 上次记录的清洁度基准值（0-100） */
  cleanlinessBase: number
  /** 上次记录的耐久度基准值（0-100） */
  durabilityBase: number
  /** 上次更新时间（epoch 毫秒） */
  updatedAt: number
  /** 清洁度每日衰减量（官方约 4/天，家具越多越慢） */
  cleanlinessDecayPerDay: number
  /** 耐久度每日衰减量（官方约 4/天） */
  durabilityDecayPerDay: number
  /** 清洁度建议下限：高于此值为「良好」（默认 90，满收益应贴近 100） */
  cleanlinessWarnThreshold: number
  /** 耐久度建议下限：高于此值为满效果（默认 80，官方满效果线） */
  durabilityWarnThreshold: number
  /** 佣人房等级（0=无,1=普通,2=中级,3=高级），决定单次打扫/修理的恢复量 */
  servantRoomLevel: number
}

// ----------------------------------------------------------------------------
// 全局设置（周期重置点）
// ----------------------------------------------------------------------------

export interface AppSettings {
  /** 每日重置的小时（0-23），游戏内一般为 0 点 */
  dailyResetHour: number
  /** 每周重置的星期（1=周一 ... 7=周日） */
  weeklyResetWeekday: number
  /**
   * 天命副本「每 4 天刷新」的起算时刻（epoch 毫秒）。
   * 天命副本进度每 4 天刷新一次，没有固定星期，需要一个已知的刷新时刻作为基准；
   * 用户可在设置里把它对齐到自己服务器的实际刷新时间。
   */
  every4DaysAnchor: number
}

// ----------------------------------------------------------------------------
// localStorage 存储 Key（集中管理，避免各模块写错）
// ----------------------------------------------------------------------------

export const STORAGE_KEYS = {
  todos: 'mhxy.todos.v1',
  seeds: 'mhxy.seeds.v1',
  dungeons: 'mhxy.dungeons.v1',
  house: 'mhxy.house.v1',
  settings: 'mhxy.settings.v1',
  characters: 'mhxy.characters.v1',
  /** 用户自定义攻略（内置攻略来自代码，不入库） */
  guides: 'mhxy.guides.v1',
  /** 内置攻略的用户补充内容（攻略id -> Markdown） */
  guideNotes: 'mhxy.guideNotes.v1',
  /** 用户自定义物价条目（内置参考条目来自代码，不入库） */
  priceItems: 'mhxy.priceItems.v1',
  /** 物价条目的用户备注（物品id -> 备注） */
  priceComments: 'mhxy.priceComments.v1',
  /** 价格观测（OCR 识别的带时间戳记录，用于趋势） */
  priceObservations: 'mhxy.priceObservations.v1',
} as const
