#!/usr/bin/env node
'use strict';
/**
 * AVOS Cloud command-line tool
 * Author: dennis zhuang<xzhuang@avoscloud.com>
 * Project: https://github.com/avoscloud/avoscloud-code-command
 * Created by : Emacs JavaScript Mode
 */
var path = require('path');
var fs = require('fs');
var archiver = require('archiver');
var os = require('os');
var request = require('request');
var _ = require('underscore');
var nodemon = require('nodemon');
var AV = require('avoscloud-sdk');
var qiniu = require('qiniu');
var nodeUtil = require('util');
var sprintf = require("sprintf-js").sprintf;
var promptly = require('promptly');
var mime = require('mime');
var async = require('async');
var color = require('cli-color');
var Table = require('cli-table');
var AdmZip = require('adm-zip');
var Q = require('q');
var table = require('text-table');
var moment = require('moment');
var semver = require('semver');
var debug = require('debug')('lean');

var Runtime = require('../lib/runtime');
var util = require('../lib/util');

//set qiniu timeout
qiniu.conf.RPC_TIMEOUT = 3600000;

var IMPORT_FILE_BATCH_SIZE = 20;

var TMP_DIR = os.tmpdir();
if (!TMP_DIR.match(/.*\/$/)) {
    TMP_DIR = TMP_DIR + path.sep;
}

var version = require('../package.json').version;

var APP = null;
var CLOUD_PATH = path.resolve('.');
var ENGINE_INFO;

// 设置命令作用的 app
exports.setCurrentApp = function(app) {
  APP = app;
};

var setCloudPath = exports.setCloudPath = function(cloudPath) {
  CLOUD_PATH = cloudPath;
};

function exitWith(err) {
    console.error('[ERROR] ' + err);
    process.exit(1);
}

/**
 * Tried to get user's home directory by environment variable.
 */
function getUserHome() {
    var home = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH;
    if (!home)
        return exitWith("无法找到用户 HOME 目录");
    return home;
}

var leancloudFolder = path.join(getUserHome(), '.leancloud');
var leancloudAppKeysFile = path.join(leancloudFolder, 'app_keys');

exports.deleteMasterKeys = function(cb) {
  var home = getUserHome();
  var avoscloudKeysFile = path.join(home, '.avoscloud_keys');

  console.log("删除 " + avoscloudKeysFile + " ...");
  console.log("删除 " + leancloudAppKeysFile + " ...");
  Q.allSettled([
    Q.nfcall(fs.truncate, avoscloudKeysFile, 0),
    Q.nfcall(fs.truncate, leancloudAppKeysFile, 0)
  ]).spread(function(avosFile, lcFile) {
    if (avosFile.state === 'rejected' && avosFile.reason.code !== 'ENOENT') {
      return cb(new Error('删除 ' + avoscloudKeysFile + ' 失败：' + avosFile.reason.message));
    }
    if (lcFile.state === 'rejected' && lcFile.reason.code !== 'ENOENT') {
      return cb(new Error('删除 ' + leancloudAppKeysFile + ' 失败：' + lcFile.reason.message));
    }
    console.log("\n清除成功\n");
    return cb();
  });
};

var initAVOSCloudSDK = exports.initAVOSCloudSDK = function(appId, isLogProjectHome, cb) {
  if (_.isFunction(appId)) {
      cb = appId;
      appId = getAppSync().appId;
  }
  if (_.isFunction(isLogProjectHome)) {
      cb = isLogProjectHome;
      isLogProjectHome = true;
  }
  if (appId === AV.applicationId) {
    return cb(null, AV);
  }
  getKeys(appId, function(err, keys) {
    if(err) {
      return cb(err);
    }
    AV.initialize(appId, keys.appKey, keys.masterKey);

    if (keys.apiServer) {
      AV.serverURL = keys.apiServer;
    }

    AV.Cloud.useMasterKey();
    util.request('functions/_ops/engine', function(err, data) {
      if (err) {
        console.error('[ERROR] 获取应用信息失败：' + err.stack);
        process.exit(1);
      }
      ENGINE_INFO = data;
      if (isLogProjectHome) {
        logProjectHome();
      }
      cb(null, AV);
    });
  });
};

function bucketDomain(bucket) {
    //special bucket for old projects.
    if (bucket == 'paas_files')
        return 'paas-files';
    else
        return 'ac-' + bucket;
}

function destroyFile(objectId) {
    if (!objectId || objectId.trim() === '')
        return;
    try {
        var file = new AV.File();
        file.id = objectId.trim();
        file.destroy();
    } catch (e) {
        debug(e.stack);
        //ignore
    }
}

function uploadFile(localFile, props, attempts, cb) {
  if (_.isFunction(attempts)) {
    cb = attempts;
    attempts = 0;
  }

  var file = new AV.File(props.name, fs.readFileSync(localFile), 'application/zip, application/octet-stream');

  file.save().then(function(result) {
    cb(null, file.url(), file.id);
  }).catch(function(err) {
    if (attempts > 3) {
      console.warn("上传文件失败超过 3 次，放弃：" + localFile);
      cb(err);
    } else {
      uploadFile(localFile, props, attempts + 1, cb);
    }
  });
}

function pollEvents(eventToken, cb) {
  var from = null;
  var moreEvent = true;
  var doLoop = function() {
    var url = 'functions/_ops/events/poll/' + eventToken;
    if (from) {
      url += '?from=' + from;
    }
    util.request(url, function(err, data) {
      var errLog = null;
      if (err) {
        console.error('获取云引擎日志失败：%s', err.message);
      } else {
        moreEvent = data.moreEvent;
        data.events.reverse().forEach(function(logInfo) {
          console.log('%s [%s] %s', new Date(logInfo.time).toLocaleString(), logInfo.level.toLocaleUpperCase(), logInfo.content);
          from = logInfo.time;
          if (logInfo.level.toLocaleUpperCase() === 'ERROR') {
            errLog = logInfo.content;
          }
        });
      }
      if (moreEvent) {
        setTimeout(function() {
          doLoop();
        }, 1000);
      } else {
        if (errLog) {
          return cb(new Error(errLog));
        }
        cb();
      }
    });
  };
  // 等待操作日志入库
  setTimeout(function() {
    doLoop();
  }, 3000);
}

