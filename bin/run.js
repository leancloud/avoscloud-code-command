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
var program = commander.parse_args(process.argv);

function exitWith(err) {
    console.error('[ERROR]: ' + err);
    process.exit(1);
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

function deleteMasterKeys() {
    var home = getUserHome();
    var avoscloudKeysFile = path.join(home, '.avoscloud_keys')
    console.log("删除 " + avoscloudKeysFile + " ...");
    fs.truncateSync(avoscloudKeysFile, 0);
    console.log("Clear done!");
}

function initMasterKey(done) {
    var appId = getAppId(getCurrApp());
    var promptMasterKeyThenUpdate = function() {
        promptly.password('请输入应用的 Master Key (可从开发者平台的应用设置里找到): ', function(err, answer) {
            if (!answer || answer.trim() == '')
                return exitWith("无效的 Master Key");
            AV.initialize(appId, answer);
            updateMasterKey(appId, answer, done, true);
        });
    };
    updateMasterKey(appId, null, function(existsMasterKey){
        if(existsMasterKey) {
            if(done) {
                AV.initialize(appId, existsMasterKey);
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

function uploadFile(localFile, props, cb, retry, retries) {
    //Retried too many times, report error.
    if (retries && retries > 3) {
        console.warn("Faild to upload a file after retrying 3 times...give up : " + localFile);
        if (cb) {
            cb(err);
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
                uploadFile(localFile, props, cb, retry, retries + 1);
            } else {
                if (cb) {
                    cb(err);
                }
            }
        }
    });
}

function deployLocalCloudCode(cloudPath) {
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
                    console.error("Upload cloud code files failed with '%j'", err.responseText);
                    destroyFile(fileId);
                    process.exit(1);
                } else {
                    console.log("Upload cloud code files successfully. Begin to deploy...");
                    //notify avoscloud platform to fetch new deployment.
                    util.requestCloud('functions/deploy/command', {
                        revision: url,
                        fileId: fileId,
                        log: program.log
                    }, 'POST', {
                        success: function(resp) {
                            console.log("Congrats! Deploy cloud code successfully.");
                            queryStatus();
                        },
                        error: function(err) {
                            console.log("Sorry, try to deploy cloud code failed with '%s'", err.responseText);
                        }
                    }, true);
                }
            }, false);
        });

        archive.on('error', function(err) {
            console.error("Compress cloud code files failed with '%s'", err);
            process.exit(1);
        });

        archive.pipe(output);
        archive.bulk([
          { src: ['package.json', 'cloud/**', 'config/**', 'public/**']}
        ]);
        archive.finalize();
    });
}

