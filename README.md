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

详细的使用指南见 [云引擎命令行工具使用详解](http://leancloud.cn/docs/cloud_code_commandline.html)，更新日志见 [changelog.md](https://github.com/leancloud/avoscloud-code-command/blob/master/changelog.md)。

## 说明

为了方便本地运行和调试云引擎，请遵照下列步骤进行:

* 要在本地调试云引擎，你需要安装 [Node.js](http://nodejs.org) 最新版本。
* 运行命令：`sudo npm install -g avoscloud-code` 安装调试 SDK。以后更新升级也请执行此命令。
* 在项目根目录运行 `lean up`，将启动本地调试服务器。
* 访问 [localhost:3000](http://localhost:3000/) 即可访问本机启动的云引擎项目。
* 访问 [localhost:3001](http://localhost:3001) 调试云引擎函数和 class hook 函数等。
  * 云引擎 2.0 版访问 [localhost:3000/avos](http://localhost:3000/avos)

## 功能说明

`lean -h` 输出：

```
  Usage: lean [options] [command]


  Commands:

    up [options]                             本地启动云引擎应用。
    search <keywords...>                     根据关键字查询开发文档。
    new                                      创建引擎项目。
    deploy [options]                         部署到云引擎。
    publish [options]                        发布开发环境代码到生产环境。
    status [options]                         查询当前部署状态。
    undeploy [options]                       从 LeanEngine 平台清除云引擎部署，包括生产环境和开发环境。
    logs [options]                           查看云引擎日志。
    app                                      多应用管理，可以使用一个云引擎项目关联多个 LeanCloud 应用。
    cql [options]                            进入 CQL 查询交互。
    redis                                    LeanCache Redis 命令行。
    upload [options] <file-or-directory...>  导入文件到 LeanCloud 平台，如果是目录，则会将该目录下的文件递归导入。
    lint                                     静态检查代码错误。
    clear [options]                          清除本地状态，在输入 app id 或者 master key 错误的情况下使用。
    help [cmd]                               display help for [cmd]

  Options:

    -h, --help     output usage information
    -V, --version  output the version number
```

并且本工具具有代码热加载功能。修改代码后，无需重启即可以调试最新代码。

### 上传代码时忽略部分文件

在使用命令行工具上传代码时，你可以在项目目录新建一个名为 `.leanengineignore` 的文件定义不需要上传的文件列表（编译产生的临时文件等在运行时不需要的文件）。它的语法类似于 `.gitignore`, 每行一个表达式，例如 `**/node_modules/**` 表示忽略任意层级下的 node_modules 目录，`*.pyc` 表示忽略拓展名为 pyc 的文件。

## Bash Completion

下载 [avoscloud_completion.sh](https://github.com/avoscloud/avoscloud-code-command/blob/master/avoscloud_completion.sh) 保存到某个目录，例如保存为 `~/.avoscloud_completion.sh`，然后在 `.bashrc` 或者 `.bash_profile` 文件中添加：

```
source ~/.avoscloud_completion.sh
```

重启终端 bash，或者重新加载 profile 文件，就可以让 `lean` 命令拥有自动完成功能。

## 安全性

部署、发布等命令在第一次运行的时候要求输入应用的 master key，您可以在 LeanCloud 平台的应用设置里找到 master key。输入后，命令行工具会将这个应用信息记录在 `~/.leancloud/app_keys` 中（0600 文件权限模式）。如果您在认证过程中出现问题，或在公共机器上使用命令行工具，可运行 `lean clear` 来删除认证信息。

## 贡献者

感谢下列用户提交的 Patch:

* [GongT](https://github.com/GongT)

## CopyRight

* License: [GNU LGPL](https://www.gnu.org/licenses/lgpl.html).
* Author: LeanCloud.cn (support@leancloud.cn)
