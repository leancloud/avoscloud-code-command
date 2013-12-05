var AV = require('avoscloud-sdk').AV;

exports.requestCloud = function (router, data, method, options){
	var dataObject,url;

	if (AV.applicationId == null) {
		throw "You must specify your applicationId using AV.initialize";
	}
	if (AV.applicationKey == null) {
		throw "You must specify a key using AV.initialize";
	}
	url = AV.serverURL;
	if (url.charAt(url.length - 1) !== "/") {
		url += "/";
	}
	url += "1/" + router;
	dataObject = data || {};
	dataObject._method = method;
	method = "POST";
	dataObject._ApplicationId = AV.applicationId;
	dataObject._ApplicationKey = AV.applicationKey;
	dataObject._ClientVersion = AV.VERSION;
	dataObject._ApplicationProduction = AV.production
	data = JSON.stringify(dataObject);
	options = options || {};
	return AV._ajax(method, url, data, options.success, options.error);
}

function s4() {
	return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
};

exports.guid = function() {
	return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
}
