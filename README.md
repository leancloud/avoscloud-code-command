# `avoscloud-code`

## 重要通知

安装和更新请使用下列命令：

```
sudo npm install -g avoscloud-code
```

如果从 npm 安装失败，可以从 GitHub 安装：

```
sudo npm install -g  git+https://github.com/leancloud/avoscloud-code-command
```

## 更新日志

详情查看 [changelog.md](https://github.com/leancloud/avoscloud-code-command/blob/master/changelog.md)

* 2014-12-26 发布 0.5.2 正式版本，修复 webHosting user 串号问题，增加 req.AV.user 对象。
* 2014-12-03 发布 0.5.1 正式版本，修复 windows 新建项目部署失败 Bug、增加新版本检测等。
* 2014-10-10 发布 0.5.0 正式版本，支持多项目部署，重构代码，提升稳定性。
* 2014-09-16 发布 0.4.9-RC3，upload 命令文件上传更稳定。

## US 节点

请下载 [avoscloud-code-0.5.0.tgz](https://github.com/leancloud/avoscloud-code-command/raw/master/us/avoscloud-code-0.5.0.tgz)，执行下列指令安装：

```
sudo npm install -g avoscloud-code-0.5.0.tgz
```

## 说明

为了方便本地运行和调试云代码，请遵照下列步骤进行:

* 要在本地调试云代码，你需要安装 [Node.js](http://nodejs.org) 最新版本。
* 运行命令：`sudo npm install -g avoscloud-code` 安装调试 SDK。以后更新升级也请执行此命令。
* 在项目根目录运行 `avoscloud`，将启动本地调试服务器。
* 访问 [localhost:3000](http://localhost:3000/) 即可访问到你的云主机代码，子路径按照你在 `app.js` 里配置的即可访问。
* 访问 [localhost:3000/avos](http://localhost:3000/avos) 调试云代码函数和 class hook 函数等。

## 功能说明

`avoscloud -h` 输出：

```
  Usage: avoscloud [选项] <命令>

  有效的命令列表包括:
    deploy: 部署云代码到 AVOS Cloud 平台开发环境
    undeploy: 从 AVOS Cloud 平台清除云代码部署，包括生产环境和开发环境
    status: 查询当前部署状态
    search <keyword>: 根据关键字查询开发文档
    publish: 发布开发环境代码到生产环境
    new: 创建云代码项目
    logs: 查看云代码日志
    clear: 清除本地状态，在输入 app id 或者 master key 错误的情况下使用
    upload <file-or-directory>: 导入文件到 AVOS Cloud 平台，如果是目录，则会将该目录下的文件递归导入。
    app [list]:  显示当前应用，deploy、status 等命令运行在当前应用上，如果加上 list ，则显示所有的应用信息。
    checkout <app>: 切换到一个应用，deploy、status 等命令将运行在该应用上。
    add <app>: 添加一个应用。
    rm <app>: 移除一个应用。

  Options:

    -h, --help                 output usage information
    -V, --version              output the version number
    -f, --filepath <path>      本地云代码项目根路径，默认是当前目录。
    -g, --git                  使用定义在管理平台的 git 仓库或者 -u 指定的 git 仓库部署云代码，默认使用本地代码部署。
    -p, --project <app>        命令运行在指定应用上，默认运行在当前应用或者 origin 应用上。
    -l, --local                使用本地代码部署云代码，该选项是默认选中。
    -o, --log <log>            本次部署的提交日志，仅对从本地部署有效。
    -n, --lines <lines>        查看多少行最新的云代码日志，默认 10 行。
    -t, --tailf                自动刷新云代码日志，结合 logs 命令使用。
    -r, --revision <revision>  git 的版本号，仅对从 git 仓库部署有效。
```

并且本工具具有代码热加载功能。修改代码后，无需重启即可以调试最新代码。

## Bash Completion

下载 [avoscloud_completion.sh](https://github.com/avoscloud/avoscloud-code-command/blob/master/avoscloud_completion.sh) 保存到某个目录，例如保存为 `~/.avoscloud_completion.sh`，然后在 `.bashrc` 或者 `.bash_profile` 文件中添加：

```
source ~/.avoscloud_completion.sh
```

重启终端 bash，或者重新加载 profile 文件，就可以让 `avoscloud` 命令拥有自动完成功能。


## 使用指南

参考 [云代码命令行工具使用详解](http://leancloud.cn/docs/cloud_code_commandline.html)

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
其中 `MyUser` 是 className，`beforeSave` 指定调用 `MyUser` 定义的 `beforeSave` 函数，其他函数类似。

## 安全性

部署、发布、清除部署等命令在第一次运行的时候要求用户输入应用的 master key，您可以在 LeanCloud 平台的应用设置里找到 master key。

输入后，本命令行工具将这个应用信息记录在 `~/.avoscloud_keys` 文件中（0600 文件权限模式）。

如果您输入错误的 master key 或者在公共机器上运行本命令行工具，可手工删除该文件。

## CopyRight

* License: [GNU LGPL](https://www.gnu.org/licenses/lgpl.html).
* Author: Dennis Zhuang（xzhuang@avoscloud.com）
