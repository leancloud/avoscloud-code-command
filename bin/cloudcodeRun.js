'use strict';
var path = require('path');
var AV = require('avoscloud-sdk').AV;

var APP_ID = process.env.LC_APP_ID;
var APP_KEY = process.env.LC_APP_KEY;
var MASTER_KEY = process.env.LC_APP_MASTER_KEY;
var PORT = process.env.LC_APP_PORT;

AV.initialize(APP_ID, APP_KEY, MASTER_KEY);
AV.Cloud.useMasterKey();

var CLOUD_PATH = path.resolve('.');

if (!CLOUD_PATH.match(/.*\/$/)) {
    CLOUD_PATH = CLOUD_PATH + path.sep;
}

require('../lib/mock').run(CLOUD_PATH, AV, PORT);
console.log("请使用浏览器打开 http://localhost:" + PORT + "/avos");