function deployGitCloudCode(revision) {
    initMasterKey(function() {
        console.log('Deploy cloud code from git repository...');
        util.requestCloud('functions/deploy/command', {
            url: program.giturl
        }, 'POST', {
            success: function(resp) {
                console.log("Congrats! Deploy cloud code from git repository successfully.");
                queryStatus();
            },
            error: function(err) {
                console.log("Deployed cloud code from git repository failed with '%j'", err.responseText);
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

function publishCloudCode() {
    initMasterKey(function() {
        console.log('Publishing cloud code to production...');
        util.requestCloud('functions/publishFunctions', {}, 'GET', {
            success: function(resp) {
                console.log("Published cloud code successfully. Current status is: ");
                outputStatus(resp);
            },
            error: function(err) {
                console.log("Published cloud code failed with '%j'", err.responseText);
            }
        }, true);
    });
}

function queryStatus() {
    initMasterKey(function() {
        util.requestCloud('functions/status', {}, 'GET', {
            success: function(resp) {
                console.log("Cloud code status is: ");
                outputStatus(resp);
            },
            error: function(err) {
                console.log("Query cloud code status failed with '%j'", err.responseText);
            }
        }, true);
    });
}

function undeployCloudCode() {
    initMasterKey(function() {
        util.requestCloud('functions/undeploy/repo', {}, 'POST', {
            success: function(resp) {
                console.log("Undeployed cloud code successfully.");
                queryStatus();
            },
            error: function(err) {
                console.log("Undeployed cloud code status failed with '%j'", err.responseText);
            }
        }, true);
    });
}

//Retrieves command-line arguments.
var CMD = program.args[0];
var CLOUD_PATH = path.resolve(program.filepath || '.');

if (!CLOUD_PATH.match(/.*\/$/)) {
    CLOUD_PATH = CLOUD_PATH + path.sep;
}

process.chdir(CLOUD_PATH);

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

function sendStats(cmd) {
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

function viewCloudLog(lastLogUpdatedTime) {
    var url = 'classes/_CloudLog?order=-updatedAt&limit=' + (lastLogUpdatedTime ? 1000 : (program.lines || 10));
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
                if (program.tailf) {
                    //fetch log every 500 milliseconds.
                    setTimeout(function() {
                        viewCloudLog(lastLogUpdatedTime);
                    }, 500);
                }
            },
            error: function(err) {
                console.log("Queried cloud code logs failed with '%j'", err.responseText);
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
function createNewProject() {
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
                    cb('Upload ' + realPath + ' fails with error: %j', err);
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
function importFiles(files, cb) {
    async.eachLimit(files, IMPORT_FILE_BATCH_SIZE, function(f, cb) {
        var realPath = path.resolve(f);
        if (fs.existsSync(realPath)) {
            importFile(f, realPath, cb);
        } else {
            cb(f + " is not exists, ignores it...");
        }
    }, cb);
}

function initAVOSCloudSDK(done) {
    var currApp = getCurrApp();
    var appId = getAppId(currApp);
    if (currApp == null || currApp === '' || appId == null || appId === '')
         return exitWith("当前目录找不到有效的 LeanCloud 云代码应用运行 '" + CMD + "' 命令。");
    var globalConfig = path.join(CLOUD_PATH, 'config/global.json');
    if (fs.existsSync(globalConfig)) {
        //try to initialize avoscloud sdk with config/gloabl.json
        var data = JSON.parse(fs.readFileSync(globalConfig, {
            encoding: 'utf-8'
        }));
        if (data && data.applicationId === appId)
            AV.initialize(data.applicationId, data.applicationKey);
    }
    initMasterKey(function(masterKey) {
        if (fs.existsSync(globalConfig)) {
            //try to initialize avoscloud sdk.
            var data = JSON.parse(fs.readFileSync(globalConfig, {
                encoding: 'utf-8'
            }));
            if (data && data.applicationId === appId) {
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

function readAppsSync() {
    var appsFile = path.join(CLOUD_PATH, '.avoscloud/apps.json');
    if (fs.existsSync(appsFile)) {
        var apps = require(appsFile);
        if (apps && Object.keys(apps).length > 0)
            return apps;
    }
    //if apps.json is not exists, tried to read from config/global.json as current app
    var appConfig = path.join(CLOUD_PATH, 'config/global.json');
    if (fs.existsSync(appConfig))
        return {
            'origin': require(appConfig).applicationId
        };
    return {};
}

function readCurrAppSync() {
    var currAppFile = path.join(CLOUD_PATH, '.avoscloud/curr_app');
    if (fs.existsSync(currAppFile)) {
        var name = fs.readFileSync(currAppFile, 'utf-8').trim();
        if (name === '')
            return null;
        return name;
    } else
        return null;
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

function addApp(name, appId) {
    if (!/\w+/.test(name))
        return exitWith("Invalid app name.");
    if (!/[a-zA-Z0-9]+/.test(appId))
        return exitWith("Invalid app id.");
    var apps = readAppsSync();
    if (apps[name])
         return exitWith("The app '" + name + "' is already exists.");
    apps[name] = appId;
    writeAppsSync(apps);
    console.log("Added a new app: %s -- %s", name, appId);
    process.exit(0);
}

function removeApp(name) {
    var apps = readAppsSync();
    if (apps[name])
        delete apps[name];
    writeAppsSync(apps);
    console.log("Removed app: %s", name);
    process.exit(0);
}

function checkoutApp(name) {
    var apps = readAppsSync();
    if (!apps[name])
        return exitWith("The app '" + name + "' is not exists.");
    writeCurrAppSync(name);
    console.log("Switced to app " + name);
    process.exit(0);
}

function appStatus(list) {
    var apps = readAppsSync();
    var currApp = readCurrAppSync();
    if (list) {
        var maxNameLength = 0;
        for (var name in apps) {
            if (name.length > maxNameLength)
                maxNameLength = name.length;
        }
        for (var name in apps) {
            var formatedName = sprintf('%-' + maxNameLength + 's', name);
            if (name == currApp) {
                console.log(color.green("* " + formatedName + " " + apps[name]));
            } else {
                console.log("  " + formatedName + " " + apps[name]);
            }
        }
    } else {
        if (currApp && apps[currApp]) {
            console.log(color.green("* " + currApp + " " + apps[currApp]));
        } else {
            console.warn("You are not in a app.Please checkout <app>");
        }
    }
    process.exit(0);
}
function queryLatestVersion(){
	try{
		util.ajax('GET','https://raw.githubusercontent.com/leancloud/avoscloud-code-command/master/latest.version',{},
				  function(resp){
					  try{
						  var latestVersion = resp.version;
						  if(latestVersion.localeCompare(version) > 0){
							  console.warn("[WARN] 发现新版本 %s, 您可以通过下列命令升级： sudo npm install -g avoscloud-code", latestVersion);
						  }
					  }catch(err){
						  //ignore
					  }
				  });
	}catch(err){
		//ignore
	}
}

function getAppId(name) {
    var apps = readAppsSync();
    if (apps[name])
        return apps[name];
    if (name == 'origin' && fs.existsSync(path.join(CLOUD_PATH, 'config/global.json'))) {
        return require(path.join(CLOUD_PATH, 'config/global.json')).applicationId;
    }
    return null;
}

/**
 * Resolve current app.
 * 1. when checked out a valid app,use it.
 * 2. If we are not in a valid app, use origin app if config/global.json is provided.
 * 3. else return null.
 */
function getCurrApp() {
    var currApp = program.project || readCurrAppSync();
    var apps = readAppsSync();
    //if the app is removed, ignore it.
    if (!apps[currApp])
        currApp = null;
    if (!currApp) {
        if (apps['origin'])
            currApp = 'origin';
    }
    return currApp;
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

function doCloudQuery() {
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

function logProjectHome() {
    console.log('[INFO]: Cloud Code Project Home Directory: ' + color.green(CLOUD_PATH));
    var apps = readAppsSync();
    var currApp = getCurrApp();
    if (apps[currApp]) {
        console.log('[INFO]: Current App: %s', color.red(currApp + ' ' + getAppId(currApp)));
    } else {
        console.warn('[INFO]: You are not in a app.Please checkout <app>');
        process.exit(1);
    }
}
//Query lastet commandline version.
queryLatestVersion()
//Send statistics data.
sendStats(CMD);
//Execute command.

if (!CMD) {
    logProjectHome();
    initAVOSCloudSDK(function(masterKey) {
        require(lib + '/mock').run(CLOUD_PATH, AV, program.port);
        console.log("请使用浏览器打开 http://localhost:" + program.port + "/avos");
    });
} else {
    switch (CMD) {
        case "search":
            if (!program.args[1]) {
                console.log("Usage: avoscloud search <关键字>");
                process.exit(1);
            }
            program.args.shift();
            exec('open https://cn.avoscloud.com/search.html?q=' + encodeURIComponent(program.args.join(' ')));
            break;
        case "deploy":
            initAVOSCloudSDK();
            logProjectHome();
            if (program.git) {
                deployGitCloudCode(program.revision || 'master');
            } else {
                if (path.resolve(CLOUD_PATH) != path.resolve('.'))
                    return exitWith("'avoscloud deploy' must be run in a cloud code project directory.");
                deployLocalCloudCode(CLOUD_PATH);
            }
            break;
        case "undeploy":
            initAVOSCloudSDK();
            logProjectHome();
            undeployCloudCode();
            break;
        case "publish":
            initAVOSCloudSDK();
            logProjectHome();
            publishCloudCode();
            break;
        case "status":
            initAVOSCloudSDK();
            logProjectHome();
            queryStatus();
            break;
        case 'new':
            createNewProject();
            break;
        case 'logs':
            initAVOSCloudSDK();
            logProjectHome();
            viewCloudLog();
            break;
        case "clear":
            deleteMasterKeys();
            break;
        case "upload":
            initAVOSCloudSDK();
            logProjectHome();
            if (!program.args[1]) {
                console.log("Usage: avoscloud upload <文件或目录>");
                process.exit(1);
            }
            program.args.shift();
            importFiles(program.args, function(err) {
                if (err)
                    console.log(err);
            });
            break;
        case "app":
            //app <list>
            var list = program.args[1] == 'list';
            appStatus(list);
            break;
        case "add":
            // add <name> <app id>
            var name = program.args[1];
            var appId = program.args[2];
            if (!name)
                return exitWith("Usage: avoscloud add <name> <app id>");
            if (!appId)
                return exitWith("Usage: avoscloud add <name> <app id>");
            addApp(name, appId);
            break;
        case "rm":
            //rm <name>
            var name = program.args[1];
            if (!name)
                return exitWith("Usage: avoscloud rm <name>");
            removeApp(name);
            break;
        case "checkout":
            //checkout <name>
            var name = program.args[1];
            if (!name)
                 return exitWith("Usage: avoscloud checkout <name>");
            checkoutApp(name);
            break;
        case "cql":
           doCloudQuery();
           break;
        default:
            program.help();
            break;
    }
}
