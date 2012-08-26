var fs = require("fs");
var path = require("path");

var mkdirp = require('mkdirp');

var exec = require(__dirname + '/common.js').exec;
var createArchive = require(__dirname + '/common.js').createArchive;
var unlock = require(__dirname + '/common.js').unlock;
var lock = require(__dirname + '/common.js').lock;

var self = this;

/*
var mirrorReverse = function(name, config, defconf, argv, cb) {
	var ignore_dirs = config.production.sync.ignore_dirs.split(',');
	var checkout = path.join(defconf.svn.trunks, name);
	var auth = config.production.sync.ftp.auth;
	var ftp_htdocs = config.production.sync.ftp.htdocs;
	var ftp_server = config.production.sync.ftp.server;
	var now = new Date().getTime().toString();
	var logfile = path.join(defconf.svn.configs, name, 'sync_' + now + '.log');
	var ignore_dirs_str = '';
	var i; for (i=0; i < ignore_dirs.length; i++) {
		ignore_dirs_str = ignore_dirs_str + ' -x ' + ignore_dirs[i];
	}
	var dry_run = '';
	if (argv.dry_run) { dry_run = "--dry-run"; }
	var verbose = '';
	if (argv.verbose) { verbose = '--verbose=3'; }
	var options = "set net:timeout 5; set net:reconnect-interval-base 5; set net:max-retries 2; ";
	var mirror = options + "mirror " + dry_run + " --reverse " + ignore_dirs_str + " --delete " + verbose + " " + checkout + ' ' + ftp_htdocs + '; bye;';
	console.log('Запись в ' + logfile);
	//console.log(mirror);
	exec('lftp', ['-u', auth, '-e', mirror , ftp_server], function(code, stdout, stderr) {
		cb(code);
	}, logfile);
};
*/

var mirror = function(auth, server, htdocs, local_dir, ignore_dirs, logfile, reverse, argv, cb) {
	mkdirp(local_dir, function(err) {
		if (!err) {
			var ignore_dirs_str = '';
			if (ignore_dirs) {
				var i; for (i=0; i < ignore_dirs.length; i++) {
					ignore_dirs_str = ignore_dirs_str + ' -x ' + ignore_dirs[i];
				}
			}
			var dry_run = '';
			if (argv['dry-run']) { dry_run = "--dry-run"; }
			var verbose = '';
			if (argv.verbose) { verbose = '--verbose=3'; }
			var options = "set ftp:list-options -a; set net:timeout 5; set net:reconnect-interval-base 5; set net:max-retries 2; ";
			var mirror;
			if (!reverse) {
				mirror = options + "mirror " + dry_run + " " + ignore_dirs_str + " --delete " + verbose + " " + htdocs + ' ' + local_dir + '; bye;';
			} else {
				mirror = options + "mirror " + dry_run + " --reverse " + ignore_dirs_str + " --delete " + verbose + " " + local_dir + ' ' + htdocs + '; bye;';
			}
			console.log('Запись в ' + logfile);
			exec('lftp', ['-u', auth, '-e', mirror , server], function(code, stdout, stderr) {
				cb(code);
			}, logfile);
		} else { cb(err); }
	});
};

this.backup = function(name, config, defconf, argv, cb) {
	var now = new Date().getTime().toString();
	var lockfile = path.join(defconf.svn.configs, name, 'backup.lck');
	var lastfile = path.join(defconf.svn.configs, name, 'lastbackup.txt');
	var logfile = path.join(defconf.svn.configs, name, 'backup_' + now + '.log');
	var ignore_dirs = config.production.sync.ignore_dirs.split(',');
	var archive_dir = path.resolve(path.join(defconf.backups, name, 'production'));
	var auth = config.production.sync.ftp.auth;
	var htdocs = config.production.sync.ftp.htdocs;
	var server = config.production.sync.ftp.server;
	var archive_file = path.resolve(path.join(defconf.backups, name, name + '_production_' + now + '.tar.gz'));
	lock(lockfile, argv, function(err) {
		if (!err) {
			mirror(auth, server, htdocs, archive_dir, false, logfile, false, argv, function(err) {
				if (!err) {
					if (!argv['dry-run']) {
						createArchive(archive_dir, archive_file, function(err) {
							if (!err) {
								unlock(lockfile, lastfile, argv, function(err) {
									cb(err);
								});
							} else { cb(err); }
						});
					} else {
						unlock(lockfile, lastfile, argv, function(err) {
							cb(err);
						});
					}
				} else { cb(err); }
			});
		} else { cb(err); }
	});
};

this.sync = function(name, config, defconf, argv, cb) {
	var now = new Date().getTime().toString();
	var lockfile = path.join(defconf.svn.configs, name, 'sync.lck');
	var lastfile = path.join(defconf.svn.configs, name, 'lastsync.txt');
	var logfile = path.join(defconf.svn.configs, name, 'sync_' + now + '.log');
	var ignore_dirs = config.production.sync.ignore_dirs.split(',');
	var checkout = path.join(defconf.svn.trunks, name);
	var auth = config.production.sync.ftp.auth;
	var htdocs = config.production.sync.ftp.htdocs;
	var server = config.production.sync.ftp.server;
	lock(lockfile, argv, function(err) {
		if (!err) {
			mirror(auth, server, htdocs, checkout, ignore_dirs, logfile, true, argv, function(err) {
				unlock(lockfile, lastfile, argv, function(err) {
					cb(err);
				});
			});
		} else { cb(err); }
	});
};
