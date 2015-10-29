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
var lib = path.join(path.dirname(fs.realpathSync(__filename)), '../lib');
var exec = require('child_process').exec;
var archiver = require('archiver');
var os = require('os');
var request = require('request');
var _ = require('underscore');
var AV = require('avoscloud-sdk').AV;
var qiniu = require('qiniu');
var util = require(lib + '/util');
var nodeUtil = require('util');
var sprintf = require("sprintf-js").sprintf;
var promptly = require('promptly');
var mime = require('mime');
var async = require('async');
var color = require('cli-color');
var Table = require('cli-table');
var AdmZip = require('adm-zip');

//set qiniu timeout
qiniu.conf.RPC_TIMEOUT = 3600000;

var IMPORT_FILE_BATCH_SIZE = 20;

var TMP_DIR = os.tmpdir();
if (!TMP_DIR.match(/.*\/$/)) {
    TMP_DIR = TMP_DIR + path.sep;
}

var version = JSON.parse(fs.readFileSync(path.join(path.dirname(fs.realpathSync(__filename)), "..", "package.json"))).version;

var PROJECT = null;
var CLOUD_PATH = path.resolve('.');
var PORT = 3000;

// 设置命令作用的 project
exports.setProject = function(project) {
  PROJECT = project;
};

var setCloudPath = exports.setCloudPath = function(cloudPath) {
  CLOUD_PATH = cloudPath;
};

exports.setPort = function(port) {
  PORT = port;
};

function exitWith(err) {
    console.error('[ERROR] ' + err);
    process.exit(1);
}

var errorCb = function(cb, exitCode, action, cause) {
  var error = new Error();
  error.action = action;
  error.exitCode = exitCode;
  error.cause = cause;
  cb(error);
};

/**
 * Tried to get user's home directory by environment variable.
 */
function getUserHome() {
    var home = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH;
    if (!home)
        return exitWith("无法找到用户 HOME 目录");
    return home;
}

exports.deleteMasterKeys = function() {
    var home = getUserHome();
    var avoscloudKeysFile = path.join(home, '.avoscloud_keys');
    var leancloudAppKeysFile = path.join(home, '.leancloud/app_keys');

    try {
      console.log("[INFO] 删除 " + avoscloudKeysFile + " ...");
      fs.truncateSync(avoscloudKeysFile, 0);
    } catch (err) {
      if (err.code !== 'ENOENT')
        exitWith(err.message);
    }

    try {
      console.log("[INFO] 删除 " + leancloudAppKeysFile + " ...");
      fs.truncateSync(leancloudAppKeysFile, 0);
    } catch (err) {
      if (err.code !== 'ENOENT')
        exitWith(err.message);
    }

    console.log("[INFO] 清除成功");
};

