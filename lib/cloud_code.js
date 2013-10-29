var AV = require('avoscloud-sdk').AV;
var underscore = require('underscore');
var http = require('http');
var https = require('https');
var urlParser = require('url');
var querystring = require('querystring');
var util = require('util');
var express = require('express');
var path = require('path');
var fs = require('fs');
var _ = require('underscore');
var cronJob = require('cron').CronJob;
var qs = require('qs');

var Global = {}

var _ref, _ref1;
if ((_ref = https.globalAgent) != null) {
	if ((_ref1 = _ref.options) != null) {
		_ref1.rejectUnauthorized = false;
	}
}


function MockRequest(object, params, user){
	this.object = object;
	this.params = params || object;
    this.user = user;
}


function MockResponse(options){
	this._options = options;
}

MockResponse.prototype = {
	success: function(data){
		this._options.success(data);
	},
    error: function(err){
		this._options.error(err);
	}
}

exports.MockRequest = MockRequest
exports.MockResponse = MockResponse

//Mock functions in cloud code.

//Mock http request
var HOOK_PREFIX = "_hook_";
var className = function(clazz) {
	if (underscore.isString(clazz)) {
		return HOOK_PREFIX + clazz;
	}
	if (clazz.className != null) {
		return HOOK_PREFIX + clazz.className;
	}
	throw "Unknown class:" + clazz;
};

//Mock functions
Global.funcs = {};
AV.Cloud.define = function(name, func){
	Global.funcs[name] = func;
};
AV.Cloud.beforeSave = function(name, func){
	Global.funcs[className(name) + "_beforeSave"] = func;
};
AV.Cloud.afterSave = function(name, func){
	Global.funcs[className(name) + "_afterSave"] = func;
};
AV.Cloud.afterUpdate = function(name, func){
	Global.funcs[className(name) + "_afterUpdate"] = func;
};
AV.Cloud.beforeDelete = function(name, func){
	Global.funcs[className(name) + "_beforeDelete"] = func;
};
AV.Cloud.afterDelete = function(name, func){
	Global.funcs[className(name) + "_afterDelete"] = func;
};

function runFunc(name, req, res){
	if(!Global.funcs[name])
		throw "Could not find function:" + name;
    Global.funcs[name].call(this, req, res);
}
function runBeforeSave(name, req, res){
	runFunc(className(name) + "_beforeSave", req, res);
}
function runAfterSave(name, req, res){
	runFunc(className(name) + "_afterSave", req, res);
}
function runAfterUpdate(name, req, res){
	runFunc(className(name) + "_afterUpdate", req, res);
}
function runBeforeDelete(name, req, res){
	runFunc(className(name) + "_beforeDelete", req, res);
}
function runAfterDelete(name, req, res){
	runFunc(className(name) + "_afterDelete", req, res);
}

exports.runFunc = runFunc
exports.runBeforeSave = runBeforeSave
exports.runAfterSave  = runAfterSave
exports.runAfterUpdate = runAfterUpdate
exports.runBeforeDelete = runBeforeDelete
exports.runAfterDelete = runAfterDelete

AV.Cloud.setInterval = function(name, interval, func){
	if (!/[a-zA-Z0-9]+/.exec(name)) {
		throw "The timer name must be an valid identifier.";
	}
	if ((typeof func) !== 'function') {
		throw "The func must be a function.";
	}
	if ((typeof interval) !== 'number') {
		throw "The interval must be a valid integer in seconds.";
	}
	new cronJob('*/'+interval+' * * * * *', func, null, true);
};

AV.Cloud.cronJob = function(name, cron, func) {

	if (!/[a-zA-Z0-9]+/.exec(name)) {
		throw "The timer name must be an valid identifier.";
	}
	if ((typeof func) !== 'function') {
		throw "The func must be a function.";
	}
	if ((typeof cron) !== 'string') {
		throw "The cron must be a valid string in the form of 'sec min hour dayOfMonth month dayOfWeek [year]'.";
	}
	if (cron.split(" ").length < 6) {
		throw "The cron must be a valid string in the form of 'sec min hour dayOfMonth month dayOfWeek [year]'.";
	}
	new cronJob(cron, func, null, true);
};

HTTPResponse = (function() {
	function HTTPResponse(buffer, headers, response, status, text) {
		this.buffer = buffer != null ? buffer : null;
		this.headers = headers != null ? headers : {};
		this.response = response != null ? response : null;
		this.status = status != null ? status : null;
		this.text = text != null ? text : null;
	}

	return HTTPResponse;

})();

