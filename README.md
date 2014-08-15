# `avoscloud-code`

## 重要通知

* 从 0.3.0 版本开始，`avoscloud-code-mock-sdk` 重命名为 `avoscloud-code`，安装和更新请使用下列命令：

```
sudo npm install -g avoscloud-code
```

如果从 npm 安装失败，可以从 GitHub 安装：

```
sudo npm install -g  git+https://github.com/avoscloud/avoscloud-code-command
```

## 更新日志

* 2014-08-15 发布 0.4.8，移除`-u`选项，支持云代码 2.0 自定义库功能，添加`AV.Cloud.onVerfied`函数。
* 2014-07-08 发布 0.4.7，默认使用 Master Key 初始化 SDK，修复`X-AVOSCloud-Session-Token`调用云代码不生效的Bug。
* 2014-06-25 发布 0.4.6，增加 `upload` 命令，用于批量上传文件到 AVOS Cloud 平台。

## 说明

为了方便本地运行和调试云代码，请遵照下列步骤进行:

* 要在本地调试云代码，你需要安装 [Node.js](http://nodejs.org) 最新版本。
* 运行命令: `sudo npm install -g avoscloud-code` 安装调试 SDK。以后更新升级也请执行此命令。
* 在项目根目录运行 `avoscloud`，将启动本地调试服务器。
* 访问 [http://localhost:3000/](http://localhost:3000/) 即可访问到你的云主机代码，子路径按照你在 `app.js` 里配置的即可访问。
* 访问 [http://localhost:3000/avos](http://localhost:3000/avos) 调试云代码函数和 class hook 函数等。

## 功能说明

`avoscloud -h` 输出：

```
 Usage: avoscloud [options] <cmd>

  Valid commands:
    deploy: 部署云代码到 AVOS Cloud 平台开发环境.
    undeploy: 从 AVOS Cloud 平台清除云代码部署，包括生产环境和开发环境.
    status: 查询当前部署状态.
    search <keyword>: 根据关键字查询开发文档.
    publish: 发布开发环境代码到生产环境。
    new: 创建云代码项目。
    logs: 查看云代码日志。
    clear: 清除本地状态，在输入 app id 或者 master key 错误的情况下使用。

  Options:

    -h, --help                 output usage information
    -V, --version              output the version number
    -f,--filepath <path>       本地云代码项目根路径，默认是当前目录。
    -g, --git                  使用定义在管理平台的 Git 仓库或者 -u 指定的 Git 仓库部署云代码，默认使用本地代码部署。
    -u, --giturl <url>         所要部署的 Git 仓库地址，必须是 Git 协议 URL，仅在使用 Git 部署 -g 选项的时候有效.
    -l, --local                使用本地代码部署云代码，该选项是默认选中。
    -o, --log <log>            部署日志，仅对从本地部署有效。
    -n, --lines <lines>        查看多少行最新的云代码日志，默认 10 行。
    -t, --tailf                自动刷新云代码日志，结合 logs 命令使用。
    -r, --revision <revision>  Git 的版本号，仅对从 Git 仓库部署有效。
```

并且本工具具有代码热加载功能。修改代码后，无需重启即可以调试最新代码。

## cURL 调试

你也可以通过 cURL 工具来调试代码：

* 测试函数:
```
curl -X POST -H 'Content-Type:application/json' \
    -d '{ "name": "dennis"}' \
    http://localhost:3000/avos/hello
```
其中 hello 是你通过 `AV.Cloud.define` 定义的函数名称。

* 测试 `beforeSave`、`afterSave`、`afterUpdate`、`beforeDelete`、`afterDelete` 等:

```
curl -X POST -H 'Content-Type:application/json' \
     -d '{ "name": "dennis"}' \
	 http://localhost:3000/avos/MyUser/beforeSave
```
其中 `MyUser` 是 className，`beforeSave` 指定调用`MyUser`定义的 `beforeSave` 函数，其他函数类似。

## 安全性

部署、发布、清除部署等命令在第一次运行的时候要求用户输入应用的 master key，您可以在 AVOS Cloud 平台的应用设置里找到 master key。

输入后，本命令行工具将这个App信息记录在 `~/.avoscloud_keys` 文件中（0600文件权限模式）。

如果您输入错误的 master key 或者在公共机器上运行本命令行工具，可手工删除该文件。

## Copyright

* License: [GNU LGPL](https://www.gnu.org/licenses/lgpl.html).
* Author: Dennis Zhuang（xzhuang@avoscloud.com）
