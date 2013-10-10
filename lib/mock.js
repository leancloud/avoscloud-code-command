var mock = require('./cloud_code.js');
var fs = require('fs');

exports.run = function(){
	var arguments = process.argv.splice(2);
	var cloudProjectPath = arguments[0] || "./";
	cloudProjectPath = fs.realpathSync(cloudProjectPath);
	if(!cloudProjectPath.match(/.*\/$/))
		cloudProjectPath = cloudProjectPath + "/";
	mock.runCloudCode(cloudProjectPath);
}