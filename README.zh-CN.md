[English](README.md) | 简体中文

# 一息

一息做两件事，共用一个账号。**拦**：打开小红书这类干扰 App 之前，手机先跳到一个网页让你呼吸十秒，十秒后先给「算了」，再给「继续打开」，并且把这一次记下来。**引**：未来一段时间最重要的那几件事放在一页上（默认三件，想放到九件也行），每天早上打开它——每件事带着今天要做的几条子任务、最近七天的七颗墨点，和一个直接跳进那个 App 的按钮（跟练去 B 站，读书去微信读书）。两件事各自能用，不需要都用。

整个东西是**一个 Cloudflare Worker 加一个 D1 数据库**，跑在免费额度里，成本约等于零。拦的那一半是自建的 [One Sec](https://one-sec.app/) 替代品，做成网页而不是 iPhone App。

<table>
<tr>
<td width="50%" align="center">

<img src="docs/images/breathing-paper.png" width="300" alt="呼吸页浅色：宣纸上的一团墨，「算了」是实心胶囊，「继续打开」是一行小号下划线文字">

<sub>「算了」是实心胶囊，「继续打开」是一行小号下划线文字——这个不对称是刻意的。</sub>

打开干扰 App 之前，手机先跳到一页倒数十秒，先给你「算了」，再给你「继续打开」，不管选哪边都记一笔。

**[拦 →](docs/breathe.md)**

</td>
<td width="50%" align="center">

<img src="docs/images/today-paper.png" width="300" alt="今日页浅色：宣纸上三张目标卡，第一张是大卡，带今天的子任务——每条子任务自己一个勾选圈和跳转药丸，外加七颗墨点；没有子任务的目标改用一个跳转大按钮">

<sub>三个目标，第一个画成大卡。没有任何地方显示连续天数。</sub>

未来一段时间最重要的那几件事收在一页上，每天早上打开——每件事带着今天要做的几条子任务、最近七天的七颗墨点，和一个直接进 App 的按钮。

**[引 →](docs/today.md)**

</td>
</tr>
</table>

<p align="center">
  <b><a href="https://yixi-app.pages.dev">直接开始用 →</a></b><br>
  <sub>公开实例，免费，什么都不用部署。也可以<a href="#自己部署约-15-分钟">自己部署一份</a>，十五分钟。</sub>
</p>

**给谁用**：想要一点摩擦而不是一道墙的人。它是摩擦，不是强制——自动化随时可以两下关掉，这是刻意的。

用公开实例最省事；如果你不愿意把「几点几分没忍住打开了哪个 App」这种日志放在别人的服务器上，就自己部署一份，十五分钟。两条路的代码完全一样。

## 已知的限制

三条是整个产品的。两面各自的清单在 [docs/breathe.md](docs/breathe.md#known-limits) 和 [docs/today.md](docs/today.md#known-limits)，部署之前都值得读一遍。

- **界面中英双语。**页脚（落地页、登录、注册）或 `/account` 里的「语言」区块可以切换，任意页加上 `?lang=en`／`?lang=zh` 也行；什么都不指定时默认中文。所有页面都已翻译，包括 `/setup` 那份最长的快捷指令教程；里面引用的 iOS 界面名，英文版给的是英文 iOS 的实际叫法。
- **中国大陆访问要用 Pages 那个地址。**见[为什么要部署两次](#为什么要部署两次)。`pages.dev` 是共享后缀，今天干净不代表永远——绑自有域名是唯一持久的解法。
- **它是提醒，不是拦路。**任何人都能两下关掉那条自动化。这是刻意的设计——整套东西坏了就放行——也意味着这个工具只对自己想要它的人有效。

## 页面

| 地址 | 谁能看 | 干什么 |
| --- | --- | --- |
| `/` | 所有人 | 落地说明，注册／登录入口 |
| `/gate?app=&k=` | gate token | 闸门决策，快捷指令打的就是它，返回 `pass` 或一条网址 |
| `/b?s=<sid>` | sid | 呼吸页 |
| `POST /resolve` | sid | 记 proceed／abandon，开免打扰窗口 |
| `/register` `/login` `/claim` `/recover` | 所有人 | 注册、登录、给老 token 绑账号、用 token 重置密码 |
| `/today` | 本人 | 每天早上要开的那一页：最重要的目标、今天的子任务、七天墨点 |
| `/today/goals` | 本人 | 增删改目标——`/today` 展示但不让改的那部分 |
| `/today/review` | 本人 | 回看：今天几分之几、最近三十天一排竖条、每个目标的墨点与打卡率、本周勾子任务的次数 |
| `/today/setup` | 本人 | 把 `/today` 加到主屏幕、配快捷指令或定时自动打开它 |
| `/goals` | 本人 | 保留为 307 跳 `/today/goals`（保留方法和请求体），旧链接和书签仍能落到有用的地方 |
| `/review` | 本人 | 今天、七天、哪个 App 最消耗你 |
| `/settings` | 本人 | 增删改自己要拦的 App |
| `GET /api/candidates` | 本人 | JSON：输入 App 名字，给出带来源的 scheme 候选。由 `/settings` 和 `/today/goals` 的 URL scheme 字段直接 fetch，不是页面 |
| `/lookup` `/probe` | —— | 保留为 302 跳 `/settings`。两个都曾是独立页面；找 scheme 和试 scheme 现在长在需要它的那个字段上，旧链接和书签仍然能落到有用的地方 |
| `/setup` | 本人 | 快捷指令配置向导，印着你自己的地址和 token |
| `/account` | 本人 | 看回自己的 gate token、改密码、退出登录 |
| `/mock?v=1\|2` | 所有人 | 两版呼吸页视觉对比 |
| `/admin` | owner | 线下发号，看每个人的 attempt 计数 |
| `/manifest.webmanifest` `/icon.png` | 所有人 | 主屏幕文件——公开、可缓存，两个都不含任何个人数据 |
| `/robots.txt` | 所有人 | 只让爬前门，别的都不给爬 |

其余一律 404。`/admin` 下面没有别的地址可以猜——见 [SECURITY.md](SECURITY.md)。

两面各有一套导航——`/today` 及其背后是「今日」，呼吸页及其背后是「拦截」——彼此留一个小链接互跳，共用同一个登录。

## 为什么要部署两次

一份代码，两处 Cloudflare 部署，共用同一个 D1：

| 部署 | 配置 | 作用 |
| --- | --- | --- |
| **Pages** | `pages/wrangler.toml` | 人访问的那个地址 |
| **Worker** | `wrangler.toml` | 两条每日 cron——中午清理，零点写 `goal_days` 快照 |

**`*.workers.dev` 在中国大陆被 DNS 污染。**这是实测出来的，不是猜的：任取一个 `*.workers.dev` 主机名，在国内三家公共 DNS（223.5.5.5 / 119.29.29.29 / 114.114.114.114）各自返回一个互不相同的地址，而且都不等于境外解析值。这是典型的域名级污染，不是 Cloudflare 被封——`cloudflare.com` 和 `*.pages.dev` 在国内外解析逐字节一致。被单独针对的是 `workers.dev` 这个共享后缀。

`*.pages.dev` 目前干净，所以人访问的地址交给 Pages。同一个边缘、同一个运行时、同一份代码、同一个数据库，只有主机名不同。`pages/functions/[[path]].ts` 里只有一行，把请求转进同一个 Worker `fetch` 处理函数。

**Worker 那份必须留着，因为 Pages 不支持 Cron Trigger。**两条 cron 都由 Cloudflare 自己触发，不需要从国内访问，所以它的主机名被污染无所谓。

照抄这个方案之前有两件事要知道：

- Cloudflare 自己的 CLI 明确推荐新项目用 Workers 而不是 Pages。这里反着来，**纯粹是为了那个能访问的域名**。
- **如果你有自己的域名，更好的做法是把它绑到 Worker 上**（Custom Domain）。域名和 cron 两个问题一起消失，`pages/` 整个目录都可以删掉。`pages.dev` 同样是共享后缀，今天干净不代表永远干净——绑自有域名才是真正一劳永逸的解法。

另外：`wrangler pages deploy` 不支持 `-c` 指定配置文件路径，所以 Pages 的配置只能放在自己的目录里，不能和 Worker 共用一份 `wrangler.toml`。

**更新一个已有部署时，Worker 和 Pages 要在同一次操作里前后脚发完**——中间这段时间里 Pages 那个地址还在跑旧代码，这时候勾一次子任务会被写进已经退役的 `done_at` 列，新代码不会再显示它。

## 自己部署（约 15 分钟）

前置条件：一个 Cloudflare 账号和 Node 18+。

### 1. 安装并登录

```bash
cd yixi
npm install
npx wrangler login
```

### 2. 建 D1 数据库

```bash
npx wrangler d1 create yixi
```

把返回的 `database_id` 填进 **`wrangler.toml` 和 `pages/wrangler.toml` 两处**。两个文件必须指向同一个数据库——这正是两处部署成为同一个 App 的原因。（`database_name` 要保持 `yixi`，否则两个文件加上 `package.json` 里的脚本都得一起改。）

### 3. 生成两个密钥，并自己留一份

```bash
openssl rand -base64 48    # 这是 TOKEN_KEY
openssl rand -base64 48    # 这是 COOKIE_SECRET
```

**不要**直接管道灌进 `wrangler secret put`。同一个 `TOKEN_KEY` 要填进两处部署，而 Cloudflare 的 secret 是读不回来的。

> ### ⚠️ `TOKEN_KEY` 丢了，所有人都再也看不到自己的 gate token
>
> `TOKEN_KEY` 是 gate token 的 AES-GCM 主密钥，作用是让登录后的人能把自己那把 token 读回来。它永不写进 D1——库被单独拖走解不出任何东西。
>
> 丢了它，拦截照常工作：`/gate` 验的是 SHA-256 哈希，从不碰密文。坏掉的是**找回**。忘了 token 的人再也读不回来，也就再也配不了新手机，`/recover`（用 token 重置密码）对他也失效了。没有重置路径，也没法反推。**继续往下之前，先存进密码管理器。**

然后设到 Worker 上：

```bash
npx wrangler secret put TOKEN_KEY        # 粘贴第一个值
npx wrangler secret put COOKIE_SECRET    # 粘贴第二个值
```

`COOKIE_SECRET` 是历史遗留。浏览器会话曾经是签名 cookie，现在改成了 `sessions_web` 表里的行，cookie 只带一个不透明 id，已经没有任何东西需要签名了，代码里也没有一处读它。这里写出来只是因为已有部署都设过它，而删一个 secret 比留着麻烦——全新部署可以不设。

### 4. 建表并部署 Worker

```bash
npm run deploy    # 先对远端 D1 apply migration，再发布
```

migration 只需要跑一次，Pages 那份共用同一个数据库。

**部署一律走 `npm run deploy`，不要直接 `wrangler deploy`**——「先 migration 再发布」这个顺序就是两边不脱节的全部保证。当前版本尤其依赖 `0006_user_locale.sql` 和 `0008_today_goals.sql`：`/gate` 认人的路径上会读 `users.locale` 和 `users.today_goals`，数据库里缺哪一列，Worker 一上去就谁也拦不住了。

### 5. 部署 Pages

```bash
cd pages
npx wrangler pages project create yixi-app --production-branch main

# TOKEN_KEY 必须和 Worker 那份【逐字节一致】，
# 否则 Pages 打不开 Worker 侧封存的 token，反之亦然。
npx wrangler pages secret put TOKEN_KEY --project-name yixi-app
npx wrangler pages secret put COOKIE_SECRET --project-name yixi-app

npx wrangler pages deploy --branch main --project-name yixi-app
```

部署完会给你一个 `https://<项目名>.pages.dev`。注意 `*.pages.dev` 的子域名是**全局唯一**的，名字被占用时 Cloudflare 会自动加后缀，那个带后缀的主机名才是后面到处要用的地址。

### 6. 打开人机验证（可选，不开也是被支持的配置）

注册是开放的，谁找到地址都能注册；而这个仓库是公开的，所以地址也是公开的。`src/ratelimit.ts` 里的每 IP 限流把单个地址压在每小时 5 次，但对一个铺在几百个地址上的脚本毫无办法。[Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) 补的就是这一块，而且只加在 `/register` 上。

1. Cloudflare 控制台 → **Turnstile** → **Add widget**，模式选 **Managed**。
2. 主机名那里要把**两处部署都填上**——`<项目名>.pages.dev` 和 `<worker名>.<子域>.workers.dev`——因为两边都在提供 `/register`。想让 `npm run dev` 也弹验证，再加一个 `localhost`。
3. 记下它给你的两个值：**site key**（公开的，会被渲染进页面）和 **secret key**（永不离开服务端）。
4. 两个值都要设到两处部署上：

```bash
# Worker
npx wrangler secret put TURNSTILE_SITE_KEY   # 粘贴 site key
npx wrangler secret put TURNSTILE_SECRET     # 粘贴 secret key

# Pages —— 同样这两个值
cd pages
npx wrangler pages secret put TURNSTILE_SITE_KEY --project-name yixi-app
npx wrangler pages secret put TURNSTILE_SECRET --project-name yixi-app
```

`TURNSTILE_SITE_KEY` 本身是公开的，写成 `wrangler.toml` 里的 `[vars]` 也完全可以。这里当 secret 设，只是为了让两个值一起走，不至于只部署了一半。

**不设它是被支持的配置，不是坏掉的配置。**两个值缺任何一个，就不渲染 widget、不做任何校验，`/register` 的行为和这个功能存在之前一模一样——这正是 `npm run dev` 和第一次部署能在完全没有 Cloudflare widget 的情况下跑通的原因。代价也值得明说：不设就等于除了每 IP 限流之外没有任何机器人防护。这和这个产品其他地方的 fail-open 是同一套判断，见 [SECURITY.md](SECURITY.md)。

另外两件该知道的事：

- **这是「零外部请求」这条规矩唯一被破的地方。**widget 脚本从 `challenges.cloudflare.com` 加载，那也是 CSP 在这一页唯一放行的域——只在 `/register`，且只在两个值都设好时。其他每一页都仍然是 `default-src 'none'`，一个例外都没有。理由写在 `src/ui/layout.ts` 里 `TURNSTILE_ORIGIN` 上面的注释里。
- **验证需要 JavaScript。**配了 widget 之后，关掉 JavaScript 的浏览器注册不了。表单上写了这句话。

### 7. 注册，然后把自己设成 owner

打开 `https://<你的地址>/register`，用邮箱和密码注册。普通使用者到这里就够了，注册是开放的（如果第 6 步配了 Turnstile，则要先过一次人机验证）。

owner 是另一回事，而且刻意没有任何界面能授予。想用 `/admin`（线下给人发号），直接改数据库：

```bash
npx wrangler d1 execute yixi --remote --command \
  "UPDATE users SET is_owner = 1 WHERE email = 'you@example.com';"
```

`/admin` 完全是可选的。既然注册已经开放，它支持线下发号和查看整体配置转化，见[统计口径](docs/onboarding.md)。

### 8. 配上第一个 App

1. `/settings` —— 加一个 App。**App 键**（比如 `xhs`）就是你之后要在 iOS 自动化里手打的那行文本，必须一字不差。只能用小写字母、数字、`-`、`_`。
2. 同一个表单里，**URL scheme** 字段自带你需要的一切：格子上方有现成的例子，右边有**试跳**按钮，下面折着一条「不知道填什么？按 App 名字找」，展开就在原地列出候选，每条标着来源。**没有一条是被验证过的。**
3. 这一步要在 iPhone 上做。点候选的**试跳**——**只有真的跳进那个 App 的才算数**。跳通了点「用这个」写回格子再保存。跳走再回来，你填了一半的表单还在。
4. `/setup` —— 快捷指令向导，你要粘的每一行都已经填好了真实地址和 token。

## 技术栈

| | |
| --- | --- |
| 运行时 | Cloudflare Workers（同时以 Pages Function 部署一份） |
| 存储 | Cloudflare D1（SQLite） |
| 语言 | TypeScript，strict，零运行时依赖 |
| 渲染 | 服务端 HTML，CSS/JS 内联，零外部请求（CSP 强制）——唯一例外是 `/register` 上的 Turnstile widget，且仅在配置了之后 |
| 加密 | 只用 WebCrypto —— PBKDF2-SHA256 密码，AES-GCM 封存 token |
| 客户端 | iOS 快捷指令 + Safari |
| 测试 | 30 个文件 709 条（Vitest + `@cloudflare/vitest-pool-workers`） |
| 成本 | 在 Cloudflare 免费额度内 |

## 目录结构

```
src/index.ts        路由表、三种认证形态、两条 cron
src/gate.ts         /gate 与 /resolve —— 唯一两条机器面对的路由
src/auth.ts         ?k= token、cookie session、常数时间比较
src/account.ts      注册／登录／绑定／找回，闭环找回逻辑
src/crypto.ts       PBKDF2 密码、AES-GCM 封存 token、随机 hex
src/db.ts           全部 D1 语句，只有 D1 语句
src/stats.ts        /review 的聚合层，grace_pass 的排除规则在这里
src/snapshot.ts      goal_days 快照：那天展示了什么、做成了什么
src/ratelimit.ts    开放端点的每 IP 固定窗口限流
src/turnstile.ts    /register 上那道可选的人机验证，以及它的 fail-open 规则
src/scheme.ts       URL scheme 黑名单 —— 一份正本，三处调用
src/schemes.ts      两份公开 scheme 清单的固化快照（60 个 App）
src/types.ts        Env、User、事件类型、共享常量
src/dates.ts        /today 与 /today/goals 共用的 'YYYY-MM-DD' 日期运算
src/ui/*.ts         一个页面一个模块，全部服务端渲染
src/ui/schemefield.ts  /settings 与 /today/goals 共用的 URL scheme 选择字段
src/ui/pwa.ts       主屏幕的 manifest 和图标——公开，不含任何个人数据
src/ui/today.ts     /today —— 每天早上打开的那一页：目标、今天的子任务、七天墨点
src/ui/goals.ts     /today/goals —— 增删改、排序、归档目标
src/ui/progress.ts  /today/review —— 回看：三十天竖条、每个目标的打卡率
src/ui/todaysetup.ts  /today/setup —— 主屏幕、快捷指令与定时自动打开的配置向导
src/api/admin.ts    owner 的发号台，以及那条隐私红线
migrations/*.sql    D1 schema，六个 migration
scripts/icon.mjs    重新生成 src/ui/pwa.ts 里那份 base64 PNG
pages/              Pages 入口（一行）加它自己的 wrangler.toml
shortcut/README.md  快捷指令为什么长这样
docs/architecture.md  请求生命周期、表结构、记账语义
```

## 开发

```bash
npm test               # vitest run —— 完整测试套件
npm run typecheck      # tsc --noEmit（src）+ tsc -p test --noEmit
npm run dev            # wrangler dev —— 本地服务器
npm run migrate:local  # 本地库建表
npm run deploy         # 远端 apply migration，然后部署 Worker
```

动手改之前先读 [CONTRIBUTING.md](CONTRIBUTING.md)。它很短，而里面每一条都来自真实踩过的坑。

## 文档

- [docs/breathe.md](docs/breathe.md) —— 快捷指令、免打扰窗口、坏了就放行，以及拦截那一面的限制
- [docs/today.md](docs/today.md) —— 目标模型、`/today` 与它背后的几页、快照、主屏幕
- [SECURITY.md](SECURITY.md) —— 威胁模型、token 双存储的取舍、自托管注意事项
- [CONTRIBUTING.md](CONTRIBUTING.md) —— 五条不能被「顺手清理」掉的约束
- [docs/architecture.md](docs/architecture.md) —— 请求生命周期、D1 表、记账语义
- [shortcut/README.md](shortcut/README.md) —— 快捷指令那套形状背后的推理

两面各自那份细节文档（`docs/breathe.md`、`docs/today.md`）目前只有英文，和 `CONTRIBUTING.md`、`SECURITY.md`、`docs/architecture.md` 一样——这个仓库的约定是界面中英双语、文档英文。这一页是唯一的中文入口，内容与英文 README 一一对应。

作者开了一个公开实例：**<https://yixi-app.pages.dev>**。去那里注册，十分钟左右就能让它开始拦你，什么都不用部署。

**运营者能看到什么、看不到什么。** 你的记录是你的：发号台只返回每个账号「被拦了多少次」这一个数字，别的什么都没有——没有时间、没有 App 名、没有放弃率，连邮箱都没有。这一条是在 SQL 层保证的，不是在模板里删掉，有测试守着，改回去就会红。但也得把话说明白：**谁跑一个实例，谁就握着那个数据库，而数据库是可以直接查的。** 这话对这个实例成立，对你注册的任何一个自托管服务都成立。

所以：想省事就用公开这个；不想让上面那句话适用于你，就自己部署一份——十五分钟，步骤在上面。

## 说人话

给自己做一个「刷手机之前先喘口气」的小工具，顺手又加了一页「今天最重要的三件事」。你一点小红书，手机先跳到一个网页让你看着圆圈呼吸十秒，十秒后你可以继续进去，也可以放弃；它会偷偷记账，过一阵你能看到自己一周被拦了多少次、其中多少次忍住了。另一半反过来：每天早上打开一页，上面是你这阵子最重要的三件事，每件事按一下就直接跳进要用的那个 App。做成网页而不是 App，是因为往 iPhone 上装自制 App 每周都要重装一次，太麻烦，还得花钱。

## License

[MIT](LICENSE)

### 公开教程

首页链接到 `/guides/iphone-shortcuts` 安装教程与 `/compare/one-sec` 比较页。两页均为无需登录的中英双语服务端页面，与首页一起列入 `/sitemap.xml`；语言沿用 cookie 和浏览器偏好，不提供独立语言 URL。含个人 token 的 `/setup` 继续要求登录且禁止索引。竞品来源核对日期为 2026-09-18。