function loopLogs(opsToken, prod, cb) {
  var start = null;
  var moreData = true;
  var doLoop = function() {
    var url = 'functions/_ops/progressive/' + opsToken + '?production=' + prod;
    if (start) {
      url += '&start=' + start;
    }
    util.request(url, function(err, data) {
      if (err) {
        console.error('获取云引擎日志失败：%s', err.message);
      }
      moreData = data.moreData;
      var errLog = null;
      data.logs.reverse().forEach(function(logInfo) {
        console.log('%s [%s] %s', new Date(logInfo.time).toLocaleString(), logInfo.level.toLocaleUpperCase(), logInfo.content);
        start = logInfo.time;
        if (logInfo.level.toLocaleUpperCase() === 'ERROR') {
          errLog = logInfo.content;
        }
      });
      if (moreData) {
        setTimeout(function() {
          doLoop();
        }, 1000);
      } else {
        if (errLog) {
          return cb(new Error(errLog));
        }
        cb();
      }

    });
  };
  // 等待部署开始日志入库
  setTimeout(function() {
    doLoop();
  }, 3000);
}

var uploadProject = function() {
  var file = path.join(TMP_DIR, new Date().getTime() + '.zip');
  return Q.ninvoke(Runtime, 'detect', CLOUD_PATH).then(function(runtimeInfo) {
    return Q.Promise(function(resolve, reject) {
      console.log("压缩项目文件 ...");
      var output = fs.createWriteStream(file);
      var archive = archiver('zip');

      output.on('close', function() {
        resolve();
      });

      archive.on('error', function(err) {
          err.action = '项目文件打包';
          reject(err);
      });

      var patterns = getIgnorePatterns(CLOUD_PATH);
      if (patterns) {
        patterns = [{ src: ['**'].concat(patterns.map(function(pattern) {
          if (pattern[0] == '!')
            return pattern.slice(1);
          else
            return '!' + pattern;
        })) }];
      } else {
        patterns = runtimeInfo.bulk();
      }

      archive.pipe(output);
      archive.bulk(patterns);
      archive.finalize();
    });
  }).then(function() {
    console.log("生成临时文件：" + file);
    //upload file to cloud code
    console.log("开始上传项目文件 ...");
    var key = util.guid() + '.zip';
    return Q.nfcall(uploadFile, file, {
        key: key,
        name: path.basename(file),
        mime_type: 'application/zip, application/octet-stream'
    });
  });
};

exports.buildImageFromLocal = function(options, cb) {
  var fileId;
  initAVOSCloudSDK(function() {
    uploadProject().then(function(args) {
      fileId = args[1];
      return Q.nfcall(util.request, 'functions/_ops/images', {
        method: 'POST',
        data: {
          zipUrl: args[0],
          comment: options.log,
          noDependenciesCache: JSON.parse(options.noCache),
          async: true
        }
      });
    }).then(function(data) {
      return Q.nfcall(pollEvents, data.eventToken);
    }).then(function() {
      console.log("\n构建成功\n");
      return Q.nfcall(listImages, 1);
    }).then(cb).catch(function(err) {
      if(fileId) {
        destroyFile(fileId);
      }
      err.action = '构建应用镜像';
      return cb(err);
    });
  });
};

var listImages = exports.listImages = function(limit, cb) {
  if (_.isFunction(limit)) {
    cb = limit;
    limit = 10;
  }
  initAVOSCloudSDK(function() {
    util.request('functions/_ops/images', function(err, data) {
      if (err) {
        return cb(err);
      }
      data = data.slice(0, limit);
      var datas = [
        [ 'IMAGE TAG', 'STATUS', 'VERSION', 'COMMENT', 'RUNTIME', 'CREATED' ]
      ];
      data.forEach(function(image) {
        datas.push([image.imageTag, image.status, image.version, image.comment, image.runtime, moment(image.created).fromNow()]);
      });
      console.log(table(datas));
      cb();
    });
  });
};

exports.rmImage = function(imageTag, cb) {
  initAVOSCloudSDK(function() {
    util.request('functions/_ops/images/' + imageTag, {
      method: 'DELETE',
    }, function(err) {
      if (err) {
        return cb(err);
      }
      console.log("\n操作成功\n");
      cb();
    });
  });
};

exports.rmImageCache = function(cb) {
  initAVOSCloudSDK(function() {
    util.request('functions/_ops/images/deleteBuildCache', {
      method: 'POST',
    }, function(err) {
      if (err) {
        return cb(err);
      }
      console.log("\n操作成功\n");
      cb();
    });
  });
};

var envMap = {
  '0': 'stg',
  '1': 'prod'
};

var showGroup = function(groups) {
  var datas = [
    [ 'GROUP NAME', 'ENV', 'CURRENT IMAGE', 'INSTANCES', 'CREATED', 'DEPLOYED']
  ];
  groups.forEach(function(obj) {
    datas.push([
      obj.groupName,
      envMap[obj.prod],
      obj.currentImage && obj.currentImage.imageTag || '',
      '[' + obj.instances.map(function(instance) {
        return instance.name + '(' + instance.status + ')';
      }).join(',') + ']',
      moment(obj.created).fromNow(),
      moment(obj.deployed).fromNow()
    ]);
  });
  console.log(table(datas));
};

exports.listGroups = function(cb) {
  initAVOSCloudSDK(function() {
    util.request('functions/_ops/groups', function(err, data) {
      if (err) {
        return cb(err);
      }
      showGroup(data);
      cb();
    });
  });
};

