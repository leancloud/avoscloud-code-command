'use strict';
var path = require('path');
var AV = require('avoscloud-sdk');

var PORT = process.env.LC_APP_PORT;

AV.init({
  appId: process.env.LC_APP_ID,
  appKey: process.env.LC_APP_KEY,
  masterKey: process.env.LC_APP_MASTER_KEY
})

AV.Cloud.useMasterKey();

var CLOUD_PATH = path.resolve('.');

if (!CLOUD_PATH.match(/.*\/$/)) {
    CLOUD_PATH = CLOUD_PATH + path.sep;
}

require('../lib/mock').run(CLOUD_PATH, AV, PORT);
console.log("请使用浏览器打开 http://localhost:" + PORT + "/avos");
