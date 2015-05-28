var fs = require('fs');
var path = require('path');
var AV = require('avoscloud-sdk').AV;
var run = require('./run');
var commander = require('./commander');
var lib = path.join(path.dirname(fs.realpathSync(__filename)), '../lib');

var program = commander.parse_args(process.argv);
run.setPort(program.port);

var CLOUD_PATH = path.resolve('.');

if (!CLOUD_PATH.match(/.*\/$/)) {
    CLOUD_PATH = CLOUD_PATH + path.sep;
}

run.logProjectHome();
run.initAVOSCloudSDK(function(masterKey) {
    require(lib + '/mock').run(CLOUD_PATH, AV, run.getPort());
    console.log("请使用浏览器打开 http://localhost:" + run.getPort() + "/avos");
});
