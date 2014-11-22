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
iconvlite = require('iconv-lite');

var Global = {}

var _ref, _ref1;
if ((_ref = https.globalAgent) != null) {
    if ((_ref1 = _ref.options) != null) {
        _ref1.rejectUnauthorized = false;
    }
}


function MockRequest(object, params, user) {
    this.object = object;
    this.params = params || object;
    this.user = user;
}


function MockResponse(options) {
    this._options = options;
}

MockResponse.prototype = {
    success: function(data) {
        this._options.success(data);
    },
    error: function(err) {
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
AV.Cloud.define = function(name, func) {
    Global.funcs[name] = func;
};
AV.Cloud.beforeSave = function(name, func) {
    Global.funcs[className(name) + "_beforeSave"] = func;
};
AV.Cloud.afterSave = function(name, func) {
    Global.funcs[className(name) + "_afterSave"] = func;
};
AV.Cloud.afterUpdate = function(name, func) {
    Global.funcs[className(name) + "_afterUpdate"] = func;
};
AV.Cloud.beforeDelete = function(name, func) {
    Global.funcs[className(name) + "_beforeDelete"] = func;
};
AV.Cloud.afterDelete = function(name, func) {
    Global.funcs[className(name) + "_afterDelete"] = func;
};

AV.Cloud.onVerified = function(type, func) {
    Global.funcs[type + "_onVerified"] = func;
};

if (AV.User._old_logOut == null) {
    AV.User._old_logOut = AV.User.logOut;
    AV.User.logOut = function(reserveSession) {
        var req;

        AV.User._old_logOut();
        if ((AV.Cloud.__express_req != null) && (reserveSession == null)) {
            req = AV.Cloud.__express_req;
            return delete req._avos_session;
        }
    };
}

if (AV.User._old_saveCurrentUser == null) {
    AV.User._old_saveCurrentUser = AV.User._saveCurrentUser;
    AV.User._saveCurrentUser = function(user, old) {
        var req, session;
        if (AV.User._currentUser !== user && AV.User._currentUser) {
            AV.User.logOut(true);
        }
        AV.User._currentUser = user;
        AV.User._old_saveCurrentUser(user);
        if ((!old) && (AV.Cloud.__express_req != null) && (user != null)) {
            req = AV.Cloud.__express_req;
            session = req._avos_session;
            if (session != null) {
                session._uid = user.id;
                return session._sessionToken = user._sessionToken;
            }
        }
    };
}

function runFunc(name, req, res) {
    if (!Global.funcs[name])
        throw "Could not find function:" + name;
    Global.funcs[name].call(this, req, res);
}

function runBeforeSave(name, req, res) {
    runFunc(className(name) + "_beforeSave", req, res);
}

function runAfterSave(name, req, res) {
    runFunc(className(name) + "_afterSave", req, res);
}

function runAfterUpdate(name, req, res) {
    runFunc(className(name) + "_afterUpdate", req, res);
}

function runBeforeDelete(name, req, res) {
    runFunc(className(name) + "_beforeDelete", req, res);
}

function runAfterDelete(name, req, res) {
    runFunc(className(name) + "_afterDelete", req, res);
}

function runOnVerified(type, req, res) {
    runFunc(type + "_onVerified", req, res);
}

exports.runFunc = runFunc
exports.runBeforeSave = runBeforeSave
exports.runAfterSave = runAfterSave
exports.runOnVerified = runOnVerified
exports.runAfterUpdate = runAfterUpdate
exports.runBeforeDelete = runBeforeDelete
exports.runAfterDelete = runAfterDelete

AV.Cloud.setInterval = function(name, interval, func) {
    if (!/[a-zA-Z0-9]+/.exec(name)) {
        throw "The timer name must be an valid identifier.";
    }
    if ((typeof func) !== 'function') {
        throw "The func must be a function.";
    }
    if ((typeof interval) !== 'number') {
        throw "The interval must be a valid integer in seconds.";
    }
    new cronJob('*/' + interval + ' * * * * *', func, null, true);
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

mimeTypes = [{
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
}];

trySetData = function(httpRes) {
    var contentType, type;

    contentType = httpRes.headers['content-type'];
    type = _.find(mimeTypes, function(mimeType) {
        return mimeType.pattern.exec(contentType);
    });
    if (type != null) {
        try {
            return httpRes.data = type.process(httpRes);
        } catch (e) {
            httpRes.data = httpRes.buffer;
        }
    } else {
        return httpRes.data = httpRes.buffer;
    }
};

AV.Cloud.HTTPResponse = HTTPResponse;

var castBody = function(body, contentType) {
    if (body == null) {
        return body;
    } else if (typeof body === 'string') {
        return body;
    } else if (Buffer.isBuffer(body)) {
        return body;
    } else if (typeof body === 'object') {
        if (/^application\/json.*/i.test(contentType)) {
            return JSON.stringify(body);
        } else if ((contentType == null) || /^application\/x-www-form-urlencoded/i.test(contentType)) {
            return qs.stringify(body);
        }
        throw "Invalid request body.";
    } else {
        throw "Invalid request body.";
    }
};
AV.Cloud.httpRequest = function(options) {
    var body, headers, hostname, httpResponse, http_module, method, params, parsedRes, path, port, promise, request, requestOptions, search, url, text;

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
    if (/^https.*/.exec(url) && parsedRes.port == null) {
        port = 443;
    }
    path = parsedRes.path;
    text = (options.text != null ? options.text : true);
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
    delete options.text;
    var contentType = headers['Content-Type'] || headers['content-type'];
    if ((method === 'POST') && (contentType == null)) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=utf-8';
    }
    var theBody = castBody(body, headers['Content-Type'] || headers['content-type']);
    var contentLen = theBody != null ? theBody.length : 0;
    if (headers["Content-Length"] == null) {
        headers["Content-Length"] = contentLen;
    }
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
        var chunkList, contentLength, encoding, matches, responseContentType;

        httpResponse.headers = res.headers || {};
        httpResponse.status = res.statusCode;
        responseContentType = res.headers['content-type'] || '';
        encoding = (matches = responseContentType.match(/.*charset=(.*)/i)) ? matches[1].trim().replace(/'|"/gm, '') : "utf8";
        if (encoding === 'utf-8' || encoding === "UTF-8") {
            encoding = "utf8";
        }
        if (text) {
            httpResponse.text = '';
        }
        chunkList = [];
        contentLength = 0;
        res.on('data', function(chunk) {
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
            if (text) {
                httpResponse.text = iconvlite.decode(httpResponse.buffer, encoding);
            }
            trySetData(httpResponse);
            if (httpResponse.status < 200 || httpResponse.status >= 400) {
                return promise.reject(httpResponse);
            } else {
                return promise.resolve(httpResponse);
            }
        });
    });
    request.setTimeout(options.timeout || 10000, function() {
        request.abort();
    });
    request.on('error', function(e) {
        httpResponse.text = util.inspect(e);
        httpResponse.status = 500;
        return promise.reject(httpResponse);
    });
    request.end(theBody);
    return promise._thenRunCallbacks(options);
};

Global.files = {}

function watchFile(f, name) {
    if (Global.files[f])
        return;
    Global.files[f] = true;
    fs.watchFile(f, {
        persistent: true,
        interval: 2000
    }, function(curr, prev) {
        if (curr.mtime != prev.mtime) {
            console.log("File " + f + " is changed,reload it...");
            requireFromFile(f, name, false);
        }
    });
}

//Mock express
var Module = module.constructor;
var paths = module.paths;
var cache = {};

function requireFromFile(path, filename, watch) {
    if (watch == null) {
        watch = true;
    }
    if (cache.hasOwnProperty(path)) {
        return cache[path].exports;
    }
    var src = fs.readFileSync(path, 'utf-8');
    var m = new Module();
    m.paths = module.paths;
    cache[path] = m;
    m._compile("var AV = require('avoscloud-sdk').AV;var __production=0; \n" + src, filename);
    if (watch)
        watchFile(path, filename);
    return m.exports;
}


Module.prototype.require = function(id) {
    if (id.match(/^cloud\//)) {
        id = Global.rootPath + id;
        return requireFromFile(require.resolve(id), id);
    }
    result = Module._load(id, this);
    if (id == 'express') {
        oldExpress = result;
        result = function() {
            if (Global.app != null) {
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
            app.listen = function() {
                var publicDir, views;
                views = path.join(Global.rootPath, this.get('views'));
                publicDir = path.join(Global.rootPath, 'public');
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

var createObject = function(req, res, cb) {
    var className = req.params.className;
    var object = new AV.Object(className);
    var body = req.body || {};
    if (body.id != null && body.id != '') {
        object = AV.Object.createWithoutData(className, body.id);
        object.fetch().then(function(obj) {
            cb.call(this, object);
        }, function(err) {
            res.send('Error :   ' + err.message);
        });
    } else {
        object._finishFetch(req.body.obj || {}, true);
        cb.call(this, object);
    }
}

function processRequest(type, req, res) {

    var processRequest0 = function(user) {
        if (user) {
            AV.User._currentUser = user;
            user._isCurrentUser = true;
        }
        if (type == 'object') {
            var func = req.params.func;
            var className = req.params.className;
            createObject(req, res, function(object) {
                var mockReq = new MockRequest(object, null, user);
                var mockResp = new MockResponse({
                    success: function(data) {
                        res.send("ok.");
                    },
                    error: function(err) {
                        console.log("Error occured:" + err);
                        res.send("Error :   " + err);
                    }
                });
                var target = null;
                switch (func) {
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
        } else {
            var mockReq = new MockRequest(null, req.body.params || req.body, user);
            var mockResp = new MockResponse({
                success: function(data) {
                    res.send({
                        result: data
                    });
                },
                error: function(err) {
                    console.log("Error occured:" + err);
                    res.send({
                        code: 1,
                        error: err.message || err
                    });
                }
            });
            runFunc(req.params.name, mockReq, mockResp);
        }
    }
    var user = null;
    var uid = req.body.uid;
    var sessionToken = req.headers['x-avoscloud-session-token'];
    if (uid || sessionToken) {
        user = new AV.User();
        if (uid) {
            user.id = uid;
            user.fetch().then(function(user) {
                processRequest0(user);
            }, function(err) {
                console.log("Fetch user failed:%j", err);
                res.send({
                    code: 1,
                    error: err.message || err
                });
            });
        } else {
            user._finishFetch({
                session_token: sessionToken
            });
            var success = function(user) {
                if (user != null) {
                    delete user._serverData.session_token;
                }
                processRequest0(user);
            };
            return user.logIn().then(success, function(err) {
                console.log("Fetch user failed:%j", err);
                res.send('Error:' + err.message);
            });
        }
    } else {
        processRequest0();
    }
}
var lib = path.join(path.dirname(fs.realpathSync(__filename)), '../lib');
var extractFuncs = function(cb) {
    var funcs = [];
    var classes = [];
    for (var f in Global.funcs) {
        if (!new RegExp('^' + HOOK_PREFIX).exec(f)) {
            funcs.push(f);
        } else {
            var idx = f.lastIndexOf("_");
            var className = f.substring(HOOK_PREFIX.length, idx);
            var method = f.substring(idx + 1);
            classes[className] = classes[className] || []
            classes[className].push(method);
        }
    }
    cb.call(this, funcs, classes);
}

function addSystemEndpoints(app) {
    //Added test endpoints.
    app.post("/avos/:className/:func", function(req, res) {
        processRequest('object', req, res);
    });
    app.post("/avos/:name", function(req, res) {
        processRequest("function", req, res);
    });
    app.get("/avos", function(req, res) {
        res.sendfile(lib + "/index.html");
    });
    app.get("/avos/classes", function(req, res) {
        extractFuncs(function(funcs, classes) {
            res.send(_.keys(classes));
        });
    });
    app.get("/avos/functions", function(req, res) {
        extractFuncs(function(funcs, classes) {
            var className = req.query.className;
            if (className == null) {
                res.send(funcs);
            } else {
                res.send(classes[className] || []);
            }
        });
    });
}

exports.runCloudCode = function(rootPath, sdk, port) {
    Global.rootPath = rootPath;
    //initialize SDK.
    if (!fs.existsSync(Global.rootPath + 'cloud/main.js'))
        throw "Cloud not find cloud/main.js";
    AV._initialize(sdk.applicationId, sdk.applicationKey, sdk.masterKey);
    if (sdk.masterKey) {
        AV.Cloud.useMasterKey();
    }

    //Load main.js
    var cloudPath = path.resolve(Global.rootPath + 'cloud/main.js');
    // Added node modules to paths
    module.paths.unshift(Global.rootPath + 'node_modules');
    requireFromFile(cloudPath, 'cloud/main.js');
    //Stratup mock server.
    var app = Global.app;
    if (!app) {
        app = express();
        app.use(express.bodyParser());
    }
    process.on('uncaughtException', function(err) {
        var msg = err;
        var stack = null;
        if (err.message) {
            msg = err.message;
        }
        if (err.stack) {
            stack = err.stack;
        }
        console.error((new Date).toUTCString() + ' uncaughtException:', msg);
        console.error(stack);
    });
    addSystemEndpoints(app);
    if (app.__listen) {
        app.__listen(port, function() {
            return console.log("Mock Server is listening on " + port + "\nPress CTRL-C to stop server.");
        });
    } else {
        app.listen(port, function() {
            return console.log("Mock Server is listening on " + port + "\nPress CTRL-C to stop server.");
        });
    }
}
