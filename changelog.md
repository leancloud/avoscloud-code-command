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
* 修复关闭 _File 表写入权限后无法正常通过本地部署云代码的 Bug。

## v0.7.0
* 增加 `--debug` （简写`-d`）选项，启用 debug 模式，使用 [node debugger](https://nodejs.org/api/debugger.html)调试你的云代码。
* 改进部署，打印更详细的部署步骤和日志，增强体验。
* 云代码函数增加 `request.ip` 获取调用客户端 IP。
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
