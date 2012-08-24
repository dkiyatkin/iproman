/* svn проекты */

var fs = require('fs');
var path = require('path');
var mustache = require('mustache');
var xml2js = require('xml2js');

var exec = require(__dirname + '/common.js').exec;
var unlock = require(__dirname + '/common.js').unlock;
var lock = require(__dirname + '/common.js').lock;

var create_repo = function(repo, cb) {
	exec('svnadmin', ['create', repo], function(code, stdout, stderr) {
		cb(code);
	});
};

var create_branch = function(repo, branch, cb) {
	branch = "file://" + path.resolve(path.join(repo, branch));
	exec("svn", ["mkdir", "--no-auth-cache", "--non-interactive", "--trust-server-cert", "--message", '', branch],
			function(code, stdout, stderr) {
		cb(code);
	});
};

var create_checkout = function(repo_checkout, checkout, cb) {
	exec("svn", ["checkout", "--no-auth-cache", "--non-interactive", "--trust-server-cert", repo_checkout, checkout],
			function(code, stdout, stderr) {
		cb(code);
	});
};

var create_access = function(checkout, cb) {
	exec('chmod', ['-R', 'o-rwx,ug+rwX', checkout], function(code, stdout, stderr) {
		cb(code);
	});
};

var create_hooks = function(name, repo, templates, cb) {
	//Обновить настроечные файлы репозитария
	fs.readFile(path.join(templates, 'conf/svnserve.conf'), 'utf8',  function(err, data){
		if (!err) {
			try {
				data = mustache.to_html(data, {name: name});
			} catch(e) { err = e; }
		}
		if (!err) {
			fs.writeFile(path.join(repo, 'conf/svnserve.conf'), data, 'utf8',  function(err) {
				if (!err) {
					fs.symlink('/usr/bin/post-commit', path.join(repo, 'hooks/post-commit'), function(err) {
						cb(err);
					});
				} else { cb(err); }
			});
		} else { cb(err); }
	});
};

/* Создать svn репозитарий и транк для проекта */
this.create = function(name, repos, trunks, host, templates, branch, cb) {
	var repo = path.join(repos, name);
	var repo_checkout = "svn://" + path.join(host, name, branch);
	var checkout = path.join(trunks, name);
	create_repo(repo, function(err) {
		if (!err) {
			console.log('Создали репозитарий');
			create_branch(repo, branch, function(err) {
				if (!err) {
					console.log('Создали ветку trunk');
					create_checkout(repo_checkout, checkout, function(err) {
						if (!err) {
							console.log('Создали checkout');
							create_access(checkout, function(err) {
								if (!err) {
									console.log('Настроили права для checkout');
									create_hooks(name, repo, templates, function(err) { cb(err); });
								} else { cb(err); }
							});
						} else { cb(err); }
					});
				} else { cb(err); }
			});
		} else { cb(err); }
	});
};

var svninfo = function(path, auth, callback) {
	exec("svn", ['info', '--xml', '--no-auth-cache', '--non-interactive', '--trust-server-cert', '--config-dir', '/etc/subversion/', "--username", auth.split(',')[0], "--password", auth.split(',')[1], path], function(err, stdout, stderr) {
		if (!err) {
			var parser = new xml2js.Parser();
			parser.on('end', function(result) {
				var rev = result.entry['@'].revision;
				var url = result.entry.url;
				var root = result.entry.repository.root;
				var uuid = result.entry.repository.uuid;
				callback(null, rev, url);
			});
			parser.parseString(stdout);
		} else { callback(err); }
	}, false, false, true);
};

var getExternals = function(ext_dir, auth, callback) { // Взять externals
	exec("svn", ["propget", "svn:externals", "--no-auth-cache", "--non-interactive", "--trust-server-cert", "--config-dir", "/etc/subversion/", "--username", auth.split(',')[0], "--password", auth.split(',')[1], ext_dir], function(err, stdout, stderr) {
		if (!err) {
			prepareExternals(ext_dir, stdout, auth, function(err, externals) { callback(err, externals); });
		} else { callback(err); }
	}, false, false, true);
};