var deployGroup = exports.deployGroup = function(groupName, imageTag, options, cb) {
  Q.nfcall(initAVOSCloudSDK).then(function() {
    return Q.nfcall(util.request, 'functions/_ops/groups/' + groupName + '/deploy', {
      method: JSON.parse(options.force) ? 'POST' : 'PUT',
      data: {
        imageTag: imageTag,
        async: true
      }
    });
  }).then(function(data) {
    return Q.nfcall(pollEvents, data.eventToken);
  }).then(function() {
    console.log("\n部署成功\n");
    return Q.nfcall(util.request, 'functions/_ops/groups');
  }).then(function(groups) {
    showGroup(_.where(groups, {groupName: groupName}));
    return;
  }).then(cb).catch(function(err) {
    err.action = '部署实例组';
    return cb(err);
  });
};

exports.undeployGroup = function(groupName, cb) {
  Q.nfcall(initAVOSCloudSDK).then(function() {
    return Q.nfcall(util.request, 'functions/_ops/groups/' + groupName + '/deploy', {
      method: 'DELETE'
    });
  }).then(function() {
    console.log("\n清除成功\n");
    return Q.nfcall(util.request, 'functions/_ops/groups');
  }).then(function(groups) {
    showGroup(_.where(groups, {groupName: groupName}));
    return;
  }).then(cb).catch(function(err) {
    err.action = '清除实例组部署';
    return cb(err);
  });
};

var quotaMap = {
  '1': '1CPU/512MB',
  '2': '2CPU/1GB',
  '4': '4CPU/2GB',
};

exports.createInstance = function(options, cb) {
  initAVOSCloudSDK(function() {
    util.request('functions/_ops/instances', {
      method: 'POST',
      data: {
        name: options.name,
        groupName: options.groupName
      }
    }, function(err, obj) {
      if (err) {
        return cb(err);
      }
      console.log("\n创建成功\n");
      var datas = [
        [ 'NAME', 'STATUS', 'GROUP NAME', 'QUOTA', 'IMAGE TAG', 'DEPLOYED', 'CREATED' ]
      ];
      datas.push([
        obj.name,
        obj.status,
        obj.groupName,
        quotaMap[obj.quota] || obj.quota,
        obj.imageInfo && obj.imageInfo.imageTag || '',
        moment(obj.deployed).fromNow(),
        moment(obj.created).fromNow()
        ]);
      console.log(table(datas));
      cb();
    });
  });
};

exports.changeGroup = function(targetGroup, instance, cb) {
  initAVOSCloudSDK(function() {
    util.request('functions/_ops/instances/' + instance + '/groupName', {
      method: 'PUT',
      data: {
        groupName: targetGroup
      }
    }, function(err) {
      if (err) {
        return cb(err);
      }
      console.log("\n切换成功\n");
      cb();
    });
  });
};

exports.deleteInstance = function(instance, cb) {
  initAVOSCloudSDK(function() {
    util.request('functions/_ops/instances/' + instance, {
      method: 'DELETE'
    }, function(err) {
      if (err) {
        return cb(err);
      }
      console.log("\n移除成功\n");
      cb();
    });
  });
};

var listInstances = exports.listInstances = function(cb) {
  initAVOSCloudSDK(function() {
    util.request('functions/_ops/instances', function(err, data) {
      if (err) {
        return cb(err);
      }
      var datas = [
        [ 'NAME', 'STATUS', 'GROUP NAME', 'QUOTA', 'IMAGE TAG', 'DEPLOYED', 'CREATED' ]
      ];
      data.forEach(function(obj) {
        datas.push([
          obj.name,
          obj.status,
          obj.groupName,
          quotaMap[obj.quota] || obj.quota,
          obj.imageInfo && obj.imageInfo.imageTag || '',
          moment(obj.deployed).fromNow(),
          moment(obj.created).fromNow()
          ]);
      });
      console.log(table(datas));
      cb();
    });
  });
};

exports.deployLocalCloudCode = function (options, cb) {
  initAVOSCloudSDK(function() {
    if (semver.satisfies(ENGINE_INFO.version, '>=4.0.0')) {
      return deployLocalCloudCodeV4(options, cb);
    } else {
      var fileId;
      return uploadProject().then(function(args) {
        fileId = args[1];
        return Q.nfcall(util.request, 'functions/_ops/deployByCommand', {
          method: 'POST',
          data: {
            revision: args[0],
            fileId: fileId,
            log: options.log,
            options: options.enable
          }
        });
      }).then(function(data) {
        return Q.nfcall(loopLogs, data.opsToken, 0);
      }).then(function() {
        console.log("\n部署成功\n");
        return Q.nfcall(queryStatus);
      }).then(cb).catch(function(err) {
        if(fileId) {
          destroyFile(fileId);
        }
        err.action = '部署云引擎应用';
        return cb(err);
      });
    }
  });
};

var deployLocalCloudCodeV4 = function(options, cb) {
  var fileId, group;
  return getDefaultGroup().then(function(_group) {
    group = _group;
    if (group.prod === 0) {
      console.log('部署到：' + color.green('预备环境'));
    } else {
      console.log('部署到：' + color.green('生产环境(' + group.groupName+ ')'));
    }
    return uploadProject();
  }).then(function(args) {
    fileId = args[1];
    return Q.nfcall(util.request, 'functions/_ops/groups/' + group.groupName + '/buildAndDeploy', {
      method: 'POST',
      data: {
        zipUrl: args[0],
        comment: options.log,
        noDependenciesCache: JSON.parse(options.noCache),
        async: true
      }
    });
  }).then(function(data) {
    return Q.nfcall(pollEvents, data.eventToken);
  }).then(function() {
    console.log("\n部署成功\n");
    return Q.nfcall(listInstances);
  }).then(cb).catch(function(err) {
    if(fileId) {
      destroyFile(fileId);
    }
    err.action = '部署应用';
    return cb(err);
  });
};

