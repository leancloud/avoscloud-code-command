## 重要通知

* 从0.3.0版本开始，`avoscloud-code-mock-sdk`重命名为`avoscloud-code`，安装和更新请使用下列命令：

```
sudo npm install -g avoscloud-code
```

## 更新日志

* 2013-12-10 更新0.3.0-beta，添加更多命令和本地部署功能。
* 2013-12-02 更新0.2.4 rc1版本，添加七牛官方模块和httpRequest超时和context支持。
* 2013-11-01 更新0.2.3 beta2版本，修复云代码基本版无法调试的bug。
* 2013-10-29 更新0.2.3 beta版本，支持从浏览器测试函数，hook等。

## 说明

为了方便本地运行和调试云代码，请遵照下列步骤进行:

* 要在本地调试云代码，你需要安装[node.js](http://nodejs.org)最新版本。
* 运行命令: `sudo npm install -g avoscloud-code` 安装调试SDK。以后更新升级也请执行此命令。
* 在项目根目录运行`avoscloud`，将启动本地调试服务器。
* 访问[http://localhost:3000/](http://localhost:3000/)即可访问到你的云主机代码，子路径按照你在`app.js`里配置的即可访问。
* 访问[http://localhost:3000/avos](http://localhost:3000/avos)调试云代码函数和class hook函数等。

## 功能说明

`avoscloud -h`输出：

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

## curl调试

你也可以通过curl工具来调试代码：

* 测试函数:
```
curl -X POST -H 'Content-Type:application/json' \
    -d '{ "name": "dennis"}' \
    http://localhost:3000/avos/hello
```
其中hello是你通过`AV.Cloud.define`定义的函数名称。

* 测试beforeSave,afterSave,afterUpdate,beforeDelete/afterDelete等:

```
curl -X POST -H 'Content-Type:application/json' \
     -d '{ "name": "dennis"}' \
	 http://localhost:3000/avos/MyUser/beforeSave
```
其中`MyUser`是className，beforeSave指定调用`MyUser`定义的beforeSave函数，其他函数类似。

## 安全性

部署、发布、清除部署等命令在第一次运行的时候要求用户输入应用的master key，您可以在AVOS Cloud平台的应用设置里找到master key。

输入后，本命令行工具将这个App信息记录在`~/.avoscloud_keys`文件中（0600文件权限模式）。

如果您输入错误的master key或者在公共机器上运行本命令行工具，可手工删除该文件。

## CopyRight

* License: [GNU LESSER GENERAL PUBLIC LICENSE](https://www.gnu.org/licenses/lgpl.html).
* Author: Dennis Zhuang（xzhuang@avos.com）
