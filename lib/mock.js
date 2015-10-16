var mock = require('./cloud_code.js');
var fs = require('fs');

exports.run = function(cloudProjectPath, AV, port, host) {
    mock.runCloudCode(cloudProjectPath, AV, port, host);
}
