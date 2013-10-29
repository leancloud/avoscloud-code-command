## 更新日志

* 2013-10-29 更新0.2.3 beta版本，支持从浏览器测试函数，hook等。
* 2013-10-18 更新0.2.2 beta版本，支持代码热加载，修复httpRequest没有返回data的bug。
* 2013-10-18 更新0.2.1版本，修复AV.Cloud.httpRequest
* 2013-10-17 更新0.2.0版本，添加定时器API


## 说明

为了方便本地运行和调试云代码，请遵照下列步骤进行:

* 要在本地调试云代码，你需要安装[node.js](http://nodejs.org)最新版本。
* 运行命令: `sudo npm install -g avoscloud-code-mock-sdk` 安装调试SDK。以后更新升级也请执行此命令。
* 在项目根目录运行`avoscloud`，将启动本地调试服务器。
* 访问`http://localhost:3000/`即可访问到你的云主机代码，子路径按照你在`app.js`里配置的即可访问。
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