exports.deployGitCloudCode = function (options, cb) {
  initAVOSCloudSDK(function() {
    if (semver.satisfies(ENGINE_INFO.version, '>=4.0.0')) {
      return deployGitCloudCodeV4(options, cb);
    } else {
      util.request('functions/_ops/deployByCommand', {
          method: 'POST',
          data: {
            after: options.revision,
            options: options.options
          }
      }, function(err, data) {
        if (err) {
          return cb(err);
        }
        loopLogs(data.opsToken, 0, function(err) {
            if (err) {
                err.action = '部署云引擎应用';
                return cb(err);
            }
            console.log("\n部署成功\n");
            queryStatus(cb);
        });
      });
    }
  });
};

var deployGitCloudCodeV4 = function(options, cb) {
  return Q.fcall(function() {
    return getDefaultGroup().then(function(group) {
      if (group.prod === 0) {
        console.log('部署到：' + color.green('预备环境'));
      } else {
        console.log('部署到：' + color.green('生产环境(' + group.groupName+ ')'));
      }
      return Q.nfcall(util.request, 'functions/_ops/groups/' + group.groupName + '/buildAndDeploy', {
        method: 'POST',
        data: {
          comment: options.log,
          noDependenciesCache: JSON.parse(options.noCache),
          gitTag: options.revision,
          async: true
        }
      });
    });
  }).then(function(data) {
    return Q.nfcall(pollEvents, data.eventToken);
  }).then(function() {
    console.log("\n部署成功\n");
    return Q.nfcall(listInstances);
  }).then(cb).catch(function(err) {
    err.action = '部署应用';
    return cb(err);
  });
};

var getDefaultGroup = function() {
  return Q.nfcall(util.request, 'functions/_ops/groups').then(function(groups) {
    return _.find(groups, function(group) {
      if (ENGINE_INFO.mode === 'free') {
        return group.groupName !== 'staging';
      } else {
        return group.groupName === 'staging';
      }
    });
  });
};

var getDefaultProdGroup = function() {
  return Q.nfcall(util.request, 'functions/_ops/groups').then(function(groups) {
    return _.find(groups, function(group) {
      return group.groupName !== 'staging';
    });
  });
};

function outputStatus(status) {
    console.log('------------------------------------------------------------------------');
    console.log(sprintf("%s：'%s'", "预备环境版本    ", status.dev));
    console.log(sprintf("%s：'%s'", "预备环境提交日志", status.devLog));
    console.log(sprintf("%s：'%s'", "生产环境版本    ", status.prod));
    console.log(sprintf("%s：'%s'", "生产环境提交日志", status.prodLog));
    console.log('------------------------------------------------------------------------');
}

exports.publishCloudCode = function(cb) {
  initAVOSCloudSDK(function() {
    if (semver.satisfies(ENGINE_INFO.version, '>=4.0.0')) {
      return publishCloudCodeV4(cb);
    } else {
      util.request('functions/_ops/publish', {
        method: 'POST'
      }, function(err, data) {
        if (err) {
          return cb(err);
        }
        loopLogs(data.opsToken, 1, function(err) {
          if (err) {
            return cb(err);
          }
          console.log("\n发布成功\n");
          queryStatus(cb);
        });
      });
    }
  });
};

var publishCloudCodeV4 = function(cb) {
  if (ENGINE_INFO.mode === 'free') {
    console.log('免费版使用 deploy 命令即可部署到生产环境，所以该指令忽略。');
    return cb();
  }
  var imageTag;
  return Q.nfcall(util.request, 'functions/_ops/groups').then(function(groups) {
    var group = _.findWhere(groups, {prod: 0});
    if (!group.currentImage) {
      throw new Error('预备环境没有相关部署');
    }
    imageTag = group.currentImage.imageTag;
    return getDefaultProdGroup();
  }).then(function(group) {
    return Q.nfcall(deployGroup, group.groupName, imageTag, {force: false});
  }).then(cb).catch(function(err) {
    err.action = '发布应用';
    return cb(err);
  });
};

var queryStatus = exports.queryStatus = function(cb) {
    initAVOSCloudSDK(function() {
        util.request('functions/status', function(err, data) {
          if (err) {
            return cb(err);
          }
          outputStatus(data);
          cb();
        });
    });
};

exports.undeployCloudCode = function(cb) {
    initAVOSCloudSDK(function() {
        util.request('functions/undeploy/repo', {
          method: 'POST'
        }, function(err) {
          if (err) {
            return cb(err);
          }
          console.log("\n清除成功\n");
          queryStatus(cb);
        });
    });
};

function input(info, cb, password) {
    var pcb = function(err, anwser) {
        cb(anwser);
    };
    if (password) {
        promptly.password(info, pcb);
    } else {
        promptly.prompt(info, pcb);
    }
}
    /**
     *Generate device uuid for statistics.
     */
function getDeviceId() {
    var deviceIdFile = path.join(leancloudFolder, 'device_id');
    var exists = fs.existsSync(deviceIdFile);
    if (exists) {
        return fs.readFileSync(deviceIdFile, {
            encoding: 'utf-8'
        });
    } else {
        var deviceId = util.guid();
        fs.writeFileSync(deviceIdFile, deviceId, {
            encoding: 'utf-8'
        });
        return deviceId;
    }
}

