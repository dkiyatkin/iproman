/*
Базовые действия с проектами.
Выводит всю информацию о проектах.
Читает общий конфиг. Берет информацию о конфигах проектах.
Выдает общую информацию. Выдает информацию по каждому проекту с его конфигом.
*/
var fs = require("fs");
var path = require("path");
var glob = require('glob');
var mkdirp = require('mkdirp');

var self = this;
/* Получить defconf */
this.info = function(config, cb) {
	//Читает главный конфиг, собирает файлы проектов
	//Если один из проектов не прочитан, выдается предупреждение
	fs.readFile(config, 'utf8',  function(err, data) { //Читаем главный конфиг
		if (!err) {
			try {
				var defconf = JSON.parse(data);
				defconf.svn.projects = {};
				glob("*/config.json", {cwd:defconf.svn.configs}, function (er, files) {
					if (!er) {
						var counter = files.length;
						if (counter) {
							files.forEach(function(val, index, array){
								//Читаем файлы проектов
								var name = val.replace(/\/config\.json$/,'');
								fs.readFile(path.join(defconf.svn.configs, val), 'utf8',  function(er2, data) {
									if (er2) { //Если неполучается прочитать выдаем предупреждение
										defconf.svn.projects[name] = er2.message;
									} else {
										try {
											defconf.svn.projects[name] = JSON.parse(data);
											var lastsync_file_txt = path.join(defconf.svn.configs, name, 'lastsync.txt');
											try {
												var stats = fs.lstatSync(lastsync_file_txt);
												defconf.svn.projects[name].production.sync.last_sync = stats.ctime;
											} catch (er3) {
												defconf.svn.projects[name].production.sync.last_sync = er3.message;
											}
										} catch (er4) {
											defconf.svn.projects[name] = er4.message;
										}
									}
									if (--counter===0) { cb(0, defconf); }
								});
							});
						} else { cb(0, defconf); }
					} else { cb(er); }
				});
			} catch(e) { cb(e); }
		} else { cb(err); }
	});
};

this.retarget = function(name, project, configs, callback){
	var data = JSON.stringify(project, null, '\t');
	var prjdir = path.join(configs, name);
	mkdirp(prjdir, function(err) {
		if (!err) {
			fs.writeFile(path.join(configs, name, 'config.json'), data, 'utf8',  function(err){
				if (err) { throw err; }
				callback();
			});
		} else { callback(err); }
	});
};

this.updateProject = function(name, config, configs, argv, cb) {
	try {
		if (argv.url) { config.production.url = argv.url; }
		if (argv['ignore-dirs']) { config.production.sync.ignore_dirs = argv['ignore-dirs']; }
		if (argv['ftp-server']) { config.production.sync.ftp.server = argv['ftp-server']; }
		if (argv['ftp-auth']) { config.production.sync.ftp.auth = argv['ftp-auth']; }
		if (argv['ftp-htdocs']) { config.production.sync.ftp.htdocs = argv['ftp-htdocs']; }
		if (argv['trunk-url']) { config.trunk.url = argv['trunk-url']; }
		self.retarget(name, config, configs, cb);
	} catch(e) { cb(e); }
};

this.setDefault = function(name, configs, argv, cb) {
	//Записать стандартный config.json проекта
	var project = {
		'production': {
			'url': argv.url?argv.url:'',
			'sync': {
				'ignore_dirs': argv['ignore-dirs']?argv['ignore-dirs']:'.svn,core/cache,core/data,core/site_data', //путь/раз,путь/два
				'ftp': {
					'server': argv['ftp-server']?argv['ftp-server']:'',
					'auth': argv['ftp-auth']?argv['ftp-auth']:'', //логин,пароль
					'htdocs': argv['ftp-htdocs']?argv['ftp-htdocs']:''
				}
			}
		},
		'trunk': {
			'url': argv['trunk-url']?argv['trunk-url']:'',
			'type': 'svn'
		}
	};
	self.retarget(name, project, configs, cb);
};

this.remove = function(name, configs, trunks, repos, backups, argv, cb) {
	// переместить репозитарий
	// переместить конфиг
	// переместить транк
	var now = new Date().getTime().toString();
	var repo = path.resolve(path.join(repos, name));
	var trunk = path.resolve(path.join(trunks, name));
	var project = path.resolve(path.join(configs, name));
	var repo_archive = path.resolve(path.join(backups, name, name + '_repo_' + now));
	var project_archive = path.resolve(path.join(backups, name, name + '_project_' + now));
	var trunk_archive = path.resolve(path.join(backups, name, name + '_trunk_' + now));
	mkdirp(repo_archive, function(err) {
		if (!err) {
			mkdirp(project_archive, function(err) {
				if (!err) {
					console.log(repo, '->', repo_archive);
					fs.rename(repo, repo_archive, function(err) {
						if (!err) {
							console.log(project, '->', project_archive);
							fs.rename(project, project_archive, function(err) {
								if (!err) {
									console.log(trunk, '->', trunk_archive);
									fs.rename(trunk, trunk_archive, function(err) { cb(err); });
								} else { cb(err); }
							});
						} else { cb(err); }
					});
				} else { cb(err); }
			});
		} else { cb(err); }
	});
};
