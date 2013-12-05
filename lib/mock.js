var mock = require('./cloud_code.js');
var fs = require('fs');

exports.run = function(cloudProjectPath){
	mock.runCloudCode(cloudProjectPath);
}
