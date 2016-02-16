'use strict';
/* global it, tempdir, exec, cd, cat, mkdir, rm */
require('shelljs/global');
var spawn = require('child_process').spawn;
var should = require('should');
var path = require('path');

var lcCmd = path.resolve(__dirname, '../bin/lc');

var app = {
  name: 'cmdTest',
  appId: 'EqSqN9TtwLm5rmgjEs3snVel-gzGzoHsz',
  appKey: 'WQL3loTmH8UdzDAc0OneOD2b',
  masterKey: '3HxKdCG098L9Hf4gwwkS5o2W'
};

var app2 = {
  name: 'leanengine-unit-test',
  appId: '4h2h4okwiyn8b6cle0oig00vitayum8ephrlsvg7xo8o19ne',
  appKey: '3xjj1qw91cr3ygjq9lt0g8c3qpet38rrxtwmmp0yffyoy2t4',
  masterKey: '3v7z633lzfec9qzx8sjql6zimvdpmtwypcchr2gelu5mrzb0'
};

var tempDirName = function () {
  return path.join(tempdir(), 'lc_' + new Date().getTime());
};

describe('engine', function() {

  before(function() {
    var tmp = tempDirName();
    console.log('create temp dir:', tmp);
    mkdir(tmp);
    cd(tmp);
  });

  after(function() {
    var tmp = tempDirName();
    console.log('rm temp dir:', tmp);
    rm('-rf', tmp);
  });

  it('clear', function(done) {
    exec(lcCmd + ' clear', function(code, stdout, stderr) {
      code.should.equal(0);
      stdout.should.match(/清除成功/);
      should.not.exist(stderr);
      cat(process.env.HOME + '/.leancloud/app_keys').should.equal('');
      done();
    });
  });

  it('new', function(done) {
    this.timeout(20000);
    var interactions = [
      '< 请输入应用的 Application ID:',
      '> ' + app.appId,
      '< 请选择项目语言',
      '> node',
      '< 请输入应用的 Master Key',
      '> ' + app.masterKey,
      '< 正在创建项目',
      '< 关联应用：cmdTest -- EqSqN9TtwLm5rmgjEs3snVel-gzGzoHsz',
      '< 切换到应用 cmdTest',
      '< 项目创建完成',
      '> EOF'
    ];
    itt(lcCmd, ['new'], interactions, function() {
      cd(app.name);
      done();
    });
  });

  describe('up', function() {
    it('no dependenies, up failed', function(done) {
      var child = exec(lcCmd + ' up', function(code, stdout) {
        code.should.equal(0);
        stdout.should.match(/npm ERR!/);
        child.kill();
        setTimeout(function() {
          done();
        }, 3000);
      }); 
    });
  });

  describe('deploy', function() {
    it('deploy', function(done) {
      this.timeout(30000);
      exec(lcCmd + ' deploy', function(code, stdout) {
        code.should.equal(0);
        stdout.should.match(/部署成功/);
        done();
      }); 
    });
    it('publish', function(done) {
      this.timeout(30000);
      exec(lcCmd + ' publish', function(code, stdout) {
        code.should.equal(0);
        stdout.should.match(/发布成功/);
        done();
      }); 
    });
  });

  describe('app', function() {
    it('app', function(done) {
      exec(lcCmd + ' app', function(code, stdout, stderr) {
        code.should.equal(0);
        should.not.exist(stderr);
        stdout.should.match(/\* cmdTest EqSqN9TtwLm5rmgjEs3snVel-gzGzoHsz/);
        done();
      });
    });

    it('add', function(done) {
      exec(lcCmd + ' app add dev ' + app2.appId, function(code, stdout, stderr) {
        code.should.equal(0);
        should.not.exist(stderr);
        stdout.should.match(/关联应用：dev -- 4h2h4okwiyn8b6cle0oig00vitayum8ephrlsvg7xo8o19ne/);
        done();
      });
    });

    it('list', function(done) {
      exec(lcCmd + ' app list', function(code, stdout, stderr) {
        code.should.equal(0);
        should.not.exist(stderr);
        stdout.should.equal('\u001b[32m* cmdTest EqSqN9TtwLm5rmgjEs3snVel-gzGzoHsz\u001b[39m\n  dev     4h2h4okwiyn8b6cle0oig00vitayum8ephrlsvg7xo8o19ne\n');
        done();
      });
    });

    it('checkout', function(done) {
      exec(lcCmd + ' app checkout dev', function(code, stdout, stderr) {
        code.should.equal(0);
        should.not.exist(stderr);
        stdout.should.match(/切换到应用 dev/);
        exec(lcCmd + ' app list', function(code, stdout) {
          stdout.should.equal('  cmdTest EqSqN9TtwLm5rmgjEs3snVel-gzGzoHsz\n\u001b[32m* dev     4h2h4okwiyn8b6cle0oig00vitayum8ephrlsvg7xo8o19ne\u001b[39m\n');
          exec(lcCmd + ' app checkout ' + app.name, function(code, stdout) {
            stdout.should.match(/切换到应用 cmdTest/);
            done();
          });
        });
      });
    });

    it('rm', function(done) {
      exec(lcCmd + ' app rm dev', function(code, stdout, stderr) {
        code.should.equal(0);
        should.not.exist(stderr);
        stdout.should.match(/移除应用关联：dev/);
        exec(lcCmd + ' app list', function(code, stdout) {
          stdout.should.equal('\u001b[32m* cmdTest EqSqN9TtwLm5rmgjEs3snVel-gzGzoHsz\u001b[39m\n');
          done();
        });
      });
    });

  });

  it('status', function(done) {
    exec(lcCmd + ' status', function(code, stdout, stderr) {
      code.should.equal(0);
      should.not.exist(stderr);
      stdout.should.match(/生产环境版本/);
      done();
    });
  });

  it('cql', function(done) {
    this.timeout(20000);
    var interactions = [
      '< CQL>',
      '> select * from MyTest where foo = "bar";',
      '< 1 rows in set',
      '> exit',
      '> EOF',
    ];
    itt(lcCmd, ['cql'], interactions, done);
  });

  describe('redis', function() {
    it('list', function(done) {
      exec(lcCmd + ' redis list', function(code, stdout, stderr) {
        code.should.equal(0);
        should.not.exist(stderr);
        stdout.should.match(/Instance/);
        done();
      });
    });

    it('conn', function(done) {
      this.timeout(20000);
      var interactions = [
        '< Redis>',
        '> ping',
        '< PONG',
        '> exit',
        '> EOF'
      ];
      itt(lcCmd, ['redis', 'conn', 'test'], interactions, done);
    });
  });

});

var itt = function(command, args, interactions, done) {
    var out = function() {
      if (interactions.length === 0) {
        return;
      }
      var match = interactions[0].match(/^(>|<)\s(.*)$/);
      if (match[1] === '>') {
        if (match[2] === 'EOF') {
          cmd.stdin.end('');
        } else {
          cmd.stdin.write(match[2] + '\n');
        }
        interactions.shift();
        out();
      }
    };
    var cmd = spawn(command, args);
    cmd.stdin.setDefaultEncoding('utf8');
    cmd.stdout.setEncoding('utf8');
    cmd.stdout.on('data', function(data) {
      data.split('\n').forEach(function(line) {
        if (interactions.length === 0) {
          return;
        }
        var match = interactions[0].match(/^(>|<)\s(.*)$/);
        if (match[1] === '<' && line.match(match[2])) {
          interactions.shift();
        }
        out();
      });
    });
    cmd.stderr.setEncoding('utf8');
    cmd.stderr.on('data', function(data) {
      should.not.exist(data);
    });
    cmd.on('close', function(code) {
      code.should.equal(0);
      done();
    });
};
