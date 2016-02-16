'use strict';
var mock = require('./cloud_code.js');

exports.run = function(cloudProjectPath, AV, port) {
    mock.runCloudCode(cloudProjectPath, AV, port);
};