exports.sendStats = function(cmd) {
    debug('sendStats: %s', cmd);
    try {
        var sessionId = util.guid();
        var timestamp = new Date().getTime();
        var data = {
            appId: 'lu348f5799fc5u3eujpzn23acmxy761kq6soyovjc3k6kwrs',
            device: {
                sdk_version: version,
                os_version: (os.platform() + ' ' + os.arch() + ' ' + os.release()),
                device_id: getDeviceId(),
                app_version: version,
                device_model: os.platform(),
                os: 'ios'
            },
            events: {
                event: [{
                    "du": 1,
                    "name": cmd,
                    "ts": timestamp
                }],
                "launch": {
                    "date": timestamp,
                    "sessionId": sessionId
                },
                "terminate": {
                    "activities": [],
                    "duration": 1,
                    "sessionId": sessionId
                }
            }
        };
        util.request('stats/collect', {
          method: 'POST',
          appId: 'lu348f5799fc5u3eujpzn23acmxy761kq6soyovjc3k6kwrs',
          appKey: 'nrit4mhmqzm1euc3n3k9fv3w0wo72v1bdic6tfrl2usxix3e',
          data: data
        }, function(err) {
          if (err) {
            debug(err.stack);
          }
        });
    } catch (err) {
        debug(err.stack);
        //ignore
    }
};

function outputLogs(datas) {
    if (datas && datas.length > 0) {
        datas.reverse().forEach(function(log) {
            var time = new Date(log.time).toLocaleString();
            var env = log.production == 1 ? 'PROD' : 'STG';
            var content = log.content.replace(/\n$/, '');
            console.log('%s [%s] [%s] %s', time, env, log.level.toLocaleUpperCase(), content);
        });
    }
}

exports.viewCloudLog = function (options, cb) {
    var tailf = JSON.parse(options.tailf);
    var lastLogUpdatedTime;
    var doViewCloudLog = function () {
        var prod = options.env.toLowerCase() === 'stg' ? 0 : 1;
        var url = 'tables/EngineLogs?production=' + prod;
        if (!tailf && options.lines) {
          url += '&limit=' + options.lines;
        }
        if (lastLogUpdatedTime) {
          url += '&since=' + encodeURIComponent(lastLogUpdatedTime);
        }
        util.request(url, {
          method: 'GET'
        }, function (err, data) {
          if (err) {
            return cb(err);
          }
          if (data.results) {
            data = data.results;
          }
          var datas = data.map(function(item) {
            if (_.isString(item))
              return JSON.parse(item);
            else
              return item;
          });
          if (datas.length > 0) {
              lastLogUpdatedTime = datas[0].time;
          }
          outputLogs(datas);
          if (tailf) {
              //fetch log every 500 milliseconds.
              setTimeout(function() {
                  doViewCloudLog();
              }, 500);
          } else {
            cb();
          }
        });
    };
    initAVOSCloudSDK(function() {
        doViewCloudLog();
    });
};

var migrateAvoscloudKeys = _.once(function() {
    var avoscloudAppKeysFile = path.join(getUserHome(), '.avoscloud_keys');

    if (fs.existsSync(avoscloudAppKeysFile)) {
        if (fs.existsSync(leancloudAppKeysFile))
            return; // 如果已有新格式的文件则不迁移

        try {
            fs.mkdirSync(leancloudFolder, '0700');
        } catch (err) {
            if (err.code != 'EEXIST')
                return exitWith(err.message);
        }

        var data = fs.readFileSync(avoscloudAppKeysFile, 'utf-8');

        if (data.trim() === '')
            data = '{}';

        var appKeys = _.mapObject(JSON.parse(data), function(value) {
            if (_.isString(value)) {
                return {
                    masterKey: value,
                    appKey: null
                };
            } else {
                return value;
            }
        });

        fs.writeFileSync(leancloudAppKeysFile, JSON.stringify(appKeys), {
            mode: '0600'
        });

        fs.unlinkSync(avoscloudAppKeysFile);
    }
});

function loadLocalAppKeys(callback) {
    migrateAvoscloudKeys();

    fs.readFile(path.join(getUserHome(), '.leancloud/app_keys'), 'utf-8', function(err, data) {
        if (err) {
            if (err.code == 'ENOENT')
                return callback(null, {});
            else
                return exitWith(err.message);
        }

        if (data.trim() === '')
            data = '{}';

        callback(null, JSON.parse(data));
    });
}

function updateMasterKeys(appId, keys, options, callback) {
    if (_.isFunction(options)) {
        callback = options;
        options = {};
    }

    loadLocalAppKeys(function(err, appKeys) {
        // If the master key is exists and force is false, then return the eixsts master key
        if (appKeys[appId] && appKeys[appId].masterKey && !options.force)
            return callback(null, appKeys[appId]);

        appKeys[appId] = {
            masterKey: keys.masterKey,
            appKey: keys.appKey,
            apiServer: keys.apiServer
        };

        fs.mkdir(leancloudFolder, '0700', function(err) {
            if (err && err.code != 'EEXIST')
                return exitWith(err.message);

            // Save to file ,and make sure file mode is 0600
            fs.writeFile(path.join(leancloudFolder, 'app_keys'), JSON.stringify(appKeys), {
                mode: '0600'
            }, function(err) {
                if (err)
                    exitWith(err.message);
                else
                    callback(null, appKeys[appId]);
            });
        });
    });
}

function getKeys(appId, cb) {
  loadLocalAppKeys(function(err, appKeys) {
    if(err) {
      return cb(err);
    }

    var fetchAndUpdateKeys = function(masterKey, cb) {
      var saveKeysCallback = function(callback, apiServer) {
        return function(err, appDetail) {
          if (err) {
            return callback(err);
          }

          if (!appDetail) {
            return callback(new Error('没有找到应用信息，请确认 appId 和 masterKey 填写正确'));
          }

          updateMasterKeys(appId, {
            masterKey: masterKey,
            appKey: appDetail.app_key,
            apiServer: apiServer
          }, {force: true}, cb);
        };
      }

      request({
        url: 'https://app-router.leancloud.cn/1/route?appId=' + appId,
      }, function(err, res, body) {
        if (err) {
          return cb(err);
        }

        var result = JSON.parse(body);

        util.request('__leancloud/apps/appDetail', {
          appId: appId,
          masterKey: masterKey,
          apiServer: result.api_server
        }, function(err, appDetail) {
          if (err) {
            util.request('__leancloud/apps/appDetail', {
              appId: appId,
              masterKey: masterKey,
              apiServer: AV._config.usApiUrl
            }, saveKeysCallback(cb, AV._config.usApiUrl));
          } else {
            saveKeysCallback(cb, result.api_server)(err, appDetail);
          }
        });
      });
    };

    var keys = appKeys[appId];
    if(!keys) {
      promptly.password('请输入应用的 Master Key (可从开发者平台的应用设置里找到)：', function(err, masterKey) {
        if (!masterKey || masterKey.trim() === '') {
            return exitWith("无效的 Master Key");
        }
        fetchAndUpdateKeys(masterKey.trim(), cb);
      });
    } else if(keys.appKey) {
      cb(null, keys);
    } else {
      fetchAndUpdateKeys(keys.masterKey, cb);
    }
  });
}

