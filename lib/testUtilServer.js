'use strict';
var path = require('path');
var express = require('express');
var request = require('request');
var _ = require('underscore');
var app = express();

app.use(express.static(path.join(__dirname, '..',  'public')));

app.get('/__engine/1/appInfo', function(req, res) {
  res.send({
    appId: app.get('appId'),
    appKey: app.get('appKey'),
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
      return result;
    });
    res.send(data);
  });
});

var getClassName = function(name) {
  if (name.indexOf('__before_save_for_') === 0) {
    return name.replace('__before_save_for_', '');
  }
  if (name.indexOf('__after_save_for_') === 0) {
    return name.replace('__after_save_for_', '');
  }
  if (name.indexOf('__after_update_for_') === 0) {
    return name.replace('__after_update_for_', '');
  }
  if (name.indexOf('__before_delete_for_') === 0) {
    return name.replace('__before_delete_for_', '');
  }
  if (name.indexOf('__after_delete_for_') === 0) {
    return name.replace('__after_delete_for_', '');
  }
  if (name.indexOf('__on_login_') === 0) {
    return name.replace('__on_login_', '');
  }
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

module.exports = app;

