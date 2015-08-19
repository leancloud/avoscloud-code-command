var AV = require('avoscloud-sdk').AV;
var fs = require('fs');
var crypto = require('crypto');

exports.requestCloud = function(router, data, method, options, jsonReq) {
    var dataObject, url;

    if (!AV.applicationId) {
        throw "You must specify your applicationId using AV.initialize";
    }
    if (!AV.applicationKey) {
        throw "You must specify a key using AV.initialize";
    }
    url = AV.serverURL;
    if (url.charAt(url.length - 1) !== "/") {
        url += "/";
    }
    url += "1/" + router;
    dataObject = data || {};
    dataObject._method = method;

    dataObject._ApplicationId = AV.applicationId;
    dataObject._ApplicationKey = AV.applicationKey;
    dataObject._ClientVersion = AV.VERSION;
    dataObject._ApplicationProduction = AV.production;
    data = JSON.stringify(dataObject);
    options = options || {};
    if (jsonReq) {
        return ajax(method, url, data, options.success, options.error);
    } else {
        method = "POST";
        return AV._ajax(method, url, data, options.success, options.error);
    }
};

exports.requestRedis = function(server, db, command, options) {
  var url = 'http://localhost:3000/redis/' + server + '/' + db;
  var handled = false;
  var xhr = new AV.XMLHttpRequest();
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (handled) {
        return;
      }
      handled = true;
      if (xhr.status >= 200 && xhr.status < 300) {
        options.success(xhr.responseText);
      } else {
        options.error(xhr.responseText);
      }
    }
  };
  xhr.open('POST', url, true);
  xhr.setRequestHeader('Content-Type', 'text/plain; charset=utf-8');
  xhr.send(command);
};

ajax = function(method, url, data, success, error, appId, appKey) {
    var options = {
        success: success,
        error: error
    };

    var promise = new AV.Promise();
    var handled = false;

    var xhr = new AV.XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            if (handled) {
                return;
            }
            handled = true;
            if (xhr.status >= 200 && xhr.status < 300) {
                var response;
                try {
                    response = JSON.parse(xhr.responseText);
                } catch (e) {
                    promise.reject(e);
                }
                if (response) {
                    promise.resolve(response, xhr.status, xhr);
                }
            } else {
                promise.reject(xhr);
            }
        }
    };
    xhr.open(method, url, true);
    xhr.setRequestHeader("Content-Type", "application/json;charset=utf-8");
    if(appId || AV.applicationId) {
        xhr.setRequestHeader("X-AVOSCloud-Application-Id", appId || AV.applicationId);
    }
    if(appKey || AV.applicationKey) {
        xhr.setRequestHeader("X-AVOSCloud-Application-Key", appKey || AV.applicationKey);
    }
    if (AV._isNode) {
        // Add a special user agent just for request from node.js.
        xhr.setRequestHeader("User-Agent",
            "AV Mock SDK/" + AV.VERSION +
            " (NodeJS " + process.versions.node + " .)");
    }
    xhr.send(data);
    return promise._thenRunCallbacks(options);
};

function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
}

function checksum(data) {
    return crypto
        .createHash('md5')
        .update(data)
        .digest('hex');
}
exports.checksumFile = function(f, cb) {
    fs.readFile(f, function(err, data) {
        if (err)
            return cb(err);
        cb(null, checksum(data));
    });
};

exports.ajax = ajax;

exports.guid = function() {
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
};
