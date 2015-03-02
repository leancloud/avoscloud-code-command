var program = require('commander'),
  fs = require('fs'),
  path = require('path');

var version = JSON.parse(fs.readFileSync(path.join(path.dirname(fs.realpathSync(__filename)), "..", "package.json"))).version;

exports.parse_args = function(argv){
  program
      .version(version)
      .usage("[选项] <命令> \n\n  有效的命令列表包括: \n    " +
          "deploy: 部署云代码到 AVOS Cloud 平台开发环境\n    " +
          "undeploy: 从 AVOS Cloud 平台清除云代码部署，包括生产环境和开发环境\n    " +
          "status: 查询当前部署状态\n    " +
          "search <keyword>: 根据关键字查询开发文档\n    " +
          "publish: 发布开发环境代码到生产环境\n    " +
          "new: 创建云代码项目\n    " +
          "logs: 查看云代码日志\n    " +
          "clear: 清除本地状态，在输入 app id 或者 master key 错误的情况下使用\n    " +
          "upload <file-or-directory>: 导入文件到 AVOS Cloud 平台，如果是目录，则会将该目录下的文件递归导入。\n    " +
          "app [list]:  显示当前应用，deploy、status 等命令运行在当前应用上，如果加上 list ，则显示所有的应用信息。\n    " +
          "checkout <app>: 切换到一个应用，deploy、status 等命令将运行在该应用上。\n    " +
          "add <app>: 添加一个应用。\n    " +
          "rm <app>: 移除一个应用。\n    " +
          "lint: 静态检查代码错误。\n    " +
          "cql: 进入 CQL 查询交互。")
      .option('-f, --filepath <path>', '本地云代码项目根路径，默认是当前目录。')
      .option('-g, --git', '使用定义在管理平台的 git 仓库或者 -u 指定的 git 仓库部署云代码，默认使用本地代码部署。')
      .option('-p, --project <app>', '命令运行在指定应用上，默认运行在当前应用或者 origin 应用上。')
      .option('-l, --local', '使用本地代码部署云代码，该选项是默认选中。')
      .option('-o, --log <log>', '本次部署的提交日志，仅对从本地部署有效。')
      .option('-n, --lines <lines>', '查看多少行最新的云代码日志，默认 10 行。', 10)
      .option('-t, --tailf', '自动刷新云代码日志，结合 logs 命令使用。', 1)
      .option('-r, --revision <revision>', 'git 的版本号，仅对从 git 仓库部署有效。')
      .option('-P, --port <port>', '指定本地调试的端口，默认 3000。', 3000)
      .parse(argv);
  return program;
}
