## 重要通知

* 从 0.3.0 版本开始，`avoscloud-code-mock-sdk` 重命名为 `avoscloud-code`，安装和更新请使用下列命令：

```
sudo npm install -g avoscloud-code
```

如果从 npm 安装失败，可以从 GitHub 安装：

```
sudo npm install -g  git+https://github.com/avos/CloudCodeMockSDK
```

## 更新日志

* 2013-03-05 发布0.3.7版本，修复httpRequst无法post JSON数据的Bug。
* 2013-03-02 发布0.3.6版本，调试界面的JSON数据自动stringify，可以直接填写对象的literal表示，改进调试UI。
* 2013-01-23 发布0.3.5版本，修复status命令并添加iconv-lite模块。
* 2013-12-20 发布0.3.4版本，修复监控文件变更的listener过多导致的内存泄露。
* 2013-12-20 发布0.3.3版本，支持`avos-express-https-redirect`中间件
* 2013-12-16 发布 0.3.3-beta 版本，支持`avos-express-cookie-session`中间件，添加调试传入用户Id功能。
* 2013-12-14 发布 0.3.2 版本，修复云代码 HTTPS 请求失败的 bug。
* 2013-12-11 更新 0.3.0-beta3，修复 sendgrid 0.4.6 找不到安装包的问题。
* 2013-12-10 更新 0.3.0-beta2，添加更多命令和本地部署功能。

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
    deploy: 部署云代码到AVOS Cloud平台开发环境.
    undeploy: 从AVOS Cloud平台清除云代码部署，包括生产环境和开发环境.
    status: 查询当前部署状态.
    search <keyword>: 根据关键字查询开发文档.
    publish: 发布开发环境代码到生产环境。
    new: 创建云代码项目。

  Options:

    -h, --help                 output usage information
    -V, --version              output the version number
    -f,--filepath <path>       本地云代码项目根路径，默认是当前目录。
    -g, --git                  使用定义在管理平台的Git仓库或者-u指定的Git仓库部署云代码，默认使用本地代码部署。
    -u, --giturl <url>         所要部署的Git仓库地址，必须是Git协议URL，仅在使用Git部署-g选项的时候有效.
    -l, --local                使用本地代码部署云代码，该选项是默认选中。
    -o, --log <log>            部署日志，仅对从本地部署有效。
    -r, --revision <revision>  Git的版本号，仅对从Git仓库部署有效。
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

* License: [GNU LESSER GENERAL PUBLIC LICENSE](https://www.gnu.org/licenses/lgpl.html).
* Author: Dennis Zhuang（xzhuang@avos.com）
