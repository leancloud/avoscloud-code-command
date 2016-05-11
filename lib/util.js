'use strict';
var AV = require('avoscloud-sdk');
var fs = require('fs');
var crypto = require('crypto');
var request = require('request');
var _ = require('underscore');

var debug = require('debug')('lean');

exports.callback = function(err) {
  if(!err) {
    return process.exit(0);
  }

  var message = err.message;

  if (!message) {
    if (_.isObject(err)) {
      message = JSON.stringify(err);
    } else {
      message = err;
    }
  }

  console.log("抱歉，%s失败：%s", err.action || '操作', message);
  debug(err.stack);
  process.exit(1);
};

/* options: appId, appKey, masterKey, method, data, apiServer */
exports.request = function(router, options, cb) {
  if (_.isFunction(options)) {
    cb = options;
    options = {};
  }
  var appId = options.appId || AV.applicationId;
  var appKey = options.appKey || AV.applicationKey;
  var masterKey = options.masterKey || AV.masterKey;
  var method = options.method || 'GET';
  var data = options.data;
  if (!appId) {
      throw "You must specify your applicationId using AV.initialize";
  }
  if (!appKey && !masterKey) {
      throw "You must specify a appKey or masterKey using AV.initialize";
  }
  var url = options.apiServer || AV._config.APIServerURL;
  if (url.charAt(url.length - 1) !== "/") {
      url += "/";
  }
  url += "1.1/" + router;
  var headers = {
      'x-avoscloud-application-id': appId,
      'X-AVOSCloud-Application-Production': AV.production || '1',
      'Content-Type': 'application/json',
      'User-Agent': 'AV Mock SDK/' + AV.VERSION +
        ' (NodeJS ' + process.versions.node + ' .)'
  };
  if (appKey) {
    headers['x-avoscloud-application-key'] = appKey;
  }
  if (masterKey) {
    headers['x-avoscloud-master-key'] = masterKey;
  }
  request({
    url: url,
    method: method,
    headers: headers,
    body: JSON.stringify(data)
  }, function(err, res, body) {
    if (err) {
      return cb(err);
    }
    try {
      body = JSON.parse(body);
    } catch (err) {
      var isHtml = /<title>([\s\S]+)<\/title>/i;
      if(isHtml.test(body)){
        body = isHtml.exec(body)[1];
      }
      body = {code: res.statusCode, error: body};
    }
    if (res.statusCode < 400) {
      return cb(null, body);
    }
    return cb(new Error('code: ' + body.code + ', error: ' + body.error));
  });
};

exports.getRedisInstances = function(cb) {
  var url = AV._config.APIServerURL + '/1.1/__cache/ops/instances';
  request({
    url: url,
    method: 'GET',
    headers: {
      'X-LC-Id': AV.applicationId,
      'X-LC-Key': AV.masterKey + ',master'
    },
    json:true
  }, function(err, res, body) {
    if (err) {
      return cb(err);
    }
    if (res.statusCode !== 200) {
      return cb(new Error(body.error));
    }
    cb(null, body);
  });
};

exports.requestRedis = function(server, db, command, cb) {
  var url = AV._config.APIServerURL + '/1.1/__cache/ops/instances/' + server + '/dbs/' + db;
  request({
    url: url,
    method: 'POST',
    headers: {
      'X-LC-Id': AV.applicationId,
      'X-LC-Key': AV.masterKey + ',master'
    },
    json:true,
    body: {'command': command}
  }, function(err, res, body) {
    if (err) {
      return cb(err);
    }
    if (res.statusCode !== 200) {
      return cb(new Error(body.error));
    }
    cb(null, body.result);
  });
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

exports.guid = function() {
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
};