/**
 *Creaet a new avoscloud cloud code project.
 */
exports.createNewProject = function(appId, runtime, cb) {
  var _appId, repoName;
  Q.fcall(function() {
    if(appId) {
      return appId;
    }
    console.log("开始输入应用信息，这些信息可以从'开发者平台的应用设置 -> 应用 key'里找到。");
    return Q.ninvoke(promptly, 'prompt', '请输入应用的 Application ID: ');
  }).then(function(appId) {
    if (!appId || appId.trim() === '') {
      throw new Error("无效的 Application ID");
    }
    _appId = appId.trim();
    if(runtime) {
      return runtime;
    }
    return Q.ninvoke(promptly, 'prompt', '请选择项目语言，Node.js(N) 或 Python(P): ');
  }).then(function(runtime) {
    runtime = runtime.trim();
    var runtimesMapping = {
      'nodejs': 'node-js-getting-started',
      'node': 'node-js-getting-started',
      'n': 'node-js-getting-started',
      'python': 'python-getting-started',
      'py': 'python-getting-started',
      'p': 'python-getting-started'
    };
    repoName = runtimesMapping[runtime.toLowerCase()];
    if (!repoName) {
      throw new Error("无效的运行环境：" + runtime);
    }
    return Q.nfcall(initAVOSCloudSDK, _appId, false);
  }).then(function(AV) {
    console.log("正在创建项目 ...");
    return Q.nfcall(util.request, '__leancloud/apps/appDetail', {
      appId: AV.applicationId,
      masterKey: AV.masterKey
    });
  }).then(function(appDetail) {
    try {
      fs.mkdirSync(appDetail.app_name);
    } catch (err) {
      if (err.code != 'EEXIST') {
        err.action = '创建项目';
        throw err;
      }
    }
    var zipFilePath = path.join(TMP_DIR, _appId + '.zip');
    return Q.Promise(function(resolve, reject) {
      request('http://lcinternal-cloud-code-update.leanapp.cn/' + repoName + '.zip')
      .pipe(fs.createWriteStream(zipFilePath))
      .on('close', function() {
        try {
          var unzipper = new AdmZip(zipFilePath);

          unzipper.getEntries().forEach(function(file) {
            console.log(color.green('  ' + file.entryName));
          });

          unzipper.extractAllTo(appDetail.app_name, true);

          setCloudPath(path.resolve(appDetail.app_name));
          Q.nfcall(addApp, appDetail.app_name, _appId).then(function() {
            return Q.nfcall(checkoutApp, appDetail.app_name);
          }).then(function() {
            console.log('项目创建完成！');
            resolve();
          }).catch(function(err) {
            reject(err);
          });
        } catch (err) {
          console.error('解压缩失败：%s，服务器响应：%s', err.stack, fs.readFileSync(zipFilePath, 'utf-8'));
          resolve();
        }
      }).on('error', function(err) {
        err.action = '创建项目：下载项目框架';
        reject(err);
      });
    });
  }).then(cb).catch(cb);
};

exports.up = function(args, port, isDebug, cb) {
  port = port || 3000;
  Q.nfcall(initAVOSCloudSDK).then(function() {
    return Q.ninvoke(Runtime, 'detect', CLOUD_PATH);
  }).then(function(runtimeInfo) {
    runtimeInfo.setDebug(isDebug);
    var monconfig = runtimeInfo.getMonconfig(args, port);
    console.log('提示：键入 %s 命令并回车来强制重启本进程', color.green('rs'));
    nodemon(monconfig);
    nodemon.on('restart', function (files) {
      console.log('因为文件变更而项目重启：%s', color.green(files));
    });
    nodemon.on('crash', function() {
      cb();
    });
    if (runtimeInfo.runtime != 'cloudcode') {
      var testServerPort = port + 1;
      var testServer = require('../lib/testUtilServer');
      testServer.set('leanenginePort', port);
      testServer.set('port', testServerPort);
      testServer.set('appId', AV.applicationId);
      testServer.set('appKey', AV.applicationKey);
      testServer.set('masterKey', AV.masterKey);
      console.log('提示：使用 %s 测试 Cloud 函数', color.green('http://localhost:' + testServerPort));
      testServer.listen(testServerPort);
    }
  }).catch(function(err) {
    err.action = '本地启动云引擎应用';
    cb(err);
  });
};

function importFile(f, realPath, cb) {
    var stats = fs.statSync(realPath);
    if (stats.isFile()) {
        util.checksumFile(realPath, function(err, checksum) {
            if (err) {
                return cb("文件 " + realPath + " 校验和失败:" + err);
            }
            var extname = path.extname(realPath) != '.' ? path.extname(realPath) : '';
            uploadFile(realPath, {
                key: util.guid() + extname,
                name: path.basename(realPath),
                mime_type: mime.lookup(realPath),
                metaData: {
                    size: stats.size,
                    _checksum: checksum
                }
            }, function(err, url, objectId) {
                if (err) {
                    destroyFile(objectId);
                    if(_.isError(err)) {
                      cb(nodeUtil.format('上传文件 ' + realPath + ' 失败：%s', err));
                    } else {
                      cb(nodeUtil.format('上传文件 ' + realPath + ' 失败：%j', err));
                    }
                } else {
                    console.log('上传文件 ' + realPath + ' 成功：' + url);
                    cb();
                }
            });
        });
    } else if (stats.isDirectory()) {
        fs.readdir(realPath, function(err, files) {
            if (err)
                return cb("读取目录 " + realPath + " 失败：" + err);
            console.log("开始上传目录 " + realPath + " 中的文件 ...");
            async.eachLimit(files, IMPORT_FILE_BATCH_SIZE, function(subFile, cb) {
                //pass in the eachLimit callback
                importFile(subFile, realPath + path.sep + subFile, cb);
            }, function(err) {
                if (err)
                    return cb(err);
                //calling parent callback.
                cb();
            });
        });
    } else {
        cb(f + ' 不是一个文件或目录，忽略');
    }
}

