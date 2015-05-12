#!/usr/bin/env node

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
var fstream = require('fstream'),
    tar = require('tar'),
    zlib = require('zlib');
var archiver = require('archiver');
var os = require('os');
var request = require('request');
var _s = require('underscore.string'),
    _ = require('underscore');
var https = require('https');
var commander = require('./commander');
var DecompressZip = require('decompress-zip');
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

//set qiniu timeout
qiniu.conf.RPC_TIMEOUT = 3600000;

IMPORT_FILE_BATCH_SIZE = 20;

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
}

exports.setCloudPath = function(cloudPath) {
  CLOUD_PATH = cloudPath;
}

exports.setPort = function(port) {
  PORT = port;
}

function exitWith(err) {
    console.error('[ERROR]: ' + err);
    process.exit(1);
}

errorCb = function(cb, exitCode, action, cause) {
  var error = new Error();
  error.action = action;
  error.exitCode = exitCode;
  error.cause = cause;
  cb(error);
}

/**
 * Tried to get user's home directory by environment variable.
 */
function getUserHome() {
    var home = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH;
    if (!home)
        return exitWith("Could not find user home directory");
    return home;
}

exports.deleteMasterKeys = function() {
    var home = getUserHome();
    var avoscloudKeysFile = path.join(home, '.avoscloud_keys')
    console.log("删除 " + avoscloudKeysFile + " ...");
    fs.truncateSync(avoscloudKeysFile, 0);
    console.log("Clear done!");
}

