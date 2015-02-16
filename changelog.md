## v0.6.5
* nodemon 只监视 `cloud` 目录。
* 升级提示增加 changelog 提示。

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
