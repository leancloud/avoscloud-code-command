var mock = require('./cloud_code.js');
var fs = require('fs');

exports.run = function(cloudProjectPath){
	if(!cloudProjectPath.match(/.*\/$/))
		cloudProjectPath = cloudProjectPath + "/";
	mock.runCloudCode(cloudProjectPath);
}