exports.initMasterKey = initMasterKey = function(done) {
    var currApp = getAppSync();
    var promptMasterKeyThenUpdate = function() {
        promptly.password('请输入应用的 Master Key (可从开发者平台的应用设置里找到): ', function(err, answer) {
            if (!answer || answer.trim() == '')
                return exitWith("无效的 Master Key");
            AV.initialize(currApp.appId, answer);
            updateMasterKey(currApp.appId, answer, done, true);
        });
    };
    updateMasterKey(currApp.appId, null, function(existsMasterKey){
        if(existsMasterKey) {
            if(done) {
                AV.initialize(currApp.appId, existsMasterKey);
                return done(existsMasterKey);
            }
        } else {
            promptMasterKeyThenUpdate();
        }
    }, false);
}

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
        console.warn("Faild to upload a file after retrying 3 times...give up : " + localFile);
        if (cb) {
            cb(lastErr);
        }
        return;
    }
    util.requestCloud("qiniu", props, 'POST', {
        success: function(resp) {
            var objectId = resp.objectId
            var uptoken = resp.token;
            var bucket = resp.bucket;
            if (!uptoken) {
                if (cb) {
                    cb(JSON.parse(resp.responseText).error);
                    return
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
                if (retries == null)
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

function loopLogs(opsToken, cb) {
  var start = null;
  var moreData = true;
  var doLoop = function() {
    var url = 'functions/_ops/progressive/' + opsToken;
    if (start) {
      url += '?start=' + start;
    }
    util.requestCloud(url, {}, 'GET', {
      success: function(res) {
        moreData = res.moreData;
        err = null;
        res.logs.forEach(function(logInfo) {
          console.log('%s [%s] %s', new Date(logInfo.createdAt).toLocaleString(), logInfo.level.toLocaleUpperCase(), logInfo.content)
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
        console.log(err)
      }
    }, true);
  };
  // 等待部署开始日志入库
  setTimeout(function() {
    doLoop();
  }, 3000);
}

exports.deployLocalCloudCode = function (cloudPath, deployLog, cb) {
    initMasterKey(function() {
        console.log("Compress cloud code files...");
        var file = path.join(TMP_DIR, new Date().getTime() + '.zip');
        var output = fs.createWriteStream(file);
        var archive = archiver('zip');

        output.on('close', function() {
            console.log("Wrote compressed file " + file + ' ...');
            //upload file to cloud code
            console.log("Begin to upload cloud code files...");
            var key = util.guid() + '.zip';
            uploadFile(file, {
                key: key,
                name: file,
                mime_type: 'application/zip, application/octet-stream'
            }, function(err, url, fileId) {
                if (err) {
                  destroyFile(fileId);
                  errorCb(cb, 1, "Upload cloud code files", err)
                } else {
                    console.log("Upload cloud code files successfully. Begin to deploy...");
                    //notify avoscloud platform to fetch new deployment.
                    util.requestCloud('functions/_ops/deployByCommand', {
                        revision: url,
                        fileId: fileId,
                        log: deployLog
                    }, 'POST', {
                        success: function(resp) {
                            loopLogs(resp.opsToken, function(err) {
                                if (err) {
                                    return errorCb(cb, 128, "Deploy cloud code", err);
                                }
                                console.log("Congrats! Deploy cloud code successfully.");
                                queryStatus(cb);
                            });
                        },
                        error: function(err) {
                          errorCb(cb, 128, "Deploy cloud code", err);
	                        }
                    }, true);
                }
            }, false);
        });

        archive.on('error', function(err) {
            errorCb(cb, 1, "Compress cloud code files", err);
        });

        archive.pipe(output);
        archive.bulk([
          { src: ['package.json', 'cloud/**', 'config/**', 'public/**']}
        ]);
        archive.finalize();
    });
}

exports.deployGitCloudCode = function (revision, giturl, cb) {
    initMasterKey(function() {
        console.log('Deploy cloud code from git repository...');
        util.requestCloud('functions/_ops/deployByCommand', {
            after: revision,
            url: giturl
        }, 'POST', {
            success: function(resp) {
                loopLogs(resp.opsToken, function(err) {
                    if (err) {
                        return errorCb(cb, 129, "Deployed cloud code from git repository", err);
                    }
                    console.log("Congrats! Deploy cloud code from git repository successfully.");
                    queryStatus(cb);
                })
            },
            error: function(err) {
                errorCb(cb, 129, "Deployed cloud code from git repository", err);
            }
        }, true);
    });
}

function outputStatus(status) {
    console.log('------------------------------------------------------------------------');
    console.log(sprintf("%-22s : '%s'", "Development version", status.dev));
    console.log(sprintf("%-22s : '%s'", "Development commit log", status.devLog));
    console.log(sprintf("%-22s : '%s'", "Production version", status.prod));
    console.log(sprintf("%-22s : '%s'", "Production commit log", status.prodLog));
    console.log('------------------------------------------------------------------------');
}

exports.publishCloudCode = function(cb) {
    initMasterKey(function() {
        console.log('Publishing cloud code to production...');
        util.requestCloud('functions/_ops/publish', {}, 'POST', {
            success: function(resp) {
                loopLogs(resp.opsToken, function(err) {
                    if (err) {
                        return errorCb(cb, 130, "Published cloud code", err);
                    }
                    console.log("Published cloud code successfully. Current status is: ");
                    queryStatus(cb);
                })
            },
            error: function(err) {
                errorCb(cb, 130, "Published cloud code", err);
            }
        }, true);
    });
}

exports.queryStatus = queryStatus = function(cb) {
    initMasterKey(function() {
        util.requestCloud('functions/status', {}, 'GET', {
            success: function(resp) {
                console.log("Cloud code status is: ");
                outputStatus(resp);
            },
            error: function(err) {
              errorCb(cb, 131, "Query cloud code status", err);
            }
        }, true);
    });
}

exports.undeployCloudCode = function(cb) {
    initMasterKey(function() {
        util.requestCloud('functions/undeploy/repo', {}, 'POST', {
            success: function(resp) {
                console.log("Undeployed cloud code successfully.");
                queryStatus(cb);
            },
            error: function(err) {
                errorCb(cb, 132, "Undeployed cloud code", err);
            }
        }, true);
    });
}

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
    var deviceIdFile = home + path.sep + '.avoscloud_device_id'
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
};

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
        util.ajax('POST', 'https://cn.avoscloud.com/1/stats/collect', JSON.stringify(data), function(resp) {}, function(err) {}, 'lu348f5799fc5u3eujpzn23acmxy761kq6soyovjc3k6kwrs', 'nrit4mhmqzm1euc3n3k9fv3w0wo72v1bdic6tfrl2usxix3e');
    } catch (err) {
        //ignore
    }
};

function outputLogs(resp) {
    if (resp && resp.results.length > 0) {
        resp.results.reverse().forEach(function(log) {
            console.log("[%s] [%s] -- %s:  %s", log.createdAt, (log.production == 1 ? 'production' : 'development'), log.level, log.content);
        });
    }
}

exports.viewCloudLog = viewCloudLog = function (lines, tailf, lastLogUpdatedTime, cb) {
    var url = 'classes/_CloudLog?order=-updatedAt&limit=' + (lastLogUpdatedTime ? 1000 : (lines || 10));
    if (lastLogUpdatedTime) {
        var where = {
            createdAt: {
                "$gt": {
                    "__type": "Date",
                    "iso": lastLogUpdatedTime
                }
            }
        }
        url += '&where=' + encodeURIComponent(JSON.stringify(where));
    }
    initMasterKey(function() {
        util.requestCloud(url, {}, 'GET', {
            success: function(resp) {
                if (resp.results.length > 0) {
                    lastLogUpdatedTime = resp.results[0].createdAt;
                }
                outputLogs(resp);
                if (tailf) {
                    //fetch log every 500 milliseconds.
                    setTimeout(function() {
                        viewCloudLog(null, tailf, lastLogUpdatedTime, cb);
                    }, 500);
                }
            },
            error: function(err) {
                errorCb(cb, 133, "Queried cloud code logs", err);
            }
        }, true);
    });
};

function updateMasterKey(appId, masterKey, done, force){
    var home = getUserHome();
    var avoscloudKeysFile = path.join(home, '.avoscloud_keys');
    fs.exists(avoscloudKeysFile, function(exists) {
        var writeMasterKey = function(data) {
            data = data || {}
            var existsMasterkey = data[appId];
            //If the master key is exists and force is false,
            // then return the eixsts master key
            if(existsMasterkey && !force) {
                if(done)
                    done(existsMasterkey);
                return;
            }
            data[appId] = masterKey;
            //Save to file ,and make sure file mode is 0600
            fs.writeFileSync(avoscloudKeysFile, JSON.stringify(data), {
                mode: 384
            });
            if(done)
                done(masterKey);
        };
        var readMasterKey = function() {
            fs.readFile(avoscloudKeysFile, 'utf-8', function(err, data) {
                if (err)
                    return exitWith(err);
                if (data.trim() == '') {
                    data = '{}';
                }
                var data = JSON.parse(data);
                writeMasterKey(data);
            });
        }
        if (exists) {
            readMasterKey();
        } else {
            writeMasterKey({});
        }
    });
}

/**
 *Creaet a new avoscloud cloud code project.
 */
exports.createNewProject = function() {
    console.log("开始输入应用信息，这些信息可以从'开发者平台的应用设置 -> 应用 key'里找到。")
    input("请输入应用的 Application ID: ", function(appId) {
        if (!appId || appId.trim() == '')
            return exitWith("无效的 Application ID");

        input("请输入应用的 Master Key: ", function(masterKey) {
            if (!masterKey || masterKey.trim() == '')
                return exitWith("无效的 Master Key");

            input("选择您的应用类型（标准版或者 web 主机版）: [standard(S) or web(W)] ", function(type) {
                type = type || 'S'
                var params = '';
                if (type.toUpperCase() == 'W' || type.toUpperCase() == 'WEB') {
                    params = '&webHosting=true';
                }
                console.log("Creating project...");
                AV.initialize(appId, masterKey);
                var url = AV.serverURL;
                if (url.charAt(url.length - 1) !== "/") {
                    url += "/";
                }
                url += "1/" + 'functions/skeleton?appId=' + appId + "&appKey=" + masterKey + params;
                var file = path.join(TMP_DIR, appId + '.zip');
                request(url).pipe(fs.createWriteStream(file))
                  .on('close', function(){
                        var unzipper = new DecompressZip(file);
                        unzipper.on('list', function (files) {
                            files.forEach(function(file){
                               console.log(color.green('  ' + file));
                            });
                        });
                        unzipper.list();
                        unzipper = new DecompressZip(file);
                        unzipper.on('extract', function (log) {
                            updateMasterKey(appId, masterKey, function(){
                                console.log('Project created!');
                            //force to update master key.
                            }, true);
                        });
                        unzipper.on('error', function (err) {
                            console.error('Caught an error when decompressing files: %j, server response: %j', err, fs.readFileSync(file,'utf-8'));
                        });
                        unzipper.extract({
                            path: './'
                        });
                  });
            });
        }, true);
    });
}

function importFile(f, realPath, cb) {
    var stats = fs.statSync(realPath);
    if (stats.isFile()) {
        util.checksumFile(realPath, function(err, checksum) {
            if (err) {
                return cb("Check sum for file " + realPath + " failed with error:" + err);
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
                      cb(nodeUtil.format('Upload ' + realPath + ' fails with error: %s', err));
                    } else {
                      cb(nodeUtil.format('Upload ' + realPath + ' fails with error: %j', err));
                    }
                } else {
                    console.log('Uploads ' + realPath + ' successfully at: ' + url);
                    cb();
                }
            }, true);
        });
    } else if (stats.isDirectory()) {
        fs.readdir(realPath, function(err, files) {
            if (err)
                return cb("Read directory " + realPath + " failed with error:" + err);
            console.log("Begin to upload files in directory " + realPath);
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
        cb(f + ' is not file or directory, ignoring...');
    }
}

/**
 * import files to avoscloud.
 */
exports.importFiles = function (files, cb) {
    async.eachLimit(files, IMPORT_FILE_BATCH_SIZE, function(f, cb) {
        var realPath = path.resolve(f);
        if (fs.existsSync(realPath)) {
            importFile(f, realPath, cb);
        } else {
            cb(f + " is not exists, ignores it...");
        }
    }, cb);
}

exports.initAVOSCloudSDK = initAVOSCloudSDK = function (done) {
    var currApp = getAppSync();
    var globalConfig = path.join(CLOUD_PATH, 'config/global.json');
    if (fs.existsSync(globalConfig)) { // TODO 不需要从 global 文件初始化 AV 对象
        //try to initialize avoscloud sdk with config/gloabl.json
        var data = JSON.parse(fs.readFileSync(globalConfig, {
            encoding: 'utf-8'
        }));
        if (data && data.applicationId === currApp.appId)
            AV.initialize(data.applicationId, data.applicationKey);
    }
    initMasterKey(function(masterKey) {
        if (fs.existsSync(globalConfig)) {
            //try to initialize avoscloud sdk.
            var data = JSON.parse(fs.readFileSync(globalConfig, {
                encoding: 'utf-8'
            }));
            if (data && data.applicationId === currApp.appId) {
                if (masterKey) {
                    AV._initialize(data.applicationId, data.applicationKey, masterKey);
                    AV.Cloud.useMasterKey();
                } else {
                    AV.initialize(data.applicationId, data.applicationKey);
                }
            }
        } else {
          if(masterKey) {
            AV.initialize(AV.applicationId, AV.applicationKey, masterKey);
            AV.Cloud.useMasterKey();
          }
        }
        if (done)
            done(masterKey);
    });
}

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
exports.getAppSync = getAppSync = function() {
    var apps = getAppsSync();
    var appTags = Object.keys(apps);
    if (appTags.length == 0) {
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
        exitWith("当前目录关联了多个应用，请使用：checkout <app> 选择应用。");
    }
}

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

exports.addApp = function(name, appId) {
    if (!/\w+/.test(name))
        return exitWith("Invalid app name.");
    if (!/[a-zA-Z0-9]+/.test(appId))
        return exitWith("Invalid app id.");
    var apps = getAppsSync();
    if (apps[name])
         return exitWith("The app '" + name + "' is already exists.");
    apps[name] = appId;
    writeAppsSync(apps);
    console.log("Added a new app: %s -- %s", name, appId);
}

exports.removeApp = function(name) {
    var apps = getAppsSync();
    if (apps[name])
        delete apps[name];
    writeAppsSync(apps);
    console.log("Removed app: %s", name);
}

exports.checkoutApp = function(name) {
    var apps = getAppsSync();
    if (!apps[name])
        return exitWith("The app '" + name + "' is not exists.");
    writeCurrAppSync(name);
    console.log("Switced to app " + name);
}

exports.appStatus = function(isList) {
    var currApp = getAppSync();
    if (isList) {
        var apps = getAppsSync();
        var maxNameLength = 0;
        for (var name in apps) {
            if (name.length > maxNameLength)
                maxNameLength = name.length;
        }
        for (var name in apps) {
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
}
exports.queryLatestVersion = function(){
	try{
		util.ajax('GET','https://raw.githubusercontent.com/leancloud/avoscloud-code-command/master/latest.version',{},
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
}

function sortObject(o) {
    var sorted = {},
    key, a = [];
    sorted['objectId'] = o['objectId'];

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
    sorted['updatedAt'] = o['updatedAt'];
    sorted['createdAt'] = o['createdAt'];
    return sorted;
}

function outputQueryResult(resp, vertical){
    var results = resp.results;
    var count = resp.count;
    results = results.map(function(result){
        return sortObject(result);
    });
    if((results == null || results.length == 0) && count == null)
        console.log("*EMPTY*");

    if(count){
        console.log(color.green('Count: ' + count));
    }

    if(vertical){
        var table = new Table();
        for(var i = 0; i< results.length ; i++){
            var result = results[i];
            for(var k in result){
                var row  = {};
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
    var table = new Table({
      head: head,
      chars: { 'top': '═' , 'top-mid': '╤' , 'top-left': '╔' , 'top-right': '╗'
             , 'bottom': '═' , 'bottom-mid': '╧' , 'bottom-left': '╚' , 'bottom-right': '╝'
             , 'left': '║' , 'left-mid': '╟' , 'mid': '─' , 'mid-mid': '┼'
             , 'right': '║' , 'right-mid': '╢' , 'middle': '│' }
    });
    for(var i = 0; i< results.length ; i++){
        var result = results[i];
        var row = [];
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

exports.doCloudQuery = doCloudQuery = function() {
    initAVOSCloudSDK(function(){
       input("CQL> ",function(cql){
           if(cql === 'exit')
               return;
           if(/.*;$/.test(cql))
               cql = cql.substring(0, cql.length - 1);
           var  vertical =/.*\\G$/.test(cql);
           if(vertical)
               cql = cql.substring(0, cql.length -2);
             //console.dir(cql);
           util.requestCloud('cloudQuery', {cql: cql}, 'GET', {
               success: function(resp) {
                   outputQueryResult(resp, vertical);
                   doCloudQuery();
               },
               error: function(err) {
                   try{
                       var error = JSON.parse(err.responseText);
                       console.log(color.red(error.code + ': ' + error['error']));
                   }catch(e){
                       console.log(color.red(err.responseText));
                   }
                   doCloudQuery();
               }
           });
        });
    });
}

exports.doLint = function() {
    console.log("linting ...");
    var cmd = path.join(__dirname, '..', 'node_modules', 'jshint', 'bin', 'jshint') + ' cloud';
    exec(cmd, function(err, stdout, stderr) {
        console.log(stdout);
        if (err) {
            process.exit(err.code);
        } else {
            console.log('lint ok');
        }
    });
}

exports.logProjectHome = function () {
    console.log('[INFO]: Cloud Code Project Home Directory: ' + color.green(CLOUD_PATH));
    var currApp = getAppSync();
    if (currApp) {
        console.log('[INFO]: Current App: %s', color.red(currApp.tag + ' ' + currApp.appId));
    } else {
        exitWith('请使用：checkout <app> 选择应用。');
    }
}

exports.getPort = function() {
  return PORT;
}