var prepareExternals = function(ext_dir, externals, auth, callback) { // Добавить номер ревизий к списку externals
	var new_externals = [];
	var externals = externals.trim().split('\n');
	var counter = externals.length;
	externals.forEach(function(val, i, externals) {
		var external = val.trim().replace(/ {2,}/, ' ').split(' '); // удаляем пробелы
		if (external.length == 2 && external[0][0] != '#') {
			svninfo(path.join(ext_dir, external[0]), auth, function(err, rev, url) {
				if (!err && rev && url) {
					external.splice(1, 0, "-r" + rev);
					new_externals[i] = external.join(' ');
				} else {
					new_externals[i] = external.join(' ');
				}
				if (-- counter == 0) callback(null, new_externals.join('\n'))
			})
		} else {
			new_externals[i] = external.join(' ');
			if (-- counter == 0) callback(null, new_externals.join('\n'))
		}
	})
}
var setExternals = function(ext_dir, externals, auth, callback) {
	exec("svn", ["propset", "svn:externals",
			"--no-auth-cache", "--non-interactive", "--trust-server-cert", "--config-dir", "/etc/subversion/", "--username", auth.split(',')[0], "--password", auth.split(',')[1], externals, ext_dir],
			function(err, stdout, stderr) {
		if (!err) {
			exec("svn", ["commit", "--message", "",
				"--no-auth-cache", "--non-interactive", "--trust-server-cert", "--config-dir", "/etc/subversion/", "--username", auth.split(',')[0], "--password", auth.split(',')[1], ext_dir],
					function(err, stdout, stderr) {
				if (!err) {
					callback(err, stdout, stderr);
				} else {
					exec("svn", ["revert",
						"--no-auth-cache", "--non-interactive", "--trust-server-cert", "--config-dir", "/etc/subversion/", "--username", auth.split(',')[0], "--password", auth.split(',')[1], ext_dir],
							function(e, stdout, stderr) {
						if (!e) {
							callback(err, stdout, stderr);
						} else { callback(e, stdout, stderr); }
					});
				}
			});
		} else { callback(err, stdout, stderr); }
	});
};

this.freeze = function(name, configs, trunks, auth, argv, cb) {
	var ext_dir = argv['ext-dir'];
	if (!ext_dir) { ext_dir = 'core' }
	ext_dir = path.join(trunks, name, ext_dir);
	var now = new Date().getTime().toString();
	var lockfile = path.join(configs, name, 'freeze.lck');
	var lastfile = path.join(configs, name, 'lastfreeze.txt');
	var checkout = path.join(trunks, name);
	lock(lockfile, argv, function(err) {
		if (!err) {
			svninfo(checkout, auth, function(err, rev, url) {
				var freeze_file_txt = path.join(configs, name, 'freeze_' + rev + '_' + now);
				if (!err) {
					getExternals(ext_dir, auth, function(err, externals) {
						if (!err) {
							var all_externals = '. -r' + rev + ' ' + url + '\n' + externals;
							if (!argv['dry-run']) {
								// записать изменения
								setExternals(ext_dir, externals, auth, function(err, stdout, stderr) {
									if (!err) {
										// записать номера в freeze_{{ rev }}_{{ date }}
										fs.writeFile(freeze_file_txt, externals, 'utf8',  function(err) {
											if (!err) {
												unlock(lockfile, lastfile, argv, function(err) { cb(err, all_externals); });
											} else { cb(err); }
										});
									} else { cb(err); }
								});
							} else { unlock(lockfile, lastfile, argv, function(err) { cb(err, all_externals); }); }
						} else { cb(err); }
					});
				} else { cb(err); }
			});
		} else { cb(err); }
	});
};
