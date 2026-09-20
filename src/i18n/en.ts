/**
 * English translations, keyed by the Chinese source text that `t()`/`msg()`
 * calls pass as their first argument — see src/i18n/index.ts for how a key is
 * looked up and how a miss falls back to the Chinese source itself.
 *
 * Grouped by the page that introduced each key; a key used by more than one
 * page lives in the first group that needs it. test/i18n.test.ts's guard ②
 * fails as soon as a `t()`/`msg()` source anywhere in src/ has no entry here,
 * guard ③ that a translation has kept its `{placeholders}` and picked up no
 * Chinese characters or punctuation on the way.
 *
 * The voice is the Chinese one, in English: plain, concrete, quiet. No
 * exclamation marks, no adjectives selling the product back to the reader, no
 * instruction the Chinese does not also give. Curly quotes where the Chinese
 * uses 「」; every HTML tag, `href` and placeholder exactly as the source has
 * it. 一息 stays 一息 — it is the product's name, not a word.
 */
export const EN: Record<string, string> = {
  "地址和账号验证通过；请打开目标 App 验证自动化。此检查不计入拦截。": "Address and account verified. Open the target app to test the automation. This check does not count as an interception.",
  "配置转化": "Setup conversion",
  "最近 30 天新版自助注册：{n} 个账号；其中 {pending} 个尚未满 7 天。": "New-version self-registrations in the last 30 days: {n}; {pending} are less than 7 days old.",
  "满 7 天的注册账号：{n}": "Registrations observed for 7 full days: {n}",
  "7 天内打开配置页：{value}": "Opened setup within 7 days: {value}",
  "7 天内首次拦截：{value}": "First interception within 7 days: {value}",
  "首次拦截前未打开配置页：{n}": "First interception without a preceding setup visit: {n}",
  "首拦后第 7 天仍有拦截：{value}；待观察：{pending}": "Interception on day 7 after activation: {value}; still observing: {pending}",
  "仅统计本版上线后的自助注册，排除 owner、历史账号与发号账号；其他测试账号无法自动识别。": "Only self-registrations with this release are included. Owner, historical and issued accounts are excluded; other test accounts cannot be identified automatically.",
  "打开配置页不代表完成配置。首次拦截只证明请求到达，不能证明 iOS 自动化已安装；页面诊断检查不计入。前两项均以满 7 天注册账号为分母，不要求先打开配置页。": "Opening setup does not mean setup is complete. An interception confirms a request, not an installed iOS automation; page diagnostics are excluded. Both initial rates use registrations observed for 7 full days, without requiring a setup visit first.",
  "留存以首拦后 168 至 192 小时内再次拦截为准，仅纳入已满 192 小时的首拦账号；不要求连续使用。未成熟的窗口不按零计算，分母为零显示 —。": "Retention means another interception from 168 to 192 hours after activation, counting only accounts observed for 192 full hours. Continuous use is not required. Incomplete windows are excluded; an empty denominator displays —.",

  // --- shared console chrome (src/ui/console.ts) -----------------------------
  // The three faces and their tabs. 「回看」 (goal-tending) and 「回顾」
  // (interception) are both "looking back"; English splits them into Review
  // and Log so a nav never offers the same word twice. 渡's own 「回看」 reuses
  // the Review entry — same English word, different page, no ambiguity in a
  // nav that never shows both at once.
  今日: 'Today',
  目标: 'Goals',
  回看: 'Review',
  怎么配: 'Guide',
  回顾: 'Log',
  设置: 'Settings',
  拦截: 'Breathe',
  渡: 'Surf',
  导航: 'Navigation',
  账号: 'Account',
  发号: 'Invites',

  // --- /today (src/ui/today.ts) ----------------------------------------------
  '今日 · 一息': 'Today · 一息',
  编辑目标: 'Edit goals',
  '先写一件最重要的事。': 'Write down the one thing that matters most.',
  健身: 'Exercise',
  新目标: 'New goal',
  记下: 'Note it',
  '{title}，今天打卡': '{title}, check in for today',
  '{title}，已打卡，点击取消': '{title}, checked in. Tap to undo.',
  最近七天: 'The last seven days',
  '{title}，今天勾上': '{title}, check off for today',
  '{title}，已勾上，点击取消': '{title}, checked off. Tap to undo.',
  // The Chinese pair exists only for its spacing rule (「去 B 站」 but
  // 「去微信读书」); English has one sentence for both.
  '去 {label}': 'Open {label}',
  '去{label}': 'Open {label}',
  去做: 'Go',
  '去绑一个 App，一按就开': 'Link an app, and it opens with one tap',
  '其余目标 · {n}': 'Other goals · {n}',
  '今天的事都做了。': 'That is everything for today.',
  '其余的事，明天再说。': 'The rest can wait until tomorrow.',
  '<b>添加到主屏幕</b>，以后一按就开。Safari 底部「分享」→「添加到主屏幕」。装好后第一次打开要再登录一次。':
    '<b>Add to Home Screen</b>, and it opens with one tap. In Safari, “Share” at the bottom → “Add to Home Screen”. The first time you open it from the icon you will have to sign in once more.',
  知道了: 'Got it',

  // --- /today/goals (src/ui/goals.ts) ----------------------------------------
  '目标 · 一息': 'Goals · 一息',
  '未来一段时间最重要的几件事。排前面的 {n} 个会出现在<a href="/today">今日</a>。':
    'The few things that matter most in the weeks ahead. The top {n} show up on <a href="/today">Today</a>.',
  '还没有目标。<br>用上面的 {plus} 加第一个。': 'No goals yet.<br>Use the {plus} above to add the first one.',
  加一个目标: 'Add a goal',
  添加: 'Add',
  '目标 · 一句话': 'Goal · one line',
  '什么时候做 · 可不填': 'When you do it · optional',
  // The goal's jump section folds behind this, the same way each sub-task's
  // does. Both summaries say it, so the two folds read as one idea.
  跳去哪: 'Where it jumps',
  '去做时跳去哪 · 可不填': 'Where the button jumps · optional',
  'bilibili:// 或 https://…': 'instagram:// or https://…',
  '填<b>具体那一节课、那一本书</b>的链接，比填 App 首页少走两步。自定义 scheme 填完点<b>试跳</b>，App 真打开了才算数；https 链接不用试。':
    'Link <b>the exact lesson, the exact book</b> rather than the app home screen — two steps fewer. After typing a custom scheme, <b>test it</b>: it counts only once the app really opens. An https link needs no test.',
  按钮上叫它什么: 'What the button calls it',
  '做到哪天 · 可不填': 'Until · optional',
  长期: 'Ongoing',
  保存: 'Save',
  上移: 'Up',
  下移: 'Down',
  归档: 'Archive',
  '子任务 · 每天都做': 'Sub-tasks · every day',
  '今天 {x}/{n}': 'Today {x}/{n}',
  存: 'Save',
  '这条子任务跳去哪 · 可不填': 'Where this sub-task jumps · optional',
  '不填就跟着目标走。自定义 scheme 填完点<b>试跳</b>，App 真打开了才算数；https 链接不用试。':
    'Leave it empty and it follows the goal. After typing a custom scheme, <b>test it</b>: it counts only once the app really opens. An https link needs no test.',
  '还没有。': 'None yet.',
  删: 'Delete',
  加一条子任务: 'Add a sub-task',
  子任务: 'Sub-task',
  加: 'Add',
  // How many goal cards /today puts on the page, 1…9. The label names the
  // page rather than the number, because the number is the control itself.
  今日页放几个目标: 'How many goals on Today',
  '只能是 {min} 到 {max} 之间的一个数。': 'It has to be a number between {min} and {max}.',
  '已归档 · {n}': 'Archived · {n}',
  恢复: 'Restore',
  删除: 'Delete',
  // Rendered inside an onclick="return confirm('…')", so no apostrophes here.
  '删掉这个目标？子任务会一起删，打卡记录保留。': 'Delete this goal? Its sub-tasks go with it. Check-ins are kept.',
  '<b>{title}</b> 到期了（{until}）。': '<b>{title}</b> ended on {until}.',
  续四周: 'Extend by four weeks',

  // Messages the form gives back when something will not save.
  '目标名不能空着。': 'A goal needs a name.',
  '目标名太长了，{n} 个字以内。': 'That name is too long. {n} characters at most.',
  '触发时机太长了，{n} 个字以内。': 'That is too long for “When you do it”. {n} characters at most.',
  'App 名太长了，{n} 个字以内。': 'That app name is too long. {n} characters at most.',
  '跳转目标太长了。': 'That link is too long.',
  '跳转目标要长成 xxx:// 或 https:// 的样子，而且不能是脚本。':
    'The link has to look like xxx:// or https://, and it cannot be a script.',
  '日期要写成 2026-10-11 这样。': 'Write the date like 2026-10-11.',
  '表单没读出来，重试一次。': 'The form did not come through. Try again.',
  '目标编号不对。': 'That goal number is not right.',
  '子任务要有名字，{n} 个字以内。': 'A sub-task needs a name. {n} characters at most.',
  '子任务编号不对。': 'That sub-task number is not right.',
  '不认识这个操作。': 'That is not an action this page knows.',
  '先归档，再删除。': 'Archive it first, then delete it.',

  // --- /today/review (src/ui/progress.ts) ------------------------------------
  '回看 · {name}': 'Review · {name}',
  今天: 'Today',
  '最近 {days} 天': 'The last {days} days',
  最近三十天每天的完成比例: 'How much of each day was done, over the last thirty days',
  // Counted things, and every count can be 1. English agreement would make
  // 「1 days have a record」 out of the natural phrasing, so these read as a
  // stat line instead — the number is the answer, and no verb has to agree
  // with it. The Chinese is unchanged; it never had the problem.
  '{days} 天里有记录的 {n} 天，做完全部的 {full} 天。':
    'Of {days} days: {n} with a record, {full} done in full.',
  每个目标: 'Each goal',
  '没有正在进行的目标。': 'No goals running right now.',
  这周: 'This week',
  '做了 <b class="num">{n}</b> 次子任务。': 'Sub-tasks checked: <b class="num">{n}</b>.',
  '拦截那边的记录在<a href="/review">回顾</a>。':
    'Breathe keeps its own record under <a href="/review">Log</a>.',
  '{n} 天 · 打卡 {x} 天': '{n}-day span · {x} checked',
  '还没有可以回看的。先去<a href="/today">今日</a>记下一件事。':
    'Nothing to look back on yet. Go to <a href="/today">Today</a> and write down one thing.',

  // --- /today/setup (src/ui/todaysetup.ts) -----------------------------------
  '怎么配 · 一息': 'Guide · 一息',
  // The address itself is a copy line at the top of the page now, so neither
  // step repeats it: an address printed three times is three chances to copy
  // the wrong one of them.
  // No article: this is both the quiet label above the line and the {name} in
  // the button's 「复制{name}」, and 「Copy The address of the Today page」 is
  // not a thing a screen reader should have to read out.
  今日页的网址: 'Today page address',
  '<b>添加到主屏幕</b>。Safari 打开上面这条网址，底部「分享」→「添加到主屏幕」。\n    之后点图标就是全屏、没有地址栏。装好后第一次打开要<b>再登录一次</b>——主屏幕里的它和 Safari 不共享登录，登一次管半年。':
    '<b>Add to Home Screen</b>. Open the address above in Safari, then “Share” at the bottom → “Add to Home Screen”. Tapping the icon after that is full screen, with no address bar. The first time you open it you will have to <b>sign in once more</b> — the copy on the home screen does not share a login with Safari, and one sign-in lasts half a year.',
  '<b>快捷指令入口</b>。「快捷指令」App 新建一条，只放一个动作「打开 URL」，网址填上面这条网址。\n    然后三选一：主屏幕长按→小组件→「快捷指令」，把它放上去；iPhone 15 Pro 以上在「设置→操作按钮」里绑它；\n    或「设置→辅助功能→触控→轻点背面」绑它。':
    '<b>A shortcut</b>. In the Shortcuts app, make one with a single action, “Open URL”, pointing at the address above. Then pick one of three: long-press the home screen → Widgets → “Shortcuts” and put it there; on iPhone 15 Pro and later bind it under “Settings → Action Button”; or bind it under “Settings → Accessibility → Touch → Back Tap”.',
  '<b>每天早上自动打开</b>。「快捷指令」→「自动化」→「特定时间」，选每天早上的时刻，运行上面那条，\n    关掉「运行前询问」。这就是提醒，不用推送。':
    '<b>Open it by itself every morning</b>. “Shortcuts” → “Automation” → “Time of Day”, pick a time in the morning, run the shortcut above, and turn off “Ask Before Running”. That is the reminder, with no notification involved.',
  '拦截那边的配置在<a href="/setup">这里</a>。': 'Breathe is set up <a href="/setup">here</a>.',

  // --- the breathing page (src/ui/breathe.ts) --------------------------------
  // 「算了」 is the loud, filled button and 「继续打开」 the quiet underlined
  // link 800ms later; English has to keep that asymmetry audible, so the exit
  // is the short everyday phrase and proceeding is the one that admits what it
  // is. The four parting lines are one each for a quarter of the sids — plain,
  // no praise, no lecture.
  '好，就到这里。': 'All right. That is far enough.',
  '这一次，你没有点进去。': 'This time you did not go in.',
  '省下来的几分钟是你的。': 'The few minutes you saved are yours.',
  '放下就好。': 'Putting it down is enough.',
  '这个链接过期了。': 'This link has expired.',
  '回到主屏幕重新打开就好。': 'Go back to the home screen and open it again.',
  吸气: 'Inhale',
  呼气: 'Exhale',
  '可以锁屏了。': 'You can lock the screen now.',
  '正在打开{label}……': 'Opening {label}…',
  '没有反应的话，回主屏幕手动打开就好。': 'If nothing happens, go back to the home screen and open it yourself.',
  '这个 App 还没配 URL scheme，手动打开就好。': 'This app has no URL scheme set up yet. Open it yourself.',
  '你正要打开<b>{label}</b>': 'You are about to open <b>{label}</b>',
  呼吸引导: 'Breathing guide',
  算了: 'Never mind',
  继续打开: 'Open it anyway',
  '这一页需要 JavaScript。回到主屏幕重新打开就好。':
    'This page needs JavaScript. Go back to the home screen and open it again.',

  // --- the two skins (src/ui/layout.ts) --------------------------------------
  // What the /mock switcher calls them: 「墨」 the wash of ink, 「息」 the ring
  // and the dot.
  墨: 'Ink',
  息: 'Breath',

  // --- /mock (src/ui/mock.ts) ------------------------------------------------
  // The example label a visitor sees when they have not named one themselves —
  // 「小红书」 for a Chinese reader, an app an English reader would actually
  // have for the other. A label somebody typed is data and is never touched.
  '这里会跳回{label}。': 'This is where it would jump back to {label}.',
  '预览页不跳转。': 'A preview page goes nowhere.',
  小红书: 'Instagram',
  视觉预览: 'Visual preview',
  预览: 'Preview',
  再看一次: 'Again',

  // --- the landing page (src/ui/landing.ts) ----------------------------------
  // The one page written for a stranger, and the only indexable one, so the
  // title and the meta description are copy too. 一息 keeps its characters; the
  // first mention in English carries 「yixi」 beside it so it can be said out
  // loud.
  '一息 —— 打开 App 之前先呼吸十秒，「今日」收好最重要的三件事':
    '一息 (yixi) — ten seconds of breathing before an app opens, and “Today” for the three things that matter most',
  '在 iPhone 上打开小红书这类 App 之前，先看着一团墨呼吸十秒，然后再决定进不进去；「今日」一页则收好未来一段时间最重要的三件事，一按就去做。自建的 One Sec 替代品：一个网页加 iOS 快捷指令，不用装 App，跑在 Cloudflare 免费额度里。':
    'Before an app like Instagram opens on an iPhone, watch a wash of ink and breathe for ten seconds, then decide whether to go in. “Today” holds the three things that matter most in the weeks ahead, one tap from being done. A self-hosted One Sec alternative: one web page plus an iOS Shortcut, no app to install, running inside the Cloudflare free tier.',
  '在你打开一个 App 之前，先呼吸十秒。': 'Ten seconds of breathing before you open an app.',
  '一息做两件事。<b>拦</b>：打开小红书这类 App 之前先呼吸十秒。<b>引</b>：把未来一段时间最重要的三件事放在<a href="/today">今日</a>一页，一按就去做。两件事各自能用，共用一个账号。':
    '一息 (yixi) does two things. <b>Breathe</b>: ten seconds before an app like Instagram opens. <b>Steer</b>: the three things that matter most in the weeks ahead sit on one page, <a href="/today">Today</a>, one tap from being done. Either half works on its own, and they share one account.',
  '这一页是从某个 App 的内置浏览器打开的。\n逛可以，<b>但配置那一步不行</b>——内置浏览器不让网页跳去别的 App，而配置里要靠这个验证。\n点右上角的「⋯」，选「在浏览器中打开」。':
    'This page was opened inside the built-in browser of some app.\nReading is fine, <b>but the setup step is not</b> — a built-in browser will not let a page jump to another app, and setup depends on exactly that.\nTap the “⋯” in the top-right corner and choose “Open in browser”.',
  '呼吸页示意：一团墨随呼吸涨落，外圈是倒计时':
    'A look at the breathing page: a wash of ink swelling and fading with the breath, the ring outside it counting down',
  '十秒之后，页面先递给你「算了」，过一会儿才递给你「继续」。\n顺序是故意的——大多数时候你会发现，那一下其实只是手指的惯性。':
    'Ten seconds in, the page offers you “Never mind” first, and only a little later “Open it anyway”.\nThe order is deliberate — most of the time you find the tap was nothing but the habit in your thumb.',
  怎么工作: 'How it works',
  'iPhone 的「快捷指令」在你打开某个 App 时，先来这里问一句该不该拦。':
    'The iPhone Shortcuts app comes here first when you open an app, and asks whether to stop you.',
  '该拦就跳到呼吸页，倒计时期间没有任何按钮可以点。':
    'If the answer is yes, it jumps to the breathing page, where nothing can be tapped while the ring fills.',
  '选「继续」会放行一分半，免得刚跳回去又被自己拦住。':
    'Choosing “Open it anyway” lets the app through for a minute and a half, so you are not stopped again the moment you land in it.',
  它记什么: 'What it records',
  '只记时间、哪个 App、以及你那次是继续了还是放下了。\n过一阵你能看到自己一周被拦了多少次，其中多少次没进去。':
    'Only the time, which app, and whether you went on or put it down.\nAfter a while you can see how many times a week you were stopped, and how many of those you walked away from.',
  关于隐私: 'On privacy',
  '注册只要一个邮箱和一个密码。邮箱不发信、不验证，只是你下次登录的用户名。':
    'Signing up takes an email address and a password. Nothing is ever sent to the address and it is never verified; it is only the name you sign in with next time.',
  '真正的身份是一把 token，快捷指令拿它认人。它加密存在服务器上，\n所以你登录之后还能看回来——代价是数据库和密钥同时泄露时它会跟着泄。\n这是为了「忘了也找得回来」换的，值不值得你自己判断。':
    'The real identity is a token, and the Shortcut uses it to know who you are. It is stored encrypted on the server,\nso you can still read it back after signing in — the price is that it leaks along with the database if the key leaks at the same time.\nThat is the trade made for “findable again after you forget it”, and whether it is worth it is yours to judge.',
  '记录只有你自己看得到。发号的人只看得到聚合次数，看不到任何一条明细——\n不然这东西没人会真的用。':
    'Your records are yours alone. Whoever handed out the token sees aggregate counts and not one single entry —\notherwise nobody would really use this.',
  '上面这几句都可以自己核对：<a href="https://github.com/Defiabell/yixi" rel="noreferrer">代码是开源的</a>。\n不想把这类数据放在别人的服务器上，照 README 部署一份自己的，\n跑在 Cloudflare 免费额度里，不花钱。':
    'You can check every line above for yourself: <a href="https://github.com/Defiabell/yixi" rel="noreferrer">the code is open source</a>.\nIf you would rather not leave this kind of data on somebody else’s server, follow the README and deploy your own,\nrunning inside the Cloudflare free tier, at no cost.',
  长什么样: 'What it looks like',
  '上面那团就是。倒计时期间页面上没有任何按钮，十秒之后才先出现「算了」。\n<span class="looks">整页看看：<a href="/mock?v=1">墨</a><a href="/mock?v=2">息</a></span>':
    'That is the one above. Nothing on the page can be tapped while the ring fills; ten seconds in, “Never mind” appears first.\n<span class="looks">See a whole one: <a href="/mock?v=1">Ink</a><a href="/mock?v=2">Breath</a></span>',
  开始用: 'Getting started',
  注册: 'Sign up',
  登录: 'Sign in',
  '已经有别人发给你的 token 了？<a href="/claim">给它绑上邮箱和密码</a>，别重新注册——\n重新注册会拿到一把新的，旧记录就找不回来了。<br>\n配到 iPhone 上的一步一步说明在<a href="/setup">怎么配</a>，登录之后打开就行。<br>\n源码 · <a href="https://github.com/Defiabell/yixi" rel="noreferrer">github.com/Defiabell/yixi</a>':
    'Already have a token somebody sent you? <a href="/claim">Attach an email address and a password to it</a> rather than signing up again —\nsigning up again hands you a new one, and the old records are out of reach.<br>\nThe step-by-step for setting it up on an iPhone is under <a href="/setup">Guide</a>, once you have signed in.<br>\nSource · <a href="https://github.com/Defiabell/yixi" rel="noreferrer">github.com/Defiabell/yixi</a>',

  // --- the account pages (src/ui/account.ts) ---------------------------------
  // The four pages a stranger or a signed-in reader meets around their own
  // account. 「token」 stays 「token」 in both languages — it is the word the
  // Shortcut, the docs and the /setup tutorial all already use.
  '注册 · 一息': 'Sign up · 一息',
  '注册之后你会拿到一把 <b>token</b>。iPhone 的「快捷指令」拿它认出你，你被拦下的每一条记录也都记在它名下。它就是这个账号本身。':
    'Signing up hands you a <b>token</b>. The iPhone Shortcuts app knows you by it, and every time you are stopped the record is filed under it. It is the account itself.',
  先说清楚代价: 'The price, up front',
  '这里<b>没有邮件服务</b>。邮箱不发信、不验证，也不能用来找回密码——它只是你下次登录时的用户名。':
    'There is <b>no mail service here</b>. Nothing is ever sent to the address, it is never verified, and it cannot recover a password — it is only the name you sign in with next time.',
  '能救你的是两样东西，它们互为备份：': 'Two things can save you, and each is the other’s backup:',
  '<b>忘了密码</b> —— 用 token 重置。在<a href="/recover">重置那一页</a>把 token 贴进去，直接设一个新的。':
    '<b>Forgot the password</b> — reset it with the token. Paste the token into <a href="/recover">the reset page</a> and set a new one there and then.',
  '<b>忘了 token</b> —— 用密码登录，账号页上点一下就能看到它。它是加密存在服务器上的。':
    '<b>Forgot the token</b> — sign in with the password and one tap on the account page shows it. It is stored encrypted on the server.',
  '<b>两样都丢了</b> —— <b>没有办法</b>。没有验证邮件、没有客服、没有后门。这个账号连同里面所有记录都拿不回来，只能重新注册一个空的。':
    '<b>Lost both</b> — <b>there is nothing to be done</b>. No verification mail, no support desk, no back door. The account and every record in it are out of reach, and all that is left is to register an empty one.',
  '这个闭环是故意做成这样的：一个自己用的小工具不值得为它接一整套邮件系统，代价就是你得自己留住其中一样。注册完先把 token 存进密码管理器，一分钟的事。':
    'The loop is deliberate: a small tool you run for yourself is not worth wiring a whole mail system into, and the price is that keeping one of the two is your job. Once you have signed up, put the token in a password manager — it takes a minute.',
  '名字 · 选填，只显示在这几个页面上': 'Name · optional, shown only on these pages',
  '留空就用邮箱 @ 前面那截': 'Left empty, the part before the @',
  '密码 · 至少 {min} 位': 'Password · {min} characters or more',
  再打一遍: 'Type it again',
  '已经有账号了？<a href="/login">登录</a>。<br>\n手里已经有一把别人发给你的 token？<a href="/claim">给它绑上邮箱和密码</a>，别在这里重新注册——重新注册会拿到一把新的，旧记录就找不回来了。':
    'Already have an account? <a href="/login">Sign in</a>.<br>\nAlready holding a token somebody sent you? <a href="/claim">Attach an email address and a password to it</a> rather than signing up here — signing up again hands you a new one, and the old records are out of reach.',
  '邮箱 · 只当用户名用，不发信': 'Email · used as a username, never written to',
  '人机验证需要 JavaScript，请先在浏览器里打开它。': 'The human check needs JavaScript. Turn it on in your browser first.',
  '人机验证没过。刷新这一页，重新验证一次。': 'The human check did not pass. Refresh this page and take it again.',
  '两次输入的密码不一样，再来一次。': 'The two passwords do not match. Try again.',
  '去登录 →': 'Sign in →',

  '登录 · 一息': 'Sign in · 一息',
  '登录只是为了让你在这几个页面上看到自己的记录和 token。快捷指令那边不受影响，它认的一直是 token。':
    'Signing in is only so that you can see your own records and your own token on these pages. It changes nothing for the Shortcut, which has always known you by the token.',
  密码: 'Password',
  '忘了密码？<a href="/recover">用 token 重置</a>。<br>\n还没有账号？<a href="/register">注册一个</a>。':
    'Forgot the password? <a href="/recover">Reset it with the token</a>.<br>\nNo account yet? <a href="/register">Sign up</a>.',

  '绑定 · 一息': 'Attach · 一息',
  '给已有的 token 绑账号': 'Attach an account to a token you already have',
  '你手里那把 token 是发号时代给出去的，只有哈希存在服务器上。绑一次邮箱和密码，以后忘了它就能登录看回来。':
    'The token you hold was handed out in the ticket-window days, and the server keeps only its hash. Attach an email address and a password once, and if you forget it you can sign in and read it back.',
  'token · 32 位十六进制，粘贴进来': 'token · 32 hex characters, pasted in',
  '名字 · 选填，留空就沿用现在这个': 'Name · optional, left empty it keeps the current one',
  绑定: 'Attach',
  'token 本身不变，快捷指令不用改。绑定只是多给这个账号一条登录的路。':
    'The token itself does not change and the Shortcut needs no edit. Attaching only adds one more way into this account.',
  '没有 token，只是想开始用？<a href="/register">注册一个新的</a>。':
    'No token, and you just want to start? <a href="/register">Sign up for a new one</a>.',

  '重置密码 · 一息': 'Reset password · 一息',
  '用 token 重置密码': 'Reset the password with the token',
  '这里不发验证邮件。能证明你是你的，是你手里那把 token——它是 128 位随机数，比一封能被人翻走的邮件更硬。':
    'No verification mail is sent here. What proves you are you is the token in your hands — 128 random bits, harder than a mail somebody else can go through.',
  '新密码 · 至少 {min} 位': 'New password · {min} characters or more',
  重置并登录: 'Reset and sign in',
  'token 一般在你当初配快捷指令时那条「文本」动作里，或者在你的密码管理器里。重置之后 <b>token 不变</b>，快捷指令照常工作；但所有已经登录的浏览器都会被踢下线，只留你手上这一个。':
    'The token is usually in the “Text” action of the Shortcut you set up, or in your password manager. After a reset <b>the token is unchanged</b> and the Shortcut keeps working, but every browser already signed in is dropped, apart from the one in your hands.',
  'token 也丢了？那这个账号真的回不来了，只能<a href="/register">重新注册一个空的</a>。<br>\n密码想起来了？<a href="/login">去登录</a>。':
    'Lost the token as well? Then this account really is gone, and all that is left is to <a href="/register">register an empty one</a>.<br>\nRemembered the password? <a href="/login">Sign in</a>.',

  '账号 · {name}': 'Account · {name}',
  还没有绑定邮箱: 'No email address attached yet',
  '加入于 <span class="num">{date}</span>': 'Joined <span class="num">{date}</span>',
  语言: 'Language',
  '注册好了。别急着走——先点下面的「显示」，把 token 存进密码管理器。':
    'You are signed up. Before you go, tap “Show” below and put the token in a password manager.',
  '绑好了。以后忘了 token 就用邮箱和密码登录，在这一页看回来。':
    'Attached. If you forget the token, sign in with the email address and password and read it back on this page.',
  '密码已经重置，其他设备上的登录都被踢掉了。': 'The password is reset, and every sign-in on other devices was dropped.',
  '密码改好了。其他设备上的登录都被踢掉了，这台还在。':
    'The password is changed. Every sign-in on other devices was dropped; this one is still here.',
  '你的 token': 'Your token',
  '快捷指令用它认出你，它也是你所有记录的钥匙。别截图，别贴进聊天框。':
    'The Shortcut knows you by it, and it is the key to every record you have. Do not screenshot it, do not paste it into a chat.',
  显示: 'Show',
  '要把它配进 iPhone，去<a href="/setup">怎么配</a>——那一页已经替你把完整的地址拼好了，照抄就行。':
    'To put it on an iPhone, go to <a href="/setup">Guide</a> — that page has already assembled the whole address, ready to copy.',
  '服务器这边打不开你的 token 原文，只存着它的哈希。<br>它照常能用，只是这里看不到。':
    'This server cannot open the plaintext of your token; it holds only the hash.<br>The token still works — it just cannot be shown here.',
  用它绑一次账号: 'Attach an account with it',
  复制: 'Copy',
  藏起来: 'Hide it',
  已复制: 'Copied',
  '已选中，长按拷贝': 'Selected — press and hold to copy',
  // The same two words for the shared copy line (src/ui/layout.ts), which has
  // to fit them into a button beside a URL in a table cell at 390px rather
  // than under a token card with a whole row to itself. 「复制{name}」 is the
  // button's aria-label: six 「复制」 in a column are one word six times to a
  // screen reader.
  长按拷贝: 'Hold to copy',
  '复制{name}': 'Copy {name}',
  '换一把新 token': 'Swap in a new token',
  '泄漏了才需要这么做。<b>旧 token 立刻失效</b>，你手机上每一条用到它的快捷指令都得把网址里的\n  <span class="mono">k=</span> 换成新的，改完之前那些 App 不会再被拦。改密码不会换 token，两者互不影响。':
    'Only needed if it has leaked. <b>The old token stops working at once</b>, and every Shortcut on your phone that uses it needs the\n  <span class="mono">k=</span> in its address replaced; until you do, those apps go unstopped. Changing the password does not change the token — the two are independent.',
  当前密码: 'Current password',
  换一把: 'Swap it',
  '新 token': 'The new token',
  '<b>只显示这一次。</b>现在就存进密码管理器，然后去把快捷指令里的网址换掉。':
    '<b>Shown this once only.</b> Put it in a password manager now, then go and replace the address in your Shortcuts.',
  '旧的那把已经不认了。去<a href="/setup?show=1">怎么配</a>拿现成的整行网址。':
    'The old one is not recognised any more. Go to <a href="/setup?show=1">Guide</a> for the whole address, ready to copy.',
  改密码: 'Change the password',
  保存新密码: 'Save the new password',
  '改密码不会换掉 token，快捷指令不用动。但其他设备上的登录会全部失效，只留你手上这一个。':
    'Changing the password does not change the token, and the Shortcut needs no edit. Every sign-in on other devices does stop working, apart from the one in your hands.',
  给它绑上邮箱和密码: 'Attach an email address and a password to it',
  还没有密码: 'No password yet',
  '这个账号是发号时代建的，只有一把 token，没有邮箱也没有密码。现在这样也能用，但 token 一丢就没了。':
    'This account was made in the ticket-window days: one token, no email address and no password. It works as it is, but lose the token and it is gone.',
  退出登录: 'Sign out',
  '退出只清掉这台设备上的登录状态。快捷指令照常拦你——它认的是 token，不是这个登录。':
    'Signing out clears the sign-in on this device only. The Shortcut goes on stopping you — what it knows you by is the token, not this session.',
  '不想把这些记录放在别人的服务器上？\n    <a href="https://github.com/Defiabell/yixi" rel="noreferrer">源码在这里</a>，\n    照 README 部署一份自己的，跑在 Cloudflare 免费额度里。':
    'Would you rather these records did not sit on somebody else’s server?\n    <a href="https://github.com/Defiabell/yixi" rel="noreferrer">The source is here</a>;\n    follow the README and deploy your own, running inside the Cloudflare free tier.',

  // --- what src/account.ts hands back when something will not save ----------
  '这个邮箱看着不对，检查一下。': 'That address does not look right. Check it.',
  '密码至少 {min} 位，最多 {max} 位。': 'A password is {min} characters at least and {max} at most.',
  '名字不能是空的，也别超过 {max} 个字。': 'A name cannot be empty, and cannot run past {max} characters.',
  '这个邮箱已经注册过了，直接登录。': 'That address is already registered. Sign in instead.',
  '邮箱或密码不对。': 'That address or password is wrong.',
  '这个 token 不对。': 'That token is not right.',
  '这个 token 还没绑定邮箱和密码，先去绑定。':
    'That token has no email address or password attached yet. Attach them first.',
  '这个 token 已经绑过账号了，直接登录，或者用它重置密码。':
    'That token already has an account. Sign in, or use it to reset the password.',
  '当前密码不对。': 'That is not the current password.',

  // --- /settings (src/ui/settings.ts) ---------------------------------------
  '设置 · 一息': 'Settings · 一息',
  '要拦哪些 App': 'Which apps to stop',
  '每条对应 iPhone 上一条「打开 App 时」自动化。改完立刻生效，不用重建快捷指令。':
    'Each row matches one “When App Is Opened” automation on the iPhone. A change takes effect at once, with no Shortcut to rebuild.',
  '已保存 <span class="mono">{app}</span>。': 'Saved <span class="mono">{app}</span>.',
  '已在拦 · {n}': 'Being stopped · {n}',
  '还没有配置任何 App。<br>用上面的 {plus} 加第一个。':
    'No apps configured yet.<br>Use the {plus} above to add the first one.',
  // 「{escape}」 is src/inapp.ts quoting the host app's own menu, so it stays in
  // that app's language — all seven are Chinese-only apps — and so does
  // 「{name}」, which is what their icon says on the phone.
  '你现在是在<b>{name}</b>内置的浏览器里。它不让网页跳去别的 App，所以这一页的\n    <b>试跳</b>按不出反应——<b>不是你的 scheme 填错了</b>。{escape}，用 Safari 打开这一页再试。\n    <br>真正拦你的时候不受影响：快捷指令打开的是系统默认浏览器，不经过{name}。':
    'You are inside the browser built into <b>{name}</b>. It will not let a page jump to another app, so <b>test it</b> on this page\n    does nothing at all — <b>your scheme is not wrong</b>. {escape}, then open this page in Safari and try again.\n    <br>What actually stops you is unaffected: the Shortcut opens the system default browser, which does not go through {name}.',
  '加一个 App': 'Add an app',
  'App 键 · 自动化里要手打的那行文本，小写': 'App key · the line you type in the automation, lowercase',
  // The example key in the App-key box. A key is the reader's own invention —
  // it only has to match the text they type into their own Shortcut — so this
  // is a suggestion, not a contract, and it may name an app an English reader
  // would have.
  xhs: 'instagram',
  'URL scheme · 点「继续」时用它跳回 App，<b>务必先实测</b>':
    'URL scheme · what “Open it anyway” jumps back to, <b>test it before you trust it</b>',
  '显示名 · 呼吸页上会看到': 'Display name · what the breathing page shows',
  已停用: 'Off',
  '删掉这条配置？已经记下的次数不会被删。': 'Delete this row? The counts already recorded stay.',
  '等待 · 秒': 'Wait · seconds',
  '免打扰 · 秒': 'Quiet · seconds',
  '「免打扰」建议 <span class="num">90</span> 秒。设得太短（几秒）会让你<b>刚跳回 App 就又被拦</b>。':
    '“Quiet” is best at <span class="num">90</span> seconds. Set it to a few seconds and you are <b>stopped again the moment you land in the app</b>.',
  它到底管什么: 'What it actually covers',
  '<p>点了「继续」之后这段时间内不再拦你。它同时解决了跳回 App 会再次触发自动化的死循环——这段时间内的触发算机器噪音，不进统计。</p>':
    '<p>For that long after you choose “Open it anyway”, you are not stopped again. It also settles the loop where jumping back into the app fires the automation once more — a trigger inside that window counts as machine noise and stays out of the statistics.</p>',
  启用拦截: 'Stop me before this app',
  'App 键只能用小写字母、数字、- 和 _，最长 32 位。它要和你在快捷指令自动化里手打的那行文本一模一样。':
    'An app key is lowercase letters, digits, - and _, up to 32 characters. It has to match the line you type in the Shortcuts automation exactly.',
  '显示名不能空着。': 'A display name cannot be empty.',
  '显示名太长了，40 个字以内。': 'That display name is too long. 40 characters at most.',
  'URL scheme 不能空着。不知道填什么就先随便填一个候选，再去「实测」页试。':
    'A URL scheme cannot be empty. If you do not know what goes here, put in any candidate and test it.',
  'URL scheme 太长了。': 'That URL scheme is too long.',
  'URL scheme 要长成 xxx:// 的样子，比如 someapp://。':
    'A URL scheme has to look like xxx://, for instance someapp://.',
  '这个 scheme 不能用。': 'That scheme cannot be used.',
  '等待秒数要是 1 到 120 之间的整数。': 'The wait has to be a whole number of seconds, 1 to 120.',
  '免打扰秒数要是 {min} 到 3600 之间的整数。太短会让你刚跳回 App 就又被拦。':
    'The quiet window has to be a whole number of seconds, {min} to 3600. Too short and you are stopped again the moment you land in the app.',
  '要删除的 App 键不对。': 'That is not an app key this page can delete.',
  '已经有一条 {key} 了。要改它就展开下面那条，别在这里重新加一遍——直接加会把它的秒数一起覆盖掉。':
    'There is already a row for {key}. Open that row below to change it rather than adding it again here — adding it again would overwrite its seconds too.',

  // --- getting out of an in-app browser (src/inapp.ts) ----------------------
  // Quoted menu items, in apps whose menus are Chinese. The English says what
  // to tap and what it will say, rather than pretending the menu is English;
  // the app names themselves are data and never come through here.
  '点右上角「⋯」→「在浏览器中打开」': 'Tap “⋯” in the top-right corner → “Open in browser”',
  '点右上角「⋯」→「在浏览器打开」': 'Tap “⋯” in the top-right corner → “Open in browser”',
  '点右上角「⋯」→「用默认浏览器打开」': 'Tap “⋯” in the top-right corner → “Open in default browser”',
  '点右上角分享 →「用浏览器打开」': 'Tap “Share” in the top-right corner → “Open in browser”',
  '点右上角「⋯」→「在 Safari 中打开」': 'Tap “⋯” in the top-right corner → “Open in Safari”',

  // --- the scheme field and its picker (src/ui/schemefield.ts) --------------
  // The worked examples are apps an English reader would actually have, same
  // rule as /today's 「健身」. Both schemes are real.
  '例：小红书 <code class="mono">xhsdiscover://</code>，起点读书 <code class="mono">QDReader://</code>。候选都<b>没验证过</b>，填完必须点<b>试跳</b>，App 真打开了才算数。':
    'For instance Instagram <code class="mono">instagram://</code>, Reddit <code class="mono">reddit://</code>. No candidate here is <b>verified</b>, so once you have filled one in you have to tap <b>test it</b> — it counts only when the app really opens.',
  试跳: 'Test it',
  '不知道填什么？按 App 名字找': 'Not sure what goes here? Search by app name',
  起点读书: 'Reddit',
  '按 App 名字搜索候选': 'Search candidates by app name',
  找: 'Search',
  // The three tiers a candidate is labelled with, shortest first — they sit in
  // a badge beside a seal and must not wrap.
  实测过: 'Tested',
  清单里有: 'On a list',
  猜的: 'A guess',
  两份清单一致: 'Two lists agree',
  '建议 App 键': 'Suggested app key',
  用这个: 'Use this',
  '表里没有这个 App。下面几条是<b>从 App Store 的 bundle id 猜出来的</b>，没人验证过 —— 一定要先试跳。':
    'This app is not in the table. The rows below are <b>guessed from the bundle id in the App Store</b> and verified by nobody — test one before you trust it.',
  '没找到这个 App。可以自己在上面的格子里填一个 scheme，再点<b>试跳</b>试试。':
    'This app was not found. You can put a scheme into the box above yourself and tap <b>test it</b>.',
  'App Store 拒了我们这次查询（它会拒绝 Cloudflare 的出口地址）。表里没有的 App 只能自己找 scheme。':
    'The App Store refused this query — it turns away Cloudflare’s outbound addresses. For an app that is not in the table, finding the scheme is yours to do.',
  '连 App Store 超时了。过一会儿再试，或者自己填一个 scheme 直接试跳。':
    'The App Store timed out. Try again in a while, or fill in a scheme yourself and test it.',
  'App Store 返回的内容看不懂。自己填一个 scheme 直接试跳也行。':
    'What the App Store returned could not be read. Filling in a scheme yourself and testing it works too.',
  '名字太短了，多打几个字。': 'That name is too short. Type a few more characters.',
  '这次没查成。': 'This search did not get through.',
  '先填 App 的名字。': 'Type the app name first.',
  '找…': 'Searching…',
  '没查成，网络或者服务的问题。自己填一个 scheme 直接试跳也行。':
    'The search did not get through — a network or a service problem. Filling in a scheme yourself and testing it works too.',
  '这条不像能跳的 scheme。': 'This does not look like a scheme that can be opened.',
  '这个不像能跳的 scheme，形状要是 xxx:// 。':
    'This does not look like a scheme that can be opened; the shape is xxx:// .',
  '先填一个 scheme。': 'Fill in a scheme first.',

  // --- /review (src/ui/review.ts) -------------------------------------------
  // The interception ledger. 「忍住」 is a deliberate walk-away and 「没做选择」
  // is the page being swiped past, and English has to keep those apart — the
  // whole honesty of the page is that the second is not counted as the first.
  '回顾 · {name}': 'Log · {name}',
  '今天还没有被拦下过。': 'Nothing has stopped you today.',
  次拦下: 'times stopped',
  忍住: 'Held',
  没做选择: 'No choice',
  进去了: 'Went in',
  '「忍住」是明确点了「算了」；「没做选择」是开了呼吸页直接切走——同样没进 App，但不算你主动放弃，所以分开记。':
    '“Held” is having tapped “Never mind”; “No choice” is the breathing page opening and being swiped away — the app went unopened either way, but only the first was a decision, so they are counted apart.',
  '这七天一次都没被拦下。': 'Nothing stopped you in these seven days.',
  '共 <b class="num">{n}</b> 次拦下，忍住 <b class="num">{hold}</b> 次，放弃率 <b class="num">{rate}</b>。':
    'stops in all: <b class="num">{n}</b>, held: <b class="num">{hold}</b>, walk-away rate: <b class="num">{rate}</b>.',
  '{date}：拦下 {n} 次，忍住 {hold}，没做选择 {idle}，进去了 {go}':
    '{date}: stopped {n}, held {hold}, no choice {idle}, went in {go}',
  '哪个 App 最消耗你': 'Which app costs you most',
  '这 {days} 天还没有记录。': 'No record in these {days} days yet.',
  '最近 {days} 天，按拦下次数排。': 'The last {days} days, ordered by how often you were stopped.',
  '<b class="num">{n}</b> 次': 'stops: <b class="num">{n}</b>',
  '忍住 {hold} · 没做选择 {idle} · 进去了 {go}': 'Held {hold} · no choice {idle} · went in {go}',
  '放弃率 {rate}': 'Walk-away rate {rate}',
  '其中 {idle} 次开了呼吸页但没做选择，{go} 次撑过等待还是进去了。':
    'Of those, {idle} opened the breathing page without choosing, and {go} sat through the wait and went in anyway.',
  '这 {days} 天没有记录。': 'No record in these {days} days.',
  次忍住: 'times held',
  放弃率: 'walk-away rate',
  有记录的天: 'days with a record',
  '记录始于 {date}。': 'Records begin {date}.',
  '另有 {n} 次是点「继续」跳回 App 时自动化重复触发的，属于机器噪音，未计入以上任何数字。':
    'Plus {n} from the automation firing again as “Open it anyway” jumped back into the app — machine noise, counted in none of the numbers above.',
  '这页只有你能看到。': 'This page is yours alone.',
  还没有记录: 'No records yet',
  '你还没有被拦下过一次。': 'You have not been stopped even once.',
  '先去 <a href="/settings">设置</a> 添加要拦的 App，再在 iPhone「快捷指令」里为它建一条「打开 App 时」自动化。之后每一次冲动都会记在这里。':
    'Go to <a href="/settings">Settings</a> first and add an app to stop, then build it a “When App Is Opened” automation in the iPhone Shortcuts app. After that every impulse is recorded here.',

  // --- scheme caveats (src/schemes.ts) ---------------------------------------
  // The reason to distrust one particular candidate, shown under it in the
  // picker on /settings. These sentences are what keep a guess from being read
  // as an answer, so they are the last copy in the product that could be left
  // untranslated. Two things stay verbatim because they are strings somebody
  // types or looks for rather than words: scheme tokens (`kwai`, `gifshow`,
  // `moble`, the `-iphone` suffix) and bundle-id vocabulary
  // (`App/Store/iPhone`). The Chinese 「数字」 standing in for a run of digits is
  // *not* one of them — it is prose, and English says so in square brackets:
  // `tencent[digits]://`. Angle brackets are deliberately not reused for it.
  // `<数字>` was carried into English verbatim for a while because guard ③'s
  // `TAG_RE` matched any `<…>` and tag parity then pinned it; the regex now
  // asks for an HTML tag name, and `<digits>` would walk straight back into
  // that trap because `digits` is a tag name as far as any regex can tell.
  // App names are given in the spelling the table's own `aliases` already use,
  // so a reader can find the row being pointed at.
  'iOS-URL-Scheme 把这一条同时记给了「火山小视频」。两个 App 不可能共用一个 scheme，所以至少有一条是抄错的。':
    'iOS-URL-Scheme files this same string under Huoshan as well. Two apps cannot share one scheme, so at least one of the two was copied down wrong.',
  '两份清单在这个 App 上不一致，一份记 kwai、一份记 gifshow。只能两个都试。':
    'The two collections disagree about this app: one records kwai, the other gifshow. There is nothing for it but to try both.',
  'iOS-URL-Scheme 把同一个 scheme 记在「微博轻享版」名下。两个名字指的可能是同一个 App，也可能不是。':
    'iOS-URL-Scheme files the same scheme under Weibo Lite. The two names may be one app, or may not.',
  '这一条就是 bundle id 本身当 scheme 用，看着不像但清单确实这么记。':
    'This one is the bundle id itself used as a scheme. It does not look like one, but that is how the collection records it.',
  '这种 tencent<数字>:// 的形状是腾讯开放平台分配的 App ID，很容易随版本换掉。':
    'A scheme shaped like tencent[digits]:// carries an App ID handed out by the Tencent open platform, and a release can change it easily enough.',
  '两份清单不一致。qiyi-iphone:// 看着像更老的那一版，但没人验证过。':
    'The two collections disagree. qiyi-iphone:// looks like the older of the two, but nobody has checked.',
  '两份清单不一致，差一个 -iphone 后缀。': 'The two collections disagree, by one -iphone suffix.',
  '结尾的 ap 看着像 app 被截断了，但清单就是这么记的。':
    'The ap at the end looks like a truncated app, but that is how the collection records it.',
  '两份清单都把 moble 写成了这样（不是 mobile）。可能是京东自己拼错的，也可能是一份抄错了另一份跟着传。照抄试一次就知道。':
    'Both collections spell it moble, not mobile. It may be JD’s own misspelling, or one collection’s slip that the other copied. Type it as written and one try settles it.',
  'tencentlaunch<数字>:// 里的数字是腾讯开放平台的 App ID，换版本就可能变。':
    'The number in a tencentlaunch[digits]:// is a Tencent open-platform App ID, and a new release can change it.',
  'bundle id 的最后一段，去掉 App/Store/iPhone 这类后缀。这一类猜对过（起点读书就是这么来的），也错过很多次。':
    'The last segment of the bundle id, with a suffix like App/Store/iPhone taken off. This kind of guess has been right before — Qidian came from it — and wrong many times.',
  'bundle id 的最后一段，原样。': 'The last segment of the bundle id, as it stands.',
  'bundle id 倒数第二段——通常是公司或产品名（知乎、豆瓣都对上了）。':
    'The second-to-last segment of the bundle id — usually the company or the product name. It matched for Zhihu and for Douban.',
  '整个 bundle id 当 scheme（百度贴吧就是这么记的）。':
    'The whole bundle id used as the scheme. That is how Baidu Tieba is recorded.',

  // The evidence behind a `verified` row, shown in the picker directly above
  // the caveat — the one line in the payload that is not a transcription but
  // an observation, so it has to survive into English intact. Both rows in the
  // table carry the same sentence, hence one entry.
  '作者的 iPhone 上从呼吸页点「继续」跳转成功':
    'Tapping “Open it anyway” on the breathing page jumped successfully, on the author’s iPhone',

  // --- /setup (src/ui/setup.ts) ----------------------------------------------
  // The Shortcut walkthrough, and the last page in the product to be
  // translated. Ordered the way the page is read rather than the way the file
  // is written, so this can be checked against a phone held beside it.
  //
  // Every quoted name here is the label English iOS actually prints — Shortcuts,
  // Automation, Get Contents of URL, If, End If, Open URL, Contents of URL,
  // Is Opened, Ask Before Running, Notify When Run, Show More, Duplicate. The
  // Chinese quotes them in 「」 and the English in curly quotes, so a reader can
  // still tell a label to hunt for from the sentence around it. Where the
  // Chinese explains a quirk of Chinese iOS, the English says what the quirk is
  // rather than transliterating the menu.
  //
  // The worked examples follow the rest of the dictionary: 小红书 is Instagram
  // and 起点读书 is Reddit, and the app KEYS in the examples move with them
  // (`xhs` becomes `instagram`) — a key is the reader's own invention, matched
  // only against what they type into their own automation, so an example key is
  // a suggestion and not a contract. 「一息 小红书」, the suggested name for the
  // shortcut itself, becomes 「一息 Instagram」: the product's name stays, the
  // example app follows.
  // The two 「怎么配」 pages differ in Chinese by word order alone — this one is
  // 「一息 · 怎么配」, /today/setup's is 「怎么配 · 一息」 — so the English differs
  // the same way rather than inventing a second name for one of them. Both
  // still read 「Guide」 in the nav and as <h1>, exactly as both read 「怎么配」
  // in Chinese.
  '一息 · 怎么配': '一息 · Guide',
  '全部在 iPhone 自带的「快捷指令」App 里完成，不用越狱，不用装别的东西。\n第一次约 5 分钟，之后每多拦一个 App 再花 1 分钟。':
    'All of it happens in the Shortcuts app the iPhone already has — no jailbreak, nothing else to install. The first one takes about 5 minutes, and each app after that about 1 more.',

  // The in-app-browser banner. 「{name}」 is the host app's own name and never
  // translated; 「{escape}」 is src/inapp.ts quoting that app's menu, which does
  // read in Chinese inside all seven of them.
  '你现在是在<b>{name}</b>内置的浏览器里。\n    下面凡是要「跳回 App」的步骤在这里都不会有反应——它不让网页跳去别的 App。\n    {escape}，用 Safari 打开这一页再照着做。':
    'You are inside the browser built into <b>{name}</b>. None of the steps below that jump back to an app will do anything here — it will not let a page open another app. {escape}, then open this page in Safari and follow it there.',

  '先记住一件事：一个 App 一条，各配各的': 'One thing first: one shortcut per app, each with its own settings',
  '没有「共用」那一说。<b>每个要拦的 App 都要单独建一条快捷指令</b>，各自的网址里\n<code>app=</code> 后面写各自的 App 键——拦小红书就写 <code>xhs</code>，拦起点读书就写\n<code>qidian</code>。写错了不会报错，只会用错那个 App 的配置：按别人的秒数呼吸、\n跳回别人的 App、记录也记在别人名下。':
    'There is no such thing as a shared one. <b>Every app you want stopped needs a shortcut of its own</b>, and each address carries that app’s own key after <code>app=</code> — for Instagram write <code>instagram</code>, for Reddit write <code>reddit</code>. Getting it wrong raises no error; it quietly uses another app’s settings: another app’s seconds to breathe through, another app’s scheme to jump back to, and the count filed under another app’s name.',
  '曾经想过让所有 App 共用一条、把 App 键当输入传进去。做不到：\n「获取 URL 的内容」的网址栏里挑不到「快捷指令输入」那个变量（真机上验过两次），\n所以只能整条粘。代价就是 token 在每条快捷指令里各出现一次，<b>将来换 token\n要每一条都改</b>。':
    'A single shortcut shared by every app, with the app key passed in as its input, was considered and cannot be done: the URL field of “Get Contents of URL” does not offer the “Shortcut Input” variable at all (checked twice on a real phone), so the whole line has to be pasted. The price is that the token appears once in every shortcut, and <b>swapping the token later means editing every one of them</b>.',

  // The token section. 「你的 token」 is the account page's heading, reused.
  '下面第一步那串网址里已经带上它了，正常配置不用单独复制。放在这里是为了你换设备、\n或者想核对时能拿到：':
    'The address in step one below already carries it, so an ordinary setup never needs to copy it on its own. It is here for changing devices, or for checking it against something:',
  '服务器这边读不到你的 token 原文，只存着它的哈希——这个账号是发号时代建的，\n         从来没绑过邮箱和密码。<a href="/claim">绑一次</a>，以后这一页就能直接印出来；\n         或者现在带上 <code>?k=你的token</code> 重新打开这一页。':
    'This server cannot read the plaintext of your token, only the hash it keeps — this account was made in the ticket-window days and never had an email address or a password attached. <a href="/claim">Attach them once</a> and this page can print it outright from then on; or reopen this page right now with <code>?k=your-token</code> on the end.',
  '它是你所有记录的钥匙，别在别人能看见屏幕的时候点。':
    'It is the key to every record you have. Do not tap it where somebody else can see the screen.',

  '第一步 · 给一个 App 建快捷指令': 'Step one · build a shortcut for one app',
  '装好之后整条是这个形状——三个动作，加一个自动补上的「结束如果」：':
    'Finished, the whole thing has this shape — three actions, plus an “End If” that appears on its own:',

  // The diagram of the assembled shortcut, drawn rather than photographed.
  '快捷指令的三个动作：获取 URL 的内容、如果内容包含 https、在如果里面打开 URL 的内容':
    'The shortcut’s three actions: Get Contents of URL, If the contents contain https, and Open URL nested inside the If',
  '获取 <code class="sc-u">…/gate?app=<b class="sc-ph">这个 App 的键</b>&amp;k=…&amp;fmt=text</code> 内容':
    'Get Contents of <code class="sc-u">…/gate?app=<b class="sc-ph">this app’s key</b>&amp;k=…&amp;fmt=text</code>',
  '如果 <b class="sc-v">URL 的内容</b> 包含 <b class="sc-k">https</b>':
    'If <b class="sc-v">Contents of URL</b> contains <b class="sc-k">https</b>',
  '打开 <b class="sc-v">URL 的内容</b>': 'Open <b class="sc-v">Contents of URL</b>',
  '结束如果 <span class="sc-note">（加完「如果」自己就有了）</span>':
    'End If <span class="sc-note">(it appears with the If)</span>',
  '第三个动作必须在「如果」<b>里面</b>。拖到「结束如果」下面就等于每次都跳——包括服务端刚说了「这次别拦」的那些次。':
    'The third action has to sit <b>inside</b> the If. Dragged below “End If” it jumps on every single launch — including the ones the server has just said to leave alone.',
  '为什么不能只用一个「打开 URL」': 'Why one Open URL on its own will not do',
  '因为 <code>/gate</code> 回的是<b>文本</b>，不是跳转。该拦你时回一条\n    <code>https://…</code>（呼吸页的地址），不该拦时回 <code>pass</code> 这个词。':
    'Because <code>/gate</code> answers with <b>text</b> rather than a redirect. When it should stop you it returns a <code>https://…</code> address, the breathing page; when it should not, the single word <code>pass</code>.',
  '所以直接「打开 URL <code>…/gate?…</code>」的话，Safari 打开的是 gate 本身，\n    你会看到<b>一个只有一行字的白页面</b>——该拦时是那行地址（还得自己再点一下），\n    不该拦时是 <code>pass</code> 四个字母。<b>每次开 App 都会被丢到这个页面上</b>，\n    包括本该放你过去的那些次。':
    'So pointing Open URL straight at <code>…/gate?…</code> opens the gate itself in Safari, and what you get is <b>a white page with one line of text on it</b> — the address when it should stop you, which you then have to tap yourself, and the four letters <code>pass</code> when it should not. <b>Every launch drops you on that page</b>, including the ones meant to let you through.',
  '三个动作的结构是：先把答案<b>取回来</b>，答案本身就是「要打开的地址」，\n    「如果 包含 https」是在问「这次取回来的是个地址，还是 <code>pass</code>」。':
    'The shape of the three actions is this: <b>fetch</b> the answer first, where the answer is itself the address to open, and “If contains https” asks whether what came back this time is an address or <code>pass</code>.',
  '<b>「不拦」必须能表达成「什么都不做」，而一个「打开 URL」永远会打开点什么。</b>\n    这也是它同时成为 fail-open 开关的原因：服务挂了、超时、返回一整页错误 HTML，\n    结果里都没有 <code>https</code>，条件不成立，快捷指令静默结束，你的 App 正常打开。':
    '<b>“Do not stop me” has to be sayable as doing nothing at all, and an Open URL always opens something.</b> That is also what makes it the fail-open switch: a dead service, a timeout, a whole page of error HTML — none of them contain <code>https</code>, the condition is false, the shortcut ends in silence and your app opens as usual.',

  '一个变量都不用挑': 'Not one variable to pick',
  '网址直接整条粘进去，不要去找「快捷指令输入」那个变量——它只有在快捷指令被设成\n「接收输入」时才会出现，新建的默认没有。整条链路只有三个动作，全部照抄即可。':
    'Paste the address in whole, and do not go looking for the “Shortcut Input” variable — it appears only once a shortcut is set to accept input, which a new one is not. The whole chain is three actions, every one of them copied as it stands.',

  // Step one, and the finished line to paste into it.
  '「获取 URL 的内容」': '“Get Contents of URL”',
  '动作搜索框里搜 <code>URL</code>，把下面对应那一整条<b>粘进 URL 那一栏</b>。\n    地址、token、App 键都已经填好了，<b>一个字都不用改</b>：':
    'Search the action box for <code>URL</code>, then <b>paste the matching whole line below into the URL field</b>. The address, the token and the app key are filled in already, so <b>not one character needs changing</b>:',
  '你还没配置任何 App，所以这里没有可粘的网址。\n       先去<a href="/settings">设置</a>加一个，再回来。':
    'You have no apps configured, so there is no address here to paste. Add one under <a href="/settings">Settings</a> first, then come back.',
  '拦<b>{label}</b>的那条快捷指令用这行': 'This line goes in the shortcut for <b>{label}</b>',
  '这一整行': 'This whole line',
  '<span class="off"> · 这个 App 现在是停用的</span>': '<span class="off"> · this app is switched off right now</span>',
  // Square brackets rather than angle ones, for the reason the scheme-caveat
  // group above gives: a bare English word inside <> is exactly the shape of an
  // HTML tag, and guard ③ would pin it into the translation as markup.
  '<先点上面的「显示」>': '[tap “Show” above first]',
  '显示更多 · 方法 GET': 'Show More · Method GET',
  '请求头 空': 'Headers empty',
  '请求体 空': 'Request Body empty',

  // Step two: the condition, and the one passage on the page that stays open.
  '「如果」': '“If”',
  '如果   「URL 的内容」   包含   https': 'If   “Contents of URL”   contains   https',
  '左栏 自动接上一步': 'Left filled by the step above',
  '中间 包含': 'Middle contains',
  '右栏 手打 https': 'Right typed by hand — https',
  '<b>这个条件只能这么写。</b>它是整套配置里唯一一处写反了会把你锁在手机外面的地方。':
    '<b>This condition can only be written this way.</b> It is the one place in the whole setup where writing it backwards locks you out of your own phone.',
  '服务器只回两种东西：该拦你时回一条 <code>https://…</code> 开头的网址，不该拦时回 <code>pass</code> 这个词。':
    'The server answers with two things only: an address beginning <code>https://…</code> when it should stop you, and the word <code>pass</code> when it should not.',
  '所以这一条同时干了两件事：该拦时打开呼吸页；而<b>只要出任何问题</b>——服务挂了、\n    token 错了、网络断了、返回空白——结果里都没有 <code>https</code>，\n    「如果」不成立，快捷指令什么都不做，<b>你的 App 正常打开</b>。':
    'So this one line does two things at once. It opens the breathing page when you should be stopped; and <b>should anything at all go wrong</b> — a dead service, a wrong token, no network, a blank answer — none of those contain <code>https</code>, the If is false, the shortcut does nothing, and <b>your app opens as usual</b>.',
  '所以<b>绝对不能反过来写成「不包含 pass」</b>。那样服务一挂，\n    每次开 App 都跳去一个打不开的网页，你会被自己写的工具锁在手机外面。':
    'So <b>never turn it around into “does not contain pass”</b>. Written that way, the moment the service goes down every launch jumps to a page that will not load, and the tool you built locks you out of your own phone.',

  '「打开 URL」，拖到「如果」<b>里面</b>': '“Open URL”, dragged <b>inside</b> the If',
  'URL 栏 自动接「URL 的内容」': 'URL field filled with “Contents of URL”',

  '建完是这三行': 'Built, it reads as these three lines',
  '获取 URL 的内容    （粘好的整条网址）        GET\n如果   「URL 的内容」   包含   https\n    打开 URL   「URL 的内容」\n结束如果':
    'Get Contents of URL    (the whole pasted line)        GET\nIf   “Contents of URL”   contains   https\n    Open URL   “Contents of URL”\nEnd If',
  '起个名字，比如 <b>一息 小红书</b>，存好。': 'Give it a name — <b>yixi Instagram</b>, say — and save it.',

  // Step two: the automation that runs it.
  '第二步 · 让它在打开 App 时自动跑': 'Step two · make it run by itself when the app opens',
  '「快捷指令」App → 底部 <b>自动化</b> → 右上角 <b>+</b>：':
    'Shortcuts app → <b>Automation</b> along the bottom → <b>+</b> in the top-right corner:',
  '触发条件选 <b>App</b>，点进去勾选<b>要拦的那一个</b>':
    'Pick <b>App</b> as the trigger, go in and tick <b>the one you want stopped</b>',
  '选 <b>已打开</b>（不是「已关闭」），下一步': 'Choose <b>Is Opened</b> (not “Is Closed”), then Next',
  '让你选运行什么时，直接选刚建的 <b>「一息 小红书」</b>——不用加动作、不用传输入':
    'When it asks what to run, pick the <b>“yixi Instagram”</b> you just built — no action to add, no input to pass',
  '<b>关掉「运行前询问」</b>，弹出确认时选「不询问」':
    '<b>Turn off “Ask Before Running”</b>, and choose “Don’t Ask” at the confirmation',
  '把「运行时通知我」也关掉，不然每次开 App 都弹横幅':
    'Turn off “Notify When Run” as well, or a banner drops down every time the app opens',

  '再加一个 App': 'Adding another app',
  '不用重头来。快捷指令列表里<b>长按「一息 小红书」→ 拷贝</b>，\n在副本里把网址中的 <code>app=</code> 后面那个词换成新 App 的键，改个名字，\n再照第二步建一条自动化。<b>只有那一个词要改。</b>':
    'No need to start over. In the shortcuts list, <b>press and hold “yixi Instagram” → Duplicate</b>; in the copy, replace the word after <code>app=</code> in the address with the new app’s key, rename it, and build it an automation the way step two says. <b>That one word is the only edit.</b>',

  // The per-app table, and the tester button beside each line.
  '各个 App 对应的整条网址': 'The whole address for each app',
  '<span class="off"> · 已停用</span>': '<span class="off"> · off</span>',
  '试一下这条通不通': 'Check whether this line gets through',
  '还没有配置 App。先去<a href="/settings">设置</a>加一个，这里就会出现可以直接粘的整行。':
    'No apps configured yet. Add one under <a href="/settings">Settings</a> and the whole pasteable line appears here.',
  '整条复制，末尾的 <code>&amp;fmt=text</code> 少了就不工作。\n<b>粘完先点「试一下这条通不通」</b>——结果就显示在按钮旁边，不跳走。\n看到 <code>pass</code> 或一条 <code>https://…</code> 网址就说明这条地址是通的；\n要是显示连不上，那就是地址本身缺了一截或混进了奇怪字符，\n这时候放进快捷指令里只会得到一句 <code>kCFErrorDomainCFNetwork</code>，看不出原因。':
    'Copy the whole line — without the <code>&amp;fmt=text</code> on the end it does not work. <b>Once it is pasted, tap “Check whether this line gets through” first</b>: the answer appears beside the button, and nothing navigates away. A <code>pass</code>, or a <code>https://…</code> address, means the line is reachable. A failure to connect means the address itself is missing a piece or picked up a stray character, and in a shortcut that produces nothing but a <code>kCFErrorDomainCFNetwork</code> with no reason attached.',

  '每个 App 都要来一遍，这是 iOS 的限制': 'Once per app, and that is an iOS limit',
  '「打开 App 时」的自动化<b>必须一个 App 建一条</b>，不能批量、不能一条选多个。\n拦 5 个 App 就是 5 条。One Sec 和所有同类工具都这样，iOS 没给别的口子。':
    'A “When App Is Opened” automation <b>has to be built one app at a time</b> — no batches, and no picking several apps in one. Five apps to stop means five automations. One Sec and every tool like it works the same way; iOS offers no other way in.',

  // Step three: proving it on the phone.
  '第三步 · 跑通一次': 'Step three · run it through once',
  '从桌面点开你刚配的那个 App': 'Open the app you just set up, from the home screen',
  '应该闪一下跳到 Safari，出现呼吸页': 'It should flicker over to Safari and show the breathing page',
  '等倒计时走完': 'Wait for the countdown to finish',
  '点「算了」→ 给你一句话，你自己退出去': 'Tap “Never mind” → it gives you one line, and you back out on your own',
  '点「继续」→ 应该跳回那个 App': 'Tap “Open it anyway” → it should jump back into the app',
  '第 5 步跳不回去，说明这个 App 的 scheme 不对。去<a href="/settings">设置</a>展开这个 App，scheme 格子右边有个<b>试跳</b>按钮，下面还能按 App 名字找候选。':
    'If step 5 does not jump back, this app’s scheme is wrong. Open the app’s row under <a href="/settings">Settings</a>: there is a <b>test it</b> button beside the scheme box, and below it you can search candidates by app name.',
  '跳回去的一瞬间自动化<b>会被再次触发，这是正常的</b>。服务端有一分半的免打扰窗口，\n这次直接放行，也不会被算成一次冲动。放下手机超过一分半再拿起来才会重新拦你——这是刻意的。':
    'The moment it jumps back, the automation <b>fires a second time, which is normal</b>. The server keeps a quiet window of a minute and a half: that trigger is let straight through and counts as no impulse at all. Only putting the phone down for longer than that and picking it up again gets you stopped afresh, which is deliberate.',

  // The zzztest line, and what each answer means.
  '验一下配对没': 'Checking that it is wired up',
  '别在快捷指令编辑页里直接点运行——那样没有输入，<code>app=</code> 是空的，会报一个和你配置无关的错。':
    'Do not tap Run inside the shortcut editor — there is no input there, <code>app=</code> comes out empty, and the error you get has nothing to do with your setup.',
  '要验地址和 token，在 Safari 里打开这个（<code>zzztest</code> 是个故意没配过的键，服务端一律放行且什么都不记）：':
    'To check the address and the token, open this in Safari (<code>zzztest</code> is a key left unconfigured on purpose: the server always lets it through and records nothing):',
  // Square brackets again, for the same reason as the 「显示」 stand-in above.
  '<你的token>': '[your-token]',
  // The {name} in the copy button's 「复制{name}」, so no article — 「Copy the
  // test address」 is not a thing a screen reader should have to read out.
  测试网址: 'test address',
  '都对，往下走': 'All correct — carry on',
  'token 不对，多半复制时带了空格': 'The token is wrong, most likely a space picked up while copying',
  '网址里 <code>app=</code> 后面空了': 'Nothing after <code>app=</code> in the address',
  '连不上 / 404': 'Cannot connect / 404',
  '地址写错，或 Worker 没部署成功': 'The address is wrong, or the Worker never deployed',

  // Why the condition is the shape it is. The one section that stays unfolded.
  '坏掉的时候必须放你进去': 'When it breaks, it has to let you in',
  '第一步第 2 个动作的条件写的是「<b>包含 <code>https</code></b>」。这不是随手写的，\n<b>永远不要改成「不包含 <code>pass</code>」</b>。':
    'The condition on step one’s second action reads “<b>contains <code>https</code></b>”. That was not written off the cuff, and <b>it must never become “does not contain <code>pass</code>”</b>.',
  '差别在服务出问题的时候。<code>/gate</code> 有一堆理由给不出正常答复：token 被换了、Worker 挂了、\n网络超时、DNS 被污染、返回了一片空白。':
    'The difference shows when the service is in trouble. <code>/gate</code> has any number of reasons to give no proper answer: the token was swapped, the Worker is down, the network timed out, DNS was poisoned, a blank came back.',
  '<b>写「包含 https 才打开」</b>：上面每种异常的返回里都没有 <code>https</code>，「如果」不成立，\n快捷指令什么都不做直接结束，<b>你的 App 正常打开</b>。最坏结果是「今天没拦住你」。':
    '<b>Written as “open only if it contains https”</b>: not one of those answers contains <code>https</code>, the If is false, the shortcut ends without doing anything, and <b>your app opens as usual</b>. The worst outcome is that it failed to stop you today.',
  '<b>写「不包含 pass 就打开」</b>：服务一挂，每次开 App 都跳去一个打不开的网页。\n你被自己写的工具<b>锁在自己手机外面</b>，而且当时多半正急着用。':
    '<b>Written as “open if it does not contain pass”</b>: the service goes down and every launch jumps to a page that will not load. The tool you built has <b>locked you out of your own phone</b>, most likely at the moment you were in a hurry to use it.',
  '这两种坏法完全不对等：一边少拦一次，一边几个 App 全废。所以默认行为必须是拿不准就放行。':
    'The two ways of breaking are nowhere near equal: one misses a single interception, the other leaves several apps unusable. So the default has to be to let you through whenever it cannot tell.',
  '还有两处照这个道理该省掉的东西': 'Two more things the same reasoning says to leave out',
  '同理还有两条：<b>别给「获取 URL 的内容」加出错处理</b>（网络失败时整条快捷指令中止，\n  后面的「打开 URL」就不会执行，App 照常打开，这正是要的）；\n  <b>别在「如果」后面加「否则」去打开任何东西</b>（「否则」就是「服务没说要拦」，那就该什么都不做）。':
    'Two corollaries. <b>Do not add error handling to “Get Contents of URL”</b> (a network failure aborts the whole shortcut, the “Open URL” after it never runs, the app opens as usual, and that is exactly what is wanted); and <b>do not put an “Otherwise” after the If to open anything</b> (“Otherwise” means the server did not ask for a stop, and the answer to that is to do nothing).',

  // Six symptoms, none of which anyone reads until one of them is theirs.
  出问题了: 'When something is wrong',
  '六种症状，点开看对应的那一条。': 'Six symptoms. Open the one that is yours.',
  'App 打不开了 / 每次开 App 都跳到打不开的网页':
    'The app will not open / every launch goes to a page that will not load',
  '<b>先止血</b>：「快捷指令」→「自动化」，把那条的开关关掉，App 立刻恢复。\n  一息挂了不该影响你用手机。然后回上一节检查「如果」的条件是不是写反了。':
    '<b>Stop the bleeding first</b>: Shortcuts → Automation, switch that one off, and the app works again at once. 一息 being down should never cost you the use of your phone. Then go back to the section above and check whether the If condition was written backwards.',
  '点「继续」跳不回 App': '“Open it anyway” does not jump back into the app',
  '大概率 scheme 不对。去<a href="/settings">设置</a>展开这个 App，scheme 格子右边点<b>试跳</b>：\n  跳走了说明 scheme 对，问题在别处；没反应就在下面「不知道填什么？」里按 App 名字找候选，\n  一条条试，跳通了点「用这个」写回格子再保存。\n  有些 App 已经彻底没有 scheme，怎么点都不动——那就只能对它放弃拦截。':
    'Most likely the scheme is wrong. Open the app’s row under <a href="/settings">Settings</a> and tap <b>test it</b> beside the scheme box: if it jumps away the scheme is right and the trouble is elsewhere; if nothing happens, search candidates by app name under “Not sure what goes here?” below, try them one at a time, and when one jumps, tap “Use this” to write it back into the box and save. Some apps have no scheme left at all and will not move however often you tap — for those, stopping you is simply off the table.',
  '打开 App，自动化压根没触发': 'The app opens and the automation never fires at all',
  '「运行前询问」没关干净，回自动化详情页再确认一次':
    '“Ask Before Running” is not fully off — go back into the automation and check once more',
  '触发条件选错了，必须是「已打开」': 'The trigger is the wrong one; it has to be “Is Opened”',
  '从后台切回前台在部分 iOS 版本上不触发，先把 App 从后台划掉再从桌面点':
    'Coming back from the background does not fire it on some iOS versions — swipe the app away first, then open it from the home screen',
  '自动化被关了，列表里每条右侧有开关': 'The automation is switched off; every row in the list has a switch on its right',
  '重启 iPhone。「打开 App 时」偶发失灵是 iOS 的老毛病':
    'Restart the iPhone. “When App Is Opened” failing now and then is an old iOS complaint',
  '每次都直接进 App，从来没被拦过': 'Every launch goes straight into the app and nothing ever stops you',
  '自动化跑了，但服务端判定「不管这个 App」：app 键对不上（大小写敏感，<code>XHS</code> ≠ <code>xhs</code>）、\n  在<a href="/settings">设置</a>里被停用了、或者你一直在一分半的免打扰窗口里。':
    'The automation runs, but the server decides this app is none of its business: the app key does not match (case matters, <code>Instagram</code> is not <code>instagram</code>), it is switched off under <a href="/settings">Settings</a>, or you have been inside the minute-and-a-half quiet window the whole time.',
  '刚点「继续」跳回去，马上又被拦': 'It stops you again the instant “Open it anyway” jumps back',
  '免打扰窗口没生效。要么 <code>/resolve</code> 没打成功（网络断了），\n  要么这个 App 的 grace 秒数设得太短，去<a href="/settings">设置</a>调大。':
    'The quiet window did not take effect. Either <code>/resolve</code> never got through because the network dropped, or this app’s grace seconds are set too short — raise them under <a href="/settings">Settings</a>.',
  '开 App 明显变慢': 'Opening the app got noticeably slower',
  '每次开 App 都要等一次到 Cloudflare 的网络往返，信号差时会有感知。没有客户端缓存。\n  慢到不可接受的话，这是要改方案的信号，不是配置问题。':
    'Every launch waits on one network round trip to Cloudflare, and on a poor signal that is noticeable. There is no client-side cache. If it is slow enough to be unacceptable, that is a sign the design needs changing rather than a configuration problem.',

  // What the tester prints beside the button it was tapped on. 「{body}」 is
  // whatever the server actually returned, trimmed to 120 characters.
  '试着连…': 'Connecting…',
  '服务器拒绝了：{body}': 'The server refused it: {body}',
  '通了 · 这条会拦你，返回了呼吸页地址':
    'Through · this line will stop you; it returned the breathing page address',
  '通了 · 返回「{body}」，现在不拦（免打扰窗口里或者这个 App 没启用）':
    'Through · it returned “{body}”, so no stop right now — either inside the quiet window, or this app is not switched on',
  '连不上 —— 地址大概缺了一截或者混进了奇怪字符':
    'Cannot connect — the address is probably missing a piece, or picked up a stray character',

  "iPhone 快捷指令教程：打开 App 前先呼吸十秒": "iPhone Shortcuts guide: pause before opening an app",
  "一息与 one sec：安装、功能和隐私比较": "Yixi vs one sec: setup, features and privacy",
  "用 iPhone 快捷指令和一息，在打开小红书等 App 前加一道呼吸暂停。了解安装步骤、试跳、自动化和常见问题。": "Set up Yixi with iPhone Shortcuts to pause before opening distracting apps. Installation, URL-scheme testing, automation and troubleshooting.",
  "一息作者整理的 one sec 比较：网页与原生应用、手动配置、拦截方式和数据保存。附官方来源与核对日期。": "A comparison by the maker of Yixi: web versus native apps, manual setup, interventions and data storage, with official sources and a review date.",
  "一息是一个网页加 iOS 快捷指令：你打开选定的 App 时，Safari 先显示呼吸页，等待后由你决定继续还是放弃。它需要联网，不是强制锁机工具。": "Yixi combines a web page with iOS Shortcuts. Opening a chosen app brings up a breathing page in Safari; after the pause, you choose whether to continue. It needs a network connection and is not a hard blocker.",
  "准备什么": "What you need",
  "准备一部 iPhone、自带的「快捷指令」App 和 Safari。先只配一个 App；用 Safari 打开本站，避免微信等内置浏览器影响跳转。": "Use an iPhone, the built-in Shortcuts app and Safari. Start with one app. Open this site in Safari, since in-app browsers can prevent app switching.",
  "四步完成首次配置": "Set up your first app in four steps",
  "注册或登录，然后在「设置」添加要拦的 App。记住你填的 App 键，例如 xhs；快捷指令里的键必须与它完全一致。": "Register or log in, then add an app in Settings. Remember its app key, such as xhs: the key in your shortcut must match exactly.",
  "注册账号": "Create an account",
  "打开设置": "Open Settings",
  "在设置里的 URL scheme 字段查找候选，用 iPhone 点「试跳」。只有真的打开目标 App 的候选才可以保存；列表里的候选没有替你验证过。": "Find URL scheme candidates in Settings and test one on your iPhone. Save it only if it really opens the intended app; listed candidates are not pre-verified.",
  "打开登录后的配置向导，显示并复制该 App 的完整地址。新建快捷指令：先「获取 URL 的内容」（GET），再加「如果 URL 的内容 包含 https」，在条件里面「打开 URL」，使用上一步返回的内容。": "Open the signed-in setup guide, reveal and copy the full address for that app. Create a shortcut: Get Contents of URL (GET), then If Contents of URL contains https, then Open URLs inside that condition, using the returned contents.",
  "打开个人配置向导": "Open your personal setup guide",
  "在「快捷指令 → 自动化」创建 App「已打开」触发器，选择目标 App 和刚才的快捷指令。关闭「运行前询问」（或选择「立即运行」，名称随 iOS 版本变化），再实际打开 App 测试。": "In Shortcuts → Automation, add an App → Is Opened trigger for your chosen app and run the shortcut you created. Disable Ask Before Running (or select Run Immediately, depending on iOS), then open the app to test it.",
  "条件必须是「包含 https」，不要写成「不包含 pass」。地址必须保留末尾的 fmt=text。配置向导会生成真实地址，本页不包含任何人的 token；不要分享个人配置页或含 token 的快捷指令。": "The condition must be “contains https”, never “does not contain pass”. Keep fmt=text at the end of the address. Your personal guide generates the real address; this public page contains no user tokens. Do not share your personal setup page or shortcuts containing your token.",
  "怎样确认配置成功": "Check that it works",
  "先在个人向导点「试一下这条通不通」，看到 pass 或呼吸页地址说明地址能连通。打开目标 App 后应出现呼吸页；等待后点「继续」应回到该 App。每多加一个 App，都要配置它自己的快捷指令和自动化。": "Use the connection test in your personal guide first: pass or a breathing-page URL means the address responds. Opening the target app should show the breathing page; after waiting, Continue should return to that app. Each additional app needs its own shortcut and automation.",
  "常见问题": "Common questions",
  "为什么没有拦截？": "Why was there no pause?",
  "检查 App 键是否一致、设置里是否启用、自动化是否开启，以及是否还在免打扰窗口内。网络或服务故障时，一息会放行，不保证每一次都拦住。": "Check that the app key matches, the app and automation are enabled, and the quiet window has expired. Yixi fails open during network or service failures; a pause is not guaranteed on every launch.",
  "为什么点继续回不去？": "Why does Continue fail to return?",
  "回到 Safari 里的设置重新试跳。URL scheme 可能随 App 更新失效，不能只凭候选名字判断；微信等内置浏览器也可能阻止跳转。": "Retest the URL scheme in Settings using Safari. App updates may invalidate a scheme; a matching candidate name is not proof. In-app browsers can also block the hand-off.",
  "记录放在哪里？": "Where are records stored?",
  "拦截和选择记录保存在所用实例的数据库。实例运营者有数据库访问权；若希望自己掌握数据，可以按源码文档自行部署。个人回看、目标和配置页面仍需登录。": "Interceptions and choices are stored in your instance’s database. Its operator has database access. Self-host using the source documentation if you want to control storage yourself. Personal reviews, goals and setup pages still require sign-in.",
  "两者都可以在刷手机之前加一道暂停。一息适合愿意手动配置快捷指令、希望阅读或自建源码的人；one sec 提供原生应用及浏览器扩展，更适合需要多平台和多种干预方式的人。": "Both can add a pause before scrolling. Yixi suits people willing to configure Shortcuts and inspect or self-host the source. one sec offers native apps and a browser extension for people seeking more platforms and intervention options.",
  "本文由一息作者维护，不是独立测评，也未与 one sec 合作。one sec 的信息来自其官网，并非本次逐项真机测试。": "This page is maintained by the maker of Yixi, not an independent reviewer or a one sec partner. one sec details come from its website, not a hands-on test of every feature.",
  "配置与能力对照": "Setup and capabilities",
  "比较项": "Aspect",
  "一息": "Yixi",
  "使用入口": "Access",
  "iPhone 快捷指令 + Safari 网页；每个 App 单独配置。": "iPhone Shortcuts + Safari; configure each app separately.",
  "官网提供 iOS、Android 应用和电脑浏览器扩展入口。": "The official site links to iOS and Android apps and a desktop browser extension.",
  "干预方式": "Interventions",
  "呼吸暂停，再选择继续或放弃；故障时放行。": "A breathing pause with a choice to continue or stop; fails open on errors.",
  "官网列出呼吸、反思等干预，以及定时屏蔽功能。": "The site lists breathing and reflection interventions, plus scheduled blocking.",
  "数据与控制": "Data and control",
  "源码以 MIT 协议公开，可自建；使用记录存在实例数据库，运营者可访问。": "MIT-licensed source; self-hostable. Usage records live in the instance database and are accessible to its operator.",
  "官网表示干预逻辑在设备本地运行，使用数据保存在本地或私有云。": "The official site says intervention logic runs locally, with usage data offline or in a private cloud.",
  "费用": "Cost",
  "当前公开实例免费使用；自建成本取决于托管和用量。": "The current public instance is free to use; self-hosting costs depend on hosting and usage.",
  "官网说明基础功能免费，另有付费选项；具体价格和功能范围请以当地商店及购买页为准。": "The site describes free essentials and paid options. Check your local store and checkout for current pricing and included features.",
  "怎么选": "Which fits you?",
  "如果你想从一个 App 开始、接受 Safari 跳转并希望能修改源码，可以先试一息。如果你需要 Android、浏览器网站干预或定时屏蔽，先查看 one sec 的对应平台说明。一息没有经过与 one sec 相同的效果研究，不能套用对方的研究数字。": "Try Yixi if you want to start with one app, accept a Safari hand-off and value editable source. For Android, website interventions or scheduled blocking, check one sec’s platform documentation. Yixi has not undergone the same effectiveness studies, so one sec’s research figures do not apply to it.",
  "来源与核对日期": "Sources and review date",
  "一息源码与功能说明": "Yixi source and feature documentation",

  // --- /surf, the ten-minute flow (src/ui/surf.ts) ---------------------------
  // The voice of the whole face: no praise, no lecture, nothing red, and
  // 「我点开了」 reads exactly as level as 「过去了」 does. Nothing on this page
  // asks the reader anything — the scene was picked once at /surf/setup — so
  // there is no question copy left in this group.
  '渡 · 一息': 'Surf · 一息',
  '冲动来了。': 'An urge came.',
  其他: 'Something else',
  '放下手机，去另一个房间。回来再点。': 'Put the phone down and go to another room. Tap again when you are back.',
  先告诉我这是哪一种: 'Tell me which one this is first',
  我起来了: 'I am up',
  '十分钟了。': 'Ten minutes.',
  过去了: 'It passed',
  还想: 'Still there',
  再来十分钟: 'Another ten minutes',
  我点开了: 'I opened it',
  // Four of the five parting lines, in the order farewellLines() returns
  // them. The fifth, 「放下就好。」, is the breathing page's own and already
  // has an entry further up.
  '就到这里。': 'This is where it ends.',
  '这一阵过去了。': 'That wave has gone by.',
  '你看着它，它就小了。': 'You watched it, and it got smaller.',
  '记下了。明天还是新的一天。': 'Noted. Tomorrow is a new day all the same.',
  // Not a parting line: the quiet notice when the start POST never landed and
  // this walk-through left no row behind.
  '这一次没记上。': 'This one was not recorded.',
  再来一次: 'Again',
  '添加到主屏幕，下次一步就到。': 'Add it to the home screen, and next time it is one tap.',

  // --- /surf scenes (src/surfscenes.ts, msg()) ------------------------------
  // One opening line and three body exits a scene, picked once at
  // /surf/setup. The openings name what the urge usually is, in the fewest
  // words that stay true; the exits are things a body can do in a minute,
  // not advice. 「其他」 above is the custom scene's own label.
  色欲: 'Lust',
  '它不是需要，是最近的一种止痛。': 'It is not a need. It is the nearest painkiller.',
  '冷水洗脸。': 'Cold water on your face.',
  '二十个深蹲。': 'Twenty squats.',
  '出门走五分钟。': 'Five minutes outside.',
  短视频: 'Short video',
  '手指想动，不是你想看。': 'The fingers want to move. You do not want to watch.',
  '把手机放到另一个房间充电。': 'Leave the phone charging in another room.',
  '打开一本纸书，看两页。': 'Open a paper book and read two pages.',
  '站起来，倒一杯水。': 'Stand up and pour a glass of water.',
  游戏: 'Games',
  '想赢的不是你，是上一局。': 'It is not you that wants to win. It is the last round.',
  '先洗个澡。': 'Take a shower first.',
  '把明天要做的第一件事写下来。': 'Write down the first thing you will do tomorrow.',
  深夜加餐: 'Late-night eating',
  '多半是累，不是饿。': 'Mostly this is tiredness, not hunger.',
  '喝一杯温水。': 'Drink a glass of warm water.',
  '刷牙。': 'Brush your teeth.',
  '关灯，躺十分钟。': 'Turn off the light and lie down for ten minutes.',
  '它会过去的。': 'It will pass.',
  // The word for a scene nobody named: an account that never opened
  // /surf/setup still has something to be called.
  冲动: 'An urge',

  // --- /surf/review, the 30-day look-back (src/ui/surfreview.ts) ------------
  现在就渡: 'Surf now',
  '冲动来的时候，从主屏图标进；这里只看记录。': 'When an urge comes, use the home-screen icon. This page only shows records.',
  '三十天 {n} 次': 'Surfed {n} times in 30 days',
  '过去了 {n}': 'Passed {n}',
  '点开了 {n}': 'Opened it {n}',
  '另有 {n} 次没走完。': 'Another {n} were not finished.',
  '还没有记录。冲动来的时候，点主屏上的「渡」。': 'Nothing recorded yet. When an urge comes, tap “Surf” on the home screen.',
  三十天: '30 days',
  几点: 'Time of day',
  最近三十天每天的冲动次数: 'Daily urge count over the last 30 days',
  每小时的冲动次数分布: 'Urge count by hour of day',

  // --- /surf/setup, picking the scene once and the entry points (src/ui/surfsetup.ts) ---
  '只需选一次。之后冲动来了，打开就是流程，不再问你任何问题。':
    'You pick once. After that, an urge means you open this and the flow starts, with nothing left to answer.',
  自己写一个: 'Write your own',
  想对那一刻的自己说的一句话: 'One line for yourself in that moment',
  入口: 'Access',
  '主屏：在 Safari 打开 /surf，分享 → 添加到主屏幕，会得到一个独立的「渡」图标。':
    'Home screen: open /surf in Safari, then Share → Add to Home Screen, and you get a separate “Surf” icon.',
  '快捷指令：新建一个「打开 URL」动作，地址填 {origin}/surf?k=你的令牌（令牌在<a href="/account">账号</a>页），命名为「渡」，就能对 Siri 说。':
    'Shortcuts: make a new “Open URL” action, with the address {origin}/surf?k=your token (the token is on the <a href="/account">Account</a> page), name it “Surf”, and you can say it to Siri.',
}
