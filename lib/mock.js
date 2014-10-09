var mock = require('./cloud_code.js');
var fs = require('fs');

exports.run = function(cloudProjectPath, masterKey) {
    mock.runCloudCode(cloudProjectPath, masterKey);
}