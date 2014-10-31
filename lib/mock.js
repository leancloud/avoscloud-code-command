var mock = require('./cloud_code.js');
var fs = require('fs');

exports.run = function(cloudProjectPath, masterKey, port) {
    mock.runCloudCode(cloudProjectPath, masterKey, port);
}
