'use strict';
var path = require('path');
var express = require('express');
var request = require('request');
var crypto = require('crypto');
var _ = require('underscore');
var app = express();

app.use(express.static(path.join(__dirname, '..',  'public')));

app.get('/__engine/1/appInfo', function(req, res) {
  res.send({
    appId: app.get('appId'),
    appKey: app.get('appKey'),
    masterKey: app.get('masterKey'),
    leanenginePort: app.get('leanenginePort')
  });
});

app.get('/__engine/1/functions', function(req, res) {
  getFunctions(function(funcName) {
    return funcName.indexOf('__') !== 0;
  }, function(err, data) {
    res.send(data);
  });
});

app.get('/__engine/1/classes', function(req, res) {
  getFunctions(function(funcName) {
    return funcName.indexOf('__') === 0;
  }, function(err, data) {
    data = _.map(data, function(name) {
      return getClassName(name);
    });
    res.send(_.uniq(data));
  });
});

app.get('/__engine/1/classes/:className/actions', function(req, res) {
  var className = req.params.className;
  getFunctions(function(name) {
    return getClassName(name) === className;
  }, function(err, data) {
    data = _.map(data, function(name) {
      var result = {className: className};
      if (name.indexOf('__before_save_for_') === 0) {
        result.action = "beforeSave";
      }
      if (name.indexOf('__after_save_for_') === 0) {
        result.action = "afterSave";
      }
      if (name.indexOf('__before_update_for_') === 0) {
        result.action = "beforeUpdate";
      }
      if (name.indexOf('__after_update_for_') === 0) {
        result.action = "afterUpdate";
      }
      if (name.indexOf('__before_delete_for_') === 0) {
        result.action = "beforeDelete";
      }
      if (name.indexOf('__after_delete_for_') === 0) {
        result.action = "afterDelete";
      }
      if (name == '__on_login__User') {
        result.action = "onLogin";
      }

      if (name.indexOf('__before') === 0) {
        result.sign = signHook(app.get('masterKey'), '__before_for_' + className, Date.now());
      } else if (name.indexOf('__after') === 0) {
        result.sign = signHook(app.get('masterKey'), '__after_for_' + className, Date.now());
      }

      return result;
    });
    res.send(data);
  });
});

var getClassName = function(name) {
  var result = name.match(/__(?:before|after|on)_(?:save|update|delete|login)(?:_for)?_(.*)/);

  if (result)
    return result[1];
  else
    return name.substring(name.lastIndexOf('_') + 1);
};

var getFunctions = function(filter, cb) {
  request({
    method: 'GET',
    url: 'http://localhost:' + app.get('leanenginePort') + '/1.1/functions/_ops/metadatas',
    timeout: 2000,
    headers: {
      'x-avoscloud-application-id': app.get('appId'),
      'x-avoscloud-master-key': app.get('masterKey')
    }
  }, function(err, response, body) {
    body = JSON.parse(body);
    cb(null, _.filter(body.result, filter));
  });
};

function signHook(masterKey, hookName, ts) {
  return ts + ',' + crypto.createHmac('sha1', masterKey).update(hookName + ':' + ts).digest('hex');
}

module.exports = app;