/**
 * import files to avoscloud.
 */
exports.importFiles = function (files, cb) {
    initAVOSCloudSDK(function() {
        async.eachLimit(files, IMPORT_FILE_BATCH_SIZE, function(f, cb) {
            var realPath = path.resolve(f);
            if (fs.existsSync(realPath)) {
                importFile(f, realPath, cb);
            } else {
                cb(f + " 不存在，忽略");
            }
        }, function(err) {
          if (err) {
            err.action = '上传文件';
          }
          cb(err);
        });
    });
};

function createConfigIfNessary() {
    var configDir = path.join(CLOUD_PATH, ".avoscloud");
    if (fs.existsSync(configDir))
        return;
    fs.mkdirSync(configDir);
    //append it to .gitignore
    fs.appendFileSync(path.join(CLOUD_PATH, ".gitignore"), ".avoscloud/\n");
}

function getAppFromCloudCodeProject() {
    var appConfig = path.join(CLOUD_PATH, 'config/global.json');
    if (fs.existsSync(appConfig)) {
        return {
            'origin': require(appConfig).applicationId
        };
    }
    return {};
}

function getAppsSync() {
    var appsFile = path.join(CLOUD_PATH, '.avoscloud/apps.json');
    if (fs.existsSync(appsFile)) {
        var apps = require(appsFile);
        if (apps && Object.keys(apps).length > 0)
            return apps;
    }
    return getAppFromCloudCodeProject();
}

/**
 * 获取 应用 tag 与 appId 信息
 * 如果有 --project 参数，则获取该应用信息
 * 如果没有，则获取「当前」应用信息：
 * * 如果 `.avoscloud/curr_app` 存在，则以此为准。
 * * 如果是 cloudcode 应用，则以 `config/global.json` 中配置为准。
 * * 如果 `.avoscloud/apps.json` 存在
 *   * 如果存在一组配置，则返回
 *   * 否则报错
 */
var getAppSync = exports.getAppSync = function() {
    var apps = getAppsSync();
    var appTags = Object.keys(apps);
    if (appTags.length === 0) {
        return exitWith("当前目录没有关联任何应用信息。请使用：lean app add <name> <app id> 关联应用。");
    }
    if (APP) {
        if (apps[APP]) {
            return { tag: APP, appId: apps[APP] };
        } else {
            return exitWith("当前目录没有关联 '" + APP + "' 应用信息，请使用：lean app add <name> <app id> 关联应用。");
        }
    }
    var currAppFile = path.join(CLOUD_PATH, '.avoscloud/curr_app');
    if (fs.existsSync(currAppFile)) {
        var name = fs.readFileSync(currAppFile, 'utf-8').trim();
        if (name === '')
            return null;
        return { tag: name, appId: getAppsSync()[name] };
    }
    if (appTags.length == 1) {
        return { tag: appTags[0], appId: apps[appTags[0]] };
    } else {
        exitWith("当前目录关联了多个应用 " + appTags + "，请使用：lean app checkout <app> 选择应用。");
    }
};

function writeCurrAppSync(name) {
    createConfigIfNessary();
    fs.writeFileSync(path.join(CLOUD_PATH, '.avoscloud/curr_app'), name, {
        mode: 384,
        encoding: 'utf-8'
    });
}

function writeAppsSync(apps) {
    createConfigIfNessary();
    var appsFile = path.join(CLOUD_PATH, '.avoscloud/apps.json');
    fs.writeFileSync(appsFile, JSON.stringify(apps), {
        encoding: 'utf-8',
        mode: 384
    });
}

var addApp = exports.addApp = function(name, appId, cb) {
  setImmediate(function() {
    if (!/\w+/.test(name))
        return cb(new Error("无效的应用名"));
    if (!/[a-zA-Z0-9]+/.test(appId))
        return cb(new Error("无效的 Application ID"));
    var apps = getAppsSync();
    if (apps[name])
        return cb(new Error("应用 '" + name + "' 已经存在"));
    apps[name] = appId;
    writeAppsSync(apps);
    console.log("关联应用：%s -- %s", name, appId);
    cb();
  });
};

exports.removeApp = function(name, cb) {
  setImmediate(function() {
    var apps = getAppsSync();
    if (apps[name])
        delete apps[name];
    writeAppsSync(apps);
    console.log("移除应用关联：%s", name);
    cb();
  });
};

var checkoutApp = exports.checkoutApp = function(name, cb) {
  setImmediate(function() {
    var apps = getAppsSync();
    if (!apps[name])
        return cb(new Error("应用 '" + name + "' 不存在"));
    writeCurrAppSync(name);
    console.log("切换到应用 " + name);
    cb();
  });
};

