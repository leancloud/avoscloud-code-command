## v1.3.2
* 支持 Java 应用的本地调试和部署
* 修复部分中国区应用被识别为美国区的问题

## v1.3.1
* 支持创建 PHP 的项目模板
* 修复调试界面无法正确地根据所选 hook 发送签名的问题
* 部署时默认会上传 .babelrc
* 文案中的包名更新为 leancloud-cli, 在后续的很长一段时间 avoscloud-code 和 leancloud-cli 会同步更新。

## v1.3.0
* 解决部分美国节点的引用无法部署的问题（如仍无法部署，请在 `~/.leancloud/app_keys` 中删除对应应用的部分然后重试）
* 调试 Hook 时会发送用于安全校验的签名，和线上环境保持一致
* 修复本地调试时 AV.Cloud.httpRequest 和线上行为不一致的问题

## v1.2.0
* 支持美国节点应用的本地调试和部署
* 支持 PHP 项目的本地调试和部署
* 修复 Windows 下 Python 项目无法进行本地调试的问题（找不到 `python2.7`）
* 修复无法创建应用名全部为中文的应用的问题

## v1.1.0
* 添加 Python 3 支持，你可在项目根目录创建一个内容为 `python3.5`、名为 `runtime.txt` 的文件来使用 Python 3.
* 添加对长前缀环境变量（LEANCLOUD_APP_ID）的支持

## v1.0.0
* 鉴于云引擎新版本的较大改动升级到 1.0.0
* 修复对 Node 0.12 的兼容
* 完善了对于某些错误的展示

## v0.11.0
* 使用 `lean` 替代 `avoscloud` 命令。
* 使用 `lean up` 作为启动本地项目的命令，而不是之前的 `avoscloud` 回车。
* 使用 `lean app <add|checkout|rm>` 替代 `avoscloud <add|checkout|rm>` 。
* 增加了 `lean image` 子命令，用于云引擎应用镜像管理。
* 增加了 `lean instance` 子命令，用于云引擎应用实例管理。
* 移除 `avoscloud lint` 子命令，因为涉及到多语言运行环境，不同语言都有自己的静态代码检查工具，所以建议用户自行安装和使用。
* 完善了命令的提示信息。

## v0.10.0
* 更新项目框架的下载地址，避免 DNS 污染
* 支持用 .leanengineignore 配置上传代码时忽略的文件

## v0.9.2
* 修复无法运行调试器的问题
* 调试页面支持 beforeUpdate、支持模拟 rpc 模式
* logs 命令可以选择生产或测试环境

## v0.9.1
* 紧急修复 0.9.0 版本引入的 Bug： 日志格式变化导致出错，调试界面模拟登陆用户无效。
* 本版本不兼容以前版本，并且服务器将在 2015 年 10 月 30 日后不再兼容老的日志格式，因此请立即升级。

## v0.9.0
* new 命令生成 Leanengine 3.0 项目框架.
* 改进 logs 命令，使用新的数据源，低于此版本的命令行工具需要立即升级，否则无法查看日志。
* 使用 App key 初始化 SDK。

## v0.8.0
* 增加  `redis` 命令，用于管理 LeanCache redis。

## v0.7.8
* 修复 SDK 重复初始化打印的警告日志太多。

## v0.7.7
* 修复调试控制台对内置表的支持 Bug
* 支持 3.0 项目以 npm start 方式启动

## v0.7.6
* 增加 LeanEngine 3.0 web 调试控制台。

## v0.7.5
* 增加 LeanEngine Python 项目的运行和部署。
* 修复 项目类型检测的处理不正确。

## v0.7.4
* 修复 new 命令提示不在项目目录的 Bug。

## v0.7.3
* 修复 app add 命令在 LeanEngine 项目目录没有关联应用时执行报错的 Bug。
* 增加 命令执行出错时提示「查看使用帮助：avoscloud -h」

## v0.7.2
* 支持 LeanEngine Node.js 运行时项目的部署。
* 中文化提示信息。
* 修复 命令行工具无法正常退出的 Bug。
* 修复 部署失败仍然提示 'Deploy cloud code successfully' 的 Bug。

## v0.7.1
* 修复关闭 _File 表写入权限后无法正常通过本地部署云引擎的 Bug。

## v0.7.0
* 增加 `--debug` （简写`-d`）选项，启用 debug 模式，使用 [node debugger](https://nodejs.org/api/debugger.html)调试你的云引擎。
* 改进部署，打印更详细的部署步骤和日志，增强体验。
* 云引擎函数增加 `request.ip` 获取调用客户端 IP。
* 改进错误输出。
* 修复 `AV.Cloud.httpRequest` 无法 POST 中文信息的 Bug（同步服务端）
* 修复 `-r` 选项对 Git 仓库部署无效的 Bug

## v0.6.8

* 紧急修复调试界面错乱。感谢用户 GongT

## v0.6.6 & v0.6.7
* 修复 `AV.Cloud.run` 没有运行本地函数的 Bug，感谢用户反馈。
* 修复调试界面传入 json 参数丢失类型的 Bug，感谢用户反馈。
* 修复部署上传文件失败时错误信息不正确的 Bug。
* 修复部署上传重试逻辑。

## v0.6.5
* nodemon 只监视 `cloud` 目录。
* 升级提示增加 changelog 提示。
* 修复非 webhosting 项目无法测试登录用户的 Bug
* 修复无法运行在 io.js 下的 Bug

## v0.6.4
* 增加 `AV.Cloud.onLogin` 方法
* 增加 `moment-timezone` 默认第三方库。
* 增加 `lint` 命令用于代码检查，推荐使用。
* 确保部署失败进程退出状态码不为 0。

## v0.6.3
* 修复 windows 无法新建项目的 Bug
* 修复部署偶尔的 401 错误。
* 修复 cql 命令无法执行 count 查询的 Bug
* 改进 new 失败后的错误消息提示。

## v0.6.2
* 修复 `avos-express-cookie-session` 的用户退出登录无效的 Bug。

## v0.6.1
* 增加 `cql` 命令用于 CQL 查询。
* 增加 `__local` 全局变量指代本地测试环境。

## v0.6.0

* 修正新版本查询 Bug。

## v0.5.2
* 修复 webHosting user 在并发请求时信息串号的问题。
* webHosting req 参数增加 user 对象（req.AV.user）。
* 使用 nodemon 监视文件变更自动热加载

## v0.5.1
* 修复新建项目在 windows 系统上的权限问题，导致部署失败。
* 增加新版本检测功能
* 新增`-P`选项，指定本地测试端口。

## v0.5.0

* 添加 `app`,`add`,`rm`等命令，用于多应用管理。
* 消除对 curl 命令的依赖。
* 重构部分代码，更稳定和健壮。
