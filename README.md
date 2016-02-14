## 介绍

**Windows 系统用户请确保安装 Node.js 在系统盘 C 盘，否则命令行工具无法正常运行。**

安装和更新请使用下列命令：

```
sudo npm install -g avoscloud-code
```

如果从 npm 安装失败，可以从 GitHub 安装：

```
sudo npm install -g  git+https://github.com/leancloud/avoscloud-code-command
```

详细的使用指南见 [云代码命令行工具使用详解](http://leancloud.cn/docs/cloud_code_commandline.html)，更新日志见 [changelog.md](https://github.com/leancloud/avoscloud-code-command/blob/master/changelog.md)。

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
    deploy: 部署云代码到 LeanEngine 平台开发环境
    undeploy: 从 LeanEngine 平台清除云代码部署，包括生产环境和开发环境
    status: 查询当前部署状态
    search <keyword>: 根据关键字查询开发文档
    publish: 发布开发环境代码到生产环境
    new: 创建云代码项目
    logs: 查看云代码日志
    clear: 清除本地状态，在输入 app id 或者 master key 错误的情况下使用
    upload <file-or-directory>: 导入文件到 LeanCloud 平台，如果是目录，则会将该目录下的文件递归导入。
    app [list]: 显示当前应用，deploy、status 等命令运行在当前应用上，如果加上 list ，则显示所有的应用信息。
    checkout <app>: 切换到一个应用，deploy、status 等命令将运行在该应用上。
    add <app>: 添加一个应用。
    rm <app>: 移除一个应用。
    lint: 静态检查代码错误。
    cql: 进入 CQL 交互式命令行。
    redis: 进入 LeanCache Redis 交互式命令行。

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

### 上传代码时忽略部分文件

在使用命令行工具上传代码时，你可以在项目目录新建一个名为 `.leanengineignore` 的文件定义不需要上传的文件列表（编译产生的临时文件等在运行时不需要的文件）。它的语法类似于 `.gitignore`, 每行一个表达式，例如 `**/node_modules/**` 表示忽略任意层级下的 node_modules 目录，`*.pyc` 表示忽略拓展名为 pyc 的文件。

## Bash Completion

下载 [avoscloud_completion.sh](https://github.com/avoscloud/avoscloud-code-command/blob/master/avoscloud_completion.sh) 保存到某个目录，例如保存为 `~/.avoscloud_completion.sh`，然后在 `.bashrc` 或者 `.bash_profile` 文件中添加：

```
source ~/.avoscloud_completion.sh
```

重启终端 bash，或者重新加载 profile 文件，就可以让 `avoscloud` 命令拥有自动完成功能。

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

部署、发布等命令在第一次运行的时候要求输入应用的 master key，您可以在 LeanCloud 平台的应用设置里找到 master key。输入后，命令行工具会将这个应用信息记录在 `~/.leancloud/app_keys` 中（0600 文件权限模式）。如果您在认证过程中出现问题，或在公共机器上使用命令行工具，可运行 `avoscloud clear` 来删除认证信息。

## 贡献者

感谢下列用户提交的 Patch:

* [GongT](https://github.com/GongT)

## CopyRight

* License: [GNU LGPL](https://www.gnu.org/licenses/lgpl.html).
* Author: LeanCloud.cn (support@leancloud.cn)