exports.appStatus = function(isList, cb) {
  setImmediate(function() {
    var currApp = getAppSync();
    if (isList) {
        var apps = getAppsSync();
        var maxNameLength = 0;
        for (var name in apps) {
            if (name.length > maxNameLength)
                maxNameLength = name.length;
        }
        for (name in apps) {
            var formatedName = sprintf('%-' + maxNameLength + 's', name);
            if (name == currApp.tag) {
                console.log(color.green("* " + formatedName + " " + apps[name]));
            } else {
                console.log("  " + formatedName + " " + apps[name]);
            }
        }
    } else {
        console.log(color.green("* " + currApp.tag + " " + currApp.appId));
    }
    cb();
  });
};
exports.queryLatestVersion = function(){
  debug('queryLatestVersion');
	request({
    url: 'https://download.leancloud.cn/sdk/cloud_code_commandline.json',
    json: true
  }, function(err, res, body) {
    if (err || res.statusCode >= 400) {
      return debug(err.stack || err || res.statusCode + ':' + body);
    }
    var latestVersion = body.version;
    var changelog = body.changelog || '1.内部重构';
    if(semver.gt(latestVersion, version)){
      console.warn(color.green("[WARN] 发现新版本 %s, 变更如下:\n%s\n您可以通过下列命令升级： sudo npm install -g avoscloud-code"), latestVersion, changelog);
    }
  });
};

function sortObject(o) {
    var sorted = {},
    key, a = [];
    sorted.objectId = o.objectId;

    for (key in o) {
        if (o.hasOwnProperty(key)) {
            a.push(key);
        }
    }

    a.sort();

    for (key = 0; key < a.length; key++) {
        if(a[key] != 'objectId' && a[key] != 'updatedAt' && a[key] != 'createdAt')
            sorted[a[key]] = o[a[key]];
    }
    sorted.updatedAt = o.updatedAt;
    sorted.createdAt = o.createdAt;
    return sorted;
}

function outputQueryResult(resp, vertical){
    var results = resp.results;
    var count = resp.count;
    var table, i, result, row;
    results = results.map(function(result){
        return sortObject(result);
    });
    if((results === null || results.length === 0) && count === null)
        console.log("*EMPTY*");

    if(count){
        console.log(color.green('Count: ' + count));
    }

    if(vertical){
        table = new Table();
        for(i = 0; i< results.length ; i++){
            result = results[i];
            for(var k in result){
                row = {};
                row[k] = result[k] || '';
                table.push(row);
            }
        }
        console.log(table.toString());
        return;
    }

    var head = results.reduce(function(ret, row){
        var ks = Object.keys(row);
        if(!ret)
            return ks;
        if(ks.length > ret.length)
            return ks;
        else
            return ret;
    }, []);
    table = new Table({
      head: head,
      chars: { 'top': '═' , 'top-mid': '╤' , 'top-left': '╔' , 'top-right': '╗',
               'bottom': '═' , 'bottom-mid': '╧' , 'bottom-left': '╚' , 'bottom-right': '╝',
               'left': '║' , 'left-mid': '╟' , 'mid': '─' , 'mid-mid': '┼',
               'right': '║' , 'right-mid': '╢' , 'middle': '│' }
    });
    for(i = 0; i< results.length ; i++){
        result = results[i];
        row = [];
        for(var j = 0; j < head.length; j++){
            row.push(result[head[j]] || '');
        }
        table.push(row);
    }
    console.log(table.toString());
    if(results && results.length > 0) {
      console.log(color.green(results.length + ' rows in set.'));
    }
}

function getIgnorePatterns(cloudPath) {
  var patterns;

  try {
    patterns = fs.readFileSync(path.join(cloudPath, '.leanengineignore')).toString().split(/\n/).filter(function(line) {
      return line.trim();
    });
  } catch (err) {
    if (err.code != 'ENOENT') {
      exitWith(err.message);
    }
  }

  return patterns;
}

exports.getRedisInstances = function(cb) {
  initAVOSCloudSDK(function(){
    util.getRedisInstances(function(err, datas) {
      if (err) {
        err.action = '查询 LeanCache 实例';
        return cb(err);
      }
      if(datas.length === 0) {
        console.log('该应用没有 LeanCache 实例');
      } else {
        console.log('Instance\tMax Memory');
        console.log('--------------------------');
        for(var i in datas) {
          var data = datas[i];
          console.log('%s\t%d MB', data.instance, data.max_memory);
        }
      }
      cb();
    });
  });
};

var doRedisClient = exports.doRedisClient = function(server, db, cb) {
  db = db || 0;
  initAVOSCloudSDK(function(){
    input("Redis> ", function(command) {
      if (command === 'quit' || command === 'exit') {
        return cb();
      }
      util.requestRedis(server, db, command, function(err, data) {
        if(err) {
          console.log('(error)', err.message);
        } else {
          console.log(data);
        }
        doRedisClient(server, db, cb);
      });
    });
  });
};

var doCloudQuery = exports.doCloudQuery = function(cb) {
    initAVOSCloudSDK(function(){
       input("CQL> ",function(cql){
           if(cql === 'exit' || cql === 'quit')
               return cb();
           if(/.*;$/.test(cql))
               cql = cql.substring(0, cql.length - 1);
           var  vertical =/.*\\G$/.test(cql);
           if(vertical)
               cql = cql.substring(0, cql.length -2);
           console.dir(cql);
           var url = 'cloudQuery?cql=' + encodeURIComponent(cql);
           util.request(url, function(err, data) {
             if (err) {
               console.log(color.red(err));
             } else if (!data.results) {
               console.log(color.red(data.code + ': ' + data.error));
             } else {
               outputQueryResult(data, vertical);
             }
             doCloudQuery(cb);
           });
        });
    });
};

var logProjectHome = function () {
    console.log('LeanEngine 项目根目录：' + CLOUD_PATH);
    var currApp = getAppSync();
    if (currApp) {
        console.log('当前应用：%s', color.green(currApp.tag + ' ' + currApp.appId));
    } else {
        exitWith('请使用：lean app checkout <app> 选择应用。');
    }
    if (semver.satisfies(ENGINE_INFO.version, '>=4.0.0')) {
        console.log('运行方案：%s', color.green(ENGINE_INFO.mode === 'free' ? '免费版' : '专业版'));
    }
};
