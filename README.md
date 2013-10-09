## 说明

为了方便本地运行和调试云代码，请遵照下列步骤进行:

* 下载本目录下的三个文件(`package.json`,`cloud_code.js`,`mock.js`)，放到你的云代码项目的根目录，跟cloud目录平级。
* 将下面内容添加到项目的`.gitignore`文件:

```
node_modules/
package.json
cloud_code.js
mock.js
local_storage.json
```

* 要在本地调试云代码，你需要安装[node.js](http://nodejs.org)最新版本。
* 在项目根目录运行`npm install -d`安装依赖。
* 在项目根目录运行命令 `node mock.js`启动调试服务器。
* 访问`http://localhost:3000/`即可访问到你的云主机代码，子路径按照你在`app.js`里配置的即可访问。
* 测试函数:

```
curl -X POST -d '{ "name": "dennis"}' http://localhost:3000/avos/hello
```
其中hello是你通过`AV.Cloud.define`定义的函数名称。

* 测试beforeSave,afterSave,afterUpdate,beforeDelete/afterDelete等:
```
curl -X POST -d '{ "name": "dennis"}' http://localhost:3000/avos/MyUser/beforeSave
```
其中`MyUser`是className，beforeSave指定调用`MyUser`定义的beforeSave函数，其他函数类似。