var initAVOSCloudSDK = exports.initAVOSCloudSDK = function(appId, cb) {
  if (_.isFunction(appId)) {
      cb = appId;
      appId = getAppSync().appId;
  }
  getKeys(appId, function(err, keys) {
    if(err) {
      return exitWith(err.message);
    }
    AV.initialize(appId, keys.appKey, keys.masterKey);
    AV.Cloud.useMasterKey();
    cb(AV);
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
        //ignore
    }
}

function uploadFile(localFile, props, cb, retry, retries, lastErr) {
    //Retried too many times, report error.
    if (retries && retries > 3) {
        console.warn("上传文件失败超过 3 次，放弃：" + localFile);
        if (cb) {
            cb(lastErr);
        }
        return;
    }
    if(props) {
      //use master key to upload files.
      props._MasterKey = AV.masterKey || AV.applicationKey;
    }
    util.requestCloud("qiniu", props, 'POST', {
        success: function(resp) {
            var objectId = resp.objectId;
            var uptoken = resp.token;
            var bucket = resp.bucket;
            if (!uptoken) {
                if (cb) {
                    cb(JSON.parse(resp.responseText).error);
                    return;
                }
            }
            var qiniuUrlPrefix = 'http://' + bucketDomain(bucket) + '.qiniudn.com/';
            qiniu.io.put(uptoken, props.key, fs.readFileSync(localFile), null, function(err, ret) {
                if (cb) {
                    cb(err, qiniuUrlPrefix + (ret ? ret.key : '404.html'), objectId);
                }
            });
        },
        error: function(err) {
            //mabye retry to upload it
            if (retry) {
                if (!retries)
                    retries = 0;
                uploadFile(localFile, props, cb, retry, retries + 1, err);
            } else {
                if (cb) {
                    cb(err);
                }
            }
        }
    });
}

function loopLogs(opsToken, prod, cb) {
  var start = null;
  var moreData = true;
  var doLoop = function() {
    var url = 'functions/_ops/progressive/' + opsToken + '?production=' + prod;
    if (start) {
      url += '&start=' + start;
    }
    util.requestCloud(url, {}, 'GET', {
      success: function(res) {
        moreData = res.moreData;
        var err = null;
        res.logs.forEach(function(logInfo) {
          console.log('%s [%s] %s', new Date(logInfo.createdAt).toLocaleString(), logInfo.level.toLocaleUpperCase(), logInfo.content);
          start = logInfo.createdAt;
          if (logInfo.level.toLocaleUpperCase() === 'ERROR') {
            err = logInfo.content;
          }
        });
        if (moreData) {
          setTimeout(function() {
            doLoop();
          }, 1000);
        } else {
          cb(err);
        }
      },
      error: function(err) {
        console.log(err);
      }
    }, true);
  };
  // 等待部署开始日志入库
  setTimeout(function() {
    doLoop();
  }, 3000);
}

exports.deployLocalCloudCode = function (runtimeInfo, cloudPath, deployLog, cb) {
    initAVOSCloudSDK(function() {
        console.log("[INFO] 压缩项目文件……");
        var file = path.join(TMP_DIR, new Date().getTime() + '.zip');
        var output = fs.createWriteStream(file);
        var archive = archiver('zip');

        output.on('close', function() {
            console.log("[INFO] 生成临时文件：" + file);
            //upload file to cloud code
            console.log("[INFO] 开始上传项目文件……");
            var key = util.guid() + '.zip';
            uploadFile(file, {
                key: key,
                name: file,
                mime_type: 'application/zip, application/octet-stream'
            }, function(err, url, fileId) {
                if (err) {
                  destroyFile(fileId);
                  errorCb(cb, 1, "上传项目文件", err);
                } else {
                    //notify avoscloud platform to fetch new deployment.
                    util.requestCloud('functions/_ops/deployByCommand', {
                        revision: url,
                        fileId: fileId,
                        log: deployLog
                    }, 'POST', {
                        success: function(resp) {
                            loopLogs(resp.opsToken, 0, function(err) {
                                if (err) {
                                    return errorCb(cb, 128, "部署失败", err);
                                }
                                console.log("[INFO] 部署成功");
                                queryStatus(cb);
                            });
                        },
                        error: function(err) {
                          errorCb(cb, 128, "部署失败", err);
	                        }
                    }, true);
                }
            }, false);
        });

        archive.on('error', function(err) {
            errorCb(cb, 1, "压缩项目文件", err);
        });

        archive.pipe(output);
        archive.bulk(runtimeInfo.bulk());
        archive.finalize();
    });
};

exports.deployGitCloudCode = function (revision, giturl, cb) {
    initAVOSCloudSDK(function() {
        util.requestCloud('functions/_ops/deployByCommand', {
            after: revision,
            url: giturl
        }, 'POST', {
            success: function(resp) {
                loopLogs(resp.opsToken, 0, function(err) {
                    if (err) {
                        return errorCb(cb, 129, "从 Git 仓库部署", err);
                    }
                    console.log("[INFO] 部署成功");
                    queryStatus(cb);
                });
            },
            error: function(err) {
                errorCb(cb, 129, "从 Git 仓库部署", err);
            }
        }, true);
    });
};

function outputStatus(status) {
    console.log('------------------------------------------------------------------------');
    console.log(sprintf("%s : '%s'", "测试环境版本    ", status.dev));
    console.log(sprintf("%s : '%s'", "测试环境提交日志", status.devLog));
    console.log(sprintf("%s : '%s'", "生产环境版本    ", status.prod));
    console.log(sprintf("%s : '%s'", "生产环境提交日志", status.prodLog));
    console.log('------------------------------------------------------------------------');
}

exports.publishCloudCode = function(cb) {
    initAVOSCloudSDK(function() {
        util.requestCloud('functions/_ops/publish', {}, 'POST', {
            success: function(resp) {
                loopLogs(resp.opsToken, 1, function(err) {
                    if (err) {
                        return errorCb(cb, 130, "发布生产环境", err);
                    }
                    console.log("[INFO] 发布成功");
                    queryStatus(cb);
                });
            },
            error: function(err) {
                errorCb(cb, 130, "发布生产环境", err);
            }
        }, true);
    });
};

var queryStatus = exports.queryStatus = function(cb) {
    initAVOSCloudSDK(function() {
        util.requestCloud('functions/status', {}, 'GET', {
            success: function(resp) {
                console.log("项目状态：");
                outputStatus(resp);
                cb();
            },
            error: function(err) {
              errorCb(cb, 131, "查询项目状态", err);
            }
        }, true);
    });
};

exports.undeployCloudCode = function(cb) {
    initAVOSCloudSDK(function() {
        util.requestCloud('functions/undeploy/repo', {}, 'POST', {
            success: function() {
                console.log("[INFO] 清除成功");
                queryStatus(cb);
            },
            error: function(err) {
                errorCb(cb, 132, "清除项目", err);
            }
        }, true);
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
    var home = getUserHome();
    var deviceIdFile = home + path.sep + '.avoscloud_device_id';
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
        util.ajax(
            'POST',
            'https://cn.avoscloud.com/1/stats/collect',
            JSON.stringify(data),
            function() {},
            function() {},
            'lu348f5799fc5u3eujpzn23acmxy761kq6soyovjc3k6kwrs',
            'nrit4mhmqzm1euc3n3k9fv3w0wo72v1bdic6tfrl2usxix3e');
    } catch (err) {
        //ignore
    }
};

function outputLogs(resp) {
    if (resp && resp.length > 0) {
        resp.reverse().forEach(function(log) {
            var time = new Date(log.time).toLocaleString();
            var env = log.production == 1 ? 'PROD' : 'TEST';
            var content = log.content.replace(/\n$/, '');
            console.log('%s [%s] [%s] %s', time, env, log.level.toLocaleUpperCase(), content);
        });
    }
}

exports.viewCloudLog = function (lines, tailf, lastLogUpdatedTime, cb) {
    initAVOSCloudSDK(function() {
        var doViewCloudLog = function doViewCloudLog(lines, tailf, lastLogUpdatedTime, cb) {
            var url = 'tables/EngineLogs';
            if (lastLogUpdatedTime) {
              url += '?since=' + encodeURIComponent(lastLogUpdatedTime);
            }
            util.requestCloud(url, {}, 'GET', {
                success: function(resp) {
                    if (resp.results) {
                      resp = resp.results;
                    }
                    resp = resp.map(function(item) {
                      if (_.isString(item))
                        return JSON.parse(item);
                      else
                        return item;
                    });
                    if (resp.length > 0) {
                        lastLogUpdatedTime = resp[0].time;
                    }
                    outputLogs(resp);
                    if (tailf) {
                        //fetch log every 500 milliseconds.
                        setTimeout(function() {
                            doViewCloudLog(null, tailf, lastLogUpdatedTime, cb);
                        }, 500);
                    }
                },
                error: function(err) {
                    errorCb(cb, 133, "查询应用日志", err);
                }
            }, true);
        };

        doViewCloudLog(lines, tailf, lastLogUpdatedTime, cb);
    });
};

var migrateAvoscloudKeys = _.once(function() {
    var avoscloudAppKeysFile = path.join(getUserHome(), '.avoscloud_keys');
    var leancloudFolder = path.join(getUserHome(), '.leancloud');
    var leancloudAppKeysFile = path.join(leancloudFolder, 'app_keys');

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
            appKey: keys.appKey
        };

        var leancloudFolder = path.join(getUserHome(), '.leancloud');
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
      return exitWith(err.message);
    }

    var fetchAndUpdateKeys = function(masterKey, cb) {
      fetchAppDetail(appId, masterKey, function(err, appDetail) {
        updateMasterKeys(appId, {
          masterKey: masterKey,
          appKey: appDetail.app_key
        }, {force: true}, cb);
      });
    };

    var keys = appKeys[appId];
    if(!keys) {
      promptly.password('请输入应用的 Master Key (可从开发者平台的应用设置里找到): ', function(err, masterKey) {
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
exports.createNewProject = function(cb) {
    console.log("开始输入应用信息，这些信息可以从'开发者平台的应用设置 -> 应用 key'里找到。");
    input("请输入应用的 Application ID: ", function(appId) {
        if (!appId || appId.trim() === '')
            return exitWith("无效的 Application ID");

        appId = appId.trim();
        initAVOSCloudSDK(appId, function(AV) {
            var languagesMapping = {
                'nodejs': 'node-js-getting-started',
                'node': 'node-js-getting-started',
                'n': 'node-js-getting-started',
                'python': 'python-getting-started',
                'py': 'python-getting-started',
                'p': 'python-getting-started'
            };

            input("请选择项目语言，Node.js(N) 或 Python(P): ", function(language) {
                var repoName = languagesMapping[language.toLowerCase()];

                if (!repoName)
                    return exitWith("无效的语言");

                console.log("正在创建项目 ...");

                fetchAppDetail(AV.applicationId, AV.masterKey, function(err, appDetail) {
                    try {
                        fs.mkdirSync(appDetail.app_name);
                    } catch (err) {
                        if (err.code != 'EEXIST')
                            return exitWith(err.message);
                    }

                    var zipFilePath = path.join(TMP_DIR, appId + '.zip');
                    request('http://lcinternal-cloud-code-update.avosapps.com/' + repoName + '.zip')
                        .pipe(fs.createWriteStream(zipFilePath))
                        .on('close', function() {
                            try {
                                var unzipper = new AdmZip(zipFilePath);

                                unzipper.getEntries().forEach(function(file) {
                                    console.log(color.green('  ' + file.entryName));
                                });

                                unzipper.extractAllTo(appDetail.app_name, true);

                                setCloudPath(path.resolve(appDetail.app_name));
                                addApp(appDetail.app_name, appId);
                                checkoutApp(appDetail.app_name);
                                console.log('项目创建完成！');
                                cb();
                            } catch (err) {
                                console.error('解压缩文件失败：%s，服务器响应：%s', err.message, fs.readFileSync(zipFilePath, 'utf-8'));
                            }
                        });
                });
            });
        });
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
            }, true);
        });
    } else if (stats.isDirectory()) {
        fs.readdir(realPath, function(err, files) {
            if (err)
                return cb("读取目录 " + realPath + " 失败：" + err);
            console.log("开始上传目录 " + realPath + " 中的文件……");
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
        }, cb);
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
        return exitWith("当前目录没有任何应用信息，请使用：add <name> <app id> 关联应用。");
    }
    if (PROJECT) {
        if (apps[PROJECT]) {
            return { tag: PROJECT, appId: apps[PROJECT] };
        } else {
            return exitWith("当前目录没有关联 '" + PROJECT + "' 应用信息，请使用：add <name> <app id> 关联应用。");
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
        exitWith("当前目录关联了多个应用 " + appTags + "，请使用：checkout <app> 选择应用。");
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

var fetchAppDetail = function(appId, masterKey, callback) {
  request({
      url: AV.serverURL + '/1.1/__leancloud/apps/appDetail',
      headers: {
          'X-AVOSCloud-Application-Id': appId,
          'X-AVOSCloud-Application-Key': masterKey + ',master'
      }
  }, function(err, res, body) {
    if (err) {
        exitWith(err.message);
    } else if (res.statusCode != 200) {
        try {
            exitWith(JSON.parse(body).error);
        } catch (err) {
            exitWith(res.statusText || res.statusCode);
        }
    } else {
      try {
          callback(null, JSON.parse(body));
      } catch (err) {
          exitWith(err.message);
      }
    }
  });
};

var addApp = exports.addApp = function(name, appId) {
    if (!/\w+/.test(name))
        return exitWith("无效的应用名");
    if (!/[a-zA-Z0-9]+/.test(appId))
        return exitWith("无效的 Application ID");
    var apps = getAppsSync();
    if (apps[name])
         return exitWith("应用 '" + name + "' 已经存在");
    apps[name] = appId;
    writeAppsSync(apps);
    console.log("[INFO] 关联应用：%s -- %s", name, appId);
};

exports.removeApp = function(name) {
    var apps = getAppsSync();
    if (apps[name])
        delete apps[name];
    writeAppsSync(apps);
    console.log("[INFO] 移除应用关联：%s", name);
};

var checkoutApp = exports.checkoutApp = function(name) {
    var apps = getAppsSync();
    if (!apps[name])
        return exitWith("应用 '" + name + "' 不存在");
    writeCurrAppSync(name);
    console.log("[INFO] 切换到应用 " + name);
};

exports.appStatus = function(isList) {
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
};
exports.queryLatestVersion = function(){
	try{
		util.ajax('GET','https://download.leancloud.cn/sdk/cloud_code_commandline.json',{},
				  function(resp){
					  try{
						  var latestVersion = resp.version;
						  var changelog = resp.changelog || '1.内部重构';
						  if(latestVersion.localeCompare(version) > 0){
							  console.warn(color.green("[WARN] 发现新版本 %s, 变更如下:\n%s\n您可以通过下列命令升级： sudo npm install -g avoscloud-code"), latestVersion, changelog);
						  }
					  }catch(err){
						  //ignore
					  }
				  });
	}catch(err){
		//ignore
	}
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

exports.getRedisInstances = function() {
  initAVOSCloudSDK(function(){
    util.getRedisInstances(function(err, datas) {
      if (err) {
        return exitWith('查询 Redis 实例出错：', err);
      }
      if(datas.length === 0) {
        console.log('该应用没有 Redis 实例');
      } else {
        console.log('\tInstance\tMax Memory');
        console.log('\t--------------------------');
        for(var i in datas) {
          var data = datas[i];
          console.log('\t%s\t%d MB', data.instance, data.max_memory);
        }
      }
    });
  });
};

var doRedisClient = exports.doRedisClient = function(server, db) {
  initAVOSCloudSDK(function(){
    input("Redis> ", function(command) {
      if (command === 'quit' || command === 'exit') {
        return;
      }
      util.requestRedis(server, db, command, function(err, data) {
        if(err) {
          console.log('(error)', err.message);
        } else {
          console.log(data);
        }
        doRedisClient(server, db);
      });
    });
  });
};

var doCloudQuery = exports.doCloudQuery = function(cb) {
    initAVOSCloudSDK(function(){
       input("CQL> ",function(cql){
           if(cql === 'exit')
               return cb();
           if(/.*;$/.test(cql))
               cql = cql.substring(0, cql.length - 1);
           var  vertical =/.*\\G$/.test(cql);
           if(vertical)
               cql = cql.substring(0, cql.length -2);
             //console.dir(cql);
           util.requestCloud('cloudQuery', {cql: cql}, 'GET', {
               success: function(resp) {
                   outputQueryResult(resp, vertical);
                   doCloudQuery(cb);
               },
               error: function(err) {
                   try{
                       var error = JSON.parse(err.responseText);
                       console.log(color.red(error.code + ': ' + error.error));
                   }catch(e){
                       console.log(color.red(err.responseText));
                   }
                   doCloudQuery();
               }
           });
        });
    });
};

exports.doLint = function(cb) {
    console.log("linting ...");
    var cmd = path.join(__dirname, '..', 'node_modules', 'jshint', 'bin', 'jshint') + ' . --exclude node_modules';
    exec(cmd, function(err, stdout, stderr) {
        console.log(stdout);
        console.log(stderr);
        if (err) {
            process.exit(err.code);
        } else {
            console.log('lint ok');
            cb();
        }
    });
};

exports.logProjectHome = function () {
    console.log('[INFO] LeanEngine 项目根目录：' + color.green(CLOUD_PATH));
    var currApp = getAppSync();
    if (currApp) {
        console.log('[INFO] 当前应用: %s', color.red(currApp.tag + ' ' + currApp.appId));
    } else {
        exitWith('请使用：checkout <app> 选择应用。');
    }
};

exports.getPort = function() {
  return PORT;
};