mimeTypes = [
	{
		pattern: /^text\/plain.*/i,
		process: function(res) {
			return res.text;
		}
	}, {
		pattern: /^application\/json.*/i,
		process: function(res) {
			return JSON.parse(res.text);
		}
	}, {
		pattern: /^application\/x-www-form-urlencoded/i,
		process: function(res) {
			return qs.parse(res.buffer);
		}
	}
];

trySetData = function(httpRes) {
	var contentType, type;

	contentType = httpRes.headers['content-type'];
	type = _.find(mimeTypes, function(mimeType) {
		return mimeType.pattern.exec(contentType);
	});
	if (type != null) {
		try{
			return httpRes.data = type.process(httpRes);
		}catch(e){
			httpRes.data = httpRes.buffer;
		}
	} else {
		return httpRes.data = httpRes.buffer;
	}
};

AV.Cloud.HTTPResponse = HTTPResponse;

AV.Cloud.httpRequest = function(options) {
	var body, headers, hostname, httpResponse, http_module, method, params, parsedRes, path, port, promise, request, requestOptions, search, url;

	options = options || {};
	options.agent = false;
	url = options.url;
	http_module = /^https.*/.exec(url) ? https : http;
	promise = new AV.Promise();
	params = options.params;
	headers = options.headers || "";
	method = options.method || "GET";
	body = options.body;
	parsedRes = urlParser.parse(url);
	hostname = parsedRes.hostname;
	port = parsedRes.port || 80;
	path = parsedRes.path;
	search = parsedRes.search;
	if (params != null) {
		path = search == null ? path + '?' : path + '&';
		if (typeof params === 'string') {
			params = querystring.parse(params);
		}
		params = querystring.stringify(params);
		path = path + params;
	}
	delete options.params;
	delete options.body;
	delete options.url;
	requestOptions = {
		host: hostname,
		port: port,
		method: method,
		headers: headers,
		path: path
	};
	requestOptions = _.extend(requestOptions, options);
	httpResponse = new HTTPResponse;
	request = http_module.request(requestOptions, function(res) {
		var chunkList, contentLength;
		httpResponse.headers = res.headers || {};
		httpResponse.status = res.statusCode;
		httpResponse.text = '';
		chunkList = [];
		contentLength = 0;
		res.on('data', function(chunk) {
			httpResponse.text += chunk.toString();
			contentLength += chunk.length;
			return chunkList.push(chunk);
		});
		return res.on('end', function() {
			var chunk, pos, _i, _len;

			httpResponse.buffer = new Buffer(contentLength);
			pos = 0;
			for (_i = 0, _len = chunkList.length; _i < _len; _i++) {
				chunk = chunkList[_i];
				chunk.copy(httpResponse.buffer, pos);
				pos += chunk.length;
			}
			trySetData(httpResponse);
			if (httpResponse.status < 200 || httpResponse.status >= 400) {
				return promise.reject(httpResponse);
			} else {
				return promise.resolve(httpResponse);
			}
		});
	});
	request.on('error', function(e) {
		httpResponse.text = util.inspect(e);
		httpResponse.status = 500;
		return promise.reject(httpResponse);
	});
	request.end(body);
	return promise._thenRunCallbacks(options);
};

Global.files = {}

function watchFile(f, name){
	if(Global.files[f])
		return;
	Global.files[f] = true;
	fs.watchFile(f,{ persistent: true, interval: 2000 },function(curr, prev){
		if(curr.mtime != prev.mtime){
			console.log("File " + f + " is changed,reload it...");
			requireFromFile(f, name);
		}
	});
}

//Mock express
var Module = module.constructor;
var paths = module.paths;
function requireFromFile(path, filename) {
    var src = fs.readFileSync(path, 'utf-8');
	var m = new Module();
	m.paths = module.paths;
	m._compile("var AV = require('avoscloud-sdk').AV;var __production=0; \n" + src, filename);
	watchFile(path,filename);
	return m.exports;
}


Module.prototype.require = function(id) {
	if(id.match(/^cloud\//)){
		id = Global.rootPath + id;
		return requireFromFile(require.resolve(id), id);
	}
	result = Module._load(id, this);
    if(id == 'express'){
		oldExpress = result;
		result = function(){
			if(Global.app!=null){
				delete Global.app.routes.get;
				delete Global.app.routes.post;
				delete Global.app.routes.put;
				delete Global.app.routes.delete;
				delete Global.app.routes.options;
				addSystemEndpoints(Global.app);
				return Global.app;
			}
			var app = oldExpress();
			app.__listen = app.listen;
			app.listen =  function(){
				var configDir, jsonFile, publicDir, views;
				jsonFile = require.resolve(Global.rootPath + 'config/global.json');
				configDir = path.dirname(jsonFile);
				views = path.resolve(configDir, '../' + (this.get('views')));
				publicDir = path.resolve(configDir, '../public');
				this.set('views', views);
				this.use(oldExpress["static"](publicDir));
				this.use(function(err, req, res, next) {
					if (err != null) {
						console.error("Error occured:" + err);
						return res.send(err);
					} else {
						return next();
					}
				});
				return this;
			};
			Global.app = app;
			return app;
		};
		result = _.extend(result, oldExpress);
	}
	return result;
};

var createObject = function(req, res, cb){
	var className = req.params.className;
	var object = new AV.Object(className);
	var body = req.body;
	if(body.id != null && body.id != ''){
		object = AV.Object.createWithoutData(className, body.id);
		object.fetch().then(function(obj){
			cb.call(this, object);
		}, function(err){
			res.send('Error :   ' + err.message);
		});
	}else{
		object._finishFetch(req.body, true);
		cb.call(this, object);
	}
}

function processRequest(type, req, res){
	if(type == 'object'){
		var func = req.params.func;
		var className = req.params.className;
		createObject(req, res, function(object){
			var mockReq = new MockRequest(object);
			var mockResp =new MockResponse({
				success: function(data){
					res.send("ok.");
				},
				error: function(err){
					console.log("Error occured:" + err);
					res.send("Error :   " + err);
				}
			});
			var target = null;
			switch(func){
			case "beforeSave":
				target = runBeforeSave;
				break;
			case "afterSave":
				target = runAfterSave;
				break;
			case "afterUpdate":
				target = runAfterUpdate;
				break;
			case "beforeDelete":
				target = runBeforeDelete;
				break;
			case "afterDelete":
				target = runAfterDelete;
				break;
			default:
				throw "Could not find function:" + func;
			}
			target.call(this, className, mockReq, mockResp);
		});
	}else{
		var mockReq = new MockRequest(null, req.body);
		var mockResp =new MockResponse({
			success: function(data){
				res.send(data);
			},
			error: function(err){
				console.log("Error occured:" + err);
				res.send("Error :   " + err);
			}
		});
		runFunc(req.params.name, mockReq, mockResp);
	}
}
var lib = path.join(path.dirname(fs.realpathSync(__filename)), '../lib');
var extractFuncs = function(cb){
	var funcs = [];
	var classes = [];
	for(var f in Global.funcs){
		if(!new RegExp('^' + HOOK_PREFIX).exec(f)){
			funcs.push(f);
		}else{
			var idx = f.lastIndexOf("_");
			var className = f.substring(HOOK_PREFIX.length, idx);
			var method = f.substring(idx + 1);
			classes[className] = classes[className]  || []
			classes[className].push(method);
		}
	}
	cb.call(this, funcs, classes);
}
function addSystemEndpoints(app){
    //Added test endpoints.
	app.post("/avos/:className/:func", function(req, res){
		processRequest('object', req, res);
	});
	app.post("/avos/:name", function(req, res){
		processRequest("function", req, res);
	});
	app.get("/avos", function(req, res){
		res.sendfile(lib + "/index.html");
	});
	app.get("/avos/classes", function(req, res){
		extractFuncs(function(funcs, classes){
			res.send(_.keys(classes));
		});
	});
	app.get("/avos/functions", function(req, res){
		extractFuncs(function(funcs, classes){
			var className = req.query.className;
			if(className == null){
				res.send(funcs);
			}else{
				res.send(classes[className] || []);
			}
		});
	});
}

exports.runCloudCode = function(rootPath){
	Global.rootPath = rootPath;
	//initialize SDK.
    if(!fs.existsSync(Global.rootPath + 'config/global.json'))
		throw "Cloud not find config/global.json";
    if(!fs.existsSync(Global.rootPath + 'cloud/main.js'))
		throw "Cloud not find config/global.json";

	var globalJSON = fs.readFileSync(Global.rootPath + 'config/global.json', 'utf-8')
	var data = JSON.parse(globalJSON);
	AV.initialize(data.applicationId, data.applicationKey);

    //Load main.js
	var cloudPath = path.resolve(Global.rootPath + 'cloud/main.js');
	requireFromFile(cloudPath, 'cloud/main.js');
    //Stratup mock server.
	var app = Global.app;
	if(!app){
		app = express();
		app.use(express.bodyParser());
	}
	var port = app.port || 3000;
	process.on('uncaughtException', function (err) {
		var msg = err;
		var stack = null;
		if(err.message){
			msg = err.message;
		}
		if(err.stack){
			stack = err.stack;
		}
		console.error((new Date).toUTCString() + ' uncaughtException:', msg);
		console.error(stack);
	});
	addSystemEndpoints(app);
	app.__listen(port, function() {
		return console.log("Mock Server is listening on " + port + "\nPress CTRL-C to stop server.");
	});
}
